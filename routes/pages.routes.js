const express = require('express');
const router = express.Router();
const prisma = require('../config/db');

// NOTE: for now these render static placeholder EJS files.
// Later, swap in real data by fetching from Prisma before res.render(),
// e.g. const articles = await prisma.newsArticle.findMany({ where: { published: true } });

router.get('/', (req, res) => res.render('home', { title: 'Home' }));

// Who We Are
router.get('/who-we-are', (req, res) => res.render('who-we-are/index', { title: 'Who We Are' }));
router.get('/who-we-are/board-of-directors', (req, res) =>
  res.render('who-we-are/board-of-directors', { title: 'Board of Directors' })
);
router.get('/who-we-are/management-team', (req, res) =>
  res.render('who-we-are/management-team', { title: 'Management Team' })
);

// Services
router.get('/services', (req, res) => res.render('services/index', { title: 'Services' }));
router.get('/services/financial-advisory', (req, res) =>
  res.render('services/financial-advisory', { title: 'Financial Advisory' })
);
router.get('/services/market-research', (req, res) =>
  res.render('services/market-research', { title: 'Market Research' })
);
router.get('/services/portfolio-fund-management', (req, res) =>
  res.render('services/portfolio-fund-management', { title: 'Portfolio & Fund Management' })
);
router.get('/services/corporate-investment-schemes', (req, res) =>
  res.render('services/corporate-investment-schemes', { title: 'Corporate Investment Schemes' })
);

// Products
router.get('/products', (req, res) => res.render('products', { title: 'Products' }));

// Resources
router.get('/resources', (req, res) => res.redirect('/resources/news'));
router.get('/resources/faqs', (req, res) => res.render('resources/faqs', { title: 'FAQs' }));
router.get('/resources/downloads', (req, res) => res.render('resources/downloads', { title: 'Downloads' }));
router.get('/resources/news', (req, res) => res.render('resources/news', { title: 'News & Articles' }));

// Careers
router.get('/careers', async (req, res, next) => {
  try {
    const jobs = await prisma.jobPosting.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' }
    });
    return res.render('careers', { title: 'Careers', jobs, error: null });
  } catch (err) {
    return next(err);
  }
});

// Contact
router.get('/contact', (req, res) => res.render('contact', { title: 'Contact Us' }));

module.exports = router;
