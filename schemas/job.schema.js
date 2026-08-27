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
        z.string()
          .min(
            1,
            'Title is required.'
          )
          .max(
            150,
            'Title must not exceed 150 characters.'
          )
      ),

  department:
    cleanString()
      .pipe(
        z.string()
          .min(
            1,
            'Department is required.'
          )
          .max(
            100,
            'Department must not exceed 100 characters.'
          )
      ),

  location:
    cleanString()
      .pipe(
        z.string()
        .min(
          1,
          'Location is required.'
        )
        .max(
          150,
          'Location must not exceed 150 characters.'
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
    cleanString()
      .pipe(
        z.string().max(
          50,
          'Job category must not exceed 50 characters.'
        )
      ),

  jobType:
    cleanString()
      .pipe(
        z.string().max(
          50,
          'Job type must not exceed 50 characters.'
        )
      ),

  deadline:
    cleanString()
      .pipe(
        z.string().refine(
          (value) => {
            if (!value) {
              return true;
            }

            return /^\d{4}-\d{2}-\d{2}$/.test(
              value
            );
          },
          {
            message:
              'Deadline must use YYYY-MM-DD format.'
          }
        )
      ),

  status:
    cleanString()
      .pipe(
        z.enum(
          [
            'open',
            'closed'
          ],
          {
            message:
              'Status must be open or closed.'
          }
        )
      )
});

module.exports = {
  jobSchema
};