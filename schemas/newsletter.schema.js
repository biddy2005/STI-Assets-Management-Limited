const { z } = require('zod');

function cleanString(maxLength) {
  return z.preprocess(
    (value) => (
      typeof value === 'string'
        ? value.trim().slice(0, maxLength)
        : ''
    ),
    z.string()
  );
}

const newsletterSchema = z.object({
  email:
    cleanString(254)
      .pipe(
        z
          .string()
          .toLowerCase()
          .email(
            'Please provide a valid email address.'
          )
      ),

  website:
    cleanString(200)
});

module.exports = {
  newsletterSchema
};