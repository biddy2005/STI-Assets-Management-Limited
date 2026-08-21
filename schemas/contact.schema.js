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

const contactSchema = z.object({
  firstName:
    cleanString(100)
      .pipe(
        z.string().min(
          1,
          'First name is required.'
        )
      ),

  lastName:
    cleanString(100)
      .pipe(
        z.string().min(
          1,
          'Last name is required.'
        )
      ),

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

  phone:
    cleanString(30),

  subject:
    cleanString(200),

  message:
    cleanString(5000)
      .pipe(
        z.string().min(
          1,
          'Message is required.'
        )
      ),

  website:
    cleanString(200)
});

module.exports = {
  contactSchema
};