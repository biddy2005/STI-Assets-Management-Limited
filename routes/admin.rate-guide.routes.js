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


const contentManagerOnly =
  requireRole(
    'SUPERADMIN',
    'EDITOR'
  );


const allowedImageMimeTypes =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);


const allowedImageExtensionsByMimeType =
  new Map([
    [
      'image/jpeg',
      new Set([
        '.jpg',
        '.jpeg'
      ])
    ],

    [
      'image/png',
      new Set([
        '.png'
      ])
    ],

    [
      'image/webp',
      new Set([
        '.webp'
      ])
    ]
  ]);


const storedImageExtensionByMimeType =
  new Map([
    [
      'image/jpeg',
      '.jpg'
    ],

    [
      'image/png',
      '.png'
    ],

    [
      'image/webp',
      '.webp'
    ]
  ]);


function hasAllowedImageMetadata(
  file
) {

  if (
    !file ||
    !allowedImageMimeTypes.has(
      file.mimetype
    )
  ) {

    return false;

  }


  const extension =
    path
      .extname(
        file.originalname
      )
      .toLowerCase();


  const allowedExtensions =
    allowedImageExtensionsByMimeType.get(
      file.mimetype
    );


  return Boolean(
    allowedExtensions &&
    allowedExtensions.has(
      extension
    )
  );

}


function detectImageMimeType(
  fileBuffer
) {

  if (
    !Buffer.isBuffer(
      fileBuffer
    )
  ) {

    return null;

  }


  const header =
    fileBuffer.subarray(
      0,
      12
    );


  const isJpeg =
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff;


  if (isJpeg) {
    return 'image/jpeg';
  }


  const pngSignature =
    Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a
    ]);


  const isPng =
    header.length >=
      pngSignature.length &&
    header
      .subarray(
        0,
        pngSignature.length
      )
      .equals(
        pngSignature
      );


  if (isPng) {
    return 'image/png';
  }


  const isWebp =
    header.length >= 12 &&
    header
      .subarray(
        0,
        4
      )
      .toString(
        'ascii'
      ) ===
      'RIFF' &&
    header
      .subarray(
        8,
        12
      )
      .toString(
        'ascii'
      ) ===
      'WEBP';


  if (isWebp) {
    return 'image/webp';
  }


  return null;

}


async function hasMatchingImageSignature(
  file
) {

  if (!file) {
    return false;
  }


  const detectedMimeType =
    detectImageMimeType(
      file.buffer
    );


  return (
    detectedMimeType ===
    file.mimetype
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
          'RATE_GUIDE_STORAGE_CLEANUP_FAILED',

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


const imageFileFilter = (
  req,
  file,
  callback
) => {

  if (
    !hasAllowedImageMetadata(
      file
    )
  ) {

    return callback(
      new Error(
        'Please upload only JPEG, PNG or WebP images.'
      )
    );

  }


  return callback(
    null,
    true
  );

};


const uploadRateGuide =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {

      /*
       * Maximum Rate Guide image size: 5 MB.
       */
      fileSize:
        5 * 1024 * 1024,

      files:
        1
    },

    fileFilter:
      imageFileFilter

  });

router.get(
  '/',

  contentManagerOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const rateGuide =
      await prisma.rateGuide.findUnique({

        where: {
          id:
            1
        }

      });


    return res.render(
      'admin/rate-guide-manager',
      {
        rateGuide,

        error:
          null,

        success:
          req.query.updated ===
          '1'
      }
    );

  })
);
router.post(
  '/',

  contentManagerOnly,

  /*
   * Multer parses the multipart form first and keeps the image
   * in req.file.buffer. No file is written to disk here.
   */
  uploadRateGuide.single(
    'rateGuideImage'
  ),

  /*
   * Then verify the CSRF token from the parsed form.
   */
  csrfAfterUpload,

  asyncHandler(async (
    req,
    res
  ) => {

    /*
     * An image is required whenever this form is submitted.
     */
    if (!req.file) {

      const rateGuide =
        await prisma.rateGuide.findUnique({

          where: {
            id:
              1
          }

        });


      return res.status(400).render(
        'admin/rate-guide-manager',
        {
          rateGuide,

          error:
            'Please select a Rate Guide image.',

          success:
            false
        }
      );

    }


    /*
     * Multer has already checked:
     *
     * - filename extension
     * - submitted MIME type
     *
     * Now inspect the actual image bytes before anything is
     * persisted to local storage or R2.
     */
    const imageIsValid =
      await hasMatchingImageSignature(
        req.file
      );


    if (!imageIsValid) {

      const rateGuide =
        await prisma.rateGuide.findUnique({

          where: {
            id:
              1
          }

        });


      return res.status(400).render(
        'admin/rate-guide-manager',
        {
          rateGuide,

          error:
            'The uploaded file is not a valid JPEG, PNG or WebP image.',

          success:
            false
        }
      );

    }


    /*
     * Never trust the original filename for storage.
     *
     * Generate the extension from the already validated MIME
     * type instead.
     */
    const storedExtension =
      storedImageExtensionByMimeType.get(
        req.file.mimetype
      );


    if (!storedExtension) {

      throw new Error(
        'Could not determine a safe Rate Guide file extension.'
      );

    }


    const storageKey =
      `${crypto.randomUUID()}${storedExtension}`;


    const savedFile =
      await savePublicFile({

        category:
          'rateGuide',

        storageKey,

        body:
          req.file.buffer,

        contentType:
          req.file.mimetype

      });


    const newImageUrl =
      savedFile.publicUrl;


    let previousImageUrl =
      null;


    try {

      const existing =
        await prisma.rateGuide.findUnique({

          where: {
            id:
              1
          }

        });


      previousImageUrl =
        existing?.imageUrl ||
        null;


      await prisma.$transaction(
        async (
          transaction
        ) => {

          const savedRateGuide =
            await transaction
              .rateGuide
              .upsert({

                where: {
                  id:
                    1
                },

                update: {

                  imageUrl:
                    newImageUrl,

                  originalName:
                    path.basename(
                      req.file.originalname
                    ),

                  mimeType:
                    req.file.mimetype,

                  fileSize:
                    req.file.size

                },

                create: {

                  id:
                    1,

                  imageUrl:
                    newImageUrl,

                  originalName:
                    path.basename(
                      req.file.originalname
                    ),

                  mimeType:
                    req.file.mimetype,

                  fileSize:
                    req.file.size

                }

              });


          await writeAuditLog({

            client:
              transaction,

            req,

            action:
              'RATE_GUIDE_UPDATED',

            entityType:
              'RateGuide',

            entityId:
              savedRateGuide.id,

            metadata: {

              imageUrl:
                savedRateGuide.imageUrl,

              originalName:
                savedRateGuide.originalName,

              mimeType:
                savedRateGuide.mimeType,

              fileSize:
                savedRateGuide.fileSize

            }

          });

        }
      );

    } catch (error) {

      /*
       * The new image has already been saved.
       *
       * If PostgreSQL fails, remove the new object so it
       * does not become orphaned.
       */
      await deletePublicFileSafely({

        req,

        category:
          'rateGuide',

        storageKey:
          savedFile.storageKey,

        context:
          'Could not remove Rate Guide after database failure'

      });


      throw error;

    }


    /*
     * PostgreSQL now points to the new Rate Guide.
     *
     * Only now is it safe to remove the previous stored object.
     */
    if (
      previousImageUrl &&
      previousImageUrl !==
        newImageUrl
    ) {

      const previousStorageKey =
        storedPublicUrlToStorageKey(
          previousImageUrl
        );


      await deletePublicFileSafely({

        req,

        category:
          'rateGuide',

        storageKey:
          previousStorageKey,

        context:
          'Rate Guide was replaced, but the previous image could not be removed'

      });

    }


    return res.redirect(
      '/admin/rate-guide?updated=1'
    );

  })
);

module.exports =
  router;