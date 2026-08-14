const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const request =
  require('supertest');

const bcrypt =
  require('bcrypt');


/*
 * ============================================================
 * TEST DATABASE SAFETY
 * ============================================================
 */

if (
  process.env.NODE_ENV !==
  'test'
) {
  throw new Error(
    'Audit integration tests refused: NODE_ENV must be test.'
  );
}


if (
  !process.env.DATABASE_URL
) {
  throw new Error(
    'Audit integration tests refused: DATABASE_URL is missing.'
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
    `Audit integration tests refused: "${databaseName}" is not recognised as a test database.`
  );
}


const app =
  require('../server');

const prisma =
  require('../config/db');


const TEST_PASSWORD =
  'Phase2F-Audit-Test-Password-2026!';


let sequence =
  0;


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function createTestEmail(
  label
) {
  sequence += 1;


  return (
    `phase2f-${label}-${Date.now()}-${sequence}@example.com`
  );
}


async function createTestAdmin({
  label = 'admin'
} = {}) {
  const passwordHash =
    await bcrypt.hash(
      TEST_PASSWORD,
      12
    );


  return prisma.admin.create({
    data: {
      email:
        createTestEmail(
          label
        ),

      passwordHash,

      role:
        'SUPERADMIN',

      isActive:
        true
    }
  });
}


function extractCsrfToken(
  html
) {
  const match =
    html.match(
      /name="_csrf"\s+value="([^"]+)"/
    );


  assert.ok(
    match?.[1],
    'Expected page to contain a CSRF token.'
  );


  return match[1];
}


async function login(
  agent,
  admin,
  {
    userAgent =
      'Phase2F-Test-Agent/1.0'
  } = {}
) {
  const loginPage =
    await agent
      .get('/admin/login')
      .expect(200);


  const csrfToken =
    extractCsrfToken(
      loginPage.text
    );


  const response =
    await agent
      .post('/auth/login')
      .set(
        'User-Agent',
        userAgent
      )
      .type('form')
      .send({
        _csrf:
          csrfToken,

        email:
          admin.email,

        password:
          TEST_PASSWORD
      });


  assert.equal(
    response.status,
    302
  );


  assert.equal(
    response.headers.location,
    '/admin/dashboard'
  );
}


async function getAdminCsrfToken(
  agent
) {
  const response =
    await agent
      .get('/admin/dashboard')
      .expect(200);


  return extractCsrfToken(
    response.text
  );
}


function todayForHtmlDateInput() {
  const now =
    new Date();


  const year =
    String(
      now.getFullYear()
    );


  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      '0'
    );


  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      '0'
    );


  return `${year}-${month}-${day}`;
}


async function clearAuditTestData() {
  await prisma.auditLog
    .deleteMany();

  await prisma.jobApplication
    .deleteMany();

  await prisma.jobPosting
    .deleteMany();

  await prisma.admin
    .deleteMany();
}


/*
 * ============================================================
 * TEST LIFECYCLE
 * ============================================================
 */

test.before(
  async () => {
    await clearAuditTestData();
  }
);


test.beforeEach(
  async () => {
    await clearAuditTestData();
  }
);


test.after(
  async () => {
    await clearAuditTestData();


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
 * 1. LOGIN AUDIT CONTEXT
 * ============================================================
 */

test(
  'successful login audit records actor, entity, IP and User-Agent',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'login-audit'
      });


    const agent =
      request.agent(app);


    const userAgent =
      'Phase2F-Login-Audit/1.0';


    await login(
      agent,
      admin,
      {
        userAgent
      }
    );


    const auditRecord =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              admin.id,

            action:
              'ADMIN_LOGIN_SUCCESS'
          },

          orderBy: {
            createdAt:
              'desc'
          }
        });


    assert.ok(
      auditRecord,
      'Expected ADMIN_LOGIN_SUCCESS audit record.'
    );


    assert.equal(
      auditRecord.adminId,
      admin.id
    );


    assert.equal(
      auditRecord.entityType,
      'Admin'
    );


    assert.equal(
      auditRecord.entityId,
      String(
        admin.id
      )
    );


    assert.ok(
      auditRecord.ipAddress,
      'Expected audit IP address.'
    );


    assert.equal(
      auditRecord.userAgent,
      userAgent
    );


    assert.ok(
      auditRecord.createdAt instanceof
        Date
    );
  }
);


/*
 * ============================================================
 * 2. CONTENT AUDIT METADATA
 * ============================================================
 */

test(
  'JOB_CREATED audit stores complete metadata and bounded User-Agent data',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'job-audit'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      admin
    );


    const csrfToken =
      await getAdminCsrfToken(
        agent
      );


    const title =
      `Phase 2F Audit Job ${Date.now()}`;


    /*
     * Deliberately longer than the audit service's configured
     * User-Agent storage size.
     */
    const longUserAgent =
      `Phase2F/${'A'.repeat(700)}`;


    const response =
      await agent
        .post('/admin/jobs')
        .set(
          'User-Agent',
          longUserAgent
        )
        .type('form')
        .send({
          _csrf:
            csrfToken,

          title,

          department:
            'Information Technology',

          location:
            'Lagos',

          description:
            'Phase 2F audit metadata integration test.',

          status:
            'open'
        });


    assert.equal(
      response.status,
      302
    );


    assert.equal(
      response.headers.location,
      '/admin/jobs'
    );


    const job =
      await prisma.jobPosting
        .findFirst({
          where: {
            title
          }
        });


    assert.ok(
      job
    );


    const auditRecord =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              admin.id,

            action:
              'JOB_CREATED',

            entityId:
              String(
                job.id
              )
          }
        });


    assert.ok(
      auditRecord
    );


    assert.equal(
      auditRecord.entityType,
      'JobPosting'
    );


    assert.ok(
      auditRecord.ipAddress
    );


    /*
     * Audit User-Agent data should be bounded rather than
     * accepting an arbitrarily large string.
     */
    assert.equal(
      auditRecord.userAgent.length,
      500
    );


    assert.ok(
      longUserAgent.startsWith(
        auditRecord.userAgent
      )
    );


    assert.equal(
      auditRecord.metadata.title,
      title
    );


    assert.equal(
      auditRecord.metadata.department,
      'Information Technology'
    );


    assert.equal(
      auditRecord.metadata.location,
      'Lagos'
    );


    assert.equal(
      auditRecord.metadata.status,
      'open'
    );


    assert.equal(
      auditRecord.metadata.deadline,
      null
    );
  }
);


/*
 * ============================================================
 * 3. AUDIT FILTERS
 * ============================================================
 */

test(
  'audit page filters by actor, action, entity type and date',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'filter-owner'
      });


    const otherAdmin =
      await createTestAdmin({
        label:
          'filter-decoy'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      admin
    );


    const csrfToken =
      await getAdminCsrfToken(
        agent
      );


    const title =
      `Phase 2F Filter Target ${Date.now()}`;


    await agent
      .post('/admin/jobs')
      .type('form')
      .send({
        _csrf:
          csrfToken,

        title,

        department:
          'Research',

        location:
          'Lagos',

        description:
          'Audit filtering target.',

        status:
          'open'
      })
      .expect(302);


    /*
     * Each decoy fails exactly one of the filter criteria.
     */

    await prisma.auditLog.create({
      data: {
        adminId:
          otherAdmin.id,

        action:
          'JOB_CREATED',

        entityType:
          'JobPosting',

        entityId:
          '900001',

        metadata: {
          marker:
            'PHASE2F_DECOY_ACTOR'
        }
      }
    });


    await prisma.auditLog.create({
      data: {
        adminId:
          admin.id,

        action:
          'NEWS_CREATED',

        entityType:
          'JobPosting',

        entityId:
          '900002',

        metadata: {
          marker:
            'PHASE2F_DECOY_ACTION'
        }
      }
    });


    await prisma.auditLog.create({
      data: {
        adminId:
          admin.id,

        action:
          'JOB_CREATED',

        entityType:
          'NewsArticle',

        entityId:
          '900003',

        metadata: {
          marker:
            'PHASE2F_DECOY_ENTITY'
        }
      }
    });


    await prisma.auditLog.create({
      data: {
        adminId:
          admin.id,

        action:
          'JOB_CREATED',

        entityType:
          'JobPosting',

        entityId:
          '900004',

        createdAt:
          new Date(
            '2000-01-01T00:00:00.000Z'
          ),

        metadata: {
          marker:
            'PHASE2F_DECOY_DATE'
        }
      }
    });


    const today =
      todayForHtmlDateInput();


    const response =
      await agent
        .get(
          '/admin/audit-logs'
        )
        .query({
          action:
            'JOB_CREATED',

          entityType:
            'JobPosting',

          adminId:
            String(
              admin.id
            ),

          from:
            today
        })
        .expect(200);


    /*
     * The real matching JOB_CREATED record should be visible.
     */
    assert.match(
      response.text,
      new RegExp(
        title.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        )
      )
    );


    /*
     * None of the deliberately non-matching records should
     * appear in the rendered audit rows.
     */
    assert.doesNotMatch(
      response.text,
      /PHASE2F_DECOY_ACTOR/
    );


    assert.doesNotMatch(
      response.text,
      /PHASE2F_DECOY_ACTION/
    );


    assert.doesNotMatch(
      response.text,
      /PHASE2F_DECOY_ENTITY/
    );


    assert.doesNotMatch(
      response.text,
      /PHASE2F_DECOY_DATE/
    );
  }
);