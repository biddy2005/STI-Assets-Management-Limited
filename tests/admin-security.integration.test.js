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
 *
 * These tests deliberately create and delete database records.
 *
 * Never allow this file to run against the normal development
 * or production database.
 */
if (
  process.env.NODE_ENV !==
  'test'
) {
  throw new Error(
    'Integration tests refused: NODE_ENV must be test.'
  );
}


if (
  !process.env.DATABASE_URL
) {
  throw new Error(
    'Integration tests refused: DATABASE_URL is missing.'
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
    `Integration tests refused: "${databaseName}" is not recognised as a test database.`
  );
}


const app =
  require('../server');

const prisma =
  require('../config/db');


const TEST_PASSWORD =
  'Phase2C-Integration-Test-Password-2026!';


let emailSequence =
  0;


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function createTestEmail(
  label
) {
  emailSequence += 1;

  return (
    `phase2c-${label}-${Date.now()}-${emailSequence}@example.com`
  );
}


async function createTestAdmin({
  role = 'EDITOR',
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
        createTestEmail(label),

      passwordHash,

      role,

      isActive:
        true
    }
  });
}


function extractCsrfToken(
  html
) {
  const tokenMatch =
    html.match(
      /name="_csrf"\s+value="([^"]+)"/
    );


  assert.ok(
    tokenMatch?.[1],
    'Expected page to contain a CSRF token.'
  );


  return tokenMatch[1];
}


async function getLoginCsrfToken(
  agent
) {
  const response =
    await agent
      .get('/admin/login')
      .expect(200);


  return extractCsrfToken(
    response.text
  );
}


async function login(
  agent,
  admin
) {
  const csrfToken =
    await getLoginCsrfToken(
      agent
    );


  const response =
    await agent
      .post('/auth/login')
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


  return response;
}


async function getAuthenticatedCsrfToken(
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


async function createTestJob(
  label
) {
  return prisma.jobPosting.create({
    data: {
      title:
        `Phase 2C ${label} ${Date.now()}`,

      department:
        'Information Technology',

      location:
        'Lagos',

      description:
        'Automated integration test job posting.',

      status:
        'open'
    }
  });
}


async function createTestContactSubmission() {
  return prisma.contactSubmission.create({
    data: {
      name:
        'Phase 2C Test User',

      email:
        createTestEmail(
          'contact'
        ),

      subject:
        'Integration test',

      message:
        'This record exists only in the isolated test database.'
    }
  });
}


/*
 * Clean only test-database tables used during this phase.
 */
async function clearPhase2CTestData() {
  await prisma.auditLog
    .deleteMany();

  await prisma.jobApplication
    .deleteMany();

  await prisma.jobPosting
    .deleteMany();

  await prisma.contactSubmission
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
    await clearPhase2CTestData();
  }
);


test.after(
  async () => {
    await clearPhase2CTestData();


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
 * 1. EDITOR CANNOT BYPASS DELETE PERMISSIONS
 * ============================================================
 */

test(
  'EDITOR cannot directly POST to SUPERADMIN-only delete routes',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'delete-bypass'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      editor
    );


    /*
     * Deliberately use nonexistent IDs.
     *
     * The request must be rejected by role middleware before
     * the route is allowed to perform a database lookup.
     */
    const destructiveRoutes =
      [
        '/admin/news/999999/delete',
        '/admin/jobs/999999/delete',
        '/admin/downloads/999999/delete',
        '/admin/news/999999/images/999999/delete',
        '/admin/applications/999999/delete',
        '/admin/contact-submissions/999999/delete',
        '/admin/newsletter/999999/delete'
      ];


    for (
      const route
      of destructiveRoutes
    ) {
      const response =
        await agent
          .post(route)
          .type('form')
          .send({});


      assert.equal(
        response.status,
        403,
        `Expected EDITOR to be forbidden from ${route}`
      );
    }
  }
);


/*
 * ============================================================
 * 2. EDITOR CANNOT BYPASS SENSITIVE UPDATE PERMISSIONS
 * ============================================================
 */

test(
  'EDITOR cannot directly POST to SUPERADMIN-only status routes',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'status-bypass'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      editor
    );


    const restrictedRequests =
      [
        {
          path:
            '/admin/applications/999999/status',

          body: {
            status:
              'REVIEWING'
          }
        },

        {
          path:
            '/admin/contact-submissions/999999/status',

          body: {
            status:
              'IN_PROGRESS'
          }
        },

        {
          path:
            '/admin/editors/999999/status',

          body: {
            isActive:
              'false'
          }
        }
      ];


    for (
      const restrictedRequest
      of restrictedRequests
    ) {
      const response =
        await agent
          .post(
            restrictedRequest.path
          )
          .type('form')
          .send(
            restrictedRequest.body
          );


      assert.equal(
        response.status,
        403,
        `Expected EDITOR to be forbidden from ${restrictedRequest.path}`
      );
    }
  }
);


/*
 * ============================================================
 * 3. SUPERADMIN DELETE WITHOUT CSRF
 * ============================================================
 */

test(
  'SUPERADMIN destructive request without CSRF is rejected without deleting data',
  async () => {
    const superAdmin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'missing-csrf'
      });


    const job =
      await createTestJob(
        'Missing CSRF'
      );


    const agent =
      request.agent(app);


    await login(
      agent,
      superAdmin
    );


    const response =
      await agent
        .post(
          `/admin/jobs/${job.id}/delete`
        )
        .type('form')
        .send({});


    assert.equal(
      response.status,
      403
    );


    const existingJob =
      await prisma.jobPosting
        .findUnique({
          where: {
            id:
              job.id
          }
        });


    assert.ok(
      existingJob,
      'Job must remain after missing-CSRF rejection.'
    );
  }
);


/*
 * ============================================================
 * 4. SUPERADMIN DELETE WITH INVALID CSRF
 * ============================================================
 */

test(
  'SUPERADMIN destructive request with invalid CSRF is rejected without deleting data',
  async () => {
    const superAdmin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'invalid-csrf'
      });


    const job =
      await createTestJob(
        'Invalid CSRF'
      );


    const agent =
      request.agent(app);


    await login(
      agent,
      superAdmin
    );


    const response =
      await agent
        .post(
          `/admin/jobs/${job.id}/delete`
        )
        .type('form')
        .send({
          _csrf:
            'this-is-not-a-valid-csrf-token'
        });


    assert.equal(
      response.status,
      403
    );


    const existingJob =
      await prisma.jobPosting
        .findUnique({
          where: {
            id:
              job.id
          }
        });


    assert.ok(
      existingJob,
      'Job must remain after invalid-CSRF rejection.'
    );
  }
);


/*
 * ============================================================
 * 5. VALID SUPERADMIN DESTRUCTIVE REQUEST
 * ============================================================
 */

test(
  'SUPERADMIN with valid CSRF can delete a job and an audit record is created',
  async () => {
    const superAdmin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'valid-delete'
      });


    const job =
      await createTestJob(
        'Valid Delete'
      );


    const agent =
      request.agent(app);


    await login(
      agent,
      superAdmin
    );


    const csrfToken =
      await getAuthenticatedCsrfToken(
        agent
      );


    const response =
      await agent
        .post(
          `/admin/jobs/${job.id}/delete`
        )
        .type('form')
        .send({
          _csrf:
            csrfToken
        });


    assert.equal(
      response.status,
      302
    );


    assert.equal(
      response.headers.location,
      '/admin/jobs'
    );


    const deletedJob =
      await prisma.jobPosting
        .findUnique({
          where: {
            id:
              job.id
          }
        });


    assert.equal(
      deletedJob,
      null
    );


    const auditRecord =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              superAdmin.id,

            action:
              'JOB_DELETED',

            entityId:
              String(job.id)
          }
        });


    assert.ok(
      auditRecord,
      'Expected JOB_DELETED audit record.'
    );
  }
);


/*
 * ============================================================
 * 6. EDITOR CONTENT CREATE WITH INVALID CSRF
 * ============================================================
 */

test(
  'EDITOR cannot create content with an invalid CSRF token',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'editor-invalid-csrf'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      editor
    );


    const title =
      `Phase 2C Invalid CSRF Job ${Date.now()}`;


    const response =
      await agent
        .post('/admin/jobs')
        .type('form')
        .send({
          _csrf:
            'invalid-token',

          title,

          department:
            'Information Technology',

          location:
            'Lagos',

          description:
            'This job must never be created.',

          status:
            'open'
        });


    assert.equal(
      response.status,
      403
    );


    const job =
      await prisma.jobPosting
        .findFirst({
          where: {
            title
          }
        });


    assert.equal(
      job,
      null
    );
  }
);


/*
 * ============================================================
 * 7. EDITOR CONTENT CREATE WITH VALID CSRF
 * ============================================================
 */

test(
  'EDITOR with valid CSRF can create approved website content',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'editor-valid-create'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      editor
    );


    const csrfToken =
      await getAuthenticatedCsrfToken(
        agent
      );


    const title =
      `Phase 2C Editor Job ${Date.now()}`;


    const response =
      await agent
        .post('/admin/jobs')
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
            'Created by an EDITOR during an automated integration test.',

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
      job,
      'Expected EDITOR-created job to exist.'
    );


    const auditRecord =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              editor.id,

            action:
              'JOB_CREATED',

            entityId:
              String(job.id)
          }
        });


    assert.ok(
      auditRecord,
      'Expected JOB_CREATED audit record.'
    );
  }
);


/*
 * ============================================================
 * 8. VALID SUPERADMIN STATUS UPDATE
 * ============================================================
 */

test(
  'SUPERADMIN with valid CSRF can update contact status and create an audit record',
  async () => {
    const superAdmin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'contact-status'
      });


    const submission =
      await createTestContactSubmission();


    const agent =
      request.agent(app);


    await login(
      agent,
      superAdmin
    );


    const csrfToken =
      await getAuthenticatedCsrfToken(
        agent
      );


    const response =
      await agent
        .post(
          `/admin/contact-submissions/${submission.id}/status`
        )
        .type('form')
        .send({
          _csrf:
            csrfToken,

          status:
            'IN_PROGRESS'
        });


    assert.equal(
      response.status,
      302
    );


    assert.equal(
      response.headers.location,
      '/admin/contact-submissions'
    );


    const updatedSubmission =
      await prisma.contactSubmission
        .findUnique({
          where: {
            id:
              submission.id
          }
        });


    assert.equal(
      updatedSubmission.status,
      'IN_PROGRESS'
    );


    const auditRecord =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              superAdmin.id,

            action:
              'CONTACT_STATUS_UPDATED',

            entityId:
              String(submission.id)
          }
        });


    assert.ok(
      auditRecord,
      'Expected CONTACT_STATUS_UPDATED audit record.'
    );
  }
);