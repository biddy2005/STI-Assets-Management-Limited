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

const careerApplicationSchema = z.object({
  applicantName:
    cleanString(100)
      .pipe(
        z.string().min(
          1,
          'Applicant name is required.'
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

  coverNote:
    cleanString(5000),

  jobId:
    z.preprocess(
      (value) => {
        if (
          typeof value === 'string' &&
          value.trim() !== ''
        ) {
          return Number(
            value
          );
        }

        return value;
      },

      z
        .number()
        .int()
        .positive(
          'Please select a valid job.'
        )
    ),

  website:
    cleanString(200)
});

module.exports = {
  careerApplicationSchema
};