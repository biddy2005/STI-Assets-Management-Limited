const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  contactSchema
} = require(
  '../schemas/contact.schema'
);


test(
  'contact schema accepts a valid submission',
  () => {
    const result =
      contactSchema.safeParse({
        firstName:
          'Odunayo',

        lastName:
          'Ajisebutu',

        email:
          'person@example.com',

        phone:
          '08012345678',

        subject:
          'Investment enquiry',

        message:
          'I would like more information.',

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
  'contact schema trims and normalizes submitted values',
  () => {
    const result =
      contactSchema.parse({
        firstName:
          '  Odunayo  ',

        lastName:
          '  Ajisebutu  ',

        email:
          '  PERSON@EXAMPLE.COM  ',

        message:
          '  Hello  '
      });

    assert.equal(
      result.firstName,
      'Odunayo'
    );

    assert.equal(
      result.lastName,
      'Ajisebutu'
    );

    assert.equal(
      result.email,
      'person@example.com'
    );

    assert.equal(
      result.message,
      'Hello'
    );

    assert.equal(
      result.phone,
      ''
    );

    assert.equal(
      result.subject,
      ''
    );

    assert.equal(
      result.website,
      ''
    );
  }
);


test(
  'contact schema rejects an invalid email address',
  () => {
    const result =
      contactSchema.safeParse({
        firstName:
          'Odunayo',

        lastName:
          'Ajisebutu',

        email:
          'not-an-email',

        message:
          'Hello'
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'contact schema rejects missing required fields',
  () => {
    const result =
      contactSchema.safeParse({
        email:
          'person@example.com'
      });

    assert.equal(
      result.success,
      false
    );
  }
);