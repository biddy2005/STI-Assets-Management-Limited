const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');

const router = express.Router();

const {
  csrfAfterUpload
} = require(
  '../middleware/csrf.middleware'
);

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);

const {
  sendJobApplicationNotification
} = require(
  '../services/email.service'
);

const prisma = require('../config/db');
const {
  resumeDirectory
} = require('../config/storage');

const {
  cleanText,
  isHoneypotTriggered,
  isValidEmail
} = require('../middleware/validation.middleware');



/*
 * Change this value whenever the recruitment section of the
 * Privacy Policy is materially updated.
 */
const RECRUITMENT_PRIVACY_NOTICE_VERSION =
  '2026-08-01';

/*
 * For now, accept only PDF résumés.
 *
 * PDF-only uploads are easier to inspect, store and download
 * safely than accepting PDF, DOC and DOCX at the same time.
 */
const allowedMimeTypes = new Set([
  'application/pdf'
]);

async function hasValidPdfSignature(
  filePath
) {
  let fileHandle;

  let selectedJob;
  let createdApplication;

  try {
    fileHandle =
      await fs.open(
        filePath,
        'r'
      );

    /*
     * Real PDF documents normally begin with:
     *
     * %PDF-
     *
     * That is five bytes.
     */
    const headerBuffer =
      Buffer.alloc(5);

    const {
      bytesRead
    } = await fileHandle.read(
      headerBuffer,
      0,
      5,
      0
    );

    if (bytesRead < 5) {
      return false;
    }

    const header =
      headerBuffer.toString(
        'ascii'
      );

    return header === '%PDF-';
  } catch (error) {
    console.error(
      'Could not inspect uploaded PDF:',
      error
    );

    return false;
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (closeError) {
        console.error(
          'Could not close uploaded PDF:',
          closeError
        );
      }
    }
  }
}

/*
 * Reload the careers page with an error message.
 */
async function renderCareerError(
  res,
  errorMessage
) {
  const jobs =
    await prisma.jobPosting
      .findMany({
        where: {
          status: 'open'
        },

        orderBy: {
          createdAt: 'desc'
        }
      })
      .catch((error) => {
        /*
         * The form error should still display even when the
         * job list cannot be reloaded.
         */
        console.error(
          'Could not reload jobs while displaying a careers form error:',
          error
        );

        return [];
      });

  return res.status(400).render(
    'careers',
    {
      title: 'Careers',
      jobs,
      error: errorMessage,
      applied: false
    }
  );
}

/*
 * Delete an uploaded file when validation or database
 * operations fail.
 *
 * Without this cleanup, rejected applications could leave
 * unused résumé files in the private folder.
 */
async function deleteUploadedFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    /*
     * ENOENT means the file no longer exists.
     * That situation does not require another error.
     */
    if (error.code !== 'ENOENT') {
      console.error(
        'Could not delete uploaded résumé:',
        error
      );
    }
  }
}

/*
 * Store résumés in storage/private/resumes.
 *
 * This folder is not exposed through express.static().
 */
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, resumeDirectory);
  },

  filename: (req, file, callback) => {
    /*
     * The application accepts only PDFs, so always use .pdf.
     *
     * Do not trust or reuse the full original filename as the
     * stored filename.
     */
    const generatedName =
      `${Date.now()}-${crypto.randomUUID()}.pdf`;

    callback(null, generatedName);
  }
});

const upload =
  multer({
    storage,

    limits: {
      /*
       * Maximum file size: 5 MB.
       */
      fileSize:
        5 * 1024 * 1024,

      /*
       * Only one résumé may be uploaded per request.
       */
      files: 1
    },

    fileFilter: (
      req,
      file,
      callback
    ) => {
      const extension =
        path
          .extname(
            file.originalname
          )
          .toLowerCase();

      const hasValidExtension =
        extension === '.pdf';

      const hasValidMimeType =
        allowedMimeTypes.has(
          file.mimetype
        );

      if (
        !hasValidExtension ||
        !hasValidMimeType
      ) {
        return callback(
          new Error(
            'Please upload your résumé as a valid PDF file.'
          )
        );
      }

      return callback(
        null,
        true
      );
    }
  });

router.post(
  '/apply',

  /*
   * Multer parses the multipart form and saves the résumé.
   */
  upload.single(
    'resume'
  ),
  csrfAfterUpload,
  asyncHandler(async (req, res) => {
    /*
     * The honeypot is a hidden field intended to catch bots.
     *
     * Pretend the request succeeded, but remove any résumé and
     * do not create a database record.
     */
    if (
      isHoneypotTriggered(req)
    ) {
      await deleteUploadedFile(
        req.file?.path
      );

      return res.redirect(
        '/careers?applied=1'
      );
    }

    /*
     * The privacy checkbox must submit the value "yes".
     */
    const privacyAcknowledged =
      req.body
        .privacyAcknowledgement ===
      'yes';

    if (!privacyAcknowledged) {
      await deleteUploadedFile(
        req.file?.path
      );

      return renderCareerError(
        res,
        'You must acknowledge the Privacy Policy before submitting your application.'
      );
    }

    /*
     * A résumé is required.
     */
    if (!req.file) {
      return renderCareerError(
        res,
        'Please upload your résumé as a PDF.'
      );
    }

    /*
     * Clean and normalise the submitted text.
     */
    const applicantName =
      cleanText(
        req.body.applicantName,
        100
      );

    const email =
      cleanText(
        req.body.email,
        254
      ).toLowerCase();

    const phone =
      cleanText(
        req.body.phone,
        30
      ) || null;

    const coverNote =
      cleanText(
        req.body.coverNote,
        5000
      ) || null;

    const jobId =
      Number(req.body.jobId);

    const applicationIsInvalid =
      !applicantName ||
      !isValidEmail(email) ||
      !Number.isInteger(jobId) ||
      jobId < 1;

    if (applicationIsInvalid) {
      await deleteUploadedFile(
        req.file.path
      );

      return renderCareerError(
        res,
        'Please select a job and provide your name, a valid email address and your résumé.'
      );
    }

    /*
     * Multer already checked the filename extension and MIME
     * type.
     *
     * Now inspect the file contents to confirm that it starts
     * with the PDF signature: %PDF-
     */
    const isRealPdf =
      await hasValidPdfSignature(
        req.file.path
      );

    if (!isRealPdf) {
      await deleteUploadedFile(
        req.file.path
      );

      return renderCareerError(
        res,
        'The uploaded file is not a valid PDF document.'
      );
    }

    /*
     * The résumé now exists on disk.
     *
     * Keep this local try/catch because the résumé must be
     * removed when a database operation fails.
     */
    try {
      /*
       * Confirm that the selected job still exists and is
       * accepting applications.
       */
        selectedJob =
          await prisma.jobPosting.findFirst({
            where: {
              id: jobId,
              status: 'open'
            },

            select: {
              id: true,
              title: true
            }
          });

      if (!selectedJob) {
        await deleteUploadedFile(
          req.file.path
        );

        return renderCareerError(
          res,
          'That job is no longer accepting applications.'
        );
      }

      createdApplication =
      await prisma.jobApplication.create({
        data: {
          applicantName,
          email,
          phone,
          coverNote,
          jobId,

          /*
           * Store only the generated private filename.
           */
          resumeStorageKey:
            req.file.filename,

          /*
           * Keep a safe version of the applicant's original
           * filename for downloads.
           */
          resumeOriginalName:
            path.basename(
              req.file.originalname
            ),

          resumeMimeType:
            req.file.mimetype,

          resumeFileSize:
            req.file.size,

          privacyAcknowledged:
            true,

          privacyAcknowledgedAt:
            new Date(),

          privacyNoticeVersion:
            RECRUITMENT_PRIVACY_NOTICE_VERSION
        }
      });
    } catch (error) {
      /*
       * Multer already stored the résumé.
       *
       * Remove it because the database operation failed.
       */
      await deleteUploadedFile(
        req.file.path
      );

      /*
       * Rethrow the original error.
       *
       * asyncHandler will forward it to your global Express
       * error middleware.
       */
      throw error;
    }

    try {
  await sendJobApplicationNotification({
    applicationId:
      createdApplication.id,

    applicantName,
    email,
    phone,
    coverNote,
    jobId,

    jobTitle:
      selectedJob.title
  });
} catch (error) {
  req.log.error(
    {
      err:
        error,

      applicationId:
        createdApplication.id
    },

    'Job application notification email failed'
  );
}

    return res.redirect(
      '/careers?applied=1'
    );
  })
);

/*
 * Handle Multer, file-filter and multipart errors.
 *
 * This must retain all four parameters:
 *
 * error, req, res, next
 *
 * Express uses the four-parameter signature to recognise
 * error-handling middleware.
 */
router.use(
  (
    error,
    req,
    res,
    next
  ) => {
    return Promise
      .resolve()
      .then(async () => {
        /*
         * csrfAfterUpload already handles uploaded-file
         * cleanup when the CSRF token is rejected.
         *
         * Forward the error to the main CSRF error handler.
         */
        if (
          error.code ===
          'EBADCSRFTOKEN'
        ) {
          return next(error);
        }

        /*
         * Multer may have saved a file before reporting a
         * multipart error.
         */
        await deleteUploadedFile(
          req.file?.path
        );

        if (
          error instanceof
          multer.MulterError
        ) {
          if (
            error.code ===
            'LIMIT_FILE_SIZE'
          ) {
            return renderCareerError(
              res,
              'The résumé must be 5 MB or smaller.'
            );
          }

          if (
            error.code ===
            'LIMIT_FILE_COUNT'
          ) {
            return renderCareerError(
              res,
              'Please upload only one résumé.'
            );
          }

          if (
            error.code ===
            'LIMIT_UNEXPECTED_FILE'
          ) {
            return renderCareerError(
              res,
              'The résumé upload field was not recognised.'
            );
          }

          return renderCareerError(
            res,
            'The résumé could not be uploaded.'
          );
        }

        /*
         * This error is created by your extension and MIME-type
         * fileFilter.
         */
        if (
          error.message ===
          'Please upload your résumé as a valid PDF file.'
        ) {
          return renderCareerError(
            res,
            error.message
          );
        }

        /*
         * Anything else is unexpected.
         */
        return next(error);
      })
      .catch(next);
  }
);

module.exports = router;