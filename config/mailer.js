const nodemailer =
  require('nodemailer');

const env =
  require('./env');


/*
 * ============================================================
 * MAIL CONFIGURATION
 * ============================================================
 */

function isMailerConfigured() {
  return Boolean(
    env.mailerConfigured
  );
}


/*
 * Export these separately so the email service does not need
 * to read process.env directly.
 */
const smtpUser =
  env.smtpUser;

const notificationRecipient =
  env.notifyEmail;


const transporter =
  isMailerConfigured()
    ? nodemailer.createTransport({
        host:
          env.smtpHost,

        port:
          env.smtpPort,

        secure:
          env.smtpPort === 465,

        requireTLS:
          env.smtpPort === 587,

        auth: {
          user:
            env.smtpUser,

          pass:
            env.smtpPass
        },

        tls: {
          minVersion:
            'TLSv1.2'
        }
      })
    : null;


module.exports = {
  transporter,
  isMailerConfigured,
  notificationRecipient,
  smtpUser
};