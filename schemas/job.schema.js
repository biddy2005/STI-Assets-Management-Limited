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

const jobSchema = z.object({
  title:
    cleanString()
      .pipe(
        z.string().min(
          1,
          'Title is required.'
        )
      ),

  department:
    cleanString()
      .pipe(
        z.string().min(
          1,
          'Department is required.'
        )
      ),

  location:
    cleanString()
      .pipe(
        z.string().min(
          1,
          'Location is required.'
        )
      ),

  description:
    cleanString()
      .pipe(
        z.string().min(
          1,
          'Description is required.'
        )
      ),

  responsibilities:
    cleanString(),

  qualifications:
    cleanString(),

  experience:
    cleanString(),

  competencies:
    cleanString(),

  jobCategory:
    cleanString(),

  jobType:
    cleanString(),

  deadline:
    cleanString(),

  status:
    cleanString()
});

module.exports = {
  jobSchema
};