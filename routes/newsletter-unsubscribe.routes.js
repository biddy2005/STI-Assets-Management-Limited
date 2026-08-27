const express =
  require('express');

const router =
  express.Router();

const prisma =
  require('../config/db');

const {
  csrfSynchronisedProtection
} = require(
  '../middleware/csrf.middleware'
);

const {
  newsletterUnsubscribeLimiter
} = require(
  '../middleware/rateLimit.middleware'
);

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);

const {
  verifyNewsletterUnsubscribeToken
} = require(
  '../utils/newsletterUnsubscribe'
);

const {
  sendNewsletterUnsubscribeToPowerAutomate
} = require(
  '../services/powerAutomate.service'
);


/**
 * These pages contain a signed unsubscribe token in the URL.
 *
 * Prevent caching/indexing and prevent the full URL from being
 * sent to another site in a Referer header.
 */
function setPrivateResponseHeaders(
  res
) {
  res.set(
    'Cache-Control',
    'no-store, private'
  );

  res.set(
    'Referrer-Policy',
    'no-referrer'
  );

  res.set(
    'X-Robots-Tag',
    'noindex, nofollow, noarchive'
  );
}


/**
 * Returns a valid NewsletterSubscriber or null.
 */
async function getVerifiedSubscriber(
  subscriberIdValue,
  token
) {
  const subscriberId =
    Number(
      subscriberIdValue
    );

  if (
    !Number.isSafeInteger(
      subscriberId
    ) ||
    subscriberId < 1
  ) {
    return null;
  }


  const subscriber =
    await prisma
      .newsletterSubscriber
      .findUnique({
        where: {
          id:
            subscriberId
        }
      });


  if (!subscriber) {
    return null;
  }


  const tokenIsValid =
    verifyNewsletterUnsubscribeToken(
      subscriber,
      token
    );


  if (!tokenIsValid) {
    return null;
  }


  return subscriber;
}


/*
 * GET only displays the confirmation page.
 *
 * It deliberately does NOT unsubscribe the client because
 * email security scanners frequently open links automatically.
 */
router.get(
  '/unsubscribe/:subscriberId/:token',

  asyncHandler(
    async (req, res) => {
      setPrivateResponseHeaders(
        res
      );


      const subscriber =
        await getVerifiedSubscriber(
          req.params.subscriberId,
          req.params.token
        );


      if (!subscriber) {
        return res
          .status(404)
          .render(
            '404',
            {
              title:
                'Unsubscribe Link Not Found',

              description:
                'The newsletter unsubscribe link is invalid or no longer available.',

              robots:
                'noindex,nofollow,noarchive'
            }
          );
      }


      const unsubscribePath =
        `/newsletter/unsubscribe/` +
        `${subscriber.id}/` +
        `${req.params.token}`;


      return res.render(
        'newsletter-unsubscribe',
        {
          title:
            'Unsubscribe',

          description:
            'Manage your STI Assets Management newsletter subscription.',

          robots:
            'noindex,nofollow,noarchive',

          unsubscribePath,

          errorMessage:
            null
        }
      );
    }
  )
);

router.get(
  '/unsubscribed',

  (req, res) => {
    setPrivateResponseHeaders(
      res
    );

    return res.render(
      'newsletter-unsubscribed',
      {
        title:
          'Unsubscribed',

        description:
          'Your newsletter subscription preference has been updated.',

        robots:
          'noindex,nofollow,noarchive'
      }
    );
  }
);

/*
 * POST performs the actual unsubscribe.
 */
router.post(
  '/unsubscribe/:subscriberId/:token',

  newsletterUnsubscribeLimiter,

  csrfSynchronisedProtection,

  asyncHandler(
    async (req, res) => {
      setPrivateResponseHeaders(
        res
      );


      const subscriber =
        await getVerifiedSubscriber(
          req.params.subscriberId,
          req.params.token
        );


      if (!subscriber) {
        return res
          .status(404)
          .render(
            '404',
            {
              title:
                'Unsubscribe Link Not Found',

              description:
                'The newsletter unsubscribe link is invalid or no longer available.',

              robots:
                'noindex,nofollow,noarchive'
            }
          );
      }


      const unsubscribePath =
        `/newsletter/unsubscribe/` +
        `${subscriber.id}/` +
        `${req.params.token}`;


      /*
      * Unsubscribe requests are idempotent.
      *
      * If PostgreSQL already records this subscriber as
      * unsubscribed, do not trigger the external workflow again.
      */
      if (!subscriber.isSubscribed) {
        return res.redirect(
          303,
          '/newsletter/unsubscribed'
        );
      }


      try {
        await sendNewsletterUnsubscribeToPowerAutomate({
          subscriberId:
            subscriber.id
        });
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
              'newsletter-unsubscribe',

            subscriberId:
              subscriber.id,

            httpStatusCode:
              error?.statusCode ||
              null
          },

          'Newsletter unsubscribe workflow failed'
        );


        return res
          .status(503)
          .render(
            'newsletter-unsubscribe',
            {
              title:
                'Unsubscribe',

              description:
                'Manage your STI Assets Management newsletter subscription.',

              robots:
                'noindex,nofollow,noarchive',

              unsubscribePath,

              errorMessage:
                'We could not process your unsubscribe request at this time. Please try again.'
            }
          );
      }

      /*
 * Microsoft 365 has confirmed the unsubscribe.
 *
 * Record the same preference locally so PostgreSQL and the
 * external newsletter workflow remain aligned.
 */
try {
  await prisma.newsletterSubscriber
    .update({
      where: {
        id:
          subscriber.id
      },

      data: {
        isSubscribed:
          false,

        unsubscribedAt:
          new Date()
      }
    });
} catch (error) {
  /*
   * The external unsubscribe has already succeeded.
   *
   * Do not tell the subscriber that their unsubscribe failed,
   * because Microsoft 365 has already processed their request.
   *
   * Log the local persistence failure prominently so it can be
   * reconciled operationally.
   */
  req.log.error(
    {
      err:
        error,

      event:
        'NEWSLETTER_LOCAL_UNSUBSCRIBE_PERSIST_FAILED',

      component:
        'newsletter',

      subscriberId:
        subscriber.id
    },

    'Newsletter unsubscribe succeeded externally but could not be persisted locally'
  );
}


      return res.redirect(
      303,
      '/newsletter/unsubscribed'
    );
    }
  )
);


module.exports =
  router;