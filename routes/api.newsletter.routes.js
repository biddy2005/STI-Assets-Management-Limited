const express = require('express');

const router = express.Router();

const prisma = require('../config/db');

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
  sendNewsletterToPowerAutomate
} = require(
  '../services/powerAutomate.service'
);

const {
  buildNewsletterUnsubscribeUrl
} = require(
  '../utils/newsletterUnsubscribe'
);

const {
  isHoneypotTriggered,
  validateSchema
} = require(
  '../middleware/validation.middleware'
);

const {
  newsletterSchema
} = require(
  '../schemas/newsletter.schema'
);

function safeRedirectBack(
  req,
  res,
  queryParameter
) {
  const origin =
    `${req.protocol}://${req.get('host')}`;

  let redirectPath = '/';

  try {
    const referer = req.get('referer');

    if (referer) {
      const refererUrl =
        new URL(referer);

      if (refererUrl.origin === origin) {
        redirectPath =
          `${refererUrl.pathname}${refererUrl.search}`;
      }
    }
  } catch (error) {
    redirectPath = '/';
  }

  const redirectUrl =
    new URL(redirectPath, origin);

  redirectUrl.searchParams.set(
    queryParameter,
    '1'
  );

  return res.redirect(
    303,
    `${redirectUrl.pathname}${redirectUrl.search}`
  );
}

router.post(
  '/',

  /*
   * The newsletter form is a normal URL-encoded form.
   * It does not upload files, so use the standard CSRF
   * middleware.
   */
  csrfSynchronisedProtection,

  /*
   * Forward unexpected database and programming errors to the
   * global Express error handler.
   */
  asyncHandler(async (req, res) => {
    /*
     * Ignore automated submissions that filled the hidden
     * honeypot field.
     *
     * Pretend the subscription succeeded, but do not create a
     * database record.
     */
    if (
      isHoneypotTriggered(req)
    ) {
      return safeRedirectBack(
        req,
        res,
        'subscribed'
      );
    }

    /*
     * Validate and normalize the newsletter form.
     *
     * The schema preserves the existing trimming,
     * length limit and lowercase normalization.
     */
    const validation =
      validateSchema(
        newsletterSchema,
        req.body
      );

    /*
     * Invalid email addresses are expected form errors.
     *
     * Redirect back to the page and show the newsletter error
     * message. This is not a server error.
     */
    if (!validation.success) {
      return safeRedirectBack(
        req,
        res,
        'newsletterError'
      );
    }

    const {
      email
    } = validation.data;

    /*
    * Upsert prevents duplicate subscriber rows.
    *
    * For an existing email address, subscribedAt is refreshed to
    * represent a new explicit subscription request.
    *
    * For a new email address, create stores the subscriber and
    * current subscription timestamp.
    */
    const subscriptionTime =
      new Date();


const subscriber =
  await prisma.newsletterSubscriber
    .upsert({
      where: {
        email
      },

      /*
       * An existing subscriber may previously have opted out.
       *
       * Submitting the newsletter form again is treated as a new,
       * explicit subscription request.
       */
      update: {
        isSubscribed:
          true,

        subscribedAt:
          subscriptionTime,

        unsubscribedAt:
          null
      },

      create: {
        email,

        isSubscribed:
          true,

        subscribedAt:
          subscriptionTime,

        unsubscribedAt:
          null
      }
    });

    const unsubscribeUrl =
    buildNewsletterUnsubscribeUrl(
      subscriber
    );


    /*
    * The subscription has already been stored successfully.
    *
    * A Microsoft 365 synchronization failure must never remove
    * or reject the valid PostgreSQL subscription record.
    */
    try {
  const webhookResult =
    await sendNewsletterToPowerAutomate({
      subscriberId:
        subscriber.id,

      email:
        subscriber.email,

      /*
       * This represents the current signup event rather than
       * the historical creation date of the PostgreSQL row.
       *
       * This allows an M365-unsubscribed subscriber to
       * explicitly subscribe again through the website.
       */
      subscribedAt:
        subscriber.subscribedAt,

      unsubscribeUrl
    });


  if (webhookResult.skipped) {
    req.log.warn(
      {
        event:
          'POWER_AUTOMATE_WEBHOOK_SKIPPED',

        component:
          'integration',

        dependency:
          'power-automate',

        workflow:
          'newsletter',

        reason:
          'NOT_CONFIGURED',

        subscriberId:
          subscriber.id
      },

      'Newsletter Power Automate webhook skipped'
    );
  }
} catch (error) {
  req.log.error(
    {
      err:
        error,

      event:
        'POWER_AUTOMATE_WEBHOOK_FAILED',

      component:
        'integration',

      dependency:
        'power-automate',

      workflow:
        'newsletter',

      subscriberId:
        subscriber.id,

      httpStatusCode:
        error?.statusCode ||
        null
    },

    'Newsletter Power Automate webhook failed'
  );
}

    return safeRedirectBack(
      req,
      res,
      'subscribed'
    );
  })
);

module.exports = router;