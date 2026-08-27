const express =
  require('express');

const router =
  express.Router();

const prisma =
  require('../config/db');

const {
  requireRole
} = require(
  '../middleware/auth.middleware'
);

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);

const {
  validateSchema
} = require(
  '../middleware/validation.middleware'
);

const {
  jobSchema
} = require(
  '../schemas/job.schema'
);

const {
  csrfSynchronisedProtection
} = require(
  '../middleware/csrf.middleware'
);

const {
  writeAuditLog
} = require(
  '../services/audit.service'
);


const contentManagerOnly =
  requireRole(
    'SUPERADMIN',
    'EDITOR'
  );


const superAdminOnly =
  requireRole(
    'SUPERADMIN'
  );

router.get(
  '/',

  contentManagerOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const jobs =
      await prisma.jobPosting.findMany({

        orderBy: {
          createdAt:
            'desc'
        }

      });


    return res.render(
      'admin/jobs-manager',
      {
        jobs
      }
    );

  })
);
router.get(
  '/new',

  contentManagerOnly,

  (
    req,
    res
  ) => {

    return res.render(
      'admin/jobs-form',
      {
        job:
          null,

        error:
          null
      }
    );

  }
);
router.post(
  '/',

  contentManagerOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    /*
     * Validate and normalize job form fields.
     *
     * Deadline parsing and status normalization remain
     * separate so existing behaviour is preserved.
     */
    const validation =
      validateSchema(
        jobSchema,
        req.body
      );


    if (!validation.success) {

      return res.status(400).render(
        'admin/jobs-form',
        {
          job:
            null,

          error:
            'Title, department, location and description are required.'
        }
      );

    }


    const {
      title,
      department,
      location,
      description,
      deadline,
      status:
        submittedStatus
    } =
      validation.data;


    const responsibilities =
      validation.data.responsibilities ||
      null;


    const qualifications =
      validation.data.qualifications ||
      null;


    const experience =
      validation.data.experience ||
      null;


    const competencies =
      validation.data.competencies ||
      null;


    const jobCategory =
      validation.data.jobCategory ||
      null;


    const jobType =
      validation.data.jobType ||
      null;


    let parsedDeadline =
      null;


    if (deadline) {

      parsedDeadline =
        new Date(
          deadline
        );


      if (
        Number.isNaN(
          parsedDeadline.getTime()
        )
      ) {

        return res.status(400).render(
          'admin/jobs-form',
          {
            job:
              null,

            error:
              'Please provide a valid application deadline.'
          }
        );

      }

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        const createdJob =
          await transaction
            .jobPosting
            .create({

              data: {

                title,

                department,

                location,

                description,

                responsibilities,

                qualifications,

                experience,

                competencies,

                jobCategory,

                jobType,

                deadline:
                  parsedDeadline,

                status:
                  submittedStatus ===
                  'open'
                    ? 'open'
                    : 'closed'

              }

            });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'JOB_CREATED',

          entityType:
            'JobPosting',

          entityId:
            createdJob.id,

          metadata: {

            title:
              createdJob.title,

            department:
              createdJob.department,

            location:
              createdJob.location,

            jobCategory:
              createdJob.jobCategory,

            jobType:
              createdJob.jobType,

            status:
              createdJob.status,

            deadline:
              createdJob.deadline

          }

        });

      }
    );


    return res.redirect(
      '/admin/jobs'
    );

  })
);
router.get(
  '/:id/edit',

  contentManagerOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const jobId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        jobId
      ) ||
      jobId < 1
    ) {

      return res.redirect(
        '/admin/jobs'
      );

    }


    const job =
      await prisma.jobPosting.findUnique({

        where: {
          id:
            jobId
        }

      });


    if (!job) {

      return res.redirect(
        '/admin/jobs'
      );

    }


    return res.render(
      'admin/jobs-form',
      {
        job,

        error:
          null
      }
    );

  })
);
router.post(
  '/:id',

  contentManagerOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const jobId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        jobId
      ) ||
      jobId < 1
    ) {

      return res.status(400).send(
        'Invalid job ID.'
      );

    }


    const existingJob =
      await prisma.jobPosting.findUnique({

        where: {
          id:
            jobId
        }

      });


    if (!existingJob) {

      return res.status(404).send(
        'Job posting not found.'
      );

    }


    /*
     * Validate and normalize updated job fields.
     */
    const validation =
      validateSchema(
        jobSchema,
        req.body
      );


    if (!validation.success) {

      return res.status(400).render(
        'admin/jobs-form',
        {
          job:
            existingJob,

          error:
            'Title, department, location and description are required.'
        }
      );

    }


    const {
      title,
      department,
      location,
      description,
      deadline,
      status:
        submittedStatus
    } =
      validation.data;


    const responsibilities =
      validation.data.responsibilities ||
      null;


    const qualifications =
      validation.data.qualifications ||
      null;


    const experience =
      validation.data.experience ||
      null;


    const competencies =
      validation.data.competencies ||
      null;


    const jobCategory =
      validation.data.jobCategory ||
      null;


    const jobType =
      validation.data.jobType ||
      null;


    let parsedDeadline =
      null;


    if (deadline) {

      parsedDeadline =
        new Date(
          deadline
        );


      if (
        Number.isNaN(
          parsedDeadline.getTime()
        )
      ) {

        return res.status(400).render(
          'admin/jobs-form',
          {
            job:
              existingJob,

            error:
              'Please provide a valid application deadline.'
          }
        );

      }

    }


    const newStatus =
      submittedStatus ===
      'open'
        ? 'open'
        : 'closed';


    await prisma.$transaction(
      async (
        transaction
      ) => {

        const updatedJob =
          await transaction
            .jobPosting
            .update({

              where: {
                id:
                  jobId
              },

              data: {

                title,

                department,

                location,

                description,

                responsibilities,

                qualifications,

                experience,

                competencies,

                jobCategory,

                jobType,

                deadline:
                  parsedDeadline,

                status:
                  newStatus

              }

            });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'JOB_UPDATED',

          entityType:
            'JobPosting',

          entityId:
            jobId,

          metadata: {

            previous: {

              title:
                existingJob.title,

              department:
                existingJob.department,

              location:
                existingJob.location,

              jobCategory:
                existingJob.jobCategory,

              jobType:
                existingJob.jobType,

              status:
                existingJob.status,

              deadline:
                existingJob.deadline

            },

            updated: {

              title:
                updatedJob.title,

              department:
                updatedJob.department,

              location:
                updatedJob.location,

              jobCategory:
                updatedJob.jobCategory,

              jobType:
                updatedJob.jobType,

              status:
                updatedJob.status,

              deadline:
                updatedJob.deadline

            }

          }

        });

      }
    );


    return res.redirect(
      '/admin/jobs'
    );

  })
);
router.post(
  '/:id/delete',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const jobId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        jobId
      ) ||
      jobId < 1
    ) {

      return res.status(400).send(
        'Invalid job ID.'
      );

    }


    const job =
      await prisma.jobPosting.findUnique({

        where: {
          id:
            jobId
        },

        include: {

          _count: {

            select: {
              applications:
                true
            }

          }

        }

      });


    if (!job) {

      return res.status(404).send(
        'Job posting not found.'
      );

    }


    /*
     * Do not delete a job that already has applications.
     *
     * Closing the job preserves the application history.
     */
    if (
      job._count.applications >
      0
    ) {

      return res.status(409).send(
        'This job has applications and cannot be deleted. Change its status to closed instead.'
      );

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .jobPosting
          .delete({

            where: {
              id:
                jobId
            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'JOB_DELETED',

          entityType:
            'JobPosting',

          entityId:
            jobId,

          metadata: {

            title:
              job.title,

            department:
              job.department,

            location:
              job.location,

            status:
              job.status

          }

        });

      }
    );


    return res.redirect(
      '/admin/jobs'
    );

  })
);

module.exports =
  router;