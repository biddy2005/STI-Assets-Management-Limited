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
    /*
     * Rates are stored as structured rows rather than an
     * uploaded image, so the published table and the
     * calculator can never disagree.
     */
    const productRates =
      await prisma.productRate.findMany({
        where: {
          isActive: true
        },
 
        orderBy: [
          { product: 'asc' },
          { minAmount: 'asc' },
          { tenorMaxDays: 'asc' }
        ]
      });
 
 
    /*
     * Product labels and currency live here rather than in the
     * database: they are presentation, and duplicating them in
     * every rate row would invite them to drift.
     */
    const RATE_PRODUCTS = [
      {
        key: 'FIXED_INCOME_NOTE',
        label: 'STIAM Fixed Income Note',
        currency: 'Naira'
      },
      {
        key: 'MONEY_MARKET_NOTE',
        label: 'STIAM Money Market Note',
        currency: 'Naira'
      },
      {
        key: 'FIXED_INCOME_DOLLAR_NOTE',
        label: 'STIAM Fixed Income Dollar Note',
        currency: 'US dollar'
      }
    ];
 
 
    /**
     * Render an amount bound the way the printed guide does.
     *
     * Truncates rather than rounds. These are band boundaries,
     * and rounding 4,999,999 up to "5m" would overstate the
     * ceiling and overlap the band above it.
     */
    const formatAmount = (value, currency) => {
      const symbol =
        currency === 'US dollar'
          ? '$'
          : '\u20A6';
 
      const trim = (text) =>
        text
          .replace(/\.00$/, '')
          .replace(/(\.\d)0$/, '$1');
 
      if (value >= 1000000) {
        const millions =
          Math.floor(value / 10000) / 100;
 
        return `${symbol}${trim(millions.toFixed(2))}m`;
      }
 
      if (value >= 1000) {
        return `${symbol}${Math.floor(value / 1000)}k`;
      }
 
      return `${symbol}${value}`;
    };
 
 
    const rateTables =
      RATE_PRODUCTS
        .map((product) => {
          const rows =
            productRates.filter(
              (rate) => rate.product === product.key
            );
 
          if (!rows.length) {
            return null;
          }
 
 
          /*
           * Tenor columns are derived from the data rather than
           * hardcoded, so adding a tenor band in the admin
           * appears here without a code change.
           */
          const tenorDays =
            [...new Set(
              rows.map((rate) => rate.tenorMaxDays)
            )].sort((a, b) => a - b);
 
 
          const amountBands =
            [...new Set(
              rows.map((rate) => Number(rate.minAmount))
            )].sort((a, b) => a - b);
 
 
          /*
           * Index by amount and tenor so each cell is a direct
           * lookup rather than a scan of the whole set.
           */
          const lookup = {};
 
          rows.forEach((rate) => {
            lookup[
              `${Number(rate.minAmount)}_${rate.tenorMaxDays}`
            ] = Number(rate.ratePercent);
          });
 
 
          return {
            key: product.key,
            label: product.label,
            currency: product.currency,
 
            tenors: tenorDays.map((days) => ({
              days,
              label: `${days}D`
            })),
 
            rows: amountBands.map((minAmount) => {
              const sample =
                rows.find(
                  (rate) =>
                    Number(rate.minAmount) === minAmount
                );
 
              const maxAmount =
                sample.maxAmount === null
                  ? null
                  : Number(sample.maxAmount);
 
              const label =
                maxAmount === null
                  ? `${formatAmount(minAmount, product.currency)} & above`
                  : `${formatAmount(minAmount, product.currency)} \u2013 ${formatAmount(maxAmount, product.currency)}`;
 
              return {
                label,
 
                cells: tenorDays.map(
                  (days) =>
                    lookup[`${minAmount}_${days}`] ?? null
                )
              };
            })
          };
        })
        .filter(Boolean);
 
 
    const ratesUpdatedAt =
      productRates.length
        ? productRates.reduce(
            (latest, rate) =>
              rate.updatedAt > latest
                ? rate.updatedAt
                : latest,
            productRates[0].updatedAt
          )
        : null;

    return res.render(
      'products',
      {
        title:
          'Products',

        description:
          'Explore STI Assets Management investment products including the Money Market Fund, Fixed Income Note and Fixed Income Dollar Note.',

        canonicalPath:
          '/products',

        rateTables,

        ratesUpdatedAt:
          ratesUpdatedAt
            ? getOrdinalDate(ratesUpdatedAt)
            : null
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

router.get(
  '/subscribe',
  asyncHandler(async (req, res) => {
    res.render('subscribe', {
      activePath: '/subscribe'
    });
  })
);

router.get(
  '/subscribe/received',
  asyncHandler(async (req, res) => {
    res.render('subscribe-received', {
      reference:
        typeof req.query.ref === 'string'
          ? req.query.ref.slice(0, 32)
          : null,

      activePath: '/subscribe'
    });
  })
);

module.exports = router;