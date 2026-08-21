const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const {
  csrfSynchronisedProtection
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
  savePrivateFile,
  deletePrivateFile
} = require(
  '../services/storage.service'
);

const {
  isHoneypotTriggered,
  validateSchema
} = require(
  '../middleware/validation.middleware'
);

const {
  careerApplicationSchema
} = require(
  '../schemas/careers.schema'
);



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

function hasValidPdfSignature(
  fileBuffer
) {
  if (
    !Buffer.isBuffer(
      fileBuffer
    ) ||
    fileBuffer.length < 5
  ) {
    return false;
  }


  const header =
    fileBuffer
      .subarray(
        0,
        5
      )
      .toString(
        'ascii'
      );


  return header ===
    '%PDF-';
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
 * Keep the incoming résumé in memory until:
 *
 * - CSRF validation passes;
 * - form validation passes;
 * - MIME/extension validation passes;
 * - PDF signature validation passes;
 * - the selected vacancy is confirmed open.
 *
 * Only then does storage.service.js persist the file.
 *
 * Maximum memory exposure remains limited by the 5 MB Multer
 * file-size limit below.
 */
const storage =
  multer.memoryStorage();

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
   * Parse the multipart form first.
   *
   * MemoryStorage means the résumé exists only in
   * req.file.buffer at this stage.
   */
  upload.single(
    'resume'
  ),

  /*
   * Multer has now populated req.body, including _csrf.
   *
   * No physical file exists yet, so standard CSRF protection
   * is sufficient.
   */
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {

    /*
     * Honeypot submissions pretend to succeed.
     *
     * Nothing has been persisted yet.
     */
    if (
      isHoneypotTriggered(req)
    ) {
      return res.redirect(
        '/careers?applied=1'
      );
    }


    const privacyAcknowledged =
      req.body
        .privacyAcknowledgement ===
      'yes';


    if (!privacyAcknowledged) {
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


    /*
     * Validate and normalize the submitted application fields.
     *
     * Upload validation, privacy acknowledgement and résumé
     * checks remain separate from this schema so their existing
     * behaviour and error messages are preserved.
     */
    const validation =
      validateSchema(
        careerApplicationSchema,
        req.body
      );


    if (!validation.success) {
      return renderCareerError(
        res,
        'Please select a job and provide your name, a valid email address and your résumé.'
      );
    }


    const {
      applicantName,
      email,
      jobId
    } = validation.data;


    const phone =
      validation.data.phone ||
      null;


    const coverNote =
      validation.data.coverNote ||
      null;


    /*
     * Multer already validated:
     *
     * - .pdf extension;
     * - application/pdf MIME type.
     *
     * Now validate the actual first bytes.
     */
    const isRealPdf =
      hasValidPdfSignature(
        req.file.buffer
      );


    if (!isRealPdf) {
      return renderCareerError(
        res,
        'The uploaded file is not a valid PDF document.'
      );
    }


    /*
     * Confirm the selected vacancy before storing any résumé.
     */
    const selectedJob =
      await prisma
        .jobPosting
        .findFirst({
          where: {
            id:
              jobId,

            status:
              'open'
          },

          select: {
            id:
              true,

            title:
              true
          }
        });


    if (!selectedJob) {
      return renderCareerError(
        res,
        'That job is no longer accepting applications.'
      );
    }


    /*
     * Use an application-generated filename.
     *
     * The same storageKey works for:
     *
     * local:
     * storage/private/resumes/<storageKey>
     *
     * R2:
     * resumes/<storageKey>
     */
    const storageKey =
      `${Date.now()}-${crypto.randomUUID()}.pdf`;


    let createdApplication;


    try {
      /*
       * Persist the résumé only after every public-input
       * validation step has succeeded.
       */
      await savePrivateFile({
        storageKey,

        body:
          req.file.buffer,

        contentType:
          req.file.mimetype
      });


      /*
       * Only create the database record after storage succeeds.
       */
      createdApplication =
        await prisma
          .jobApplication
          .create({
            data: {
              applicantName,
              email,
              phone,
              coverNote,
              jobId,

              resumeStorageKey:
                storageKey,

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
       * Storage may already have succeeded when the database
       * operation subsequently fails.
       *
       * Attempt cleanup through the same abstraction.
       *
       * deletePrivateFile() is safe when the file does not
       * exist, so cleanup is also attempted when the original
       * storage operation failed ambiguously.
       */
      try {
        await deletePrivateFile({
          storageKey
        });
      } catch (cleanupError) {
        req.log.error(
          {
            err:
              cleanupError,

            storageKey
          },

          'Could not clean up résumé after application creation failed'
        );
      }


      throw error;
    }


    /*
     * Email is deliberately non-transactional.
     *
     * A notification failure must not undo the valid résumé and
     * JobApplication record.
     */
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

          event:
            'EMAIL_SEND_FAILED',

          component:
            'email',

          dependency:
            'smtp',

          notificationType:
            'job_application',

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
 * MemoryStorage means no physical résumé has been persisted
 * while Multer and CSRF processing occur.
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
         * Forward CSRF failures to the application's central
         * CSRF error handler.
         */
        if (
          error.code ===
            'EBADCSRFTOKEN'
        ) {
          return next(
            error
          );
        }


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


        if (
          error.message ===
            'Please upload your résumé as a valid PDF file.'
        ) {
          return renderCareerError(
            res,
            error.message
          );
        }


        return next(
          error
        );
      })
      .catch(
        next
      );
  }
);

module.exports = router;