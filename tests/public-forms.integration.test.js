const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const request =
  require('supertest');

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
    'Public-form integration tests refused: NODE_ENV must be test.'
  );
}


if (
  !process.env.DATABASE_URL
) {
  throw new Error(
    'Public-form integration tests refused: DATABASE_URL is missing.'
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
    `Public-form integration tests refused: "${databaseName}" is not recognised as a test database.`
  );
}


/*
 * Require the application only after the environment safety
 * checks have passed.
 */
const app =
  require('../server');

const prisma =
  require('../config/db');


const {
  resumeDirectory
} = require(
  '../config/storage'
);


const {
  transporter,
  isMailerConfigured
} = require(
  '../config/mailer'
);


const {
  sendJobApplicationNotification
} = require(
  '../services/email.service'
);

const {
  sendContactToPowerAutomate,
  sendNewsletterToPowerAutomate,
  sendNewsletterUnsubscribeToPowerAutomate
} = require(
  '../services/powerAutomate.service'
);


/*
 * ============================================================
 * TEST FILE DATA
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
    `phase2e-${label}-${Date.now()}-${emailSequence}@example.com`
  );
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


async function getPageCsrfToken(
  agent,
  page
) {
  const response =
    await agent
      .get(page)
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


async function clearPublicFormTestData() {
  /*
   * Applications must be removed before their parent Jobs.
   */
  await prisma.jobApplication
    .deleteMany();

  await prisma.jobPosting
    .deleteMany();

  await prisma.contactSubmission
    .deleteMany();

  await prisma.newsletterSubscriber
    .deleteMany();
}


let originalResumeFiles;


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


    await clearPublicFormTestData();
  }
);


test.beforeEach(
  async () => {
    await clearPublicFormTestData();

    await removeFilesCreatedDuringTests(
      resumeDirectory,
      originalResumeFiles
    );
  }
);


test.after(
  async () => {
    await clearPublicFormTestData();


    await removeFilesCreatedDuringTests(
      resumeDirectory,
      originalResumeFiles
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
 * 1. EMAIL-DISABLED SERVICE
 * ============================================================
 */

test(
  'career email notification service skips safely when SMTP is disabled',
  async () => {
    assert.equal(
      isMailerConfigured(),
      false,
      'SMTP must remain disabled in .env.test.'
    );


    assert.equal(
      transporter,
      null
    );


    const careerResult =
      await sendJobApplicationNotification({
        applicationId:
          999999,

        applicantName:
          'Phase 2E Applicant',

        email:
          'phase2e-career@example.com',

        phone:
          null,

        coverNote:
          null,

        jobId:
          999999,

        jobTitle:
          'Integration Test Role'
      });


    assert.deepEqual(
      careerResult,
      {
        sent:
          false,

        skipped:
          true,

        messageId:
          null
      }
    );
  }
);

test(
  'Power Automate integrations skip safely when webhooks are disabled',
  async () => {
    const contactResult =
      await sendContactToPowerAutomate({
        submissionId:
          999999,

        name:
          'Power Automate Contact Test',

        email:
          'power-automate-contact@example.com',

        phone:
          null,

        subject:
          'Integration Test',

        message:
          'Power Automate disabled integration test.',

        submittedAt:
          new Date(
            '2026-01-01T00:00:00.000Z'
          )
      });


    const newsletterResult =
      await sendNewsletterToPowerAutomate({
        subscriberId:
          999999,

        email:
          'power-automate-newsletter@example.com',

        subscribedAt:
          new Date(
            '2026-01-01T00:00:00.000Z'
          ),

        unsubscribeUrl:
          'https://example.test/newsletter/unsubscribe/999999/test-token'
      });


    assert.deepEqual(
      contactResult,
      {
        sent:
          false,

        skipped:
          true,

        statusCode:
          null
      }
    );


    assert.deepEqual(
      newsletterResult,
      {
        sent:
          false,

        skipped:
          true,

        statusCode:
          null
      }
    );

    await assert.rejects(
      () =>
        sendNewsletterUnsubscribeToPowerAutomate({
          subscriberId:
            999999
        }),

      /not configured/i
    );
  }
);

/*
 * ============================================================
 * 2. CONTACT CSRF
 * ============================================================
 */

test(
  'Contact submission without CSRF is rejected and creates no record',
  async () => {
    const email =
      createTestEmail(
        'contact-no-csrf'
      );


    const response =
      await request(app)
        .post('/api/contact')
        .type('form')
        .send({
          firstName:
            'Phase',

          lastName:
            'Two',

          email,

          message:
            'This must not be saved.'
        });


    assert.equal(
      response.status,
      403
    );


    const count =
      await prisma.contactSubmission
        .count({
          where: {
            email
          }
        });


    assert.equal(
      count,
      0
    );
  }
);


/*
 * ============================================================
 * 3. CONTACT VALIDATION
 * ============================================================
 */

test(
  'invalid Contact submission is rejected without database persistence',
  async () => {
    const agent =
      request.agent(app);


    const csrfToken =
      await getPageCsrfToken(
        agent,
        '/contact'
      );


    const response =
      await agent
        .post('/api/contact')
        .type('form')
        .send({
          _csrf:
            csrfToken,

          firstName:
            'Phase',

          lastName:
            'Two',

          email:
            'not-an-email',

          message:
            'Invalid email test.'
        });


    assert.equal(
      response.status,
      400
    );


    const count =
      await prisma.contactSubmission
        .count();


    assert.equal(
      count,
      0
    );
  }
);


/*
 * ============================================================
 * 4. CONTACT HONEYPOT
 * ============================================================
 */

test(
  'Contact honeypot pretends to succeed without saving spam',
  async () => {
    const agent =
      request.agent(app);


    const csrfToken =
      await getPageCsrfToken(
        agent,
        '/contact'
      );


    const email =
      createTestEmail(
        'contact-honeypot'
      );


    const response =
      await agent
        .post('/api/contact')
        .type('form')
        .send({
          _csrf:
            csrfToken,

          website:
            'https://spam.example',

          firstName:
            'Spam',

          lastName:
            'Bot',

          email,

          message:
            'Automated submission.'
        });


    assert.equal(
      response.status,
      302
    );


    assert.equal(
      response.headers.location,
      '/contact?success=1'
    );


    const count =
      await prisma.contactSubmission
        .count({
          where: {
            email
          }
        });


    assert.equal(
      count,
      0
    );
  }
);


/*
 * ============================================================
 * 5. VALID CONTACT + SMTP DISABLED
 * ============================================================
 */

test(
  'valid Contact submission is saved even when SMTP is disabled',
  async () => {
    const agent =
      request.agent(app);


    const csrfToken =
      await getPageCsrfToken(
        agent,
        '/contact'
      );


    const email =
      createTestEmail(
        'contact-valid'
      );


    /*
     * The expected SMTP-disabled path logs one warning.
     */
    const originalWarn =
      console.warn;


    let response;


    console.warn =
      () => { };


    try {
      response =
        await agent
          .post('/api/contact')
          .type('form')
          .send({
            _csrf:
              csrfToken,

            firstName:
              'Odunayo',

            lastName:
              'Integration',

            email:
              email.toUpperCase(),

            phone:
              '08000000000',

            subject:
              'Phase 2E',

            message:
              'Public Contact integration test.'
          });
    } finally {
      console.warn =
        originalWarn;
    }


    assert.equal(
      response.status,
      302
    );


    assert.equal(
      response.headers.location,
      '/contact?success=1'
    );


    const submission =
      await prisma.contactSubmission
        .findFirst({
          where: {
            email
          }
        });


    assert.ok(
      submission,
      'Expected ContactSubmission record.'
    );


    assert.equal(
      submission.email,
      email
    );


    assert.equal(
      submission.name,
      'Odunayo Integration'
    );


    assert.equal(
      submission.status,
      'NEW'
    );
  }
);


/*
 * ============================================================
 * 6. NEWSLETTER CSRF
 * ============================================================
 */

test(
  'Newsletter submission without CSRF is rejected',
  async () => {
    const email =
      createTestEmail(
        'newsletter-no-csrf'
      );


    const response =
      await request(app)
        .post('/api/newsletter')
        .type('form')
        .send({
          email
        });


    assert.equal(
      response.status,
      403
    );


    const count =
      await prisma.newsletterSubscriber
        .count({
          where: {
            email
          }
        });


    assert.equal(
      count,
      0
    );
  }
);


/*
 * ============================================================
 * 7. NEWSLETTER VALIDATION
 * ============================================================
 */

test(
  'invalid Newsletter email redirects with an error and saves nothing',
  async () => {
    const agent =
      request.agent(app);


    const csrfToken =
      await getPageCsrfToken(
        agent,
        '/contact'
      );


    const response =
      await agent
        .post('/api/newsletter')
        .type('form')
        .send({
          _csrf:
            csrfToken,

          email:
            'invalid-email-address'
        });


    assert.equal(
      response.status,
      303
    );


    assert.equal(
      response.headers.location,
      '/?newsletterError=1'
    );


    const count =
      await prisma.newsletterSubscriber
        .count();


    assert.equal(
      count,
      0
    );
  }
);


/*
 * ============================================================
 * 8. NEWSLETTER HONEYPOT
 * ============================================================
 */

test(
  'Newsletter honeypot pretends to succeed without adding a subscriber',
  async () => {
    const agent =
      request.agent(app);


    const csrfToken =
      await getPageCsrfToken(
        agent,
        '/contact'
      );


    const email =
      createTestEmail(
        'newsletter-honeypot'
      );


    const response =
      await agent
        .post('/api/newsletter')
        .type('form')
        .send({
          _csrf:
            csrfToken,

          website:
            'spam-filled-field',

          email
        });


    assert.equal(
      response.status,
      303
    );


    assert.equal(
      response.headers.location,
      '/?subscribed=1'
    );


    const count =
      await prisma.newsletterSubscriber
        .count({
          where: {
            email
          }
        });


    assert.equal(
      count,
      0
    );
  }
);


/*
 * ============================================================
 * 9. NEWSLETTER DUPLICATES + SAFE REDIRECT
 * ============================================================
 */

test(
  'Newsletter subscription is idempotent and cannot redirect to an external Referer',
  async () => {
    const agent =
      request.agent(app);


    const csrfToken =
      await getPageCsrfToken(
        agent,
        '/contact'
      );


    const email =
      createTestEmail(
        'newsletter-valid'
      );


    /*
     * Supply an external Referer deliberately.
     *
     * The route must fall back to "/" instead of redirecting
     * visitors to the external site.
     */
    const firstResponse =
      await agent
        .post('/api/newsletter')
        .set(
          'Referer',
          'https://attacker.example/phishing'
        )
        .type('form')
        .send({
          _csrf:
            csrfToken,

          email:
            email.toUpperCase()
        });


    assert.equal(
      firstResponse.status,
      303
    );


    assert.equal(
      firstResponse.headers.location,
      '/?subscribed=1'
    );


    /*
     * Submit the same normalised email again.
     *
     * Prisma upsert should not create a duplicate.
     */
    const secondResponse =
      await agent
        .post('/api/newsletter')
        .type('form')
        .send({
          _csrf:
            csrfToken,

          email
        });


    assert.equal(
      secondResponse.status,
      303
    );


    assert.equal(
      secondResponse.headers.location,
      '/?subscribed=1'
    );


    const count =
      await prisma.newsletterSubscriber
        .count({
          where: {
            email
          }
        });


    assert.equal(
      count,
      1
    );
  }
);


/*
 * ============================================================
 * 10. CAREERS HONEYPOT + FILE CLEANUP
 * ============================================================
 */

test(
  'Careers honeypot removes the uploaded résumé and creates no application',
  async () => {
    const agent =
      request.agent(app);


    const csrfToken =
      await getPageCsrfToken(
        agent,
        '/careers'
      );


    const before =
      await directorySnapshot(
        resumeDirectory
      );


    const response =
      await agent
        .post('/api/careers/apply')
        .field(
          '_csrf',
          csrfToken
        )
        .field(
          'website',
          'https://spam.example'
        )
        .field(
          'applicantName',
          'Automated Bot'
        )
        .field(
          'email',
          createTestEmail(
            'career-honeypot'
          )
        )
        .field(
          'jobId',
          '999999'
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
              'spam-resume.pdf',

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


    const applications =
      await prisma.jobApplication
        .count();


    assert.equal(
      applications,
      0
    );


    const after =
      await directorySnapshot(
        resumeDirectory
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
      []
    );
  }
);