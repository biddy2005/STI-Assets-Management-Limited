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
    'Upload integration tests refused: NODE_ENV must be test.'
  );
}


if (
  !process.env.DATABASE_URL
) {
  throw new Error(
    'Upload integration tests refused: DATABASE_URL is missing.'
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
    `Upload integration tests refused: "${databaseName}" is not recognised as a test database.`
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
  'Phase2D-Upload-Test-Password-2026!';


let emailSequence =
  0;


/*
 * ============================================================
 * TEST FILE DATA
 * ============================================================
 */

/*
 * A small PDF-shaped document.
 *
 * The application currently validates the normal %PDF-
 * signature, which is the control being tested here.
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


/*
 * Valid 1x1 PNG image.
 */
const VALID_PNG =
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );


const FAKE_PDF =
  Buffer.from(
    'This is plain text pretending to be a PDF.'
  );


const FAKE_JPEG =
  Buffer.from(
    'This is not actually a JPEG image.'
  );


/*
 * Multer's résumé limit is 5 MB.
 *
 * One additional byte guarantees LIMIT_FILE_SIZE.
 */
const OVERSIZED_PDF =
  Buffer.concat(
    [
      Buffer.from(
        '%PDF-1.4\n'
      ),

      Buffer.alloc(
        5 * 1024 * 1024,
        0x20
      ),

      Buffer.from(
        '\n%%EOF'
      )
    ]
  );


/*
 * Admin image uploads have a 5 MB limit.
 */
const OVERSIZED_PNG =
  Buffer.concat(
    [
      VALID_PNG,

      Buffer.alloc(
        5 * 1024 * 1024,
        0x00
      )
    ]
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
    `phase2d-${label}-${Date.now()}-${emailSequence}@example.com`
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
        `Phase 2D ${label} ${Date.now()}`,

      department:
        'Information Technology',

      location:
        'Lagos',

      description:
        'Temporary job used only for upload integration testing.',

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
    'Expected the page to contain a CSRF token.'
  );


  return match[1];
}


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
      .get(
        '/admin/dashboard'
      )
      .expect(
        200
      );


  return extractCsrfToken(
    response.text
  );
}


async function getCareersCsrfToken(
  agent
) {
  const response =
    await agent
      .get(
        '/careers'
      )
      .expect(
        200
      );


  return extractCsrfToken(
    response.text
  );
}


/*
 * Return filenames currently present in a directory.
 */
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


/*
 * Compare the current directory with an earlier snapshot.
 */
async function assertNoNewFiles(
  directory,
  before
) {
  const after =
    await directorySnapshot(
      directory
    );


  const newFiles =
    [
      ...after
    ].filter(
      (filename) =>
        !before.has(
          filename
        )
    );


  assert.deepEqual(
    newFiles,
    [],
    `Unexpected uploaded files remained in ${directory}`
  );
}


/*
 * Remove only files created after the Phase 2D test suite
 * started.
 *
 * Existing development uploads are deliberately preserved.
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
 *
 * The project may contain legitimate development uploads.
 *
 * Never delete files that existed before the tests began.
 */

let originalResumeFiles;
let originalDigestFiles;
let originalNewsFiles;


/*
 * ============================================================
 * DATABASE CLEANUP
 * ============================================================
 */

async function clearPhase2DDatabaseData() {
  await prisma.auditLog
    .deleteMany();

  await prisma.newsImage
    .deleteMany();

  await prisma.newsArticle
    .deleteMany();

  await prisma.jobApplication
    .deleteMany();

  await prisma.jobPosting
    .deleteMany();

await prisma.productRate
  .deleteMany();

  await prisma.dailyDigest
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

    await clearPhase2DDatabaseData();
  }
);


test.after(
  async () => {
    /*
     * Remove database records created in the isolated test DB.
     */
    await clearPhase2DDatabaseData();


    /*
     * Remove only physical files created by these tests.
     */
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
 * 1. FAKE RÉSUMÉ PDF
 * ============================================================
 */

test(
  'career application rejects a fake PDF and removes the uploaded file',
  async () => {
    const job =
      await createTestJob(
        'Fake PDF'
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


    const response =
      await agent
        .post(
          '/api/careers/apply'
        )
        .field(
          '_csrf',
          csrfToken
        )
        .field(
          'applicantName',
          'Phase 2D Applicant'
        )
        .field(
          'email',
          createTestEmail(
            'fake-pdf'
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
          FAKE_PDF,
          {
            filename:
              'resume.pdf',

            contentType:
              'application/pdf'
          }
        );


    assert.equal(
      response.status,
      400
    );


    assert.match(
      response.text,
      /not a valid PDF document/i
    );


    await assertNoNewFiles(
      resumeDirectory,
      before
    );


    const applications =
      await prisma.jobApplication
        .count({
          where: {
            jobId:
              job.id
          }
        });


    assert.equal(
      applications,
      0
    );
  }
);


/*
 * ============================================================
 * 2. OVERSIZED RÉSUMÉ
 * ============================================================
 */

test(
  'career application rejects a résumé larger than 5 MB and leaves no file behind',
  async () => {
    const job =
      await createTestJob(
        'Oversized PDF'
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


    const response =
      await agent
        .post(
          '/api/careers/apply'
        )
        .field(
          '_csrf',
          csrfToken
        )
        .field(
          'applicantName',
          'Oversized Test Applicant'
        )
        .field(
          'email',
          createTestEmail(
            'oversized-pdf'
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
          OVERSIZED_PDF,
          {
            filename:
              'oversized.pdf',

            contentType:
              'application/pdf'
          }
        );


    assert.equal(
      response.status,
      400
    );


    assert.match(
      response.text,
      /5 MB or smaller/i
    );


    await assertNoNewFiles(
      resumeDirectory,
      before
    );
  }
);


/*
 * ============================================================
 * 3. VALID RÉSUMÉ
 * ============================================================
 */

test(
  'valid PDF résumé is stored privately and application metadata is created',
  async () => {
    const job =
      await createTestJob(
        'Valid PDF'
      );


    const agent =
      request.agent(
        app
      );


    const csrfToken =
      await getCareersCsrfToken(
        agent
      );


    const response =
      await agent
        .post(
          '/api/careers/apply'
        )
        .field(
          '_csrf',
          csrfToken
        )
        .field(
          'applicantName',
          'Valid Resume Applicant'
        )
        .field(
          'email',
          createTestEmail(
            'valid-pdf'
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
              'Valid Resume.pdf',

            contentType:
              'application/pdf'
          }
        );


    assert.equal(
      response.status,
      302
    );


    assert.equal(
      response.headers.location,
      '/careers?applied=1'
    );


    const application =
      await prisma.jobApplication
        .findFirst({
          where: {
            jobId:
              job.id
          },

          orderBy: {
            id:
              'desc'
          }
        });


    assert.ok(
      application,
      'Expected a JobApplication record.'
    );


    assert.equal(
      application.resumeMimeType,
      'application/pdf'
    );


    assert.equal(
      application.resumeOriginalName,
      'Valid Resume.pdf'
    );


    assert.equal(
      application.privacyAcknowledged,
      true
    );


    /*
     * The generated storage key must not reuse the supplied
     * original filename.
     */
    assert.notEqual(
      application.resumeStorageKey,
      'Valid Resume.pdf'
    );


    const storedPath =
      path.join(
        resumeDirectory,
        path.basename(
          application.resumeStorageKey
        )
      );


    const storedBytes =
      await fs.readFile(
        storedPath
      );


    assert.equal(
      storedBytes
        .subarray(
          0,
          5
        )
        .toString(
          'ascii'
        ),
      '%PDF-'
    );
  }
);


/*
 * ============================================================
 * 4. PRIVATE RÉSUMÉ NOT PUBLICLY EXPOSED
 * ============================================================
 */

test(
  'private résumé cannot be downloaded through a public storage URL',
  async () => {
    const application =
      await prisma.jobApplication
        .findFirst({
          orderBy: {
            id:
              'desc'
          }
        });


    assert.ok(
      application,
      'A valid résumé application is required from the previous test.'
    );


    const response =
      await request(
        app
      ).get(
        `/storage/private/resumes/${encodeURIComponent(
          application.resumeStorageKey
        )}`
      );


    assert.equal(
      response.status,
      404
    );
  }
);


/*
 * ============================================================
 * 5. RÉSUMÉ DOWNLOAD ROLE PROTECTION
 * ============================================================
 */

test(
  'EDITOR cannot access the private résumé download route',
  async () => {
    const application =
      await prisma.jobApplication
        .findFirst({
          orderBy: {
            id:
              'desc'
          }
        });


    assert.ok(
      application
    );


    const editor =
      await createTestAdmin({
        role:
          'EDITOR',

        label:
          'resume-editor'
      });


    const agent =
      request.agent(
        app
      );


    await login(
      agent,
      editor
    );


    const response =
      await agent
        .get(
          `/admin/applications/${application.id}/resume`
        );


    assert.equal(
      response.status,
      403
    );
  }
);


/*
 * ============================================================
 * 6. SUPERADMIN PRIVATE RÉSUMÉ ACCESS
 * ============================================================
 */

test(
  'SUPERADMIN can download a private résumé with no-store headers',
  async () => {
    const application =
      await prisma.jobApplication
        .findFirst({
          orderBy: {
            id:
              'desc'
          }
        });


    assert.ok(
      application
    );


    const superAdmin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'resume-superadmin'
      });


    const agent =
      request.agent(
        app
      );


    await login(
      agent,
      superAdmin
    );


    const response =
      await agent
        .get(
          `/admin/applications/${application.id}/resume`
        );


    assert.equal(
      response.status,
      200
    );


    assert.match(
      response.headers[
        'content-disposition'
      ] || '',
      /attachment/i
    );


    assert.match(
      response.headers[
        'cache-control'
      ] || '',
      /no-store/i
    );


    assert.equal(
      response.headers[
        'x-content-type-options'
      ],
      'nosniff'
    );
  }
);


/*
 * ============================================================
 * 7. FAKE ADMIN IMAGE
 * ============================================================
 */

test(
  'fake JPEG upload is rejected by image-signature validation and cleaned up',
  async () => {
    const admin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'fake-image'
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


    const response =
      await agent
        .post(
          '/admin/news'
        )
        .field(
          '_csrf',
          csrfToken
        )
        .field(
          'title',
          `Fake Image Test ${Date.now()}`
        )
        .field(
          'body',
          'The cover image for this article is deliberately invalid.'
        )
        .attach(
          'coverImage',
          FAKE_JPEG,
          {
            filename:
              'fake.jpg',

            contentType:
              'image/jpeg'
          }
        );


    assert.equal(
      response.status,
      400
    );


    assert.match(
      response.text,
      /not a valid JPEG, PNG or WebP image/i
    );


    await assertNoNewFiles(
      newsUploadDirectory,
      before
    );
  }
);


/*
 * ============================================================
 * 8. CSRF CLEANUP AFTER MULTER
 * ============================================================
 */

test(
  'multipart News upload without CSRF is rejected without persisting a file or article',
  async () => {
    const admin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'upload-csrf'
      });


    const agent =
      request.agent(
        app
      );


    await login(
      agent,
      admin
    );


    const before =
      await directorySnapshot(
        newsUploadDirectory
      );


    const title =
      `Missing CSRF Upload ${Date.now()}`;


    const response =
      await agent
        .post(
          '/admin/news'
        )
        .field(
          'title',
          title
        )
        .field(
          'body',
          'This article must not be created because the CSRF token is missing.'
        )
        .attach(
          'coverImage',
          VALID_PNG,
          {
            filename:
              'csrf-test.png',

            contentType:
              'image/png'
          }
        );


    assert.equal(
      response.status,
      403
    );


    await assertNoNewFiles(
      newsUploadDirectory,
      before
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
  }
);

/*
 * ============================================================
 * 9. OVERSIZED ADMIN IMAGE
 * ============================================================
 */

test(
  'admin News image larger than 5 MB is rejected and not persisted',
  async () => {
    const admin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'oversized-image'
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
      `Oversized News Image ${Date.now()}`;


    const response =
      await agent
        .post(
          '/admin/news'
        )
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
          'This article must not be created because its cover image is too large.'
        )
        .attach(
          'coverImage',
          OVERSIZED_PNG,
          {
            filename:
              'oversized.png',

            contentType:
              'image/png'
          }
        );


    assert.equal(
      response.status,
      400
    );


    assert.match(
      response.text,
      /exceeds the allowed size/i
    );


    await assertNoNewFiles(
      newsUploadDirectory,
      before
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
  }
);


/*
 * ============================================================
 * 10. FAKE DIGEST PDF
 * ============================================================
 */

test(
  'digest upload rejects a fake PDF and removes it',
  async () => {
    const admin =
      await createTestAdmin({
        role:
          'SUPERADMIN',

        label:
          'fake-digest'
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
        digestUploadDirectory
      );


    const response =
      await agent
        .post(
          '/admin/downloads'
        )
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
          FAKE_PDF,
          {
            filename:
              'digest.pdf',

            contentType:
              'application/pdf'
          }
        );


    assert.equal(
      response.status,
      400
    );


    assert.match(
      response.text,
      /not a valid PDF document/i
    );


    await assertNoNewFiles(
      digestUploadDirectory,
      before
    );
  }
);