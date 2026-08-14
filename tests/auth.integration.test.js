const test =
  require(
    'node:test'
  );

const assert =
  require(
    'node:assert/strict'
  );

const request =
  require(
    'supertest'
  );

const bcrypt =
  require(
    'bcrypt'
  );


/*
 * ============================================================
 * TEST DATABASE SAFETY CHECK
 * ============================================================
 *
 * These integration tests deliberately create and remove Admin
 * and AuditLog records.
 *
 * Never allow them to run against a normal development or
 * production database.
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


/*
 * Requiring server.js no longer starts the HTTP listener because
 * of the require.main === module protection we added.
 */
const app =
  require(
    '../server'
  );

const prisma =
  require(
    '../config/db'
  );


const TEST_PASSWORD =
  'Phase2-Integration-Test-Password-2026!';


let emailSequence =
  0;


/*
 * Generate a unique address for every administrator created by
 * the tests.
 */
function createTestEmail(
  label
) {
  emailSequence +=
    1;

  return (
    `phase2-${label}-${Date.now()}-${emailSequence}@example.com`
  );
}


/*
 * Create an administrator directly in the isolated test
 * database.
 */
async function createTestAdmin({
  role = 'EDITOR',
  isActive = true,
  label = 'admin'
} = {}) {
  const email =
    createTestEmail(
      label
    );

  const passwordHash =
    await bcrypt.hash(
      TEST_PASSWORD,
      12
    );


  return prisma.admin.create({
    data: {
      email,
      passwordHash,
      role,
      isActive
    }
  });
}


/*
 * Every login form receives its CSRF token from GET
 * /admin/login.
 */
async function getLoginCsrfToken(
  agent
) {
  const response =
    await agent
      .get(
        '/admin/login'
      )
      .expect(
        200
      );


  const tokenMatch =
    response.text.match(
      /name="_csrf"\s+value="([^"]+)"/
    );


  assert.ok(
    tokenMatch?.[1],
    'The admin login page did not contain a CSRF token.'
  );


  return tokenMatch[1];
}


/*
 * Perform a normal browser-style administrator login while
 * preserving the session cookie through Supertest's agent.
 */
async function login(
  agent,
  email,
  password =
    TEST_PASSWORD
) {
  const csrfToken =
    await getLoginCsrfToken(
      agent
    );


  return agent
    .post(
      '/auth/login'
    )
    .type(
      'form'
    )
    .send({
      _csrf:
        csrfToken,

      email,

      password
    });
}


/*
 * The database is dedicated to automated tests, so clearing the
 * authentication tables is safe after the safety checks above.
 */
async function clearAuthenticationTestData() {
  await prisma.auditLog
    .deleteMany();

  await prisma.admin
    .deleteMany();
}


test.before(
  async () => {
    await clearAuthenticationTestData();
  }
);


test.after(
  async () => {
    await clearAuthenticationTestData();


    /*
     * Close connect-pg-simple's own PostgreSQL pool.
     */
    if (
      app.locals
        .sessionStore &&
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
 * CSRF
 * ============================================================
 */
test(
  'admin login page exposes a CSRF token',
  async () => {
    const agent =
      request.agent(
        app
      );


    const token =
      await getLoginCsrfToken(
        agent
      );


    assert.ok(
      token.length > 20
    );
  }
);


test(
  'admin login rejects a missing CSRF token',
  async () => {
    const response =
      await request(
        app
      )
        .post(
          '/auth/login'
        )
        .type(
          'form'
        )
        .send({
          email:
            'nobody@example.com',

          password:
            'not-a-password'
        });


    assert.equal(
      response.status,
      403
    );
  }
);


/*
 * ============================================================
 * SUCCESSFUL LOGIN
 * ============================================================
 */
test(
  'valid administrator credentials create an authenticated session',
  async () => {
    const admin =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'success'
      });


    const agent =
      request.agent(
        app
      );


    const response =
      await login(
        agent,
        admin.email
      );


    assert.equal(
      response.status,
      302
    );

    assert.equal(
      response.headers.location,
      '/admin/dashboard'
    );


    /*
     * The same browser session must now be able to access the
     * protected dashboard.
     */
    await agent
      .get(
        '/admin/dashboard'
      )
      .expect(
        200
      );


    const updatedAdmin =
      await prisma.admin
        .findUnique({
          where: {
            id:
              admin.id
          }
        });


    assert.equal(
      updatedAdmin.failedLogins,
      0
    );

    assert.equal(
      updatedAdmin.lockedUntil,
      null
    );

    assert.ok(
      updatedAdmin.lastLoginAt instanceof
        Date
    );


    const auditRecord =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              admin.id,

            action:
              'ADMIN_LOGIN_SUCCESS'
          }
        });


    assert.ok(
      auditRecord
    );
  }
);


/*
 * ============================================================
 * INCORRECT PASSWORD
 * ============================================================
 */
test(
  'incorrect password increments failed login count',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'wrong-password'
      });


    const agent =
      request.agent(
        app
      );


    const response =
      await login(
        agent,
        admin.email,
        'Definitely-Wrong-Password!'
      );


    assert.equal(
      response.status,
      401
    );


    const updatedAdmin =
      await prisma.admin
        .findUnique({
          where: {
            id:
              admin.id
          }
        });


    assert.equal(
      updatedAdmin.failedLogins,
      1
    );


    const auditRecord =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              admin.id,

            action:
              'ADMIN_LOGIN_FAILED'
          }
        });


    assert.ok(
      auditRecord
    );
  }
);


/*
 * ============================================================
 * INACTIVE ACCOUNT
 * ============================================================
 */
test(
  'inactive administrator cannot log in',
  async () => {
    const admin =
      await createTestAdmin({
        isActive:
          false,

        label:
          'inactive'
      });


    const agent =
      request.agent(
        app
      );


    const response =
      await login(
        agent,
        admin.email
      );


    assert.equal(
      response.status,
      401
    );


    const dashboardResponse =
      await agent
        .get(
          '/admin/dashboard'
        );


    assert.equal(
      dashboardResponse.status,
      302
    );

    assert.equal(
      dashboardResponse.headers.location,
      '/admin/login'
    );
  }
);


/*
 * ============================================================
 * ACCOUNT LOCKOUT
 * ============================================================
 */
test(
  'five incorrect passwords lock the administrator account',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'lockout'
      });


    const agent =
      request.agent(
        app
      );


    const csrfToken =
      await getLoginCsrfToken(
        agent
      );


    for (
      let attempt = 1;
      attempt <= 5;
      attempt += 1
    ) {
      const response =
        await agent
          .post(
            '/auth/login'
          )
          .type(
            'form'
          )
          .send({
            _csrf:
              csrfToken,

            email:
              admin.email,

            password:
              'Incorrect-Password!'
          });


      assert.equal(
        response.status,
        401
      );
    }


    const updatedAdmin =
      await prisma.admin
        .findUnique({
          where: {
            id:
              admin.id
          }
        });


    assert.equal(
      updatedAdmin.failedLogins,
      5
    );


    assert.ok(
      updatedAdmin.lockedUntil instanceof
        Date
    );


    assert.ok(
      updatedAdmin.lockedUntil >
        new Date()
    );


    const lockAudit =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              admin.id,

            action:
              'ADMIN_ACCOUNT_LOCKED'
          }
        });


    assert.ok(
      lockAudit
    );
  }
);


/*
 * ============================================================
 * SESSION VERSION INVALIDATION
 * ============================================================
 */
test(
  'changing sessionVersion invalidates an existing administrator session',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'session-version'
      });


    const agent =
      request.agent(
        app
      );


    const loginResponse =
      await login(
        agent,
        admin.email
      );


    assert.equal(
      loginResponse.status,
      302
    );


    await agent
      .get(
        '/admin/dashboard'
      )
      .expect(
        200
      );


    /*
     * Simulate a password/status security change made by the
     * SUPERADMIN.
     */
    await prisma.admin
      .update({
        where: {
          id:
            admin.id
        },

        data: {
          sessionVersion: {
            increment:
              1
          }
        }
      });


    const response =
      await agent
        .get(
          '/admin/dashboard'
        );


    assert.equal(
      response.status,
      302
    );

    assert.equal(
      response.headers.location,
      '/admin/login'
    );
  }
);


/*
 * ============================================================
 * EDITOR ROLE RESTRICTION
 * ============================================================
 */
test(
  'EDITOR cannot access job applications',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'editor-access'
      });


    const agent =
      request.agent(
        app
      );


    const loginResponse =
      await login(
        agent,
        editor.email
      );


    assert.equal(
      loginResponse.status,
      302
    );


    const response =
      await agent
        .get(
          '/admin/applications'
        );


    assert.equal(
      response.status,
      403
    );
  }
);


/*
 * ============================================================
 * SUPERADMIN ROLE ACCESS
 * ============================================================
 */
test(
  'SUPERADMIN can access job applications',
  async () => {
    const superAdmin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'superadmin-access'
      });


    const agent =
      request.agent(
        app
      );


    const loginResponse =
      await login(
        agent,
        superAdmin.email
      );


    assert.equal(
      loginResponse.status,
      302
    );


    await agent
      .get(
        '/admin/applications'
      )
      .expect(
        200
      );
  }
);