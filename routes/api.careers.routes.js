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

async function hasValidPdfSignature(filePath) {
  let fileHandle;

  try {
    fileHandle = await fs.open(filePath, 'r');

    /*
     * Real PDF documents normally begin with:
     *
     * %PDF-
     *
     * That is five bytes.
     */
    const headerBuffer = Buffer.alloc(5);

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
      headerBuffer.toString('ascii');

    return header === '%PDF-';
  } catch (error) {
    console.error(
      'Could not inspect uploaded PDF:',
      error
    );

    return false;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

/*
 * Reload the careers page with an error message.
 */
async function renderCareerError(res, error) {
  const jobs = await prisma.jobPosting
    .findMany({
      where: {
        status: 'open'
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    .catch(() => []);

  return res.status(400).render('careers', {
    title: 'Careers',
    jobs,
    error
  });
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

const upload = multer({
  storage,

  limits: {
    /*
     * Maximum file size: 5 MB.
     */
    fileSize: 5 * 1024 * 1024,

    /*
     * Only one résumé may be uploaded per request.
     */
    files: 1
  },

fileFilter: (req, file, callback) => {
  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  const hasValidExtension =
    extension === '.pdf';

  const hasValidMimeType =
    allowedMimeTypes.has(file.mimetype);

  if (!hasValidExtension || !hasValidMimeType) {
    return callback(
      new Error(
        'Please upload your résumé as a valid PDF file.'
      )
    );
  }

  return callback(null, true);
}
});

router.post(
  '/apply',

  /*
   * Multer first parses multipart fields and stores the PDF.
   */
  upload.single('resume'),

  /*
   * CSRF can now read req.body._csrf.
   * It removes the PDF if verification fails.
   */
  csrfAfterUpload,

  async (req, res) => {
    if (isHoneypotTriggered(req)) {
      if (req.file) {
        await deleteUploadedFile(
          req.file.path
        );
      }

      return res.redirect(
        '/careers?applied=1'
      );
    }

    const privacyAcknowledged =
      req.body.privacyAcknowledgement === 'yes';

      if (!privacyAcknowledged) {
  if (req.file) {
    await deleteUploadedFile(
      req.file.path
    );
  }

  return renderCareerError(
    res,
    'You must acknowledge the Privacy Policy before submitting your application.'
  );
}

    if (!req.file) {
      return renderCareerError(
        res,
        'Please upload your résumé as a PDF.'
      );
    }

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
        'Please select a job and provide your name, email and résumé.'
      );
    }

    try {
      const job =
        await prisma.jobPosting.findFirst({
          where: {
            id: jobId,
            status: 'open'
          }
        });

      if (!job) {
        await deleteUploadedFile(
          req.file.path
        );

        return renderCareerError(
          res,
          'That job is no longer accepting applications.'
        );
      }

          await prisma.jobApplication.create({
            data: {
              applicantName,
              email,
              phone,
              coverNote,
              jobId,

              resumeStorageKey:
                req.file.filename,

              resumeOriginalName:
                path.basename(
                  req.file.originalname
                ),

              resumeMimeType:
                req.file.mimetype,

              resumeFileSize:
                req.file.size,

              /*
              * Privacy acknowledgement record.
              */
              privacyAcknowledged: true,

              privacyAcknowledgedAt:
                new Date(),

              privacyNoticeVersion:
                RECRUITMENT_PRIVACY_NOTICE_VERSION
            }
          });

      return res.redirect(
        '/careers?applied=1'
      );
    } catch (error) {
      await deleteUploadedFile(
        req.file.path
      );

      console.error(
        'Job application failed:',
        error
      );

      return res.status(500).render(
        '500',
        {
          title: 'Server Error'
        }
      );
    }
  }
);

/*
 * Handle Multer-specific upload errors.
 */
router.use(
  async (error, req, res, next) => {
    /*
     * In case Multer created a file before reporting another
     * error, clean it up.
     */
    if (req.file?.path) {
      await deleteUploadedFile(
        req.file.path
      );
    }

    if (error instanceof multer.MulterError) {
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

      return renderCareerError(
        res,
        'The résumé could not be uploaded.'
      );
    }

    if (
      error.message ===
      'Please upload your résumé as a valid PDF file.'
    ) {
      return renderCareerError(
        res,
        error.message
      );
    }

    return next(error);
  }
);

module.exports = router;