const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const request =
  require('supertest');

const bcrypt =
  require('bcrypt');

const fs =
  require('fs/promises');

const path =
  require('path');


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
    'Upload resilience tests refused: NODE_ENV must be test.'
  );
}


if (
  !process.env.DATABASE_URL
) {
  throw new Error(
    'Upload resilience tests refused: DATABASE_URL is missing.'
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
    `Upload resilience tests refused: "${databaseName}" is not recognised as a test database.`
  );
}


const app =
  require('../server');

const prisma =
  require('../config/db');


const {
  resumeDirectory,
  digestUploadDirectory,
  newsUploadDirectory
} = require('../config/storage');


const TEST_PASSWORD =
  'Phase2D-Part2-Test-Password-2026!';


let emailSequence =
  0;


/*
 * ============================================================
 * VALID TEST FILES
 * ============================================================
 */

const VALID_PDF =
  Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj',
      '<< /Type /Catalog >>',
      'endobj',
      'trailer',
      '<<>>',
      '%%EOF'
    ].join('\n')
  );


const VALID_PNG =
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );


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
    `phase2d2-${label}-${Date.now()}-${emailSequence}@example.com`
  );
}


async function createTestAdmin({
  role = 'SUPERADMIN',
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
      role,

      isActive:
        true
    }
  });
}


async function createTestJob(
  label
) {
  return prisma.jobPosting.create({
    data: {
      title:
        `Phase 2D Part 2 ${label} ${Date.now()}`,

      department:
        'Information Technology',

      location:
        'Lagos',

      description:
        'Temporary job used for upload resilience testing.',

      status:
        'open'
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


async function getCareersCsrfToken(
  agent
) {
  const response =
    await agent
      .get('/careers')
      .expect(200);


  return extractCsrfToken(
    response.text
  );
}


async function directorySnapshot(
  directory
) {
  try {
    return new Set(
      await fs.readdir(
        directory
      )
    );
  } catch (error) {
    if (
      error.code ===
      'ENOENT'
    ) {
      return new Set();
    }

    throw error;
  }
}


async function getNewFiles(
  directory,
  before
) {
  const after =
    await directorySnapshot(
      directory
    );


  return [
    ...after
  ].filter(
    (filename) =>
      !before.has(
        filename
      )
  );
}


async function assertNoNewFiles(
  directory,
  before
) {
  const newFiles =
    await getNewFiles(
      directory,
      before
    );


  assert.deepEqual(
    newFiles,
    [],
    `Unexpected file remained in ${directory}`
  );
}


async function fileExists(
  filePath
) {
  try {
    await fs.access(
      filePath
    );

    return true;
  } catch (error) {
    if (
      error.code ===
      'ENOENT'
    ) {
      return false;
    }

    throw error;
  }
}


/*
 * Delete only files that did not exist before this test suite
 * started.
 */
async function removeFilesCreatedDuringTests(
  directory,
  originalFiles
) {
  const currentFiles =
    await directorySnapshot(
      directory
    );


  for (
    const filename
    of currentFiles
  ) {
    if (
      originalFiles.has(
        filename
      )
    ) {
      continue;
    }


    await fs.unlink(
      path.join(
        directory,
        filename
      )
    ).catch(
      (error) => {
        if (
          error.code !==
          'ENOENT'
        ) {
          throw error;
        }
      }
    );
  }
}


/*
 * ============================================================
 * ORIGINAL FILE SNAPSHOTS
 * ============================================================
 */

let originalResumeFiles;
let originalDigestFiles;
let originalNewsFiles;


/*
 * ============================================================
 * DATABASE CLEANUP
 * ============================================================
 */

async function clearTestDatabaseData() {
  await prisma.newsImage
    .deleteMany();

  await prisma.newsArticle
    .deleteMany();

  await prisma.jobApplication
    .deleteMany();

  await prisma.jobPosting
    .deleteMany();

  await prisma.dailyDigest
    .deleteMany();

  await prisma.productRate
    .deleteMany();

  await prisma.auditLog
    .deleteMany();

  await prisma.admin
    .deleteMany();
}


async function removeCurrentTestFiles() {
  await removeFilesCreatedDuringTests(
    resumeDirectory,
    originalResumeFiles
  );

  await removeFilesCreatedDuringTests(
    digestUploadDirectory,
    originalDigestFiles
  );

  await removeFilesCreatedDuringTests(
    newsUploadDirectory,
    originalNewsFiles
  );
}


/*
 * ============================================================
 * TEST LIFECYCLE
 * ============================================================
 */

test.before(
  async () => {
    originalResumeFiles =
      await directorySnapshot(
        resumeDirectory
      );

    originalDigestFiles =
      await directorySnapshot(
        digestUploadDirectory
      );

    originalNewsFiles =
      await directorySnapshot(
        newsUploadDirectory
      );

    await clearTestDatabaseData();
  }
);


test.beforeEach(
  async () => {
    await clearTestDatabaseData();

    await removeCurrentTestFiles();
  }
);


test.after(
  async () => {
    await clearTestDatabaseData();

    await removeCurrentTestFiles();


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
 * 1. SUCCESSFUL NEWS IMAGE
 * ============================================================
 */

test(
  'valid News cover image is saved only when the article is successfully created',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'news-success'
      });


    const agent =
      request.agent(
        app
      );


    await login(
      agent,
      admin
    );


    const csrfToken =
      await getAdminCsrfToken(
        agent
      );


    const before =
      await directorySnapshot(
        newsUploadDirectory
      );


    const title =
      `Phase 2D News Success ${Date.now()}`;


    const response =
      await agent
        .post('/admin/news')
        .field(
          '_csrf',
          csrfToken
        )
        .field(
          'title',
          title
        )
        .field(
          'body',
          'Valid News article created during an automated resilience test.'
        )
        .attach(
          'coverImage',
          VALID_PNG,
          {
            filename:
              'cover.png',

            contentType:
              'image/png'
          }
        );


    assert.equal(
      response.status,
      302
    );


    assert.equal(
      response.headers.location,
      '/admin/news'
    );


    const article =
      await prisma.newsArticle
        .findFirst({
          where: {
            title
          }
        });


    assert.ok(
      article,
      'Expected NewsArticle record.'
    );


    assert.ok(
      article.coverImage,
      'Expected NewsArticle coverImage.'
    );


    const newFiles =
      await getNewFiles(
        newsUploadDirectory,
        before
      );


    assert.equal(
      newFiles.length,
      1
    );


    assert.equal(
      path.basename(
        article.coverImage
      ),
      newFiles[0]
    );


    assert.equal(
      await fileExists(
        path.join(
          newsUploadDirectory,
          newFiles[0]
        )
      ),
      true
    );


    const auditRecord =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              admin.id,

            action:
              'NEWS_CREATED',

            entityId:
              String(
                article.id
              )
          }
        });


    assert.ok(
      auditRecord
    );
  }
);


/*
 * ============================================================
 * 2. NEWS DATABASE FAILURE
 * ============================================================
 */

test(
  'News image is removed when the article database transaction fails',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'news-db-failure'
      });


    const agent =
      request.agent(
        app
      );


    await login(
      agent,
      admin
    );


    const csrfToken =
      await getAdminCsrfToken(
        agent
      );


    const before =
      await directorySnapshot(
        newsUploadDirectory
      );


    const title =
      `Phase 2D Forced News Failure ${Date.now()}`;


    const originalTransaction =
      prisma.$transaction;


    let response;


    prisma.$transaction =
      async () => {
        throw new Error(
          'Forced News database failure for integration test.'
        );
      };


    try {
      response =
        await agent
          .post('/admin/news')
          .field(
            '_csrf',
            csrfToken
          )
          .field(
            'title',
            title
          )
          .field(
            'body',
            'This article must not survive the forced database failure.'
          )
          .attach(
            'coverImage',
            VALID_PNG,
            {
              filename:
                'forced-failure.png',

              contentType:
                'image/png'
            }
          );
    } finally {
      prisma.$transaction =
        originalTransaction;
    }


    assert.equal(
      response.status,
      500
    );


    const article =
      await prisma.newsArticle
        .findFirst({
          where: {
            title
          }
        });


    assert.equal(
      article,
      null
    );


    await assertNoNewFiles(
      newsUploadDirectory,
      before
    );
  }
);


/*
 * ============================================================
 * 3. RATE GUIDE FAILURE PRESERVES OLD FILE
 * ============================================================
 */

test(
  'failed Product Rate update preserves the previously published rates',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'product-rate-failure'
      });


    const agent =
      request.agent(
        app
      );


    await login(
      agent,
      admin
    );


    const existingRate =
      await prisma.productRate.create({
        data: {
          product:
            'MONEY_MARKET_NOTE',

          tenorMinDays:
            1,

          tenorMaxDays:
            30,

          minAmount:
            250000,

          maxAmount:
            999999,

          ratePercent:
            10.5,

          isActive:
            true
        }
      });


    const csrfToken =
      await getAdminCsrfToken(
        agent
      );


    const originalTransaction =
      prisma.$transaction;


    let failureResponse;


    prisma.$transaction =
      async () => {
        throw new Error(
          'Forced Product Rate database failure for integration test.'
        );
      };


    try {
      failureResponse =
        await agent
          .post('/admin/rates')
          .type('form')
          .send({
            _csrf:
              csrfToken,

            product:
              'MONEY_MARKET_NOTE',

            rate_0_30:
              '12.75'
          });
    } finally {
      prisma.$transaction =
        originalTransaction;
    }


    assert.equal(
      failureResponse.status,
      500
    );


    const ratesAfterFailure =
      await prisma.productRate.findMany({
        where: {
          product:
            'MONEY_MARKET_NOTE'
        }
      });


    assert.equal(
      ratesAfterFailure.length,
      1
    );


    assert.equal(
      ratesAfterFailure[0].id,
      existingRate.id
    );


    assert.equal(
      Number(
        ratesAfterFailure[0].ratePercent
      ),
      10.5
    );
  }
);


/*
 * ============================================================
 * 4. SUCCESSFUL DIGEST REPLACEMENT
 * ============================================================
 */

test(
  'successful Digest replacement saves the new PDF and removes the previous PDF',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'digest-success'
      });


    const agent =
      request.agent(
        app
      );


    await login(
      agent,
      admin
    );


    /*
     * Create the first Monday Digest.
     */
    let csrfToken =
      await getAdminCsrfToken(
        agent
      );


    const firstResponse =
      await agent
        .post('/admin/downloads')
        .field(
          '_csrf',
          csrfToken
        )
        .field(
          'dayOfWeek',
          'MONDAY'
        )
        .attach(
          'digestFile',
          VALID_PDF,
          {
            filename:
              'first-digest.pdf',

            contentType:
              'application/pdf'
          }
        );


    assert.equal(
      firstResponse.status,
      302
    );


    const originalDigest =
      await prisma.dailyDigest
        .findFirst({
          where: {
            dayOfWeek:
              'MONDAY'
          }
        });


    assert.ok(
      originalDigest
    );


    const originalFilePath =
      path.join(
        digestUploadDirectory,
        path.basename(
          originalDigest.filePath
        )
      );


    assert.equal(
      await fileExists(
        originalFilePath
      ),
      true
    );


    /*
     * Replace it with a second valid PDF.
     */
    csrfToken =
      await getAdminCsrfToken(
        agent
      );


    const secondResponse =
      await agent
        .post('/admin/downloads')
        .field(
          '_csrf',
          csrfToken
        )
        .field(
          'dayOfWeek',
          'MONDAY'
        )
        .attach(
          'digestFile',
          VALID_PDF,
          {
            filename:
              'replacement-digest.pdf',

            contentType:
              'application/pdf'
          }
        );


    assert.equal(
      secondResponse.status,
      302
    );


    const replacedDigest =
      await prisma.dailyDigest
        .findFirst({
          where: {
            dayOfWeek:
              'MONDAY'
          }
        });


    assert.ok(
      replacedDigest
    );


    assert.notEqual(
      replacedDigest.filePath,
      originalDigest.filePath
    );


    const replacementFilePath =
      path.join(
        digestUploadDirectory,
        path.basename(
          replacedDigest.filePath
        )
      );


    assert.equal(
      await fileExists(
        replacementFilePath
      ),
      true
    );


    /*
     * The database is now pointing to the replacement, so the
     * old file should have been removed.
     */
    assert.equal(
      await fileExists(
        originalFilePath
      ),
      false
    );


    const auditRecord =
      await prisma.auditLog
        .findFirst({
          where: {
            adminId:
              admin.id,

            action:
              'DIGEST_REPLACED',

            entityId:
              String(
                replacedDigest.id
              )
          }
        });


    assert.ok(
      auditRecord
    );
  }
);


/*
 * ============================================================
 * 5. FAILED DIGEST REPLACEMENT
 * ============================================================
 */

test(
  'failed Digest replacement removes the new PDF and preserves the existing PDF',
  async () => {
    const admin =
      await createTestAdmin({
        label:
          'digest-failure'
      });


    const agent =
      request.agent(
        app
      );


    await login(
      agent,
      admin
    );


    /*
     * Establish an existing Digest.
     */
    let csrfToken =
      await getAdminCsrfToken(
        agent
      );


    await agent
      .post('/admin/downloads')
      .field(
        '_csrf',
        csrfToken
      )
      .field(
        'dayOfWeek',
        'MONDAY'
      )
      .attach(
        'digestFile',
        VALID_PDF,
        {
          filename:
            'existing-digest.pdf',

          contentType:
            'application/pdf'
        }
      )
      .expect(
        302
      );


    const originalDigest =
      await prisma.dailyDigest
        .findFirst({
          where: {
            dayOfWeek:
              'MONDAY'
          }
        });


    assert.ok(
      originalDigest
    );


    const originalFilePath =
      path.join(
        digestUploadDirectory,
        path.basename(
          originalDigest.filePath
        )
      );


    assert.equal(
      await fileExists(
        originalFilePath
      ),
      true
    );


    const beforeReplacement =
      await directorySnapshot(
        digestUploadDirectory
      );


    csrfToken =
      await getAdminCsrfToken(
        agent
      );


    const originalTransaction =
      prisma.$transaction;


    let response;


    prisma.$transaction =
      async () => {
        throw new Error(
          'Forced Digest database failure for integration test.'
        );
      };


    try {
      response =
        await agent
          .post('/admin/downloads')
          .field(
            '_csrf',
            csrfToken
          )
          .field(
            'dayOfWeek',
            'MONDAY'
          )
          .attach(
            'digestFile',
            VALID_PDF,
            {
              filename:
                'failed-replacement.pdf',

              contentType:
                'application/pdf'
            }
          );
    } finally {
      prisma.$transaction =
        originalTransaction;
    }


    assert.equal(
      response.status,
      500
    );


    const digestAfterFailure =
      await prisma.dailyDigest
        .findFirst({
          where: {
            dayOfWeek:
              'MONDAY'
          }
        });


    assert.equal(
      digestAfterFailure.filePath,
      originalDigest.filePath
    );


    assert.equal(
      await fileExists(
        originalFilePath
      ),
      true
    );


    await assertNoNewFiles(
      digestUploadDirectory,
      beforeReplacement
    );
  }
);


/*
 * ============================================================
 * 6. RÉSUMÉ DATABASE FAILURE
 * ============================================================
 */

test(
  'résumé is removed when JobApplication creation fails after upload',
  async () => {
    const job =
      await createTestJob(
        'Resume DB Failure'
      );


    const agent =
      request.agent(
        app
      );


    const csrfToken =
      await getCareersCsrfToken(
        agent
      );


    const before =
      await directorySnapshot(
        resumeDirectory
      );


    const originalCreate =
      prisma.jobApplication
        .create;


    /*
     * The Careers route deliberately logs database failures.
     * Suppress this one expected error so the successful test
     * output does not look like an application failure.
     */
    const originalConsoleError =
      console.error;


    let response;


    prisma.jobApplication.create =
      async () => {
        throw new Error(
          'Forced JobApplication database failure for integration test.'
        );
      };


    console.error =
      () => {};


    try {
      response =
        await agent
          .post('/api/careers/apply')
          .field(
            '_csrf',
            csrfToken
          )
          .field(
            'applicantName',
            'Phase 2D Database Failure Applicant'
          )
          .field(
            'email',
            createTestEmail(
              'resume-db-failure'
            )
          )
          .field(
            'jobId',
            String(
              job.id
            )
          )
          .field(
            'privacyAcknowledgement',
            'yes'
          )
          .attach(
            'resume',
            VALID_PDF,
            {
              filename:
                'database-failure-resume.pdf',

              contentType:
                'application/pdf'
            }
          );
    } finally {
      prisma.jobApplication.create =
        originalCreate;

      console.error =
        originalConsoleError;
    }


    assert.equal(
      response.status,
      500
    );


    const applicationCount =
      await prisma.jobApplication
        .count({
          where: {
            jobId:
              job.id
          }
        });


    assert.equal(
      applicationCount,
      0
    );


    await assertNoNewFiles(
      resumeDirectory,
      before
    );
  }
);