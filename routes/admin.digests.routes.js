const express =
  require('express');

const router =
  express.Router();

const multer =
  require('multer');

const crypto =
  require('crypto');

const path =
  require('path');

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
  csrfSynchronisedProtection,
  csrfAfterUpload
} = require(
  '../middleware/csrf.middleware'
);

const {
  savePublicFile,
  deletePublicFile
} = require(
  '../services/storage.service'
);

const {
  writeAuditLog
} = require(
  '../services/audit.service'
);

const {
  DAY_ORDER,
  DAY_LABELS,
  getActiveWeekRange,
  getDateForDay
} = require(
  '../utils/digestWeek'
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


function hasValidPdfSignature(
  fileBuffer
) {

  if (
    !Buffer.isBuffer(
      fileBuffer
    ) ||
    fileBuffer.length < 5
  ) {

    return false;

  }


  return (
    fileBuffer
      .subarray(
        0,
        5
      )
      .toString(
        'ascii'
      ) ===
      '%PDF-'
  );

}


function storedPublicUrlToStorageKey(
  storedUrl
) {

  if (
    typeof storedUrl !==
      'string' ||
    !storedUrl.trim()
  ) {

    return null;

  }


  let pathname =
    storedUrl.trim();


  try {

    pathname =
      new URL(
        pathname
      ).pathname;

  } catch {

    pathname =
      pathname
        .split('?')[0]
        .split('#')[0];

  }


  const storageKey =
    path.posix.basename(
      pathname
    );


  return storageKey || null;

}


async function deletePublicFileSafely({
  req,
  category,
  storageKey,
  context
}) {

  if (!storageKey) {
    return;
  }


  try {

    await deletePublicFile({
      category,
      storageKey
    });

  } catch (cleanupError) {

    req.log.error(
      {
        err:
          cleanupError,

        event:
          'DIGEST_STORAGE_CLEANUP_FAILED',

        component:
          'storage',

        category,

        storageKey,

        requestId:
          req.requestId
      },

      context
    );

  }

}


/*
 * Daily Digest uploads stay in memory until validation succeeds.
 */
const uploadDigest =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {

      /*
       * Maximum digest size: 10 MB.
       */
      fileSize:
        10 * 1024 * 1024,

      /*
       * Only one digest file is accepted.
       */
      files:
        1
    },

    fileFilter: (
      req,
      file,
      callback
    ) => {

      const extension =
        path
          .extname(
            file.originalname
          )
          .toLowerCase();


      const hasPdfExtension =
        extension ===
        '.pdf';


      const hasPdfMimeType =
        file.mimetype ===
        'application/pdf';


      if (
        !hasPdfExtension ||
        !hasPdfMimeType
      ) {

        return callback(
          new Error(
            'Please upload a PDF file with a .pdf extension.'
          )
        );

      }


      return callback(
        null,
        true
      );

    }

  });

router.get(
  '/',

  contentManagerOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const {
      weekStart,
      weekEnd
    } =
      getActiveWeekRange();


    const digests =
      await prisma.dailyDigest.findMany({

        where: {

          publishDate: {
            gte:
              weekStart,

            lte:
              weekEnd
          }

        },

        orderBy: {
          publishDate:
            'asc'
        }

      });


    const byDay = {};


    digests.forEach(
      (digest) => {

        byDay[
          digest.dayOfWeek
        ] =
          digest;

      }
    );


    const days =
      DAY_ORDER.map(
        (day) => ({

          key:
            day,

          label:
            DAY_LABELS[
              day
            ],

          digest:
            byDay[
              day
            ] || null

        })
      );


    return res.render(
      'admin/downloads-manager',
      {
        days,
        error:
          null
      }
    );

  })
);

router.post(
  '/',

  contentManagerOnly,

  /*
   * Multer parses the multipart form and keeps the PDF in
   * req.file.buffer. No file is written to disk here.
   */
  uploadDigest.single(
    'digestFile'
  ),

  /*
   * The CSRF token is part of the multipart body, so Multer
   * must parse the form before CSRF verification.
   */
  csrfAfterUpload,

  asyncHandler(async (
    req,
    res
  ) => {

    const dayOfWeek =
      typeof req.body.dayOfWeek ===
        'string'
        ? req.body.dayOfWeek.trim()
        : '';


    if (
      !DAY_ORDER.includes(
        dayOfWeek
      )
    ) {

      return res.status(400).send(
        'Please select a valid weekday.'
      );

    }


    if (!req.file) {

      return res.status(400).send(
        'Please upload a PDF file.'
      );

    }


    /*
     * The extension and MIME type have already been checked by
     * Multer. Now inspect the actual opening bytes held in
     * memory before anything is persisted.
     */
    const isActualPdf =
      hasValidPdfSignature(
        req.file.buffer
      );


    if (!isActualPdf) {

      return res.status(400).send(
        'The uploaded file is not a valid PDF document.'
      );

    }


    const {
      weekStart
    } =
      getActiveWeekRange();


    const publishDate =
      getDateForDay(
        weekStart,
        dayOfWeek
      );


    const storageKey =
      `${crypto.randomUUID()}.pdf`;


    const savedFile =
      await savePublicFile({

        category:
          'digests',

        storageKey,

        body:
          req.file.buffer,

        contentType:
          'application/pdf'

      });


    const newFileUrl =
      savedFile.publicUrl;


    let previousFileUrl =
      null;


    try {

      const existing =
        await prisma.dailyDigest.findFirst({

          where: {
            dayOfWeek,
            publishDate
          }

        });


      if (existing) {

        previousFileUrl =
          existing.filePath;


        await prisma.$transaction(
          async (
            transaction
          ) => {

            const updatedDigest =
              await transaction
                .dailyDigest
                .update({

                  where: {
                    id:
                      existing.id
                  },

                  data: {
                    filePath:
                      newFileUrl
                  }

                });


            await writeAuditLog({

              client:
                transaction,

              req,

              action:
                'DIGEST_REPLACED',

              entityType:
                'DailyDigest',

              entityId:
                updatedDigest.id,

              metadata: {

                dayOfWeek:
                  updatedDigest.dayOfWeek,

                publishDate:
                  updatedDigest.publishDate,

                previousFilePath:
                  existing.filePath,

                newFilePath:
                  updatedDigest.filePath

              }

            });

          }
        );

      } else {

        await prisma.$transaction(
          async (
            transaction
          ) => {

            const createdDigest =
              await transaction
                .dailyDigest
                .create({

                  data: {

                    title:
                      'STIAM Daily Market Digest',

                    filePath:
                      newFileUrl,

                    publishDate,

                    dayOfWeek

                  }

                });


            await writeAuditLog({

              client:
                transaction,

              req,

              action:
                'DIGEST_CREATED',

              entityType:
                'DailyDigest',

              entityId:
                createdDigest.id,

              metadata: {

                dayOfWeek:
                  createdDigest.dayOfWeek,

                publishDate:
                  createdDigest.publishDate,

                filePath:
                  createdDigest.filePath

              }

            });

          }
        );

      }

    } catch (error) {

      await deletePublicFileSafely({

        req,

        category:
          'digests',

        storageKey:
          savedFile.storageKey,

        context:
          'Could not remove digest after database failure'

      });


      throw error;

    }


    if (
      previousFileUrl &&
      previousFileUrl !==
        newFileUrl
    ) {

      const previousStorageKey =
        storedPublicUrlToStorageKey(
          previousFileUrl
        );


      await deletePublicFileSafely({

        req,

        category:
          'digests',

        storageKey:
          previousStorageKey,

        context:
          'Digest was replaced, but the previous PDF could not be removed'

      });

    }


    return res.redirect(
      '/admin/downloads'
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

    const digestId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        digestId
      ) ||
      digestId < 1
    ) {

      return res.status(400).send(
        'Invalid digest ID.'
      );

    }


    /*
     * Retrieve the record before deleting it because
     * its filePath is needed for storage cleanup.
     */
    const digest =
      await prisma.dailyDigest.findUnique({

        where: {
          id:
            digestId
        }

      });


    if (!digest) {

      return res.status(404).send(
        'Daily digest not found.'
      );

    }


    /*
     * Delete the database record and write the audit
     * event in the same PostgreSQL transaction.
     */
    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .dailyDigest
          .delete({

            where: {
              id:
                digestId
            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'DIGEST_DELETED',

          entityType:
            'DailyDigest',

          entityId:
            digestId,

          metadata: {

            dayOfWeek:
              digest.dayOfWeek,

            publishDate:
              digest.publishDate,

            filePath:
              digest.filePath

          }

        });

      }
    );


    /*
     * The database deletion succeeded.
     *
     * Now remove the stored PDF. A storage cleanup
     * failure is logged without turning the successful
     * database deletion into a server error.
     */
    const storageKey =
      storedPublicUrlToStorageKey(
        digest.filePath
      );


    await deletePublicFileSafely({

      req,

      category:
        'digests',

      storageKey,

      context:
        'Digest record was deleted, but its PDF could not be removed'

    });


    return res.redirect(
      '/admin/downloads'
    );

  })
);

module.exports =
  router;