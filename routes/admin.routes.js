const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const {
  requireAuth,
  requireRole
} = require('../middleware/auth.middleware');
const prisma = require('../config/db');
const {
  resumeDirectory
} = require('../config/storage');
const { DAY_ORDER, DAY_LABELS, getActiveWeekRange, getDateForDay } = require('../utils/digestWeek');
const { slugify } = require('../utils/slugify');

// Login page (public)
router.get('/login', (req, res) => res.render('admin/login', { error: null }));

// Everything below this line requires a logged-in admin
router.use(requireAuth);

/*
 * Content editors can create and update public website content.
 */
const contentManagerOnly = requireRole(
  'superadmin',
  'editor'
);

/*
 * Sensitive data and permanent deletion are restricted
 * to superadmins.
 */
const superAdminOnly = requireRole(
  'superadmin'
);

router.get('/dashboard', (req, res) => {
  res.render('admin/dashboard', { admin: { email: req.session.adminEmail } });
});

// --- Daily Digest uploads ---
const digestStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/digests')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const uploadDigest = multer({
  storage: digestStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  }
});

router.get('/downloads', async (req, res) => {
  const { weekStart, weekEnd } = getActiveWeekRange();

  const digests = await prisma.dailyDigest.findMany({
    where: { publishDate: { gte: weekStart, lte: weekEnd } },
    orderBy: { publishDate: 'asc' }
  });

  const byDay = {};
  digests.forEach((d) => { byDay[d.dayOfWeek] = d; });

  const days = DAY_ORDER.map((day) => ({
    key: day,
    label: DAY_LABELS[day],
    digest: byDay[day] || null
  }));

  res.render('admin/downloads-manager', { days, error: null });
});

router.post('/downloads', uploadDigest.single('digestFile'), async (req, res) => {
  try {
    const { dayOfWeek } = req.body;

    if (!DAY_ORDER.includes(dayOfWeek) || !req.file) {
      return res.redirect('/admin/downloads');
    }

    const { weekStart } = getActiveWeekRange();
    const publishDate = getDateForDay(weekStart, dayOfWeek);

    const existing = await prisma.dailyDigest.findFirst({
      where: { dayOfWeek, publishDate }
    });

    if (existing) {
      await prisma.dailyDigest.update({
        where: { id: existing.id },
        data: { filePath: `/uploads/digests/${req.file.filename}` }
      });
    } else {
      await prisma.dailyDigest.create({
        data: {
          title: 'STIAM Daily Market Digest',
          filePath: `/uploads/digests/${req.file.filename}`,
          publishDate,
          dayOfWeek
        }
      });
    }

    res.redirect('/admin/downloads');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/downloads');
  }
});

router.post(
  '/downloads/:id/delete',
  requireRole('superadmin'),
  async (req, res, next) => {
  try {
    await prisma.dailyDigest.delete({ where: { id: Number(req.params.id) } });
  } catch (err) {
    console.error(err);
  }
  res.redirect('/admin/downloads');
});

// --- News & Articles ---
const newsStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/news')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const imageFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'));
  }
  cb(null, true);
};

const uploadCoverImage = multer({ storage: newsStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter });
const uploadGalleryImages = multer({ storage: newsStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter });

router.get('/news', async (req, res) => {
  const articles = await prisma.newsArticle.findMany({ orderBy: { createdAt: 'desc' } });
  res.render('admin/news-manager', { articles });
});

router.get('/news/new', (req, res) => {
  res.render('admin/news-form', { article: null, error: null });
});

router.post('/news', uploadCoverImage.single('coverImage'), async (req, res) => {
  try {
    const { title, body, published } = req.body;
    const baseSlug = slugify(title);

    let slug = baseSlug;
    let counter = 1;
    while (await prisma.newsArticle.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    await prisma.newsArticle.create({
      data: {
        title,
        slug,
        body,
        coverImage: req.file ? `/uploads/news/${req.file.filename}` : null,
        published: published === 'on',
        publishedAt: published === 'on' ? new Date() : null
      }
    });

    res.redirect('/admin/news');
  } catch (err) {
    console.error(err);
    res.render('admin/news-form', { article: null, error: 'Something went wrong creating the article.' });
  }
});

router.get('/news/:id/edit', async (req, res) => {
  const article = await prisma.newsArticle.findUnique({ where: { id: Number(req.params.id) } });
  if (!article) return res.redirect('/admin/news');
  res.render('admin/news-form', { article, error: null });
});

router.post('/news/:id', uploadCoverImage.single('coverImage'), async (req, res) => {
  try {
    const { title, body, published } = req.body;
    const id = Number(req.params.id);
    const existing = await prisma.newsArticle.findUnique({ where: { id } });
    if (!existing) return res.redirect('/admin/news');

    const wasPublished = existing.published;
    const isNowPublished = published === 'on';

    await prisma.newsArticle.update({
      where: { id },
      data: {
        title,
        body,
        published: isNowPublished,
        publishedAt: isNowPublished && !wasPublished ? new Date() : existing.publishedAt,
        ...(req.file ? { coverImage: `/uploads/news/${req.file.filename}` } : {})
      }
    });

    res.redirect('/admin/news');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/news');
  }
});

router.post(
  '/news/:id/delete',
  requireRole('superadmin'),
  async (req, res, next) => {
  try {
    await prisma.newsArticle.delete({ where: { id: Number(req.params.id) } });
  } catch (err) {
    console.error(err);
  }
  res.redirect('/admin/news');
});

// --- News gallery management ---
router.get('/news/:id/images', async (req, res) => {
  const article = await prisma.newsArticle.findUnique({
    where: { id: Number(req.params.id) },
    include: { images: { orderBy: { order: 'asc' } } }
  });
  if (!article) return res.redirect('/admin/news');
  res.render('admin/news-images', { article, error: null });
});

router.post('/news/:id/images', uploadGalleryImages.array('galleryImages', 10), async (req, res) => {
  try {
    const newsArticleId = Number(req.params.id);
    const files = req.files || [];

    const lastImage = await prisma.newsImage.findFirst({
      where: { newsArticleId },
      orderBy: { order: 'desc' }
    });
    let nextOrder = lastImage ? lastImage.order + 1 : 0;

    for (const file of files) {
      await prisma.newsImage.create({
        data: {
          newsArticleId,
          imageUrl: `/uploads/news/${file.filename}`,
          order: nextOrder
        }
      });
      nextOrder += 1;
    }

    res.redirect(`/admin/news/${newsArticleId}/images`);
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/news/${req.params.id}/images`);
  }
});

router.post(
  '/news/:id/images/:imageId/delete',
  requireRole('superadmin'),
  async (req, res, next) => {
  try {
    await prisma.newsImage.delete({ where: { id: Number(req.params.imageId) } });
  } catch (err) {
    console.error(err);
  }
  res.redirect(`/admin/news/${req.params.id}/images`);
});

// --- Job Postings ---
router.get('/jobs', async (req, res) => {
  const jobs = await prisma.jobPosting.findMany({ orderBy: { createdAt: 'desc' } });
  res.render('admin/jobs-manager', { jobs });
});

router.get('/jobs/new', (req, res) => {
  res.render('admin/jobs-form', { job: null, error: null });
});

router.post('/jobs', async (req, res) => {
  try {
    const { title, department, location, description, deadline, status } = req.body;

    await prisma.jobPosting.create({
      data: {
        title,
        department,
        location,
        description,
        deadline: deadline ? new Date(deadline) : null,
        status: status === 'open' ? 'open' : 'closed'
      }
    });

    res.redirect('/admin/jobs');
  } catch (err) {
    console.error(err);
    res.render('admin/jobs-form', { job: null, error: 'Something went wrong creating the job posting.' });
  }
});

router.get('/jobs/:id/edit', async (req, res) => {
  const job = await prisma.jobPosting.findUnique({ where: { id: Number(req.params.id) } });
  if (!job) return res.redirect('/admin/jobs');
  res.render('admin/jobs-form', { job, error: null });
});

router.post('/jobs/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, department, location, description, deadline, status } = req.body;

    await prisma.jobPosting.update({
      where: { id },
      data: {
        title,
        department,
        location,
        description,
        deadline: deadline ? new Date(deadline) : null,
        status: status === 'open' ? 'open' : 'closed'
      }
    });

    res.redirect('/admin/jobs');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/jobs');
  }
});

router.post(
  '/jobs/:id/delete',
  requireRole('superadmin'),
  async (req, res, next) => {
  try {
    await prisma.jobPosting.delete({ where: { id: Number(req.params.id) } });
  } catch (err) {
    console.error(err);
  }
  res.redirect('/admin/jobs');
});

// --- Job Applications (read-only, tied to Job Postings) ---
router.get(
  '/applications',
  requireRole('superadmin'),
  async (req, res, next) => {
    try {
      const jobIdFilter =
        req.query.jobId
          ? Number(req.query.jobId)
          : null;

      const applications =
        await prisma.jobApplication.findMany({
          where: jobIdFilter
            ? {
                jobId: jobIdFilter
              }
            : {},

          include: {
            job: true
          },

          orderBy: {
            submittedAt: 'desc'
          }
        });

      const jobs =
        await prisma.jobPosting.findMany({
          orderBy: {
            createdAt: 'desc'
          }
        });

      return res.render(
        'admin/applications-manager',
        {
          applications,
          jobs,
          jobIdFilter
        }
      );
    } catch (error) {
      return next(error);
    }
  }
);

/*
 * Download an applicant's résumé.
 *
 * Everything in admin.routes.js after router.use(requireAuth)
 * already requires an authenticated administrator.
 */
router.get(
  '/applications/:id/resume',
  requireRole('superadmin'),
  async (req, res, next) => {
    try {
      const applicationId =
        Number(req.params.id);

      if (
        !Number.isInteger(applicationId) ||
        applicationId < 1
      ) {
        return res.status(400).send(
          'Invalid application ID.'
        );
      }

      const application =
        await prisma.jobApplication.findUnique({
          where: {
            id: applicationId
          }
        });

      if (!application) {
        return res.status(404).render(
          '404',
          {
            title:
              'Application Not Found'
          }
        );
      }

      /*
       * path.basename removes any directory path and keeps only
       * the filename.
       *
       * This prevents a stored value such as ../../secret.txt
       * from being used to read files outside the résumé folder.
       */
      const safeStorageName =
        path.basename(
          application.resumeStorageKey
        );

      const resumePath = path.join(
        resumeDirectory,
        safeStorageName
      );

      /*
       * Check that the file exists before trying to download it.
       */
      try {
        await fs.access(resumePath);
      } catch (error) {
        return res.status(404).send(
          'The résumé file could not be found.'
        );
      }

      /*
       * Do not allow the browser or an intermediary cache to
       * retain the résumé.
       */
      res.setHeader(
        'Cache-Control',
        'private, no-store, max-age=0'
      );

      res.setHeader(
        'Pragma',
        'no-cache'
      );

      res.setHeader(
        'X-Content-Type-Options',
        'nosniff'
      );

      /*
       * res.download() forces a file download and uses the
       * applicant's original filename.
       */
      return res.download(
        resumePath,
        application.resumeOriginalName,
        (error) => {
          if (
            error &&
            !res.headersSent
          ) {
            return next(error);
          }
        }
      );
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/applications/:id/delete',

  /*
   * Only administrators whose role is SUPERADMIN
   * can continue to the deletion code below.
   */
  requireRole('superadmin'),

  async (req, res, next) => {
    const applicationId =
      Number(req.params.id);

    /*
     * Make sure the application ID is a valid positive number.
     */
    if (
      !Number.isInteger(applicationId) ||
      applicationId < 1
    ) {
      return res.status(400).send(
        'Invalid application ID.'
      );
    }

    try {
      /*
       * Find the application before deleting it.
       *
       * We need resumeStorageKey so that we can also delete
       * the résumé from storage/private/resumes.
       */
      const application =
        await prisma.jobApplication.findUnique({
          where: {
            id: applicationId
          }
        });

      /*
       * Stop when the application does not exist.
       */
      if (!application) {
        return res.status(404).send(
          'Application not found.'
        );
      }

      /*
       * Delete the database record.
       */
      await prisma.jobApplication.delete({
        where: {
          id: applicationId
        }
      });

      /*
       * Get only the safe filename.
       *
       * For example:
       * 1722345678901-random-id.pdf
       */
      const safeStorageName =
        path.basename(
          application.resumeStorageKey
        );

      /*
       * Build the complete private résumé path.
       */
      const resumePath = path.join(
        resumeDirectory,
        safeStorageName
      );

      /*
       * Delete the résumé file.
       */
      try {
        await fs.unlink(resumePath);
      } catch (fileError) {
        /*
         * ENOENT means the résumé file was already missing.
         * That should not crash the application.
         */
        if (fileError.code !== 'ENOENT') {
          console.error(
            'Application deleted, but résumé cleanup failed:',
            {
              applicationId,
              resumePath,
              error: fileError
            }
          );
        }
      }

      /*
       * Return to the application manager after deletion.
       */
      return res.redirect(
        '/admin/applications'
      );
    } catch (error) {
      /*
       * Send unexpected errors to your main Express
       * error-handling middleware.
       */
      return next(error);
    }
  }
);

// --- Contact Submissions (read-only) ---
router.get(
  '/contact-submissions',
  requireRole('superadmin'),
  async (req, res, next) => {
    try {
      const submissions =
        await prisma.contactSubmission.findMany({
          orderBy: {
            submittedAt: 'desc'
          }
        });

      return res.render(
        'admin/contact-submissions',
        {
          submissions
        }
      );
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/contact-submissions/:id/delete',
  requireRole('superadmin'),
  async (req, res, next) => {
    const submissionId =
      Number(req.params.id);

    if (
      !Number.isInteger(submissionId) ||
      submissionId < 1
    ) {
      return res.status(400).send(
        'Invalid contact submission ID.'
      );
    }

    try {
      await prisma.contactSubmission.delete({
        where: {
          id: submissionId
        }
      });

      return res.redirect(
        '/admin/contact-submissions'
      );
    } catch (error) {
      return next(error);
    }
  }
);

// --- Newsletter Subscribers (read-only) ---
router.get(
  '/newsletter',
  requireRole('superadmin'),
  async (req, res, next) => {
    try {
      const subscribers =
        await prisma.newsletterSubscriber.findMany({
          orderBy: {
            subscribedAt: 'desc'
          }
        });

      return res.render(
        'admin/newsletter-manager',
        {
          subscribers
        }
      );
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/newsletter/:id/delete',
  requireRole('superadmin'),
  async (req, res, next) => {
    const subscriberId =
      Number(req.params.id);

    if (
      !Number.isInteger(subscriberId) ||
      subscriberId < 1
    ) {
      return res.status(400).send(
        'Invalid newsletter subscriber ID.'
      );
    }

    try {
      await prisma.newsletterSubscriber.delete({
        where: {
          id: subscriberId
        }
      });

      return res.redirect(
        '/admin/newsletter'
      );
    } catch (error) {
      return next(error);
    }
  }
);

// --- CRUD route stubs ---
// Remaining resources still to build out: jobs, faqs, team.
// Pattern to copy is the "news" section above.

module.exports = router;