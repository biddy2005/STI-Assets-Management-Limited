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
  cleanText,
  isHoneypotTriggered,
  isValidEmail
} = require(
  '../middleware/validation.middleware'
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
     * Clean and normalise the email address.
     */
    const email =
      cleanText(
        req.body.email,
        254
      ).toLowerCase();

    /*
     * Invalid email addresses are expected form errors.
     *
     * Redirect back to the page and show the newsletter error
     * message. This is not a server error.
     */
    if (!isValidEmail(email)) {
      return safeRedirectBack(
        req,
        res,
        'newsletterError'
      );
    }

    /*
     * upsert prevents duplicate records.
     *
     * When the email already exists, update: {} makes no
     * changes.
     *
     * When the email does not exist, create adds the new
     * subscriber.
     */
    await prisma.newsletterSubscriber.upsert({
      where: {
        email
      },

      update: {},

      create: {
        email
      }
    });

    return safeRedirectBack(
      req,
      res,
      'subscribed'
    );
  })
);

module.exports = router;