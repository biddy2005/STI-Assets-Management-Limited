const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { cleanText, isHoneypotTriggered, isValidEmail } = require('../middleware/validation.middleware');

router.post('/', async (req, res) => {
  if (isHoneypotTriggered(req)) return res.redirect('/contact?success=1');

  const name = cleanText(req.body.name, 100);
  const email = cleanText(req.body.email, 254).toLowerCase();
  const phone = cleanText(req.body.phone, 30) || null;
  const subject = cleanText(req.body.subject, 200) || null;
  const message = cleanText(req.body.message, 5000);

  if (!name || !isValidEmail(email) || !message) {
    return res.status(400).render('contact', {
      title: 'Contact Us',
      error: 'Please provide a name, valid email address, and message.'
    });
  }

  try {
    await prisma.contactSubmission.create({
      data: { name, email, phone, subject, message }
    });

    // TODO: trigger an email notification here via nodemailer (see config/mailer.js you'll add)
    return res.redirect('/contact?success=1');
  } catch (err) {
    console.error(err);
    return res.status(500).render('500', { title: 'Server Error' });
  }
});

module.exports = router;
