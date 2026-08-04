const pino =
  require('pino');

const env =
  require('./env');

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
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',

        'password',
        'passwordHash',
        'sessionSecret',

        'SMTP_PASS',
        'DATABASE_URL',

        'req.body.password',
        'req.body._csrf',
        'req.body.message',
        'req.body.coverNote'
      ],

      censor:
        '[REDACTED]'
    }
  });

module.exports =
  logger;