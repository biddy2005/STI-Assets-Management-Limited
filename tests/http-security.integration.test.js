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
    'HTTP security tests refused: NODE_ENV must be test.'
  );
}


if (
  !process.env.DATABASE_URL
) {
  throw new Error(
    'HTTP security tests refused: DATABASE_URL is missing.'
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
    `HTTP security tests refused: "${databaseName}" is not recognised as a test database.`
  );
}


const app =
  require('../server');

const prisma =
  require('../config/db');


const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/*
 * ============================================================
 * TEST LIFECYCLE
 * ============================================================
 */

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
 * 1. HEALTH CHECK
 * ============================================================
 */

test(
  'healthz returns ok, no-store and a UUID request ID',
  async () => {
    const response =
      await request(app)
        .get('/healthz')
        .expect(200);


    const requestId =
      response.headers[
        'x-request-id'
      ];


    assert.match(
      requestId,
      UUID_V4_PATTERN
    );


    assert.equal(
      response.body.status,
      'ok'
    );


    assert.equal(
      response.body.requestId,
      requestId
    );


    assert.match(
      response.headers[
        'cache-control'
      ] || '',
      /no-store/i
    );
  }
);


/*
 * ============================================================
 * 2. READINESS SUCCESS
 * ============================================================
 */

test(
  'readyz returns ready when PostgreSQL is available',
  async () => {
    const response =
      await request(app)
        .get('/readyz')
        .expect(200);


    const requestId =
      response.headers[
        'x-request-id'
      ];


    assert.match(
      requestId,
      UUID_V4_PATTERN
    );


    assert.deepEqual(
      response.body,
      {
        status:
          'ready',

        requestId
      }
    );


    assert.match(
      response.headers[
        'cache-control'
      ] || '',
      /no-store/i
    );
  }
);


/*
 * ============================================================
 * 3. READINESS FAILURE
 * ============================================================
 */

test(
  'readyz returns 503 when the database readiness query fails',
  async () => {
    const originalQueryRaw =
      prisma.$queryRaw;


    let response;


    prisma.$queryRaw =
      async () => {
        throw new Error(
          'Forced readiness failure for integration test.'
        );
      };


    try {
      response =
        await request(app)
          .get('/readyz');
    } finally {
      prisma.$queryRaw =
        originalQueryRaw;
    }


    assert.equal(
      response.status,
      503
    );


    assert.equal(
      response.body.status,
      'not-ready'
    );


    assert.match(
      response.body.requestId,
      UUID_V4_PATTERN
    );


    assert.equal(
      response.body.requestId,
      response.headers[
        'x-request-id'
      ]
    );


    assert.match(
      response.headers[
        'cache-control'
      ] || '',
      /no-store/i
    );
  }
);


/*
 * ============================================================
 * 4. REQUEST-ID SPOOFING
 * ============================================================
 */

test(
  'client-supplied X-Request-ID is replaced by a server-generated UUID',
  async () => {
    const response =
      await request(app)
        .get('/healthz')
        .set(
          'X-Request-ID',
          'attacker-controlled-request-id'
        )
        .expect(200);


    const returnedRequestId =
      response.headers[
        'x-request-id'
      ];


    assert.notEqual(
      returnedRequestId,
      'attacker-controlled-request-id'
    );


    assert.match(
      returnedRequestId,
      UUID_V4_PATTERN
    );
  }
);


/*
 * ============================================================
 * 5. UNIQUE REQUEST IDS
 * ============================================================
 */

test(
  'different requests receive different request IDs',
  async () => {
    const first =
      await request(app)
        .get('/healthz')
        .expect(200);


    const second =
      await request(app)
        .get('/healthz')
        .expect(200);


    assert.notEqual(
      first.headers[
        'x-request-id'
      ],
      second.headers[
        'x-request-id'
      ]
    );
  }
);


/*
 * ============================================================
 * 6. HELMET SECURITY HEADERS
 * ============================================================
 */

test(
  'public responses include the required Helmet security headers',
  async () => {
    const response =
      await request(app)
        .get('/healthz')
        .expect(200);


    const csp =
      response.headers[
        'content-security-policy'
      ] || '';


    assert.match(
      csp,
      /default-src 'self'/i
    );


    assert.match(
      csp,
      /object-src 'none'/i
    );


    assert.match(
      csp,
      /frame-ancestors 'self'/i
    );


    assert.equal(
      response.headers[
        'x-content-type-options'
      ],
      'nosniff'
    );


    assert.equal(
      response.headers[
        'x-frame-options'
      ],
      'SAMEORIGIN'
    );


    assert.equal(
      response.headers[
        'referrer-policy'
      ],
      'no-referrer'
    );


    /*
     * Express implementation details should not be advertised.
     */
    assert.equal(
      response.headers[
        'x-powered-by'
      ],
      undefined
    );


    /*
     * HSTS is deliberately disabled during local/test HTTP
     * execution. It will be tested later on HTTPS staging.
     */
    assert.equal(
      response.headers[
        'strict-transport-security'
      ],
      undefined
    );
  }
);


/*
 * ============================================================
 * 7. ADMIN CACHE PROTECTION
 * ============================================================
 */

test(
  'administrator and authentication pages are marked no-store',
  async () => {
    const response =
      await request(app)
        .get('/admin/login')
        .expect(200);


    assert.match(
      response.headers[
        'cache-control'
      ] || '',
      /private/i
    );


    assert.match(
      response.headers[
        'cache-control'
      ] || '',
      /no-store/i
    );


    assert.equal(
      response.headers[
        'pragma'
      ],
      'no-cache'
    );
  }
);


/*
 * ============================================================
 * 8. CSRF ERROR RESPONSE SECURITY
 * ============================================================
 */

test(
  'CSRF rejection is no-store and carries a request ID',
  async () => {
    const response =
      await request(app)
        .post('/api/contact')
        .type('form')
        .send({
          firstName:
            'Missing',

          lastName:
            'Token',

          email:
            'missing-token@example.com',

          message:
            'This request deliberately has no CSRF token.'
        });


    assert.equal(
      response.status,
      403
    );


    assert.match(
      response.headers[
        'cache-control'
      ] || '',
      /no-store/i
    );


    assert.match(
      response.headers[
        'x-request-id'
      ],
      UUID_V4_PATTERN
    );
  }
);


/*
 * ============================================================
 * 9. OVERSIZED NORMAL REQUEST BODY
 * ============================================================
 */

test(
  'JSON body larger than the configured limit returns 413 instead of 500',
  async () => {
    const oversizedValue =
      'A'.repeat(
        300 * 1024
      );


    const response =
      await request(app)
        .post('/api/contact')
        .set(
          'Content-Type',
          'application/json'
        )
        .send(
          JSON.stringify({
            payload:
              oversizedValue
          })
        );


    assert.equal(
      response.status,
      413
    );


    assert.match(
      response.text,
      /request body is too large/i
    );


    assert.match(
      response.headers[
        'cache-control'
      ] || '',
      /no-store/i
    );


    assert.match(
      response.headers[
        'x-request-id'
      ],
      UUID_V4_PATTERN
    );
  }
);


/*
 * ============================================================
 * 10. MALFORMED JSON
 * ============================================================
 */

test(
  'malformed JSON returns 400 instead of an internal server error',
  async () => {
    const response =
      await request(app)
        .post('/api/contact')
        .set(
          'Content-Type',
          'application/json'
        )
        .send(
          '{"firstName":"Broken JSON"'
        );


    assert.equal(
      response.status,
      400
    );


    assert.match(
      response.text,
      /invalid request body/i
    );


    assert.match(
      response.headers[
        'cache-control'
      ] || '',
      /no-store/i
    );


    assert.match(
      response.headers[
        'x-request-id'
      ],
      UUID_V4_PATTERN
    );
  }
);