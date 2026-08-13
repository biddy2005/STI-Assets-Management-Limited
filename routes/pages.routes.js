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

        description:
          'STI Assets Management provides investment management, financial advisory, market research and portfolio solutions for individuals and organisations in Nigeria.',

        canonicalPath: '/',

        articles: cards
      }
    );
  })
);

// Who We Are
router.get(
  '/who-we-are',
  (req, res) =>
    res.render(
      'who-we-are/index',
      {
        title: 'Who We Are',

        description:
          'Learn about STI Assets Management Limited, our purpose, values and commitment to delivering professional investment and financial management services.',

        canonicalPath:
          '/who-we-are'
      }
    )
);

/*
 * Legacy team URLs now resolve to the consolidated Our Team page.
 */
router.get(
  '/who-we-are/board-of-directors',
  (req, res) =>
    res.redirect('/our-team')
);

router.get(
  '/who-we-are/management-team',
  (req, res) =>
    res.redirect('/our-team')
);

router.get(
  '/our-team',
  (req, res) =>
    res.render(
      'our-team',
      {
        title: 'Our Team',

        description:
          'Meet the Board of Directors and management professionals guiding STI Assets Management Limited.',

        canonicalPath:
          '/our-team'
      }
    )
);

// Services
router.get(
  '/services',
  (req, res) =>
    res.render(
      'services/index',
      {
        title: 'Services',

        description:
          'Explore STI Assets Management services including financial advisory, market research, portfolio and fund management, and corporate investment solutions.',

        canonicalPath:
          '/services'
      }
    )
);

/*
 * Preserve the original service URLs while routing visitors
 * to the corresponding sections of the consolidated Services page.
 */
router.get(
  '/services/financial-advisory',
  (req, res) =>
    res.redirect(
      '/services#financial-advisory'
    )
);

router.get(
  '/services/market-research',
  (req, res) =>
    res.redirect(
      '/services#market-research'
    )
);

router.get(
  '/services/portfolio-fund-management',
  (req, res) =>
    res.redirect(
      '/services#portfolio-fund-management'
    )
);

router.get(
  '/services/corporate-investment-schemes',
  (req, res) =>
    res.redirect(
      '/services#corporate-investment-schemes'
    )
);

// Products
router.get(
  '/products',

  asyncHandler(async (req, res) => {
    const rateGuide =
      await prisma.rateGuide.findUnique({
        where: {
          id: 1
        }
      });
    const rateGuideImageUrl =
      rateGuide?.imageUrl ||
      'https://stiassetmgt.com/wp-content/uploads/2026/02/Screenshot-2026-02-20-095509-1024x363.png';


    return res.render(
      'products',
      {
        title:
          'Products',

        description:
          'Explore STI Assets Management investment products including the Money Market Fund, Fixed Income Note and Fixed Income Dollar Note.',

        canonicalPath:
          '/products',

        rateGuideImageUrl
      }
    );
  })
);

// Resources
router.get('/resources', (req, res) => res.redirect('/resources/news'));
router.get('/resources/faqs', (req, res) => res.render('resources/faqs', {
  title: 'FAQs',

  description:
    'Find answers to frequently asked questions about STI Assets Management, our investment products, services and client processes.',

  canonicalPath:
    '/resources/faqs'
}));

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

        description:
          'Access STI Assets Management market reports, daily market digests and downloadable investment resources.',

        canonicalPath:
          '/resources/downloads',

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

        description:
          'Read the latest news, market insights, company updates and investment perspectives from STI Assets Management.',

        canonicalPath:
          '/resources/news',

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
            'Article Not Found',

          description:
            'The requested STI Assets Management article could not be found.',

          robots:
            'noindex,follow'
        }
      );
    }

    const articleDescription =
      article.body
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const metaDescription =
    articleDescription.length > 155
      ? `${articleDescription.slice(
          0,
          152
        ).trim()}...`
      : articleDescription;

    return res.render(
      'resources/news-article',
      {
        title: article.title,

        description:
          metaDescription ||
          'Read the latest news and investment insights from STI Assets Management.',

        canonicalPath:
          `/resources/news/${article.slug}`,

        ogType:
          'article',

        ogImage:
          article.coverImage || null,

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

    const requestedJobId =
      Number(req.query.job);

    const selectedJobId =
      Number.isInteger(requestedJobId) &&
      requestedJobId > 0 &&
      jobs.some(
        (job) =>
          job.id === requestedJobId
      )
        ? requestedJobId
        : null;

    const cards =
      jobs.map((job) => ({
        ...job,

        summary:
          job.description.length > 180
            ? `${job.description
                .slice(0, 177)
                .trim()}...`
            : job.description
      }));

    return res.render(
      'careers',
      {
        title: 'Careers',

        description:
          'Explore career opportunities at STI Assets Management and apply to join our team of investment and financial services professionals.',

        canonicalPath:
          '/careers',

        jobs: cards,

        selectedJobId,

        error: null,

        applied:
          req.query.applied === '1'
      }
    );
  })
);

router.get(
  '/careers/jobs/:id',

  asyncHandler(async (req, res) => {
    const jobId =
      Number(req.params.id);

    if (
      !Number.isInteger(jobId) ||
      jobId < 1
    ) {
      return res.status(404).render(
        '404',
        {
          title: 'Job Not Found',

          description:
            'The requested STI Assets Management job opportunity could not be found.',

          robots:
            'noindex,follow'
        }
      );
    }

    const job =
      await prisma.jobPosting.findFirst({
        where: {
          id: jobId,
          status: 'open'
        }
      });

    if (!job) {
      return res.status(404).render(
        '404',
        {
          title: 'Job Not Found',

          description:
            'The requested STI Assets Management job opportunity could not be found.',

          robots:
            'noindex,follow'
        }
      );
    }

    const toList =
      (value) => {
        if (
          typeof value !== 'string' ||
          !value.trim()
        ) {
          return [];
        }

        return value
          .split(/\r?\n/)
          .map(
            (item) =>
              item.trim()
          )
          .filter(Boolean);
      };

    const metaDescription =
      job.description.length > 155
        ? `${job.description
            .slice(0, 152)
            .trim()}...`
        : job.description;

    return res.render(
      'career-job-details',
      {
        title:
          job.title,

        description:
          metaDescription,

        canonicalPath:
          `/careers/jobs/${job.id}`,

        job,

        responsibilities:
          toList(
            job.responsibilities
          ),

        qualifications:
          toList(
            job.qualifications
          ),

        experience:
          toList(
            job.experience
          ),

        competencies:
          toList(
            job.competencies
          )
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
          'Terms and Conditions',

        description:
          'Review the Terms and Conditions governing access to and use of the STI Assets Management website and online services.',

        canonicalPath:
          '/terms-and-conditions'
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
        title:
          'Cookie Policy',

        description:
          'Learn how STI Assets Management uses cookies and similar technologies when you visit or interact with our website.',

        canonicalPath:
          '/cookie-policy'
      }
    );
  }
);


// Legal
router.get(
  '/privacy-policy',
  (req, res) =>
    res.render(
      'privacy-policy',
      {
        title:
          'Privacy Policy',

        description:
          'Learn how STI Assets Management collects, uses, stores and protects personal information when you use our website and services.',

        canonicalPath:
          '/privacy-policy'
      }
    )
);

// Contact
router.get('/contact', (req, res) =>
  res.render('contact', {
  title:
    'Contact Us',

  description:
    'Contact STI Assets Management for investment enquiries, financial advisory services, client support and general information.',

  canonicalPath:
    '/contact',

  error: null,

  success:
    req.query.success === '1'
}
)
);

module.exports = router;