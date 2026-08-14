const {
  transporter,
  isMailerConfigured,
  notificationRecipient,
  smtpUser
} = require(
  '../config/mailer'
);

/**
 * Removes line breaks from values used in email subjects.
 *
 * This prevents submitted form content from creating
 * unexpected email headers.
 */
function cleanEmailSubject(
  value,
  fallback
) {
  const cleanedValue =
    typeof value === 'string'
      ? value
          .replace(
            /[\r\n]+/g,
            ' '
          )
          .trim()
          .slice(0, 200)
      : '';

  return cleanedValue ||
    fallback;
}

/**
 * Builds an absolute admin URL when APP_BASE_URL has been
 * configured.
 */
function buildAdminApplicationsUrl() {
  const baseUrl =
    typeof process.env.APP_BASE_URL ===
      'string'
      ? process.env.APP_BASE_URL
          .trim()
          .replace(/\/+$/, '')
      : '';

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/admin/applications`;
}

/**
 * Sends one notification email.
 *
 * When SMTP has not been configured, the function returns a
 * skipped result rather than throwing an error.
 */
async function sendNotificationEmail({
  subject,
  text
}) {
  if (
    !isMailerConfigured() ||
    !transporter
  ) {
    console.warn(
      'Email notification skipped because SMTP is not configured.'
    );

    return {
      sent: false,
      skipped: true,
      messageId: null
    };
  }

  const information =
    await transporter.sendMail({
      /*
       * Keep the sender aligned with the authenticated SMTP
       * mailbox.
       */
      from:
       `STI Assets Management Website <${smtpUser}>`,

      to:
        notificationRecipient,

      subject:
        cleanEmailSubject(
          subject,
          'New website notification'
        ),

      text,

      /*
       * These messages do not use filesystem or remote URL
       * attachments.
       */
      disableFileAccess:
        true,

      disableUrlAccess:
        true
    });

  return {
    sent: true,
    skipped: false,
    messageId:
      information.messageId
  };
}

/**
 * Sends an internal notification when someone submits the
 * website contact form.
 */
async function sendContactNotification({
  submissionId,
  name,
  email,
  phone,
  subject,
  message
}) {
  const notificationSubject =
    subject
      ? `Website contact: ${subject}`
      : 'New website contact message';

  return sendNotificationEmail({
  subject:
    notificationSubject,

    text: [
      'A new contact message was submitted through the website.',
      '',
      `Submission ID: ${submissionId || 'Not available'}`,
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || 'Not provided'}`,
      `Subject: ${subject || 'Not provided'}`,
      '',
      'Message:',
      message
    ].join('\n')
  });
}

/**
 * Sends an internal notification when a candidate submits a
 * job application.
 *
 * The résumé is not attached to the email. Administrators
 * should download it through the authenticated admin portal.
 */
async function sendJobApplicationNotification({
  applicationId,
  applicantName,
  email,
  phone,
  coverNote,
  jobId,
  jobTitle
}) {
  const adminApplicationsUrl =
    buildAdminApplicationsUrl();

  const messageLines = [
    'A new job application was submitted through the website.',
    '',
    `Application ID: ${applicationId}`,
    `Job ID: ${jobId}`,
    `Position: ${jobTitle}`,
    `Applicant: ${applicantName}`,
    `Email: ${email}`,
    `Phone: ${phone || 'Not provided'}`,
    '',
    'Cover note:',
    coverNote || 'Not provided'
  ];

  if (adminApplicationsUrl) {
    messageLines.push(
      '',
      `Review applications: ${adminApplicationsUrl}`
    );
  }

    return sendNotificationEmail({
    subject:
      `New job application: ${jobTitle}`,

    text:
      messageLines.join('\n')
  });
}

/**
 * Sends an internal notification when someone submits the
 * website newsletter subscription form.
 */
async function sendNewsletterNotification({
  email
}) {
  return sendNotificationEmail({
    subject:
      'New website newsletter subscription',

    text: [
      'A new newsletter subscription was submitted through the website.',
      '',
      `Subscriber email: ${email}`
    ].join('\n')
  });
}

module.exports = {
  sendContactNotification,
  sendJobApplicationNotification,
  sendNewsletterNotification
};