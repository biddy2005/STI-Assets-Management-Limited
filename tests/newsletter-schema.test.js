const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  newsletterSchema
} = require(
  '../schemas/newsletter.schema'
);


test(
  'newsletter schema accepts a valid email',
  () => {
    const result =
      newsletterSchema.safeParse({
        email:
          'person@example.com',

        website:
          ''
      });

    assert.equal(
      result.success,
      true
    );
  }
);


test(
  'newsletter schema trims and normalizes email',
  () => {
    const result =
      newsletterSchema.parse({
        email:
          '  PERSON@EXAMPLE.COM  '
      });

    assert.equal(
      result.email,
      'person@example.com'
    );

    assert.equal(
      result.website,
      ''
    );
  }
);


test(
  'newsletter schema rejects an invalid email',
  () => {
    const result =
      newsletterSchema.safeParse({
        email:
          'invalid-email'
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'newsletter schema rejects a missing email',
  () => {
    const result =
      newsletterSchema.safeParse({});

    assert.equal(
      result.success,
      false
    );
  }
);