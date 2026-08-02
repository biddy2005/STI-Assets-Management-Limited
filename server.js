const env = require('./config/env');
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');

const pgSession =
  require('connect-pg-simple')(session);




const pageRoutes = require('./routes/pages.routes');
const adminRoutes = require('./routes/admin.routes');
const authRoutes = require('./routes/auth.routes');
const contactRoutes = require('./routes/api.contact.routes');
const careersRoutes = require('./routes/api.careers.routes');
const newsletterRoutes = require('./routes/api.newsletter.routes');

const {
  contactLimiter,
  newsletterLimiter,
  careersLimiter,
  loginLimiter
} = require(
  './middleware/rateLimit.middleware'
);

const app = express();
if (env.isProduction) app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https://images.unsplash.com', 'https://stiassetmgt.com'],
        'frame-src': ["'self'", 'https://www.google.com']
      }
    }
  })
);




// ---- View engine ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Middleware ----
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    name: 'assetco.sid',

    store: new pgSession({
      conString: env.databaseUrl,
      schemaName: 'sessions',
      tableName: 'session',
      createTableIfMissing: true
    }),

    secret: env.sessionSecret,

    resave: false,
    saveUninitialized: false,
    rolling: true,

    cookie: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 2
    }
  })
);

app.use((req, res, next) => {
  res.locals.newsletterSuccess = req.query.subscribed === '1';
  res.locals.newsletterError = req.query.newsletterError === '1';
  next();
});


// ============================================================
// RATE-LIMITED FORM SUBMISSIONS
// ============================================================

/*
 * Protect only the login POST request.
 *
 * A normal visit to a login page should not count against
 * the limit. Only submitting the form counts.
 */
app.post(
  '/auth/login',
  loginLimiter
);

/*
 * Protect only contact form submissions.
 */
app.post(
  '/api/contact',
  contactLimiter
);

/*
 * Protect only career application submissions.
 *
 * IMPORTANT:
 * This line must appear before careersRoutes is mounted.
 *
 * That ensures the limiter runs before Multer processes and
 * saves the résumé file.
 */
app.post(
  '/api/careers/apply',
  careersLimiter
);

/*
 * Protect only newsletter form submissions.
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

const prisma = require('./config/db');

app.get('/healthz', (req, res) => {
  return res.status(200).json({
    status: 'ok'
  });
});

app.get('/readyz', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      status: 'ready'
    });
  } catch (error) {
    return res.status(503).json({
      status: 'not-ready'
    });
  }
});


// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// ---- Error handler ----
app.use((error, req, res, next) => {
  /*
   * This is important when an error happens after Express has
   * already started sending a file or response.
   */
  if (res.headersSent) {
    return next(error);
  }

  console.error(
    'Unhandled application error:',
    error
  );

  return res.status(500).render(
    '500',
    {
      title: 'Server Error'
    }
  );
});

const PORT = env.port;
const server = app.listen(PORT, () => {
  console.log(
    `Server listening on port ${PORT}`
  );
});

async function shutdown(signal) {
  console.log(
    `${signal} received. Closing server.`
  );

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10000).unref();
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);
