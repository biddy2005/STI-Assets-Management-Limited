require('dotenv').config();

const env =
  require('./config/env');

const express =
  require('express');

const session =
  require('express-session');

const path =
  require('path');

const crypto =
  require('crypto');

const helmet =
  require('helmet');

const prisma =
  require('./config/db');

const pgSession =
  require('connect-pg-simple')(
    session
  );

const {
  exposeCsrfToken
} = require(
  './middleware/csrf.middleware'
);

const pageRoutes =
  require('./routes/pages.routes');

const adminRoutes =
  require('./routes/admin.routes');

const authRoutes =
  require('./routes/auth.routes');

const contactRoutes =
  require('./routes/api.contact.routes');

const careersRoutes =
  require('./routes/api.careers.routes');

const newsletterRoutes =
  require('./routes/api.newsletter.routes');

const {
  contactLimiter,
  newsletterLimiter,
  careersLimiter,
  loginLimiter
} = require(
  './middleware/rateLimit.middleware'
);

const pinoHttp =
  require('pino-http');

const logger =
  require('./config/logger');

const app =
  express();

/**
 * Converts the TRUST_PROXY environment value into a setting
 * Express understands.
 *
 * Examples:
 *
 * TRUST_PROXY="1"
 * TRUST_PROXY="loopback"
 * TRUST_PROXY="loopback, linklocal"
 * TRUST_PROXY="true"
 * TRUST_PROXY="false"
 */
function parseTrustProxy(
  value
) {
  const normalizedValue =
    typeof value === 'string'
      ? value.trim()
      : '';

  if (!normalizedValue) {
    return null;
  }

  if (
    normalizedValue.toLowerCase() ===
    'true'
  ) {
    return true;
  }

  if (
    normalizedValue.toLowerCase() ===
    'false'
  ) {
    return false;
  }

  if (
    /^\d+$/.test(
      normalizedValue
    )
  ) {
    return Number(
      normalizedValue
    );
  }

  return normalizedValue;
}

/*
 * Configure reverse-proxy trust explicitly in production.
 *
 * This affects:
 *
 * - req.ip
 * - req.protocol
 * - secure cookies
 * - IP-based rate limits
 */
if (env.isProduction) {
  const trustProxySetting =
    parseTrustProxy(
      process.env.TRUST_PROXY
    );

  if (
    trustProxySetting === null
  ) {
    throw new Error(
      'TRUST_PROXY must be configured in production.'
    );
  }

  if (
    trustProxySetting === false
  ) {
    app.disable(
      'trust proxy'
    );
  } else {
    app.set(
      'trust proxy',
      trustProxySetting
    );
  }
}

/*
 * Helmet already removes X-Powered-By, but disabling it
 * explicitly documents the intended behaviour.
 */
app.disable(
  'x-powered-by'
);

/*
 * Security headers.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet
          .contentSecurityPolicy
          .getDefaultDirectives(),

        'img-src': [
          "'self'",
          'data:',
          'https://images.unsplash.com',
          'https://stiassetmgt.com'
        ],

        'frame-src': [
          "'self'",
          'https://www.google.com'
        ]
      }
    },

    /*
     * Only send HSTS in production because development uses
     * HTTP on localhost.
     */
    strictTransportSecurity:
      env.isProduction
        ? {
            maxAge:
              31_536_000,

            includeSubDomains:
              true
          }
        : false
  })
);

/*
 * Give every request a server-generated identifier.
 *
 * The ID is returned to the browser and included in error
 * logs, making production incidents easier to trace.
 */
app.use(
  pinoHttp({
    logger,

    genReqId: (
      req,
      res
    ) => {
      const requestId =
        crypto.randomUUID();

      req.requestId =
        requestId;

      res.setHeader(
        'X-Request-ID',
        requestId
      );

      return requestId;
    },

    customLogLevel: (
      req,
      res,
      error
    ) => {
      if (
        error ||
        res.statusCode >= 500
      ) {
        return 'error';
      }

      if (
        res.statusCode >= 400
      ) {
        return 'warn';
      }

      return 'info';
    },

    customSuccessMessage: (
      req,
      res
    ) => {
      return `${req.method} ${req.url} completed`;
    },

    customErrorMessage: (
      req,
      res,
      error
    ) => {
      return `${req.method} ${req.url} failed`;
    }
  })
);

/*
 * Health check.
 *
 * This endpoint confirms that the Node application is running.
 * It does not depend on sessions, CSRF or PostgreSQL.
 */
app.get(
  '/healthz',
  (req, res) => {
    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    return res.status(200).json({
      status: 'ok',
      requestId:
        req.requestId
    });
  }
);

/*
 * Readiness check.
 *
 * This endpoint confirms that the application can communicate
 * with PostgreSQL.
 */
app.get(
  '/readyz',
  async (req, res) => {
    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    try {
      await prisma.$queryRaw`
        SELECT 1
      `;

      return res.status(200).json({
        status: 'ready',
        requestId:
          req.requestId
      });
    } catch (error) {
      req.log.error(
        {
          err:
            error,

          requestId:
            req.requestId
        },

        'Readiness check failed'
      );

      return res.status(503).json({
        status: 'not-ready',
        requestId:
          req.requestId
      });
    }
  }
);

// ============================================================
// VIEW ENGINE
// ============================================================

app.set(
  'view engine',
  'ejs'
);

app.set(
  'views',
  path.join(
    __dirname,
    'views'
  )
);

// ============================================================
// REQUEST PARSING AND STATIC FILES
// ============================================================

/*
 * These limits apply to URL-encoded and JSON requests.
 *
 * Multipart file uploads are handled separately by Multer and
 * retain their own file-size limits.
 */
app.use(
  express.urlencoded({
    extended: true,
    limit: '250kb',
    parameterLimit: 100
  })
);

app.use(
  express.json({
    limit: '250kb'
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      'public'
    ),
    {
      /*
       * Do not expose hidden files such as .env-style files if
       * one is accidentally copied into public.
       */
      dotfiles: 'ignore',

      /*
       * Do not automatically serve an index.html file.
       * EJS routes control page responses.
       */
      index: false,

      etag: true,
      fallthrough: true
    }
  )
);

/*
 * Prevent authenticated/admin pages from being stored in the
 * browser cache.
 */
app.use(
  (req, res, next) => {
    if (
      req.path.startsWith(
        '/admin'
      ) ||
      req.path.startsWith(
        '/auth'
      )
    ) {
      res.setHeader(
        'Cache-Control',
        'private, no-store, max-age=0'
      );

      res.setHeader(
        'Pragma',
        'no-cache'
      );
    }

    return next();
  }
);

// ============================================================
// SESSION MANAGEMENT
// ============================================================

const sessionStore =
  new pgSession({
    conString:
      env.databaseUrl,

    schemaName:
      'sessions',

    tableName:
      'session',

    /*
     * Development can create the session table automatically.
     *
     * Production must create it through a controlled database
     * migration before the application starts.
     */
    createTableIfMissing:
      !env.isProduction
  });

sessionStore.on(
  'error',
  (error) => {
    logger.error(
      {
        err:
          error
      },

      'Session store error'
    );
  }
);

app.use(
  session({
    name:
      'assetco.sid',

    store:
      sessionStore,

    secret:
      env.sessionSecret,

    resave:
      false,

    saveUninitialized:
      false,

    rolling:
      true,

    cookie: {
      httpOnly:
        true,

      /*
       * Secure cookies require HTTPS in production.
       *
       * Correct TRUST_PROXY configuration is important when
       * HTTPS terminates at a reverse proxy.
       */
      secure:
        env.isProduction,

      sameSite:
        'lax',

      maxAge:
        1000 *
        60 *
        60 *
        2
    }
  })
);

/*
 * CSRF tokens depend on req.session, so this must remain after
 * session middleware.
 */
app.use(
  exposeCsrfToken
);

/*
 * Footer newsletter status values.
 */
app.use(
  (req, res, next) => {
    res.locals.newsletterSuccess =
      req.query.subscribed ===
      '1';

    res.locals.newsletterError =
      req.query.newsletterError ===
      '1';

    return next();
  }
);

// ============================================================
// RATE-LIMITED FORM SUBMISSIONS
// ============================================================

/*
 * Protect only login submissions.
 */
app.post(
  '/auth/login',
  loginLimiter
);

/*
 * Protect only contact submissions.
 */
app.post(
  '/api/contact',
  contactLimiter
);

/*
 * This must remain before careersRoutes is mounted so the
 * limiter runs before Multer stores a résumé.
 */
app.post(
  '/api/careers/apply',
  careersLimiter
);

/*
 * Protect only newsletter subscriptions.
 */
app.post(
  '/api/newsletter',
  newsletterLimiter
);

// ============================================================
// ROUTES
// ============================================================

app.use(
  '/',
  pageRoutes
);

app.use(
  '/admin',
  adminRoutes
);

app.use(
  '/auth',
  authRoutes
);

app.use(
  '/api/contact',
  contactRoutes
);

app.use(
  '/api/careers',
  careersRoutes
);

app.use(
  '/api/newsletter',
  newsletterRoutes
);

// ============================================================
// 404 AND ERROR HANDLERS
// ============================================================

app.use(
  (req, res) => {
    return res.status(404).render(
      '404',
      {
        title:
          'Page Not Found'
      }
    );
  }
);

/*
 * CSRF error handler.
 */
app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    if (
      error.code !==
      'EBADCSRFTOKEN'
    ) {
      return next(error);
    }

    req.log.warn(
      {
        requestId:
          req.requestId,

        method:
          req.method,

        path:
          req.originalUrl
      },

      'CSRF request rejected'
    );

    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    return res.status(403).render(
      '403',
      {
        title:
          'Request Rejected',

        message:
          'Your form session expired or the request could not be verified.'
      }
    );
  }
);

/*
 * Global application error handler.
 */
app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    /*
     * Forward the error to Express when a response has already
     * started.
     */
    if (res.headersSent) {
      return next(error);
    }

    req.log.error(
      {
        err:
          error
      },

      'Unhandled application error'
    );

    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    return res.status(500).render(
      '500',
      {
        title:
          'Server Error'
      }
    );
  }
);

// ============================================================
// SERVER STARTUP
// ============================================================

const PORT =
  env.port;

const server =
  app.listen(
    PORT,
    () => {
      logger.info(
        {
          port:
            PORT
        },

        'Server started'
      );
    }
  );

/*
 * Limit the amount of time a client can occupy an HTTP
 * connection.
 *
 * The request timeout remains long enough for your existing
 * PDF and image uploads.
 */
server.requestTimeout =
  120_000;

server.headersTimeout =
  60_000;

server.keepAliveTimeout =
  5_000;

server.maxRequestsPerSocket =
  1_000;

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

let isShuttingDown =
  false;

async function disconnectPrisma() {
  try {
    await prisma.$disconnect();
  } catch (error) {
    logger.error(
      {
        err:
          error
      },

      'Prisma disconnection failed'
    );
  }
}

function shutdown(
  signal,
  exitCode = 0
) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown =
    true;

  logger.info(
    {
      signal
    },

    'Shutdown signal received'
  );
  /*
   * Force the process to stop when active connections prevent
   * a normal shutdown.
   */
  const forceShutdownTimer =
    setTimeout(
    async () => {
      logger.error(
        {
          signal
        },

        'Graceful shutdown timed out'
      );

      await disconnectPrisma();

      process.exit(1);
    },
    10_000
  );

  forceShutdownTimer.unref();

  server.close(
    async () => {
      clearTimeout(
        forceShutdownTimer
      );

      await disconnectPrisma();

      process.exit(
        exitCode
      );
    }
  );

  /*
   * Close idle keep-alive connections where supported by the
   * installed Node.js version.
   */
  if (
    typeof server
      .closeIdleConnections ===
    'function'
  ) {
    server.closeIdleConnections();
  }
}

process.on(
  'SIGTERM',
  () => {
    shutdown(
      'SIGTERM'
    );
  }
);

process.on(
  'SIGINT',
  () => {
    shutdown(
      'SIGINT'
    );
  }
);

/*
 * Unexpected process-level errors leave the application in an
 * uncertain state. Log them and shut down rather than
 * continuing to accept requests.
 */
process.on(
  'uncaughtException',
  (error) => {
    logger.fatal(
      {
        err:
          error
      },

      'Uncaught exception'
    );

    shutdown(
      'uncaughtException',
      1
    );
  }
);

process.on(
  'unhandledRejection',
  (reason) => {
    const rejectionError =
      reason instanceof Error
        ? reason
        : new Error(
            String(reason)
          );

    logger.fatal(
      {
        err:
          rejectionError
      },

      'Unhandled Promise rejection'
    );

    shutdown(
      'unhandledRejection',
      1
    );
  }
);