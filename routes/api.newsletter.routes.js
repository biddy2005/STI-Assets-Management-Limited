const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { cleanText, isHoneypotTriggered, isValidEmail } = require('../middleware/validation.middleware');

function safeRedirectBack(req, res, queryParam) {
  const referer = req.get('Referer');
  const fallback = '/';
  const target = referer && referer.startsWith(req.protocol + '://' + req.get('host')) ? referer : fallback;

  const url = new URL(target);
  url.searchParams.set(queryParam, '1');
  res.redirect(url.pathname + url.search);
}

router.post('/', async (req, res) => {
  if (isHoneypotTriggered(req)) return safeRedirectBack(req, res, 'subscribed');

  const email = cleanText(req.body.email, 254).toLowerCase();

  if (!isValidEmail(email)) {
    return safeRedirectBack(req, res, 'newsletterError');
  }

  try {
    await prisma.newsletterSubscriber.create({ data: { email } });
    return safeRedirectBack(req, res, 'subscribed');
  } catch (err) {
    // P2002 = unique constraint violation (already subscribed) — treat as success
    if (err.code === 'P2002') {
      return safeRedirectBack(req, res, 'subscribed');
    }
    console.error(err);
    return safeRedirectBack(req, res, 'newsletterError');
  }
});

module.exports = router;