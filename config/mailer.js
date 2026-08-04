const nodemailer =
  require('nodemailer');

/*
 * Read and normalise the SMTP environment variables once when
 * the application starts.
 */
const smtpHost =
  typeof process.env.SMTP_HOST === 'string'
    ? process.env.SMTP_HOST.trim()
    : '';

const smtpPort =
  Number(process.env.SMTP_PORT) ||
  587;

const smtpUser =
  typeof process.env.SMTP_USER === 'string'
    ? process.env.SMTP_USER.trim()
    : '';

const smtpPass =
  typeof process.env.SMTP_PASS === 'string'
    ? process.env.SMTP_PASS
    : '';

const notificationRecipient =
  typeof process.env.NOTIFY_EMAIL === 'string'
    ? process.env.NOTIFY_EMAIL.trim()
    : '';

/**
 * Returns true only when every value needed for email
 * notifications has been supplied.
 */
function isMailerConfigured() {
  return Boolean(
    smtpHost &&
    smtpPort &&
    smtpUser &&
    smtpPass &&
    notificationRecipient
  );
}

/*
 * Do not create a real SMTP transporter while the environment
 * configuration is incomplete.
 */
const transporter =
  isMailerConfigured()
    ? nodemailer.createTransport({
        host:
          smtpHost,

        port:
          smtpPort,

        /*
         * Port 465 starts with TLS immediately.
         *
         * Port 587 normally begins unencrypted and upgrades
         * through STARTTLS.
         */
        secure:
          smtpPort === 465,

        auth: {
          user:
            smtpUser,

          pass:
            smtpPass
        },

        /*
         * Prevent SMTP connection attempts from hanging for
         * an excessive period when the provider is unreachable.
         */
        connectionTimeout:
          10_000,

        greetingTimeout:
          10_000,

        socketTimeout:
          20_000
      })
    : null;

/**
 * Tests DNS resolution, connection, TLS and authentication.
 *
 * No email is sent by this function.
 */
async function verifyMailerConnection() {
  if (
    !isMailerConfigured() ||
    !transporter
  ) {
    return {
      configured: false,
      verified: false,
      message:
        'SMTP email is not configured.'
    };
  }

  await transporter.verify();

  return {
    configured: true,
    verified: true,
    message:
      'SMTP connection verified successfully.'
  };
}

module.exports = {
  transporter,
  isMailerConfigured,
  verifyMailerConnection,
  notificationRecipient,
  smtpUser
};