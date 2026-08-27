const pino =
  require('pino');

const env =
  require('./env');


/*
 * ============================================================
 * APPLICATION LOGGER
 * ============================================================
 *
 * Logs are emitted as structured JSON.
 *
 * Never deliberately log:
 * - passwords
 * - session secrets
 * - database credentials
 * - Power Automate webhook credentials
 * - R2 credentials
 * - CSRF tokens
 * - contact/application message bodies
 *
 * The redact configuration below provides a second layer of
 * protection in case one of these values is accidentally
 * included in a structured log object.
 */

const logger =
  pino({
    level:
      env.logLevel,

    base: {
      service:
        'asset-mgmt-site',

      environment:
        env.nodeEnv
    },

    timestamp:
      pino.stdTimeFunctions
        .isoTime,

    redact: {
      paths: [
        /*
         * HTTP authentication/session data.
         */
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',

        /*
         * Administrator credentials.
         */
        'password',
        'passwordHash',
        'currentPassword',
        'newPassword',
        'confirmPassword',
        'sessionSecret',

        /*
         * Database credentials.
         */
        'databaseUrl',
        'DATABASE_URL',

        /*
         * Cloudflare R2 credentials.
         */
        'r2AccessKeyId',
        'r2SecretAccessKey',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',

        /*
         * Request-body secrets and personal data.
         *
         * pino-http does not log req.body by default, but these
         * paths provide defence in depth if body logging is ever
         * introduced elsewhere.
         */
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.confirmPassword',
        'req.body._csrf',
        'req.body.email',
        'req.body.phone',
        'req.body.message',
        'req.body.coverNote',

        /*
         * Also protect body objects that may be logged directly
         * rather than through req.body.
         */
        'body.password',
        'body.currentPassword',
        'body.newPassword',
        'body.confirmPassword',
        'body._csrf',
        'body.email',
        'body.phone',
        'body.message',
        'body.coverNote',
        /*
        * Résumé content passed to the Careers Power Automate
        * integration.
        */
        'resumeContentBase64',
        'resume.contentBytes',
        'body.resume.contentBytes',
        'req.body.resume.contentBytes',
        /*
        * Power Automate webhook credentials and Newsletter
        * unsubscribe signing secret.
        */
        'powerAutomateContactUrl',
        'powerAutomateCareersUrl',
        'powerAutomateNewsletterUrl',
        'powerAutomateNewsletterUnsubscribeUrl',
        'newsletterUnsubscribeSecret',
        'POWER_AUTOMATE_CONTACT_URL',
        'POWER_AUTOMATE_CAREERS_URL',
        'POWER_AUTOMATE_NEWSLETTER_URL',
        'POWER_AUTOMATE_NEWSLETTER_UNSUBSCRIBE_URL',
        'NEWSLETTER_UNSUBSCRIBE_SECRET'

      ],

      censor:
        '[REDACTED]'
    }
  });


module.exports =
  logger;