const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../middleware/auth.middleware');
const prisma = require('../config/db');
const { DAY_ORDER, DAY_LABELS, getActiveWeekRange, getDateForDay } = require('../utils/digestWeek');
const { slugify } = require('../utils/slugify');

// Login page (public)
router.get('/login', (req, res) => res.render('admin/login', { error: null }));

// Everything below this line requires a logged-in admin
router.use(requireAuth);

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

router.post('/downloads/:id/delete', async (req, res) => {
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

const uploadCoverImage = multer({ storage: newsStorage, fileFilter: imageFileFilter });
const uploadGalleryImages = multer({ storage: newsStorage, fileFilter: imageFileFilter });

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

router.post('/news/:id/delete', async (req, res) => {
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

router.post('/news/:id/images/:imageId/delete', async (req, res) => {
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

router.post('/jobs/:id/delete', async (req, res) => {
  try {
    await prisma.jobPosting.delete({ where: { id: Number(req.params.id) } });
  } catch (err) {
    console.error(err);
  }
  res.redirect('/admin/jobs');
});

// --- Job Applications (read-only, tied to Job Postings) ---
router.get('/applications', async (req, res) => {
  const jobIdFilter = req.query.jobId ? Number(req.query.jobId) : null;

  const applications = await prisma.jobApplication.findMany({
    where: jobIdFilter ? { jobId: jobIdFilter } : {},
    include: { job: true },
    orderBy: { submittedAt: 'desc' }
  });

  const jobs = await prisma.jobPosting.findMany({ orderBy: { createdAt: 'desc' } });

  res.render('admin/applications-manager', { applications, jobs, jobIdFilter });
});

router.post('/applications/:id/delete', async (req, res) => {
  try {
    await prisma.jobApplication.delete({ where: { id: Number(req.params.id) } });
  } catch (err) {
    console.error(err);
  }
  res.redirect('/admin/applications');
});

// --- Contact Submissions (read-only) ---
router.get('/contact-submissions', async (req, res) => {
  const submissions = await prisma.contactSubmission.findMany({
    orderBy: { submittedAt: 'desc' }
  });
  res.render('admin/contact-submissions', { submissions });
});

router.post('/contact-submissions/:id/delete', async (req, res) => {
  try {
    await prisma.contactSubmission.delete({ where: { id: Number(req.params.id) } });
  } catch (err) {
    console.error(err);
  }
  res.redirect('/admin/contact-submissions');
});

// --- Newsletter Subscribers (read-only) ---
router.get('/newsletter', async (req, res) => {
  const subscribers = await prisma.newsletterSubscriber.findMany({
    orderBy: { subscribedAt: 'desc' }
  });
  res.render('admin/newsletter-manager', { subscribers });
});

router.post('/newsletter/:id/delete', async (req, res) => {
  try {
    await prisma.newsletterSubscriber.delete({ where: { id: Number(req.params.id) } });
  } catch (err) {
    console.error(err);
  }
  res.redirect('/admin/newsletter');
});

// --- CRUD route stubs ---
// Remaining resources still to build out: jobs, faqs, team.
// Pattern to copy is the "news" section above.

module.exports = router;