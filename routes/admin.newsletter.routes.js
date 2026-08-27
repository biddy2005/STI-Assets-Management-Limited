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

router.get(
  '/',

  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const subscribers =
      await prisma
        .newsletterSubscriber
        .findMany({

          orderBy: {
            subscribedAt:
              'desc'
          }

        });


    return res.render(
      'admin/newsletter-manager',
      {
        subscribers
      }
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

    const subscriberId =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        subscriberId
      ) ||
      subscriberId < 1
    ) {

      return res.status(400).send(
        'Invalid newsletter subscriber ID.'
      );

    }


    const subscriber =
      await prisma
        .newsletterSubscriber
        .findUnique({

          where: {
            id:
              subscriberId
          },

          select: {
            id:
              true,

            email:
              true,

            isSubscribed:
              true,

            subscribedAt:
              true,

            unsubscribedAt:
              true
          }

        });


    if (!subscriber) {

      return res.status(404).send(
        'Newsletter subscriber not found.'
      );

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .newsletterSubscriber
          .delete({

            where: {
              id:
                subscriberId
            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'NEWSLETTER_SUBSCRIBER_DELETED',

          entityType:
            'NewsletterSubscriber',

          entityId:
            subscriberId,

          metadata: {
            email:
              subscriber.email,

            isSubscribed:
              subscriber.isSubscribed,

            subscribedAt:
              subscriber.subscribedAt,

            unsubscribedAt:
              subscriber.unsubscribedAt
          }

        });

      }
    );


    return res.redirect(
      '/admin/newsletter'
    );

  })
);

module.exports =
  router;