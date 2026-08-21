const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  careerApplicationSchema
} = require(
  '../schemas/careers.schema'
);


test(
  'career application schema accepts valid input',
  () => {
    const result =
      careerApplicationSchema
        .safeParse({
          applicantName:
            'Applicant Name',

          email:
            'person@example.com',

          phone:
            '08012345678',

          coverNote:
            'I am interested in this role.',

          jobId:
            '12',

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
  'career application schema normalizes submitted values',
  () => {
    const result =
      careerApplicationSchema
        .parse({
          applicantName:
            '  Applicant Name  ',

          email:
            '  PERSON@EXAMPLE.COM  ',

          phone:
            '  08012345678  ',

          coverNote:
            '  Cover note  ',

          jobId:
            '7'
        });

    assert.equal(
      result.applicantName,
      'Applicant Name'
    );

    assert.equal(
      result.email,
      'person@example.com'
    );

    assert.equal(
      result.phone,
      '08012345678'
    );

    assert.equal(
      result.coverNote,
      'Cover note'
    );

    assert.equal(
      result.jobId,
      7
    );

    assert.equal(
      result.website,
      ''
    );
  }
);


test(
  'career application schema rejects invalid email',
  () => {
    const result =
      careerApplicationSchema
        .safeParse({
          applicantName:
            'Applicant Name',

          email:
            'invalid-email',

          jobId:
            '1'
        });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'career application schema rejects invalid job id',
  () => {
    const result =
      careerApplicationSchema
        .safeParse({
          applicantName:
            'Applicant Name',

          email:
            'person@example.com',

          jobId:
            '0'
        });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'career application schema rejects missing applicant name',
  () => {
    const result =
      careerApplicationSchema
        .safeParse({
          applicantName:
            '',

          email:
            'person@example.com',

          jobId:
            '1'
        });

    assert.equal(
      result.success,
      false
    );
  }
);