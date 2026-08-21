const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const {
  isHoneypotTriggered,
  validateSchema
} = require(
  '../middleware/validation.middleware'
);

const {
  contactSchema
} = require(
  '../schemas/contact.schema'
);

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
     * Validate and normalize the submitted form.
     *
     * The schema preserves the existing behaviour:
     * values are trimmed and limited to their existing
     * maximum lengths before validation.
     */
    const validation =
      validateSchema(
        contactSchema,
        req.body
      );

    if (!validation.success) {
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

    const {
      firstName,
      lastName,
      email,
      message
    } = validation.data;

    const phone =
      validation.data.phone ||
      null;

    const subject =
      validation.data.subject ||
      null;

    const name =
      `${firstName} ${lastName}`.trim();

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
