const express =
  require('express');

const router =
  express.Router();

const path =
  require('path');

const prisma =
  require('../config/db');

const {
  requireRole
} = require(
  '../middleware/auth.middleware'
);

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);

const {
  csrfSynchronisedProtection
} = require(
  '../middleware/csrf.middleware'
);

const {
  getPrivateFile,
  deletePrivateFile
} = require(
  '../services/storage.service'
);

const {
  writeAuditLog
} = require(
  '../services/audit.service'
);


const superAdminOnly =
  requireRole(
    'SUPERADMIN'
  );


const allowedApplicationStatuses =
  new Set([
    'NEW',
    'REVIEWING',
    'SHORTLISTED',
    'REJECTED',
    'HIRED'
  ]);

router.get(
  '/',

  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const rawJobId =
      req.query.jobId;


    let jobIdFilter =
      null;


    /*
     * Only use the filter when it is a valid positive integer.
     */
    if (rawJobId) {

      const convertedJobId =
        Number(
          rawJobId
        );


      if (
        Number.isInteger(
          convertedJobId
        ) &&
        convertedJobId > 0
      ) {

        jobIdFilter =
          convertedJobId;

      }

    }


    const applications =
      await prisma.jobApplication.findMany({

        where:
          jobIdFilter
            ? {
                jobId:
                  jobIdFilter
              }
            : {},

        include: {
          job:
            true
        },

        orderBy: {
          submittedAt:
            'desc'
        }

      });


    const jobs =
      await prisma.jobPosting.findMany({

        orderBy: {
          createdAt:
            'desc'
        }

      });


    return res.render(
      'admin/applications-manager',
      {
        applications,

        jobs,

        jobIdFilter
      }
    );

  })
);
router.get(
  '/:id/resume',

  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const applicationId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        applicationId
      ) ||
      applicationId < 1
    ) {

      return res.status(400).send(
        'Invalid application ID.'
      );

    }


    const application =
      await prisma
        .jobApplication
        .findUnique({

          where: {
            id:
              applicationId
          }

        });


    if (!application) {

      return res.status(404).render(
        '404',
        {
          title:
            'Application Not Found'
        }
      );

    }


    /*
     * Ask the storage abstraction for the résumé.
     *
     * The route does not need to know whether the file comes
     * from local private storage or Cloudflare R2.
     */
    let storedResume;


    try {

      storedResume =
        await getPrivateFile({

          storageKey:
            application
              .resumeStorageKey

        });

    } catch (error) {

      /*
       * storage.service.js normalizes both:
       *
       * local ENOENT
       * R2 404 / NoSuchKey
       *
       * into STORAGE_FILE_NOT_FOUND.
       */
      if (
        error.code ===
        'STORAGE_FILE_NOT_FOUND'
      ) {

        return res.status(404).send(
          'The résumé file could not be found.'
        );

      }


      throw error;

    }


    /*
     * Applicant résumés contain private information and must
     * not be cached by browsers or intermediary proxies.
     */
    res.setHeader(
      'Cache-Control',
      'private, no-store, max-age=0'
    );


    res.setHeader(
      'Pragma',
      'no-cache'
    );


    res.setHeader(
      'X-Content-Type-Options',
      'nosniff'
    );


    /*
     * Preserve the applicant's original filename while removing
     * any directory information.
     */
    const downloadName =
      path.basename(
        application
          .resumeOriginalName ||
        'resume.pdf'
      );


    res.attachment(
      downloadName
    );


    /*
     * Prefer the MIME type recorded when the application was
     * originally accepted.
     */
    res.setHeader(
      'Content-Type',

      application
        .resumeMimeType ||
      storedResume
        .contentType ||
      'application/octet-stream'
    );


    /*
     * getPrivateFile() returns a Buffer regardless of whether
     * the backend is local storage or private R2.
     */
    return res.send(
      storedResume.body
    );

  })
);
router.post(
  '/:id/status',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const applicationId =
      Number(
        req.params.id
      );


    const status =
      typeof req.body.status ===
        'string'
        ? req.body.status.trim()
        : '';


    if (
      !Number.isSafeInteger(
        applicationId
      ) ||
      applicationId < 1
    ) {

      return res.status(400).send(
        'Invalid application ID.'
      );

    }


    if (
      !allowedApplicationStatuses.has(
        status
      )
    ) {

      return res.status(400).send(
        'Invalid application status.'
      );

    }


    const application =
      await prisma.jobApplication.findUnique({

        where: {
          id:
            applicationId
        },

        select: {
          id:
            true,

          status:
            true
        }

      });


    if (!application) {

      return res.status(404).send(
        'Application not found.'
      );

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .jobApplication
          .update({

            where: {
              id:
                applicationId
            },

            data: {
              status
            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'APPLICATION_STATUS_UPDATED',

          entityType:
            'JobApplication',

          entityId:
            applicationId,

          metadata: {

            previousStatus:
              application.status,

            newStatus:
              status

          }

        });

      }
    );


    return res.redirect(
      '/admin/applications'
    );

  })
);
router.post(
  '/:id/delete',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const applicationId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        applicationId
      ) ||
      applicationId < 1
    ) {

      return res.status(400).send(
        'Invalid application ID.'
      );

    }


    const application =
      await prisma.jobApplication.findUnique({

        where: {
          id:
            applicationId
        }

      });


    if (!application) {

      return res.status(404).send(
        'Application not found.'
      );

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .jobApplication
          .delete({

            where: {
              id:
                applicationId
            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'APPLICATION_DELETED',

          entityType:
            'JobApplication',

          entityId:
            applicationId,

          metadata: {

            jobId:
              application.jobId,

            previousStatus:
              application.status,

            originalResumeName:
              application.resumeOriginalName

          }

        });

      }
    );


    /*
     * The database deletion and audit event have already
     * succeeded.
     *
     * Remove the applicant's résumé from whichever private
     * storage backend is configured.
     *
     * A storage cleanup failure must not make the successful
     * database deletion appear to have failed.
     */
    try {

      await deletePrivateFile({

        storageKey:
          application
            .resumeStorageKey

      });

    } catch (storageError) {

      req.log.error(
        {
          err:
            storageError,

          event:
            'APPLICATION_RESUME_DELETE_CLEANUP_FAILED',

          applicationId,

          storageKey:
            application
              .resumeStorageKey
        },

        'Application deleted, but résumé storage cleanup failed'
      );

    }


    return res.redirect(
      '/admin/applications'
    );

  })
);

module.exports =
  router;