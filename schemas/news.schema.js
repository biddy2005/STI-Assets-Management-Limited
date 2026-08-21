const { z } = require('zod');

function cleanString() {
  return z.preprocess(
    (value) => (
      typeof value === 'string'
        ? value.trim()
        : ''
    ),
    z.string()
  );
}

const newsSchema = z.object({
  title:
    cleanString()
      .pipe(
        z.string().min(
          1,
          'Article title is required.'
        )
      ),

  body:
    cleanString()
      .pipe(
        z.string().min(
          1,
          'Article body is required.'
        )
      )
});

module.exports = {
  newsSchema
};