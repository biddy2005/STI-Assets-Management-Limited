const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  jobSchema
} = require(
  '../schemas/job.schema'
);


test(
  'job schema accepts a valid job',
  () => {
    const result =
      jobSchema.safeParse({
        title:
          'Investment Analyst',

        department:
          'Investment',

        location:
          'Lagos',

        description:
          'Support the investment team.',

        responsibilities:
          'Research companies.',

        qualifications:
          'BSc required.',

        experience:
          '2 years',

        competencies:
          'Analytical thinking',

        jobCategory:
          'Investment',

        jobType:
          'Full Time',

        deadline:
          '2026-12-31',

        status:
          'open'
      });

    assert.equal(
      result.success,
      true
    );
  }
);


test(
  'job schema trims submitted text',
  () => {
    const result =
      jobSchema.parse({
        title:
          '  Investment Analyst  ',

        department:
          '  Investment  ',

        location:
          '  Lagos  ',

        description:
          '  Job description  '
      });

    assert.equal(
      result.title,
      'Investment Analyst'
    );

    assert.equal(
      result.department,
      'Investment'
    );

    assert.equal(
      result.location,
      'Lagos'
    );

    assert.equal(
      result.description,
      'Job description'
    );

    assert.equal(
      result.responsibilities,
      ''
    );

    assert.equal(
      result.qualifications,
      ''
    );

    assert.equal(
      result.experience,
      ''
    );

    assert.equal(
      result.competencies,
      ''
    );

    assert.equal(
      result.jobCategory,
      ''
    );

    assert.equal(
      result.jobType,
      ''
    );

    assert.equal(
      result.deadline,
      ''
    );

    assert.equal(
      result.status,
      ''
    );
  }
);


test(
  'job schema rejects missing required fields',
  () => {
    const result =
      jobSchema.safeParse({
        title:
          '',
        department:
          '',
        location:
          '',
        description:
          ''
      });

    assert.equal(
      result.success,
      false
    );
  }
);