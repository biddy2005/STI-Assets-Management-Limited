const express =
  require('express');

const router =
  express.Router();

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
  writeAuditLog
} = require(
  '../services/audit.service'
);


const superAdminOnly =
  requireRole(
    'SUPERADMIN'
  );


const allowedContactStatuses =
  new Set([
    'NEW',
    'IN_PROGRESS',
    'RESOLVED',
    'ARCHIVED'
  ]);

router.get(
  '/',

  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const submissions =
      await prisma.contactSubmission.findMany({

        orderBy: {
          submittedAt:
            'desc'
        }

      });


    return res.render(
      'admin/contact-submissions',
      {
        submissions
      }
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

    const submissionId =
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
        submissionId
      ) ||
      submissionId < 1
    ) {

      return res.status(400).send(
        'Invalid contact submission ID.'
      );

    }


    if (
      !allowedContactStatuses.has(
        status
      )
    ) {

      return res.status(400).send(
        'Invalid contact status.'
      );

    }


    const submission =
      await prisma
        .contactSubmission
        .findUnique({

          where: {
            id:
              submissionId
          },

          select: {
            id:
              true,

            status:
              true
          }

        });


    if (!submission) {

      return res.status(404).send(
        'Contact submission not found.'
      );

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .contactSubmission
          .update({

            where: {
              id:
                submissionId
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
            'CONTACT_STATUS_UPDATED',

          entityType:
            'ContactSubmission',

          entityId:
            submissionId,

          metadata: {

            previousStatus:
              submission.status,

            newStatus:
              status

          }

        });

      }
    );


    return res.redirect(
      '/admin/contact-submissions'
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

    const submissionId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        submissionId
      ) ||
      submissionId < 1
    ) {

      return res.status(400).send(
        'Invalid contact submission ID.'
      );

    }


    const submission =
      await prisma
        .contactSubmission
        .findUnique({

          where: {
            id:
              submissionId
          },

          select: {
            id:
              true,

            subject:
              true,

            status:
              true,

            submittedAt:
              true
          }

        });


    if (!submission) {

      return res.status(404).send(
        'Contact submission not found.'
      );

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .contactSubmission
          .delete({

            where: {
              id:
                submissionId
            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'CONTACT_DELETED',

          entityType:
            'ContactSubmission',

          entityId:
            submissionId,

          metadata: {

            subject:
              submission.subject,

            previousStatus:
              submission.status,

            submittedAt:
              submission.submittedAt

          }

        });

      }
    );


    return res.redirect(
      '/admin/contact-submissions'
    );

  })
);

module.exports =
  router;