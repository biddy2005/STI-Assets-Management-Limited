const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const {
  requireAuth,
  requireRole
} = require('../middleware/auth.middleware');
const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);
const prisma = require('../config/db');
const allowedContactStatuses =
  new Set([
    'NEW',
    'IN_PROGRESS',
    'RESOLVED',
    'ARCHIVED'
  ]);
const allowedApplicationStatuses =
  new Set([
    'NEW',
    'REVIEWING',
    'SHORTLISTED',
    'REJECTED',
    'HIRED'
  ]);
const {
  resumeDirectory
} = require('../config/storage');
const { DAY_ORDER, DAY_LABELS, getActiveWeekRange, getDateForDay } = require('../utils/digestWeek');
const { slugify } = require('../utils/slugify');
const {
  csrfSynchronisedProtection,
  csrfAfterUpload
} = require(
  '../middleware/csrf.middleware'
);

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

router.get(
  '/downloads',

  /*
   * Editors and superadmins can manage daily digests.
   */
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const {
      weekStart,
      weekEnd
    } = getActiveWeekRange();

    const digests =
      await prisma.dailyDigest.findMany({
        where: {
          publishDate: {
            gte: weekStart,
            lte: weekEnd
          }
        },

        orderBy: {
          publishDate: 'asc'
        }
      });

    const byDay = {};

    digests.forEach((digest) => {
      byDay[digest.dayOfWeek] =
        digest;
    });

    const days =
      DAY_ORDER.map((day) => ({
        key: day,
        label: DAY_LABELS[day],
        digest: byDay[day] || null
      }));

    return res.render(
      'admin/downloads-manager',
      {
        days,
        error: null
      }
    );
  })
);

router.post(
  '/downloads', 
  contentManagerOnly,
  uploadDigest.single('digestFile'),  
  csrfAfterUpload,
  async (req, res) => {
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
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const digestId =
      Number(req.params.id);

    if (
      !Number.isInteger(digestId) ||
      digestId < 1
    ) {
      return res.status(400).send(
        'Invalid digest ID.'
      );
    }

    const digest =
      await prisma.dailyDigest.findUnique({
        where: {
          id: digestId
        }
      });

    if (!digest) {
      return res.status(404).send(
        'Daily digest not found.'
      );
    }

    /*
     * This currently deletes only the database record.
     * Physical PDF cleanup will be added in the file-storage
     * cleanup phase.
     */
    await prisma.dailyDigest.delete({
      where: {
        id: digestId
      }
    });

    return res.redirect(
      '/admin/downloads'
    );
  })
);

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

router.get(
  '/news',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const articles =
      await prisma.newsArticle.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });

    return res.render(
      'admin/news-manager',
      {
        articles
      }
    );
  })
);

router.get(
  '/news/new',
  contentManagerOnly,
  (req, res) => {
    return res.render(
      'admin/news-form',
      {
        article: null,
        error: null
      }
    );
  }
);

router.post(
  '/news', 
   contentManagerOnly,
  uploadCoverImage.single('coverImage'),  
  csrfAfterUpload,
  async (req, res) => {
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

router.get(
  '/news/:id/edit',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    if (
      !Number.isInteger(articleId) ||
      articleId < 1
    ) {
      return res.redirect(
        '/admin/news'
      );
    }

    const article =
      await prisma.newsArticle.findUnique({
        where: {
          id: articleId
        }
      });

    if (!article) {
      return res.redirect(
        '/admin/news'
      );
    }

    return res.render(
      'admin/news-form',
      {
        article,
        error: null
      }
    );
  })
);

router.post(
  '/news/:id', 
   contentManagerOnly,
  uploadCoverImage.single('coverImage'),  
  csrfAfterUpload,
  async (req, res) => {
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
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    if (
      !Number.isInteger(articleId) ||
      articleId < 1
    ) {
      return res.status(400).send(
        'Invalid article ID.'
      );
    }

    const article =
      await prisma.newsArticle.findUnique({
        where: {
          id: articleId
        }
      });

    if (!article) {
      return res.status(404).send(
        'News article not found.'
      );
    }

    /*
     * Prisma deletes the article record.
     *
     * Physical cover and gallery image cleanup will be added
     * in the file-storage cleanup phase.
     */
    await prisma.newsArticle.delete({
      where: {
        id: articleId
      }
    });

    return res.redirect(
      '/admin/news'
    );
  })
);

// --- News gallery management ---
router.get(
  '/news/:id/images',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    if (
      !Number.isInteger(articleId) ||
      articleId < 1
    ) {
      return res.redirect(
        '/admin/news'
      );
    }

    const article =
      await prisma.newsArticle.findUnique({
        where: {
          id: articleId
        },

        include: {
          images: {
            orderBy: {
              order: 'asc'
            }
          }
        }
      });

    if (!article) {
      return res.redirect(
        '/admin/news'
      );
    }

    return res.render(
      'admin/news-images',
      {
        article,
        error: null
      }
    );
  })
);

router.post(
  '/news/:id/images', 
    contentManagerOnly,
  uploadGalleryImages.array('galleryImages', 10),  
  csrfAfterUpload,
  async (req, res) => {
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
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    const imageId =
      Number(req.params.imageId);

    if (
      !Number.isInteger(articleId) ||
      articleId < 1
    ) {
      return res.status(400).send(
        'Invalid article ID.'
      );
    }

    if (
      !Number.isInteger(imageId) ||
      imageId < 1
    ) {
      return res.status(400).send(
        'Invalid image ID.'
      );
    }

    /*
     * Confirm that the image actually belongs to the article
     * in the URL.
     */
    const image =
      await prisma.newsImage.findFirst({
        where: {
          id: imageId,
          newsArticleId: articleId
        }
      });

    if (!image) {
      return res.status(404).send(
        'News gallery image not found.'
      );
    }

    /*
     * This currently removes only the database record.
     * Physical image deletion will be added later.
     */
    await prisma.newsImage.delete({
      where: {
        id: imageId
      }
    });

    return res.redirect(
      `/admin/news/${articleId}/images`
    );
  })
);

// --- Job Postings ---
router.get(
  '/jobs',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const jobs =
      await prisma.jobPosting.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });

    return res.render(
      'admin/jobs-manager',
      {
        jobs
      }
    );
  })
);

router.get(
  '/jobs/new',
  contentManagerOnly,
  (req, res) => {
    return res.render(
      'admin/jobs-form',
      {
        job: null,
        error: null
      }
    );
  }
);

router.post(
  '/jobs',
  contentManagerOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const title =
      typeof req.body.title === 'string'
        ? req.body.title.trim()
        : '';

    const department =
      typeof req.body.department === 'string'
        ? req.body.department.trim()
        : '';

    const location =
      typeof req.body.location === 'string'
        ? req.body.location.trim()
        : '';

    const description =
      typeof req.body.description === 'string'
        ? req.body.description.trim()
        : '';

    const deadline =
      typeof req.body.deadline === 'string'
        ? req.body.deadline.trim()
        : '';

    const submittedStatus =
      typeof req.body.status === 'string'
        ? req.body.status.trim()
        : '';

    if (
      !title ||
      !department ||
      !location ||
      !description
    ) {
      return res.status(400).render(
        'admin/jobs-form',
        {
          job: null,
          error:
            'Title, department, location and description are required.'
        }
      );
    }

    let parsedDeadline = null;

    if (deadline) {
      parsedDeadline =
        new Date(deadline);

      if (
        Number.isNaN(
          parsedDeadline.getTime()
        )
      ) {
        return res.status(400).render(
          'admin/jobs-form',
          {
            job: null,
            error:
              'Please provide a valid application deadline.'
          }
        );
      }
    }

    await prisma.jobPosting.create({
      data: {
        title,
        department,
        location,
        description,
        deadline: parsedDeadline,

        status:
          submittedStatus === 'open'
            ? 'open'
            : 'closed'
      }
    });

    return res.redirect(
      '/admin/jobs'
    );
  })
);

router.get(
  '/jobs/:id/edit',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const jobId =
      Number(req.params.id);

    if (
      !Number.isInteger(jobId) ||
      jobId < 1
    ) {
      return res.redirect(
        '/admin/jobs'
      );
    }

    const job =
      await prisma.jobPosting.findUnique({
        where: {
          id: jobId
        }
      });

    if (!job) {
      return res.redirect(
        '/admin/jobs'
      );
    }

    return res.render(
      'admin/jobs-form',
      {
        job,
        error: null
      }
    );
  })
);

router.post(
  '/jobs/:id',
  contentManagerOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const jobId =
      Number(req.params.id);

    if (
      !Number.isInteger(jobId) ||
      jobId < 1
    ) {
      return res.status(400).send(
        'Invalid job ID.'
      );
    }

    const existingJob =
      await prisma.jobPosting.findUnique({
        where: {
          id: jobId
        }
      });

    if (!existingJob) {
      return res.status(404).send(
        'Job posting not found.'
      );
    }

    const title =
      typeof req.body.title === 'string'
        ? req.body.title.trim()
        : '';

    const department =
      typeof req.body.department === 'string'
        ? req.body.department.trim()
        : '';

    const location =
      typeof req.body.location === 'string'
        ? req.body.location.trim()
        : '';

    const description =
      typeof req.body.description === 'string'
        ? req.body.description.trim()
        : '';

    const deadline =
      typeof req.body.deadline === 'string'
        ? req.body.deadline.trim()
        : '';

    const submittedStatus =
      typeof req.body.status === 'string'
        ? req.body.status.trim()
        : '';

    if (
      !title ||
      !department ||
      !location ||
      !description
    ) {
      return res.status(400).render(
        'admin/jobs-form',
        {
          job: existingJob,
          error:
            'Title, department, location and description are required.'
        }
      );
    }

    let parsedDeadline = null;

    if (deadline) {
      parsedDeadline =
        new Date(deadline);

      if (
        Number.isNaN(
          parsedDeadline.getTime()
        )
      ) {
        return res.status(400).render(
          'admin/jobs-form',
          {
            job: existingJob,
            error:
              'Please provide a valid application deadline.'
          }
        );
      }
    }

    await prisma.jobPosting.update({
      where: {
        id: jobId
      },

      data: {
        title,
        department,
        location,
        description,
        deadline: parsedDeadline,

        status:
          submittedStatus === 'open'
            ? 'open'
            : 'closed'
      }
    });

    return res.redirect(
      '/admin/jobs'
    );
  })
);

router.post(
  '/jobs/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const jobId =
      Number(req.params.id);

    if (
      !Number.isInteger(jobId) ||
      jobId < 1
    ) {
      return res.status(400).send(
        'Invalid job ID.'
      );
    }

    const job =
      await prisma.jobPosting.findUnique({
        where: {
          id: jobId
        },

        include: {
          _count: {
            select: {
              applications: true
            }
          }
        }
      });

    if (!job) {
      return res.status(404).send(
        'Job posting not found.'
      );
    }

    /*
     * Do not delete a job that already has applications.
     *
     * Closing the job preserves the application history.
     */
    if (
      job._count.applications > 0
    ) {
      return res.status(409).send(
        'This job has applications and cannot be deleted. Change its status to closed instead.'
      );
    }

    await prisma.jobPosting.delete({
      where: {
        id: jobId
      }
    });

    return res.redirect(
      '/admin/jobs'
    );
  })
);

// --- Job Applications (read-only, tied to Job Postings) ---
router.get(
  '/applications',
  superAdminOnly,

  asyncHandler(async (req, res) => {
    const rawJobId =
      req.query.jobId;

    let jobIdFilter = null;

    /*
     * Only use the filter when it is a valid positive integer.
     */
    if (rawJobId) {
      const convertedJobId =
        Number(rawJobId);

      if (
        Number.isInteger(convertedJobId) &&
        convertedJobId > 0
      ) {
        jobIdFilter =
          convertedJobId;
      }
    }

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
  })
);

/*
 * Download an applicant's résumé.
 *
 * Everything in admin.routes.js after router.use(requireAuth)
 * already requires an authenticated administrator.
 */
router.get(
  '/applications/:id/resume',
  superAdminOnly,

  asyncHandler(async (
    req,
    res,
    next
  ) => {
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
     * Use only the filename portion of the stored value.
     * This prevents directory traversal.
     */
    const safeStorageName =
      path.basename(
        application.resumeStorageKey
      );

    const resumePath =
      path.join(
        resumeDirectory,
        safeStorageName
      );

    /*
     * Confirm that the résumé still exists.
     */
    try {
      await fs.access(resumePath);
    } catch (fileError) {
      if (
        fileError.code ===
        'ENOENT'
      ) {
        return res.status(404).send(
          'The résumé file could not be found.'
        );
      }

      /*
       * A permission or file-system error is unexpected.
       * Throw it so asyncHandler forwards it to the global
       * error handler.
       */
      throw fileError;
    }

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
     * res.download() uses a callback, so its callback error
     * must still be passed manually to next(error).
     */
    return res.download(
      resumePath,
      application.resumeOriginalName,
      (downloadError) => {
        if (downloadError) {
          return next(
            downloadError
          );
        }
      }
    );
  })
);

router.post(
  '/applications/:id/status',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const applicationId =
      Number(req.params.id);

    const status =
      typeof req.body.status === 'string'
        ? req.body.status.trim()
        : '';

    if (
      !Number.isInteger(applicationId) ||
      applicationId < 1
    ) {
      return res.status(400).send(
        'Invalid application ID.'
      );
    }

    if (
      !allowedApplicationStatuses.has(
        status
      )
    ) {
      return res.status(400).send(
        'Invalid application status.'
      );
    }

    const application =
      await prisma.jobApplication.findUnique({
        where: {
          id: applicationId
        },

        select: {
          id: true
        }
      });

    if (!application) {
      return res.status(404).send(
        'Application not found.'
      );
    }

    await prisma.jobApplication.update({
      where: {
        id: applicationId
      },

      data: {
        status
      }
    });

    return res.redirect(
      '/admin/applications'
    );
  })
);

router.post(
  '/applications/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
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
      return res.status(404).send(
        'Application not found.'
      );
    }

    await prisma.jobApplication.delete({
      where: {
        id: applicationId
      }
    });

    const safeStorageName =
      path.basename(
        application.resumeStorageKey
      );

    const resumePath =
      path.join(
        resumeDirectory,
        safeStorageName
      );

    /*
     * Keep this local catch.
     *
     * It handles the expected situation where the file has
     * already been removed.
     */
    try {
      await fs.unlink(resumePath);
    } catch (fileError) {
      if (
        fileError.code !==
        'ENOENT'
      ) {
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

    return res.redirect(
      '/admin/applications'
    );
  })
);

// --- Contact Submissions (read-only) ---
router.get(
  '/contact-submissions',
  superAdminOnly,

  asyncHandler(async (req, res) => {
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
  })
);

router.post(
  '/contact-submissions/:id/status',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const submissionId =
      Number(req.params.id);

    const status =
      typeof req.body.status === 'string'
        ? req.body.status.trim()
        : '';

    if (
      !Number.isInteger(submissionId) ||
      submissionId < 1
    ) {
      return res.status(400).send(
        'Invalid contact submission ID.'
      );
    }

    if (
      !allowedContactStatuses.has(
        status
      )
    ) {
      return res.status(400).send(
        'Invalid contact status.'
      );
    }

    const submission =
      await prisma.contactSubmission.findUnique({
        where: {
          id: submissionId
        },

        select: {
          id: true
        }
      });

    if (!submission) {
      return res.status(404).send(
        'Contact submission not found.'
      );
    }

    await prisma.contactSubmission.update({
      where: {
        id: submissionId
      },

      data: {
        status
      }
    });

    return res.redirect(
      '/admin/contact-submissions'
    );
  })
);

router.post(
  '/contact-submissions/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
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

    const submission =
      await prisma.contactSubmission.findUnique({
        where: {
          id: submissionId
        },

        select: {
          id: true
        }
      });

    if (!submission) {
      return res.status(404).send(
        'Contact submission not found.'
      );
    }

    await prisma.contactSubmission.delete({
      where: {
        id: submissionId
      }
    });

    return res.redirect(
      '/admin/contact-submissions'
    );
  })
);

// --- Newsletter Subscribers (read-only) ---
router.get(
  '/newsletter',
  superAdminOnly,

  asyncHandler(async (req, res) => {
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
  })
);

router.post(
  '/newsletter/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
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

    const subscriber =
      await prisma.newsletterSubscriber.findUnique({
        where: {
          id: subscriberId
        },

        select: {
          id: true
        }
      });

    if (!subscriber) {
      return res.status(404).send(
        'Newsletter subscriber not found.'
      );
    }

    await prisma.newsletterSubscriber.delete({
      where: {
        id: subscriberId
      }
    });

    return res.redirect(
      '/admin/newsletter'
    );
  })
);

// --- CRUD route stubs ---
// Remaining resources still to build out: jobs, faqs, team.
// Pattern to copy is the "news" section above.

module.exports = router;