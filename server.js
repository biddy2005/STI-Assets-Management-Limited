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
        'https://stiassetmgt.com',

        /*
        * Allow images stored in the configured public R2 origin.
        *
        * Using the environment value means this automatically
        * follows us when R2_PUBLIC_BASE_URL is later changed from
        * the temporary R2 URL to assets.stiassetmgt.com.
        */
        ...(
          env.storageDriver ===
            'r2' &&
          env.r2PublicBaseUrl
            ? [
                new URL(
                  env.r2PublicBaseUrl
                ).origin
              ]
            : []
        )
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
 * Return only the pathname portion of a request URL.
 *
 * Query strings are deliberately excluded from routine
 * operational logs.
 */
const getRequestPath =
  (req) => {
    return typeof req.url === 'string'
      ? req.url.split('?')[0]
      : '';
  };


/*
 * Routine browser assets do not need an INFO log entry when
 * they are served successfully.
 *
 * Failed asset requests are still logged so missing or broken
 * files remain visible.
 */
const routineStaticAssetPattern =
  /\.(?:css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot|map)$/i;


/*
 * Give every request a server-generated identifier.
 *
 * The ID is returned to the browser and included in error
 * logs, making production incidents easier to trace.
 */
app.use(
  pinoHttp({
    logger,



    /*
     * Keep automatic HTTP request logs concise.
     *
     * We deliberately avoid logging the complete request and
     * response headers because they add a large amount of noise
     * and can contain cookies or other unnecessary information.
     */
    serializers: {
      req: (
        req
      ) => {
        const requestPath =
          getRequestPath(
            req
          );

        return {
          id:
            req.id,

          method:
            req.method,

          path:
            requestPath
        };
      },

      res: (
        res
      ) => {
        return {
          statusCode:
            res.statusCode
        };
      }
    },

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
      const requestPath =
        getRequestPath(
          req
        );

      /*
      * Health checks are intentionally quiet during normal
      * operation.
      *
      * /readyz already writes an explicit error log when the
      * PostgreSQL readiness check fails.
      */
      const isHealthCheck =
        requestPath === '/healthz' ||
        requestPath === '/readyz';

      /*
      * Successful static assets create large amounts of routine
      * log noise and provide little operational value.
      *
      * Failed static requests are deliberately NOT silenced.
      */
      const isSuccessfulStaticAsset =
        res.statusCode < 400 &&
        routineStaticAssetPattern.test(
          requestPath
        );

      if (
        isHealthCheck ||
        isSuccessfulStaticAsset
      ) {
        return 'silent';
      }

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
          const requestPath =
            getRequestPath(
              req
            );

          return `${req.method} ${requestPath} completed`;
        },

    customErrorMessage: (
      req,
      res,
      error
    ) => {
      const requestPath =
        getRequestPath(
          req
        );

      return `${req.method} ${requestPath} failed`;
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
    /*
     * Sessions deliberately use a smaller PostgreSQL pool than
     * Prisma's application-data pool.
     */
    conObject: {
      connectionString:
        env.databaseUrl,

      max:
        env.sessionDbPoolMax,

      idleTimeoutMillis:
        env.dbIdleTimeoutMs,

      connectionTimeoutMillis:
        env.dbConnectionTimeoutMs
    },

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

/*
 * Expose the store internally so automated integration tests
 * can close its PostgreSQL connection cleanly.
 */
app.locals.sessionStore =
  sessionStore;

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
          'Page Not Found',

        description:
          'The page you requested could not be found on the STI Assets Management website.',

        robots:
          'noindex,follow'
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
 * ============================================================
 * REQUEST BODY PARSER ERRORS
 * ============================================================
 *
 * Malformed or oversized client input is not an internal
 * application failure.
 *
 * Keep these responses out of the generic 500 handler so
 * monitoring does not mistake invalid client input for a
 * server outage.
 */
app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    const errorStatus =
      Number(
        error?.status ||
        error?.statusCode
      );


    const payloadTooLarge =
      errorStatus ===
        413 ||
      error?.type ===
        'entity.too.large' ||
      error?.type ===
        'parameters.too.many';


    if (payloadTooLarge) {
      req.log.warn(
        {
          requestId:
            req.requestId,

          method:
            req.method,

          path:
            req.originalUrl,

          errorType:
            error?.type || null
        },

        'Oversized request body rejected'
      );


      res.setHeader(
        'Cache-Control',
        'no-store'
      );


      return res
        .status(413)
        .send(
          'Request body is too large.'
        );
    }


    const malformedBody =
      errorStatus ===
        400 &&
      (
        error?.type ===
          'entity.parse.failed' ||
        error?.type ===
          'request.size.invalid'
      );


    if (malformedBody) {
      req.log.warn(
        {
          requestId:
            req.requestId,

          method:
            req.method,

          path:
            req.originalUrl,

          errorType:
            error?.type || null
        },

        'Malformed request body rejected'
      );


      res.setHeader(
        'Cache-Control',
        'no-store'
      );


      return res
        .status(400)
        .send(
          'Invalid request body.'
        );
    }


    return next(error);
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
          'Server Error',

        description:
          'An unexpected error occurred while processing your request.',

        robots:
          'noindex,nofollow'
      }
    );
  }
);

// ============================================================
// SERVER STARTUP
// ============================================================

/*
 * Start the HTTP server only when server.js is executed
 * directly.
 *
 * Integration tests can therefore require this file and test
 * the Express application without opening the normal
 * application port.
 */
if (
  require.main ===
  module
) {

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
}


/*
 * Export the Express application for integration tests.
 *
 * Running `node server.js` still starts the normal server
 * because require.main === module in that situation.
 */
module.exports =
  app;