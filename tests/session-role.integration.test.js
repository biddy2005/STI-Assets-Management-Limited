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
    .includes('test')
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
  'Phase2B-Integration-Test-Password-2026!';


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
    `phase2b-${label}-${Date.now()}-${emailSequence}@example.com`
  );
}


async function createTestAdmin({
  role = 'EDITOR',
  isActive = true,
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
      isActive
    }
  });
}


/*
 * Extract a synchroniser CSRF token from an HTML page.
 */
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


/*
 * Fetch the login page and obtain its CSRF token.
 */
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


/*
 * Perform a real administrator login.
 */
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


/*
 * Obtain a fresh CSRF token from the authenticated dashboard.
 *
 * Login regenerates the session, so we deliberately obtain a
 * token after authentication instead of reusing the login token.
 */
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


async function clearAuthenticationTestData() {
  await prisma.auditLog
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
    await clearAuthenticationTestData();
  }
);


test.after(
  async () => {
    await clearAuthenticationTestData();


    if (
      app.locals.sessionStore &&
      typeof app.locals.sessionStore.close ===
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
 * 1. UNAUTHENTICATED ACCESS
 * ============================================================
 */

test(
  'unauthenticated administrator pages redirect to login',
  async () => {
    const response =
      await request(app)
        .get('/admin/dashboard');


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
 * 2. EDITOR CONTENT ACCESS
 * ============================================================
 */

test(
  'EDITOR can access all approved content-management pages',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'editor-content'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      editor
    );


    const allowedRoutes =
      [
        '/admin/news',
        '/admin/downloads',
        '/admin/jobs',
        '/admin/rate-guide'
      ];


    for (
      const route
      of allowedRoutes
    ) {
      const response =
        await agent
          .get(route);


      assert.equal(
        response.status,
        200,
        `Expected EDITOR access to ${route}`
      );
    }
  }
);


/*
 * ============================================================
 * 3. EDITOR SENSITIVE-DATA RESTRICTIONS
 * ============================================================
 */

test(
  'EDITOR is blocked from every SUPERADMIN-only management page',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'editor-restricted'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      editor
    );


    const restrictedRoutes =
      [
        '/admin/applications',
        '/admin/contact-submissions',
        '/admin/newsletter',
        '/admin/audit-logs',
        '/admin/editors'
      ];


    for (
      const route
      of restrictedRoutes
    ) {
      const response =
        await agent
          .get(route);


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
 * 4. SUPERADMIN SENSITIVE-DATA ACCESS
 * ============================================================
 */

test(
  'SUPERADMIN can access every SUPERADMIN-only management page',
  async () => {
    const superAdmin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'superadmin-access'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      superAdmin
    );


    const protectedRoutes =
      [
        '/admin/applications',
        '/admin/contact-submissions',
        '/admin/newsletter',
        '/admin/audit-logs',
        '/admin/editors'
      ];


    for (
      const route
      of protectedRoutes
    ) {
      const response =
        await agent
          .get(route);


      assert.equal(
        response.status,
        200,
        `Expected SUPERADMIN access to ${route}`
      );
    }
  }
);


/*
 * ============================================================
 * 5. ACCOUNT DEACTIVATION INVALIDATES SESSION
 * ============================================================
 */

test(
  'deactivating an administrator invalidates their active session',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'deactivated-session'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      editor
    );


    /*
     * Confirm that the session works before deactivation.
     */
    await agent
      .get('/admin/dashboard')
      .expect(200);


    /*
     * Simulate the SUPERADMIN deactivating the account.
     */
    await prisma.admin
      .update({
        where: {
          id:
            editor.id
        },

        data: {
          isActive:
            false
        }
      });


    const response =
      await agent
        .get('/admin/dashboard');


    assert.equal(
      response.status,
      302
    );


    assert.equal(
      response.headers.location,
      '/admin/login'
    );


    /*
     * The destroyed session must remain unusable.
     */
    const secondResponse =
      await agent
        .get('/admin/dashboard');


    assert.equal(
      secondResponse.status,
      302
    );


    assert.equal(
      secondResponse.headers.location,
      '/admin/login'
    );
  }
);


/*
 * ============================================================
 * 6. LOGOUT REQUIRES CSRF
 * ============================================================
 */

test(
  'logout without a CSRF token is rejected and does not destroy the session',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'logout-csrf'
      });


    const agent =
      request.agent(app);


    await login(
      agent,
      editor
    );


    const logoutResponse =
      await agent
        .post('/auth/logout')
        .type('form')
        .send({});


    assert.equal(
      logoutResponse.status,
      403
    );


    /*
     * A failed CSRF check must not log the administrator out.
     */
    await agent
      .get('/admin/dashboard')
      .expect(200);
  }
);


/*
 * ============================================================
 * 7. SUCCESSFUL LOGOUT
 * ============================================================
 */

test(
  'valid logout destroys the session and creates an audit record',
  async () => {
    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'valid-logout'
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


    const logoutResponse =
      await agent
        .post('/auth/logout')
        .type('form')
        .send({
          _csrf:
            csrfToken
        });


    assert.equal(
      logoutResponse.status,
      302
    );


    assert.equal(
      logoutResponse.headers.location,
      '/admin/login'
    );


    /*
     * The old authenticated session must no longer work.
     */
    const dashboardResponse =
      await agent
        .get('/admin/dashboard');


    assert.equal(
      dashboardResponse.status,
      302
    );


    assert.equal(
      dashboardResponse.headers.location,
      '/admin/login'
    );


    /*
     * Logout should also appear in the security audit trail.
     */
    const logoutAudit =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              editor.id,

            action:
              'ADMIN_LOGOUT'
          }
        });


    assert.ok(
      logoutAudit,
      'Expected ADMIN_LOGOUT audit record.'
    );
  }
);