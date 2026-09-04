const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  requireAuth
} = require(
  '../middleware/auth.middleware'
);

const editorRoutes =
  require(
    './admin.editors.routes'
  );

const digestRoutes =
  require(
    './admin.digests.routes'
  );

const newsRoutes =
  require(
    './admin.news.routes'
  );

const jobRoutes =
  require(
    './admin.jobs.routes'
  );

const applicationRoutes =
  require(
    './admin.applications.routes'
  );

const contactRoutes =
  require(
    './admin.contacts.routes'
  );

const newsletterRoutes =
  require(
    './admin.newsletter.routes'
  );

const auditLogRoutes =
  require(
    './admin.audit-logs.routes'
  );

// Login page (public)
router.get('/login', (req, res) => res.render('admin/login', { error: null }));

// Everything below this line requires a logged-in admin
router.use(requireAuth);


router.use(
  '/editors',
  editorRoutes
);

router.use(
  '/downloads',
  digestRoutes
);

router.use(
  '/news',
  newsRoutes
);

router.use(
  '/jobs',
  jobRoutes
);

router.use(
  '/applications',
  applicationRoutes
);

router.use(
  '/contact-submissions',
  contactRoutes
);

router.use(
  '/newsletter',
  newsletterRoutes
);

router.use(
  '/audit-logs',
  auditLogRoutes
);

router.get(
  '/dashboard',

  (req, res) => {
    return res.render(
      'admin/dashboard',
      {
        admin:
          res.locals.admin
      }
    );
  }
);




// --- Future Admin Resources ---
// Admin management for FAQs and team profiles can be added
// later when those resources are moved into the database.


/*
 * ============================================================
 * ADMIN UPLOAD ERROR HANDLER
 * ============================================================
 *
 * Extracted admin routers use Multer for multipart uploads.
 *
 * Errors raised inside those child routers propagate back to
 * this parent router, where they are converted into controlled
 * 400 responses instead of leaking into the application's
 * generic 500 error handler.
 */
router.use(
  (
    error,
    req,
    res,
    next
  ) => {

    /*
     * CSRF failures are handled by the application's dedicated
     * CSRF error handler.
     */
    if (
      error.code ===
      'EBADCSRFTOKEN'
    ) {

      return next(
        error
      );

    }


    /*
     * Multer upload errors.
     */
    if (
      error instanceof
      multer.MulterError
    ) {

      if (
        error.code ===
        'LIMIT_FILE_SIZE'
      ) {

        return res.status(400).send(
          'The uploaded file exceeds the allowed size.'
        );

      }


      if (
        error.code ===
        'LIMIT_FILE_COUNT'
      ) {

        return res.status(400).send(
          'Too many files were uploaded.'
        );

      }


      if (
        error.code ===
        'LIMIT_UNEXPECTED_FILE'
      ) {

        return res.status(400).send(
          'The upload field was not recognised or too many files were selected.'
        );

      }


      return res.status(400).send(
        'The file upload could not be completed.'
      );

    }


    /*
     * File-filter errors raised by our extracted upload routers.
     */
    if (
      error.message ===
      'Please upload a PDF file with a .pdf extension.'
    ) {

      return res.status(400).send(
        error.message
      );

    }


    if (
      error.message ===
      'Please upload only JPEG, PNG or WebP images.'
    ) {

      return res.status(400).send(
        error.message
      );

    }


    /*
     * Anything unrelated to uploads continues to the main
     * application error handler.
     */
    return next(
      error
    );

  }
);


module.exports = router;