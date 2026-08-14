const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const request =
  require('supertest');


/*
 * ============================================================
 * TEST ENVIRONMENT SAFETY
 * ============================================================
 */

if (
  process.env.NODE_ENV !==
  'test'
) {
  throw new Error(
    'Rate-limit integration tests refused: NODE_ENV must be test.'
  );
}


if (
  !process.env.DATABASE_URL
) {
  throw new Error(
    'Rate-limit integration tests refused: DATABASE_URL is missing.'
  );
}


const parsedDatabaseUrl =
  new URL(
    process.env.DATABASE_URL
  );


const databaseName =
  parsedDatabaseUrl.pathname
    .replace(
      /^\/+/,
      ''
    );


if (
  !databaseName
    .toLowerCase()
    .includes(
      'test'
    )
) {
  throw new Error(
    `Rate-limit integration tests refused: "${databaseName}" is not recognised as a test database.`
  );
}


const app =
  require('../server');

const prisma =
  require('../config/db');


test.after(
  async () => {
    if (
      app.locals.sessionStore &&
      typeof app.locals
        .sessionStore
        .close ===
        'function'
    ) {
      await app.locals
        .sessionStore
        .close();
    }


    await prisma
      .$disconnect();
  }
);


/*
 * ============================================================
 * 1. CONTACT LIMIT
 * ============================================================
 */

test(
  'Contact form returns 429 after five requests from one IP',
  async () => {
    /*
     * Requests 1-5 are inside the configured allowance.
     *
     * They contain no CSRF token, so after passing the limiter
     * they should be rejected by CSRF with 403.
     */
    for (
      let attempt = 1;
      attempt <= 5;
      attempt += 1
    ) {
      const response =
        await request(app)
          .post('/api/contact')
          .type('form')
          .send({
            firstName:
              'Rate',

            lastName:
              'Limit',

            email:
              `contact-${attempt}@example.com`,

            message:
              'Rate limit test.'
          });


      assert.equal(
        response.status,
        403,
        `Contact request ${attempt} should still be below the rate limit.`
      );
    }


    /*
     * Request 6 exceeds the configured threshold.
     */
    const blockedResponse =
      await request(app)
        .post('/api/contact')
        .type('form')
        .send({
          firstName:
            'Rate',

          lastName:
            'Limit',

          email:
            'contact-blocked@example.com',

          message:
            'This request should be rate limited.'
        });


    assert.equal(
      blockedResponse.status,
      429
    );


    assert.match(
      blockedResponse.text,
      /contact form too many times/i
    );


    assert.ok(
      blockedResponse.headers.ratelimit ||
      blockedResponse.headers[
        'ratelimit-policy'
      ],
      'Expected RateLimit response headers.'
    );
  }
);


/*
 * ============================================================
 * 2. NEWSLETTER LIMIT
 * ============================================================
 */

test(
  'Newsletter returns 429 after ten attempts from one IP',
  async () => {
    for (
      let attempt = 1;
      attempt <= 10;
      attempt += 1
    ) {
      const response =
        await request(app)
          .post('/api/newsletter')
          .type('form')
          .send({
            email:
              `newsletter-${attempt}@example.com`
          });


      assert.equal(
        response.status,
        403,
        `Newsletter request ${attempt} should still be below the rate limit.`
      );
    }


    const blockedResponse =
      await request(app)
        .post('/api/newsletter')
        .type('form')
        .send({
          email:
            'newsletter-blocked@example.com'
        });


    assert.equal(
      blockedResponse.status,
      429
    );


    assert.match(
      blockedResponse.text,
      /newsletter subscription attempts/i
    );


    assert.ok(
      blockedResponse.headers.ratelimit ||
      blockedResponse.headers[
        'ratelimit-policy'
      ]
    );
  }
);


/*
 * ============================================================
 * 3. CAREERS LIMIT
 * ============================================================
 */

test(
  'Careers application endpoint returns 429 after three attempts from one IP',
  async () => {
    /*
     * The limiter sits before Multer.
     *
     * No PDF needs to be uploaded for this test.
     */
    for (
      let attempt = 1;
      attempt <= 3;
      attempt += 1
    ) {
      const response =
        await request(app)
          .post('/api/careers/apply')
          .type('form')
          .send({
            applicantName:
              'Rate Limit Applicant',

            email:
              `career-${attempt}@example.com`
          });


      assert.equal(
        response.status,
        403,
        `Careers request ${attempt} should still be below the rate limit.`
      );
    }


    const blockedResponse =
      await request(app)
        .post('/api/careers/apply')
        .type('form')
        .send({
          applicantName:
            'Blocked Applicant',

          email:
            'career-blocked@example.com'
        });


    assert.equal(
      blockedResponse.status,
      429
    );


    assert.match(
      blockedResponse.text,
      /too many job applications/i
    );


    assert.ok(
      blockedResponse.headers.ratelimit ||
      blockedResponse.headers[
        'ratelimit-policy'
      ]
    );
  }
);