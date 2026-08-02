const {
  rateLimit
} = require('express-rate-limit');

/**
 * Builds a consistent rate limiter for normal HTML forms.
 *
 * @param {object} options
 * @param {string} options.identifier
 * @param {number} options.windowMs
 * @param {number} options.limit
 * @param {string} options.message
 */
function createFormLimiter({
  identifier,
  windowMs,
  limit,
  message
}) {
  return rateLimit({
    /*
     * The length of time during which requests are counted.
     *
     * Example:
     * 15 * 60 * 1000 = 15 minutes
     */
    windowMs,

    /*
     * Maximum number of requests allowed from one IP address
     * during the configured window.
     */
    limit,

    /*
     * Gives this limiter a recognisable name in modern
     * RateLimit response headers.
     */
    identifier,

    /*
     * Send modern standards-based RateLimit headers.
     *
     * The browser's Network panel will show headers such as:
     * RateLimit
     * RateLimit-Policy
     */
    standardHeaders: 'draft-8',

    /*
     * Do not send the older X-RateLimit-* headers.
     */
    legacyHeaders: false,

    /*
     * This custom handler runs when the visitor exceeds
     * the configured limit.
     */
    handler: (req, res) => {
      let retryAfterSeconds = null;

      /*
       * express-rate-limit normally provides resetTime.
       * We calculate an approximate number of seconds remaining.
       */
      if (
        req.rateLimit?.resetTime instanceof Date
      ) {
        retryAfterSeconds = Math.max(
          1,
          Math.ceil(
            (
              req.rateLimit.resetTime.getTime() -
              Date.now()
            ) / 1000
          )
        );
      }

      return res.status(429).render('429', {
        title: 'Too Many Requests',
        message,
        retryAfterSeconds
      });
    }
  });
}

/*
 * Contact form:
 *
 * A visitor can submit the contact form five times
 * in fifteen minutes.
 */
const contactLimiter = createFormLimiter({
  identifier: 'contact-form',
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message:
    'You have submitted the contact form too many times. Please wait a few minutes before trying again.'
});

/*
 * Newsletter form:
 *
 * A visitor can attempt ten subscriptions in one hour.
 *
 * This allows for occasional typing mistakes without allowing
 * automated scripts to submit the form continuously.
 */
const newsletterLimiter = createFormLimiter({
  identifier: 'newsletter-form',
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message:
    'You have made too many newsletter subscription attempts. Please try again later.'
});

/*
 * Careers application form:
 *
 * A visitor can submit three job applications in one hour.
 *
 * This limit is lower because each application can also include
 * an uploaded PDF and create a database record.
 */
const careersLimiter = createFormLimiter({
  identifier: 'careers-form',
  windowMs: 60 * 60 * 1000,
  limit: 3,
  message:
    'You have submitted too many job applications. Please wait before trying again.'
});

/*
 * Administrator login:
 *
 * A visitor can attempt ten logins in fifteen minutes.
 */
const loginLimiter = createFormLimiter({
  identifier: 'admin-login',
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message:
    'Too many login attempts were made from this device. Please wait before trying again.'
});

module.exports = {
  contactLimiter,
  newsletterLimiter,
  careersLimiter,
  loginLimiter
};