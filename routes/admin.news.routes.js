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

const fs =
  require('fs/promises');

const prisma =
  require('../config/db');

const {
  newsUploadDirectory
} = require(
  '../config/storage'
);

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
  newsSchema
} = require(
  '../schemas/news.schema'
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
  slugify
} = require(
  '../utils/slugify'
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
          'NEWS_STORAGE_CLEANUP_FAILED',

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


async function deleteFileIfExists(
  filePath
) {

  if (!filePath) {
    return;
  }


  try {

    await fs.unlink(
      filePath
    );

  } catch (error) {

    if (
      error.code !==
      'ENOENT'
    ) {

      throw error;

    }

  }

}


function storedUrlToFilePath(
  storedUrl,
  uploadDirectory
) {

  if (
    typeof storedUrl !==
      'string' ||
    !storedUrl.trim()
  ) {

    return null;

  }


  const fileName =
    path.posix.basename(
      storedUrl
    );


  return path.join(
    uploadDirectory,
    fileName
  );

}


async function deleteStoredFileSafely(
  req,
  storedUrl,
  uploadDirectory,
  context
) {

  const filePath =
    storedUrlToFilePath(
      storedUrl,
      uploadDirectory
    );


  if (!filePath) {
    return;
  }


  try {

    await deleteFileIfExists(
      filePath
    );

  } catch (cleanupError) {

    req.log.error(
      {
        err:
          cleanupError,

        event:
          'NEWS_LOCAL_STORAGE_CLEANUP_FAILED',

        component:
          'storage',

        filePath,

        requestId:
          req.requestId
      },

      context
    );

  }

}


/*
 * Remove a News image from whichever storage backend originally
 * produced its browser-facing URL.
 *
 * Historical News images may still use /uploads/news/... while
 * newer images use the public storage abstraction.
 */
async function deleteNewsAssetSafely(
  req,
  storedUrl,
  context
) {

  if (
    typeof storedUrl !==
      'string' ||
    !storedUrl.trim()
  ) {

    return;

  }


  /*
   * Historical local News image.
   */
  if (
    storedUrl.startsWith(
      '/uploads/news/'
    )
  ) {

    await deleteStoredFileSafely(
      req,
      storedUrl,
      newsUploadDirectory,
      context
    );


    return;

  }


  /*
   * Storage-abstraction / R2 News image.
   */
  const storageKey =
    storedPublicUrlToStorageKey(
      storedUrl
    );


  await deletePublicFileSafely({

      req,

      category:
        'news',

      storageKey,

      context

    });

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


/*
 * News cover image upload.
 */
const uploadCoverImage =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {

      fileSize:
        5 * 1024 * 1024,

      files:
        1
    },

    fileFilter:
      imageFileFilter

  });


/*
 * News gallery upload.
 */
const uploadGalleryImages =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {

      fileSize:
        5 * 1024 * 1024,

      files:
        10
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

    const articles =
      await prisma.newsArticle.findMany({

        orderBy: {
          createdAt:
            'desc'
        }

      });


    return res.render(
      'admin/news-manager',
      {
        articles
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
      'admin/news-form',
      {
        article:
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

  uploadCoverImage.single(
    'coverImage'
  ),

  csrfAfterUpload,

  asyncHandler(async (
    req,
    res
  ) => {

    const validation =
      validateSchema(
        newsSchema,
        req.body
      );


    const isPublished =
      req.body.published ===
      'on';


    if (!validation.success) {

      return res.status(400).render(
        'admin/news-form',
        {
          article:
            null,

          error:
            'Article title and body are required.'
        }
      );

    }


    const {
      title,
      body
    } =
      validation.data;


    if (req.file) {

      const coverImageIsValid =
        await hasMatchingImageSignature(
          req.file
        );


      if (!coverImageIsValid) {

        return res.status(400).render(
          'admin/news-form',
          {
            article:
              null,

            error:
              'The cover file is not a valid JPEG, PNG or WebP image.'
          }
        );

      }

    }


    const baseSlug =
      slugify(
        title
      );


    if (!baseSlug) {

      return res.status(400).render(
        'admin/news-form',
        {
          article:
            null,

          error:
            'The article title must contain valid letters or numbers.'
        }
      );

    }


    let slug =
      baseSlug;


    let counter =
      1;


    while (
      await prisma.newsArticle.findUnique({
        where: {
          slug
        }
      })
    ) {

      slug =
        `${baseSlug}-${counter}`;

      counter +=
        1;

    }


    let savedCoverFile =
      null;


    try {

      if (req.file) {

        const storedExtension =
          storedImageExtensionByMimeType.get(
            req.file.mimetype
          );


        if (!storedExtension) {

          throw new Error(
            'Could not determine a safe News cover file extension.'
          );

        }


        const storageKey =
          `${crypto.randomUUID()}${storedExtension}`;


        savedCoverFile =
          await savePublicFile({

            category:
              'news',

            storageKey,

            body:
              req.file.buffer,

            contentType:
              req.file.mimetype

          });

      }


      await prisma.$transaction(
        async (
          transaction
        ) => {

          const createdArticle =
            await transaction
              .newsArticle
              .create({

                data: {

                  title,

                  slug,

                  body,

                  coverImage:
                    savedCoverFile
                      ? savedCoverFile.publicUrl
                      : null,

                  published:
                    isPublished,

                  publishedAt:
                    isPublished
                      ? new Date()
                      : null

                }

              });


          await writeAuditLog({

            client:
              transaction,

            req,

            action:
              'NEWS_CREATED',

            entityType:
              'NewsArticle',

            entityId:
              createdArticle.id,

            metadata: {

              title:
                createdArticle.title,

              slug:
                createdArticle.slug,

              published:
                createdArticle.published,

              hasCoverImage:
                Boolean(
                  createdArticle.coverImage
                )

            }

          });

        }
      );

    } catch (error) {

      if (savedCoverFile) {

        await deletePublicFileSafely({

          req,

          category:
            'news',

          storageKey:
            savedCoverFile.storageKey,

          context:
            'Could not remove News cover after article creation failed:'

        });

      }


      throw error;

    }


    return res.redirect(
      '/admin/news'
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

    const articleId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        articleId
      ) ||
      articleId < 1
    ) {

      return res.redirect(
        '/admin/news'
      );

    }


    const article =
      await prisma.newsArticle.findUnique({

        where: {
          id:
            articleId
        }

      });


    if (!article) {

      return res.redirect(
        '/admin/news'
      );

    }


    return res.render(
      'admin/news-form',
      {
        article,
        error:
          null
      }
    );

  })
);

router.post(
  '/:id',

  contentManagerOnly,

  uploadCoverImage.single(
    'coverImage'
  ),

  csrfAfterUpload,

  asyncHandler(async (
    req,
    res
  ) => {

    const articleId =
      Number(
        req.params.id
      );


    /*
     * Validate and normalize the updated article text.
     */
    const validation =
      validateSchema(
        newsSchema,
        req.body
      );


    const isNowPublished =
      req.body.published ===
      'on';


    /*
     * The replacement cover is still only in memory here, so
     * invalid requests require no filesystem cleanup.
     */
    if (
      !Number.isSafeInteger(
        articleId
      ) ||
      articleId < 1
    ) {

      return res.status(400).send(
        'Invalid article ID.'
      );

    }


    const existing =
      await prisma.newsArticle.findUnique({

        where: {
          id:
            articleId
        }

      });


    if (!existing) {

      return res.status(404).send(
        'News article not found.'
      );

    }


    if (!validation.success) {

      return res.status(400).render(
        'admin/news-form',
        {
          article: {
            ...existing,

            title:
              typeof req.body.title ===
                'string'
                ? req.body.title.trim()
                : '',

            body:
              typeof req.body.body ===
                'string'
                ? req.body.body.trim()
                : '',

            published:
              isNowPublished
          },

          error:
            'Article title and body are required.'
        }
      );

    }


    const {
      title,
      body
    } =
      validation.data;


    /*
     * Validate the real replacement-image bytes before
     * uploading them.
     */
    if (req.file) {

      const replacementCoverIsValid =
        await hasMatchingImageSignature(
          req.file
        );


      if (
        !replacementCoverIsValid
      ) {

        return res.status(400).render(
          'admin/news-form',
          {
            article: {
              ...existing,

              title,

              body,

              published:
                isNowPublished
            },

            error:
              'The replacement cover is not a valid JPEG, PNG or WebP image.'
          }
        );

      }

    }


    let savedReplacementCover =
      null;


    /*
     * Upload a new object only when the administrator selected
     * a replacement cover.
     */
    if (req.file) {

      const storedExtension =
        storedImageExtensionByMimeType.get(
          req.file.mimetype
        );


      if (!storedExtension) {

        throw new Error(
          'Could not determine a safe News cover file extension.'
        );

      }


      const storageKey =
        `${crypto.randomUUID()}${storedExtension}`;


      savedReplacementCover =
        await savePublicFile({

          category:
            'news',

          storageKey,

          body:
            req.file.buffer,

          contentType:
            req.file.mimetype

        });

    }


    const previousCoverUrl =
      existing.coverImage;


    /*
     * Leaving the file input blank preserves the current cover.
     */
    const newCoverUrl =
      savedReplacementCover
        ? savedReplacementCover.publicUrl
        : existing.coverImage;


    const wasPublished =
      existing.published;


    try {

      await prisma.$transaction(
        async (
          transaction
        ) => {

          const updatedArticle =
            await transaction
              .newsArticle
              .update({

                where: {
                  id:
                    articleId
                },

                data: {

                  title,

                  body,

                  coverImage:
                    newCoverUrl,

                  published:
                    isNowPublished,

                  publishedAt:
                    isNowPublished &&
                    !wasPublished
                      ? new Date()
                      : existing.publishedAt

                }

              });


          await writeAuditLog({

            client:
              transaction,

            req,

            action:
              'NEWS_UPDATED',

            entityType:
              'NewsArticle',

            entityId:
              articleId,

            metadata: {

              previous: {

                title:
                  existing.title,

                published:
                  existing.published,

                coverImage:
                  existing.coverImage

              },

              updated: {

                title:
                  updatedArticle.title,

                published:
                  updatedArticle.published,

                coverImage:
                  updatedArticle.coverImage

              }

            }

          });

        }
      );

    } catch (error) {

      /*
       * PostgreSQL still references the previous cover if the
       * transaction fails, so remove only the newly uploaded
       * replacement.
       */
      if (savedReplacementCover) {

        await deletePublicFileSafely({

          req,

          category:
            'news',

          storageKey:
            savedReplacementCover.storageKey,

          context:
            'Could not remove replacement News cover after article update failed:'

        });

      }


      throw error;

    }


    /*
     * PostgreSQL now references the new cover.
     *
     * Delete the previous cover only after the transaction
     * succeeds.
     */
    if (
      savedReplacementCover &&
      previousCoverUrl &&
      previousCoverUrl !==
        newCoverUrl
    ) {

      await deleteNewsAssetSafely(
        req,
        previousCoverUrl,
        'Article was updated, but the previous cover image could not be removed:'
      );

    }


    return res.redirect(
      '/admin/news'
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

    const articleId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        articleId
      ) ||
      articleId < 1
    ) {

      return res.status(400).send(
        'Invalid article ID.'
      );

    }


    /*
     * Retrieve both the cover URL and existing gallery URLs
     * before deleting their database records.
     */
    const article =
      await prisma.newsArticle.findUnique({

        where: {
          id:
            articleId
        },

        include: {

          images: {

            select: {
              imageUrl:
                true
            }

          }

        }

      });


    if (!article) {

      return res.status(404).send(
        'News article not found.'
      );

    }


    const galleryImageUrls =
      article.images
        .map(
          (image) =>
            image.imageUrl
        )
        .filter(
          Boolean
        );


    /*
     * Remove the database records atomically.
     */
    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .newsImage
          .deleteMany({

            where: {
              newsArticleId:
                articleId
            }

          });


        await transaction
          .newsArticle
          .delete({

            where: {
              id:
                articleId
            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'NEWS_DELETED',

          entityType:
            'NewsArticle',

          entityId:
            articleId,

          metadata: {

            title:
              article.title,

            slug:
              article.slug,

            galleryImageCount:
              article.images.length,

            hadCoverImage:
              Boolean(
                article.coverImage
              )

          }

        });

      }
    );


    /*
     * Both cover and gallery images use the News storage-aware
     * cleanup helper.
     *
     * This also supports historical /uploads/news/... files.
     */
    await Promise.all([

      deleteNewsAssetSafely(
        req,
        article.coverImage,
        'Article record was deleted, but its cover image could not be removed:'
      ),

      ...galleryImageUrls.map(
        (
          storedImageUrl
        ) => {

          return deleteNewsAssetSafely(
            req,
            storedImageUrl,
            'Article record was deleted, but one of its gallery images could not be removed:'
          );

        }
      )

    ]);


    return res.redirect(
      '/admin/news'
    );

  })
);

/*
 * ============================================================
 * NEWS GALLERY MANAGEMENT
 * ============================================================
 */

router.get(
  '/:id/images',

  contentManagerOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const articleId =
      Number(
        req.params.id
      );


    if (
      !Number.isSafeInteger(
        articleId
      ) ||
      articleId < 1
    ) {

      return res.redirect(
        '/admin/news'
      );

    }


    const article =
      await prisma.newsArticle.findUnique({

        where: {
          id:
            articleId
        },

        include: {

          images: {

            orderBy: {
              order:
                'asc'
            }

          }

        }

      });


    if (!article) {

      return res.redirect(
        '/admin/news'
      );

    }


    return res.render(
      'admin/news-images',
      {
        article,

        error:
          null
      }
    );

  })
);

router.post(
  '/:id/images',

  contentManagerOnly,

  /*
   * Keep all selected gallery images in memory.
   */
  uploadGalleryImages.array(
    'galleryImages',
    10
  ),

  /*
   * Multipart forms must be parsed before CSRF verification.
   */
  csrfAfterUpload,

  asyncHandler(async (
    req,
    res
  ) => {

    const articleId =
      Number(
        req.params.id
      );


    const files =
      Array.isArray(
        req.files
      )
        ? req.files
        : [];


    if (
      !Number.isSafeInteger(
        articleId
      ) ||
      articleId < 1
    ) {

      return res.status(400).send(
        'Invalid article ID.'
      );

    }


    if (
      files.length ===
      0
    ) {

      return res.status(400).send(
        'Please select at least one image.'
      );

    }


    const galleryValidationResults =
      await Promise.all(

        files.map(
          (
            file
          ) => {

            return hasMatchingImageSignature(
              file
            );

          }
        )

      );


    const allGalleryImagesAreValid =
      galleryValidationResults.every(
        Boolean
      );


    if (
      !allGalleryImagesAreValid
    ) {

      return res.status(400).send(
        'One or more uploaded files are not valid JPEG, PNG or WebP images.'
      );

    }


    const article =
      await prisma.newsArticle.findUnique({

        where: {
          id:
            articleId
        },

        select: {
          id:
            true
        }

      });


    if (!article) {

      return res.status(404).send(
        'News article not found.'
      );

    }


    const lastImage =
      await prisma.newsImage.findFirst({

        where: {
          newsArticleId:
            articleId
        },

        orderBy: {
          order:
            'desc'
        }

      });


    const startingOrder =
      lastImage
        ? lastImage.order + 1
        : 0;


    const savedGalleryFiles =
      [];


    try {

      for (
        const file of files
      ) {

        const storedExtension =
          storedImageExtensionByMimeType.get(
            file.mimetype
          );


        if (!storedExtension) {

          throw new Error(
            'Could not determine a safe News gallery file extension.'
          );

        }


        const storageKey =
          `${crypto.randomUUID()}${storedExtension}`;


        const savedFile =
          await savePublicFile({

            category:
              'news',

            storageKey,

            body:
              file.buffer,

            contentType:
              file.mimetype

          });


        savedGalleryFiles.push(
          savedFile
        );

      }

    } catch (error) {

      await Promise.all(

        savedGalleryFiles.map(
          (
            savedFile
          ) => {

            return deletePublicFileSafely({

              req,

              category:
                'news',

              storageKey:
                savedFile.storageKey,

              context:
                'Could not remove a partially uploaded News gallery image:'

            });

          }
        )

      );


      throw error;

    }


    try {

      await prisma.$transaction(
        async (
          transaction
        ) => {

          const createdImageIds =
            [];


          for (
            const [
              index,
              savedFile
            ] of savedGalleryFiles.entries()
          ) {

            const createdImage =
              await transaction
                .newsImage
                .create({

                  data: {

                    newsArticleId:
                      articleId,

                    imageUrl:
                      savedFile.publicUrl,

                    order:
                      startingOrder +
                      index

                  }

                });


            createdImageIds.push(
              createdImage.id
            );

          }


          await writeAuditLog({

            client:
              transaction,

            req,

            action:
              'GALLERY_IMAGE_ADDED',

            entityType:
              'NewsArticle',

            entityId:
              articleId,

            metadata: {

              imageCount:
                createdImageIds.length,

              imageIds:
                createdImageIds

            }

          });

        }
      );

    } catch (error) {

      await Promise.all(

        savedGalleryFiles.map(
          (
            savedFile
          ) => {

            return deletePublicFileSafely({

              category:
                'news',

              storageKey:
                savedFile.storageKey,

              context:
                'Could not remove News gallery image after database failure:'

            });

          }
        )

      );


      throw error;

    }


    return res.redirect(
      `/admin/news/${articleId}/images`
    );

  })
);
router.post(
  '/:id/images/:imageId/delete',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const articleId =
      Number(
        req.params.id
      );


    const imageId =
      Number(
        req.params.imageId
      );


    if (
      !Number.isSafeInteger(
        articleId
      ) ||
      articleId < 1
    ) {

      return res.status(400).send(
        'Invalid article ID.'
      );

    }


    if (
      !Number.isSafeInteger(
        imageId
      ) ||
      imageId < 1
    ) {

      return res.status(400).send(
        'Invalid image ID.'
      );

    }


    const image =
      await prisma.newsImage.findFirst({

        where: {

          id:
            imageId,

          newsArticleId:
            articleId

        }

      });


    if (!image) {

      return res.status(404).send(
        'News gallery image not found.'
      );

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .newsImage
          .delete({

            where: {
              id:
                imageId
            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'GALLERY_IMAGE_DELETED',

          entityType:
            'NewsImage',

          entityId:
            imageId,

          metadata: {

            newsArticleId:
              articleId,

            imageUrl:
              image.imageUrl,

            order:
              image.order

          }

        });

      }
    );


    await deleteNewsAssetSafely(
      req,
      image.imageUrl,
      'Gallery image record was deleted, but its stored image could not be removed:'
    );


    return res.redirect(
      `/admin/news/${articleId}/images`
    );

  })
);

module.exports =
  router;