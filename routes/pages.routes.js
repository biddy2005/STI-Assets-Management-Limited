const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { getActiveWeekRange, buildWeekMap, getOrdinalDate } = require('../utils/digestWeek');

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);

router.get(
  '/',

  asyncHandler(async (req, res) => {
    const articles =
      await prisma.newsArticle.findMany({
        where: {
          published: true
        },

        orderBy: {
          publishedAt: 'desc'
        },

        take: 3
      });

    const cards =
      articles.map((article) => ({
        ...article,

        formattedDate:
          article.publishedAt
            ? getOrdinalDate(
                article.publishedAt
              )
            : null,

        excerpt:
          article.body.length > 140
            ? `${article.body.slice(
                0,
                140
              )}…`
            : article.body
      }));

    return res.render(
      'home',
      {
        title: 'Home',
        articles: cards
      }
    );
  })
);

// Who We Are
router.get('/who-we-are', (req, res) => res.render('who-we-are/index', { title: 'Who We Are' }));
router.get('/who-we-are/board-of-directors', (req, res) =>
  res.render('who-we-are/board-of-directors', { title: 'Board of Directors' })
);
router.get('/who-we-are/management-team', (req, res) =>
  res.render('who-we-are/management-team', { title: 'Management Team' })
);

router.get('/our-team', (req, res) => res.render('our-team', { title: 'Our Team' }));

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

router.get(
  '/resources/downloads',

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

    const weekDigests =
      buildWeekMap(
        digests,
        weekStart
      );

    return res.render(
      'resources/downloads',
      {
        title: 'Downloads',
        weekDigests
      }
    );
  })
);

router.get(
  '/resources/news',

  asyncHandler(async (req, res) => {
    const articles =
      await prisma.newsArticle.findMany({
        where: {
          published: true
        },

        orderBy: {
          publishedAt: 'desc'
        }
      });

    const cards =
      articles.map((article) => ({
        ...article,

        formattedDate:
          article.publishedAt
            ? getOrdinalDate(
                article.publishedAt
              )
            : null,

        excerpt:
          article.body.length > 180
            ? `${article.body.slice(
                0,
                180
              )}…`
            : article.body
      }));

    return res.render(
      'resources/news',
      {
        title: 'News & Articles',
        articles: cards
      }
    );
  })
);

router.get(
  '/resources/news/:slug',

  asyncHandler(async (req, res) => {
    const article =
      await prisma.newsArticle.findFirst({
        where: {
          slug: req.params.slug,
          published: true
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
      return res.status(404).render(
        '404',
        {
          title:
            'Article Not Found'
        }
      );
    }

    return res.render(
      'resources/news-article',
      {
        title: article.title,
        article,

        formattedDate:
          article.publishedAt
            ? getOrdinalDate(
                article.publishedAt
              )
            : null
      }
    );
  })
);

// Careers
router.get(
  '/careers',

  asyncHandler(async (req, res) => {
    const jobs =
      await prisma.jobPosting.findMany({
        where: {
          status: 'open'
        },

        orderBy: {
          createdAt: 'desc'
        }
      });

    return res.render(
      'careers',
      {
        title: 'Careers',
        jobs,
        error: null,

        applied:
          req.query.applied === '1'
      }
    );
  })
);

router.get(
  '/terms-and-conditions',
  (req, res) => {
    return res.render(
      'terms-and-conditions',
      {
        title:
          'Terms and Conditions'
      }
    );
  }
);

router.get(
  '/cookie-policy',
  (req, res) => {
    return res.render(
      'cookie-policy',
      {
        title: 'Cookie Policy'
      }
    );
  }
);


// Legal
router.get('/privacy-policy', (req, res) => res.render('privacy-policy', { title: 'Privacy Policy' }));

// Contact
router.get('/contact', (req, res) =>
  res.render('contact', {
    title: 'Contact Us',
    error: null,
    success: req.query.success === '1'
  })
);

module.exports = router;