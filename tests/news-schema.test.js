const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  newsSchema
} = require(
  '../schemas/news.schema'
);


test(
  'news schema accepts a valid article',
  () => {
    const result =
      newsSchema.safeParse({
        title:
          'Market Update',

        body:
          'The market recorded positive performance today.'
      });

    assert.equal(
      result.success,
      true
    );
  }
);


test(
  'news schema trims article fields',
  () => {
    const result =
      newsSchema.parse({
        title:
          '  Market Update  ',

        body:
          '  Article body content.  '
      });

    assert.equal(
      result.title,
      'Market Update'
    );

    assert.equal(
      result.body,
      'Article body content.'
    );
  }
);


test(
  'news schema rejects a missing title',
  () => {
    const result =
      newsSchema.safeParse({
        title:
          '',

        body:
          'Article content'
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'news schema rejects a missing body',
  () => {
    const result =
      newsSchema.safeParse({
        title:
          'Market Update',

        body:
          ''
      });

    assert.equal(
      result.success,
      false
    );
  }
);