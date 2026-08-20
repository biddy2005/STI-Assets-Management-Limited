const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { cleanText, isHoneypotTriggered, isValidEmail } = require('../middleware/validation.middleware');

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
  sendContactToPowerAutomate
} = require(
  '../services/powerAutomate.service'
);

router.post(
  '/',

  /*
   * This is a normal URL-encoded form, so use the standard
   * CSRF middleware rather than csrfAfterUpload.
   */
  csrfSynchronisedProtection,

  /*
   * Forward unexpected asynchronous errors to the global
   * Express error handler.
   */
  asyncHandler(async (req, res) => {
    /*
     * Bots commonly fill hidden honeypot fields.
     *
     * Pretend the form succeeded, but do not save anything.
     */
    if (
      isHoneypotTriggered(req)
    ) {
      return res.redirect(
        '/contact?success=1'
      );
    }

    /*
     * Clean and limit every submitted value.
     */
    const firstName =
      cleanText(
        req.body.firstName,
        100
      );

    const lastName =
      cleanText(
        req.body.lastName,
        100
      );

    const name =
      `${firstName} ${lastName}`.trim();

    const email =
      cleanText(
        req.body.email,
        254
      ).toLowerCase();

    const phone =
      cleanText(
        req.body.phone,
        30
      ) || null;

    const subject =
      cleanText(
        req.body.subject,
        200
      ) || null;

    const message =
      cleanText(
        req.body.message,
        5000
      );

    /*
     * Required fields:
     *
     * - first name
     * - last name
     * - valid email
     * - message
     */
    const submissionIsInvalid =
      !firstName ||
      !lastName ||
      !isValidEmail(email) ||
      !message;

    if (submissionIsInvalid) {
      return res.status(400).render(
        'contact',
        {
          title: 'Contact Us',

          error:
            'Please provide your first name, last name, a valid email address and a message.',

          success: false
        }
      );
    }

    /*
     * The ContactSubmission status automatically defaults to
     * NEW based on your Prisma schema.
     */
const submission =
  await prisma.contactSubmission.create({
    data: {
      name,
      email,
      phone,
      subject,
      message
    }
  });

try {
  const webhookResult =
    await sendContactToPowerAutomate({
      submissionId:
        submission.id,

      name,

      email,

      phone,

      subject,

      message,

      submittedAt:
        submission.submittedAt
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
          'contact',

        reason:
          'NOT_CONFIGURED',

        submissionId:
          submission.id
      },

      'Contact Power Automate webhook skipped'
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
        'contact',

      submissionId:
        submission.id,

      httpStatusCode:
        error?.statusCode ||
        null
    },

    'Contact Power Automate webhook failed'
  );
}


    return res.redirect(
      '/contact?success=1'
    );
  })
);

module.exports = router;
