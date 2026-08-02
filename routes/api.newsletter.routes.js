const express = require('express');

const router = express.Router();

const prisma = require('../config/db');

const {
  csrfSynchronisedProtection
} = require(
  '../middleware/csrf.middleware'
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
  csrfSynchronisedProtection,
  async (req, res, next) => {
  try {
    /*
     * Ignore automated submissions that filled the honeypot.
     */
    if (isHoneypotTriggered(req)) {
      return safeRedirectBack(
        req,
        res,
        'subscribed'
      );
    }

    const email = cleanText(
      req.body.email,
      254
    ).toLowerCase();

    if (!isValidEmail(email)) {
      return safeRedirectBack(
        req,
        res,
        'newsletterError'
      );
    }

    /*
     * upsert prevents duplicate subscriber records.
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
  } catch (error) {
    console.error(
      'Newsletter subscription failed:',
      error
    );

    return safeRedirectBack(
      req,
      res,
      'newsletterError'
    );
  }
});

module.exports = router;