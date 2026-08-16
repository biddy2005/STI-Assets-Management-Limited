const crypto =
  require('crypto');

const fs =
  require('fs/promises');

const path =
  require('path');

const prisma =
  require('../config/db');

const env =
  require('../config/env');

const {
  digestUploadDirectory,
  newsUploadDirectory,
  rateGuideUploadDirectory
} = require(
  '../config/storage'
);

const {
  putR2Object,
  getR2Object,
  buildPublicR2Url
} = require(
  '../services/r2-storage.service'
);


/*
 * ============================================================
 * HISTORICAL PUBLIC ASSETS -> CLOUDFLARE R2 MIGRATION
 * ============================================================
 *
 * Default mode:
 *
 *   DRY RUN
 *
 * Execution requires BOTH:
 *
 *   --execute
 *
 * and:
 *
 *   MIGRATE_PUBLIC_ASSETS_TO_R2=YES
 *
 * The script migrates historical local URLs for:
 *
 * - DailyDigest.filePath
 * - RateGuide.imageUrl
 * - NewsArticle.coverImage
 * - NewsImage.imageUrl
 *
 * Safety rules:
 *
 * - local source files are never deleted;
 * - already-R2 database URLs are skipped;
 * - every uploaded object is downloaded and SHA-256 verified;
 * - if any asset fails validation or R2 verification, NO database
 *   URLs are changed;
 * - database URLs are cut over in one Prisma transaction.
 */


const executeMode =
  process.argv.includes(
    '--execute'
  );


const executionApproved =
  process.env
    .MIGRATE_PUBLIC_ASSETS_TO_R2 ===
  'YES';


const migrationReportDirectory =
  path.join(
    __dirname,
    '..',
    'storage',
    'private',
    'migration-reports'
  );


const categoryConfiguration = {
  digests: {
    localDirectory:
      digestUploadDirectory,

    localUrlPrefix:
      '/uploads/digests',

    objectPrefix:
      'digests'
  },

  rateGuide: {
    localDirectory:
      rateGuideUploadDirectory,

    localUrlPrefix:
      '/uploads/rate-guide',

    objectPrefix:
      'rate-guide'
  },

  news: {
    localDirectory:
      newsUploadDirectory,

    localUrlPrefix:
      '/uploads/news',

    objectPrefix:
      'news'
  }
};


function calculateSha256(
  buffer
) {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      buffer
    )
    .digest(
      'hex'
    );
}


function hasPdfSignature(
  buffer
) {
  return Boolean(
    Buffer.isBuffer(buffer) &&
    buffer.length >= 5 &&
    buffer
      .subarray(0, 5)
      .toString('ascii') ===
      '%PDF-'
  );
}


function detectImageMimeType(
  buffer
) {
  if (
    !Buffer.isBuffer(buffer)
  ) {
    return null;
  }


  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;


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
    buffer.length >=
      pngSignature.length &&
    buffer
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
    buffer.length >= 12 &&
    buffer
      .subarray(0, 4)
      .toString('ascii') ===
      'RIFF' &&
    buffer
      .subarray(8, 12)
      .toString('ascii') ===
      'WEBP';


  if (isWebp) {
    return 'image/webp';
  }


  return null;
}


function extensionForMimeType(
  mimeType
) {
  switch (mimeType) {
    case 'application/pdf':
      return '.pdf';

    case 'image/jpeg':
      return '.jpg';

    case 'image/png':
      return '.png';

    case 'image/webp':
      return '.webp';

    default:
      return null;
  }
}


function isAlreadyR2Url(
  storedUrl
) {
  if (
    typeof storedUrl !==
      'string' ||
    !storedUrl.trim() ||
    !env.r2PublicBaseUrl
  ) {
    return false;
  }


  const baseUrl =
    env.r2PublicBaseUrl
      .replace(/\/+$/, '');


  const candidate =
    storedUrl.trim();


  return (
    candidate === baseUrl ||
    candidate.startsWith(
      `${baseUrl}/`
    )
  );
}


function resolveHistoricalLocalFile({
  category,
  storedUrl
}) {
  const configuration =
    categoryConfiguration[
      category
    ];


  if (!configuration) {
    throw new Error(
      'Unsupported public asset category.'
    );
  }


  if (
    typeof storedUrl !==
      'string' ||
    !storedUrl.trim()
  ) {
    throw new Error(
      'The database URL is empty.'
    );
  }


  const trimmedUrl =
    storedUrl.trim();


  const expectedPrefix =
    `${configuration.localUrlPrefix}/`;


  if (
    !trimmedUrl.startsWith(
      expectedPrefix
    )
  ) {
    throw new Error(
      `Expected a historical URL beginning with ${expectedPrefix}`
    );
  }


  const encodedFilename =
    trimmedUrl
      .slice(
        expectedPrefix.length
      )
      .split('?')[0]
      .split('#')[0];


  if (!encodedFilename) {
    throw new Error(
      'The historical URL does not contain a filename.'
    );
  }


  let filename;


  try {
    filename =
      decodeURIComponent(
        encodedFilename
      );
  } catch (error) {
    throw new Error(
      'The historical URL contains an invalid encoded filename.'
    );
  }


  if (
    !filename ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0') ||
    path.basename(filename) !==
      filename
  ) {
    throw new Error(
      'The historical URL does not contain a safe single filename.'
    );
  }


  const localDirectory =
    path.resolve(
      configuration.localDirectory
    );


  const localPath =
    path.resolve(
      localDirectory,
      filename
    );


  if (
    !localPath.startsWith(
      `${localDirectory}${path.sep}`
    )
  ) {
    throw new Error(
      'The historical file resolved outside its configured upload directory.'
    );
  }


  return {
    filename,
    localPath,
    configuration
  };
}


function isMissingR2ObjectError(
  error
) {
  return Boolean(
    error &&
    (
      error.name ===
        'NoSuchKey' ||

      error.Code ===
        'NoSuchKey' ||

      Number(
        error.$metadata
          ?.httpStatusCode
      ) === 404
    )
  );
}


async function bodyToBuffer(
  body
) {
  if (!body) {
    return Buffer.alloc(0);
  }


  if (
    typeof body
      .transformToByteArray ===
    'function'
  ) {
    const bytes =
      await body
        .transformToByteArray();

    return Buffer.from(
      bytes
    );
  }


  const chunks = [];


  for await (
    const chunk of body
  ) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }


  return Buffer.concat(
    chunks
  );
}


async function inspectExistingR2Object({
  objectKey,
  expectedHash,
  expectedSize
}) {
  try {
    const object =
      await getR2Object({
        visibility:
          'public',

        objectKey
      });


    const body =
      await bodyToBuffer(
        object.Body
      );


    const actualHash =
      calculateSha256(
        body
      );


    return {
      exists:
        true,

      matches:
        actualHash ===
          expectedHash &&
        body.length ===
          expectedSize,

      actualHash,

      actualSize:
        body.length
    };
  } catch (error) {
    if (
      isMissingR2ObjectError(
        error
      )
    ) {
      return {
        exists:
          false,

        matches:
          false,

        actualHash:
          null,

        actualSize:
          null
      };
    }


    throw error;
  }
}


async function writeMigrationReport(
  report
) {
  await fs.mkdir(
    migrationReportDirectory,
    {
      recursive:
        true
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        '-'
      );


  const reportPath =
    path.join(
      migrationReportDirectory,
      `public-r2-migration-${timestamp}.json`
    );


  await fs.writeFile(
    reportPath,

    JSON.stringify(
      report,
      null,
      2
    ),

    'utf8'
  );


  return reportPath;
}


function createStorageKey({
  asset,
  mimeType
}) {
  const extension =
    extensionForMimeType(
      mimeType
    );


  if (!extension) {
    throw new Error(
      `Unsupported verified MIME type: ${mimeType}`
    );
  }


  /*
   * Use deterministic keys rather than historical filenames.
   *
   * Historical filenames may contain spaces, brackets and
   * other characters that the storage abstraction deliberately
   * does not allow.
   *
   * Record type + ID also prevents one DB record from sharing
   * the same physical R2 object with another record.
   */
  return (
    `legacy-${asset.keyLabel}-${asset.id}${extension}`
  );
}


async function collectAssets() {
  const [
    digests,
    rateGuides,
    newsArticles,
    newsImages
  ] = await Promise.all([
    prisma.dailyDigest.findMany({
      select: {
        id: true,
        filePath: true
      },

      orderBy: {
        id: 'asc'
      }
    }),

    prisma.rateGuide.findMany({
      select: {
        id: true,
        imageUrl: true,
        mimeType: true,
        fileSize: true
      },

      orderBy: {
        id: 'asc'
      }
    }),

    prisma.newsArticle.findMany({
      select: {
        id: true,
        coverImage: true
      },

      orderBy: {
        id: 'asc'
      }
    }),

    prisma.newsImage.findMany({
      select: {
        id: true,
        imageUrl: true
      },

      orderBy: {
        id: 'asc'
      }
    })
  ]);


  return [
    ...digests.map(
      (digest) => ({
        recordType:
          'DailyDigest',

        keyLabel:
          'digest',

        category:
          'digests',

        id:
          digest.id,

        field:
          'filePath',

        sourceUrl:
          digest.filePath,

        expectedKind:
          'pdf',

        expectedMimeType:
          'application/pdf',

        expectedFileSize:
          null
      })
    ),

    ...rateGuides.map(
      (rateGuide) => ({
        recordType:
          'RateGuide',

        keyLabel:
          'rate-guide',

        category:
          'rateGuide',

        id:
          rateGuide.id,

        field:
          'imageUrl',

        sourceUrl:
          rateGuide.imageUrl,

        expectedKind:
          'image',

        expectedMimeType:
          rateGuide.mimeType,

        expectedFileSize:
          rateGuide.fileSize
      })
    ),

    ...newsArticles
      .filter(
        (article) =>
          typeof article.coverImage ===
            'string' &&
          article.coverImage.trim()
      )
      .map(
        (article) => ({
          recordType:
            'NewsArticle',

          keyLabel:
            'news-cover',

          category:
            'news',

          id:
            article.id,

          field:
            'coverImage',

          sourceUrl:
            article.coverImage,

          expectedKind:
            'image',

          expectedMimeType:
            null,

          expectedFileSize:
            null
        })
      ),

    ...newsImages.map(
      (image) => ({
        recordType:
          'NewsImage',

        keyLabel:
          'news-gallery',

        category:
          'news',

        id:
          image.id,

        field:
          'imageUrl',

        sourceUrl:
          image.imageUrl,

        expectedKind:
          'image',

        expectedMimeType:
          null,

        expectedFileSize:
          null
      })
    )
  ];
}


async function inspectLocalAsset(
  asset
) {
  const {
    filename,
    localPath,
    configuration
  } = resolveHistoricalLocalFile({
    category:
      asset.category,

    storedUrl:
      asset.sourceUrl
  });


  let body;


  try {
    body =
      await fs.readFile(
        localPath
      );
  } catch (error) {
    if (
      error.code ===
        'ENOENT'
    ) {
      const missingError =
        new Error(
          `Local source file does not exist: ${localPath}`
        );

      missingError.code =
        'MISSING_LOCAL_FILE';

      throw missingError;
    }


    throw error;
  }


  let verifiedMimeType;


  if (
    asset.expectedKind ===
      'pdf'
  ) {
    if (
      !hasPdfSignature(
        body
      )
    ) {
      const signatureError =
        new Error(
          'The local file does not contain a valid PDF signature.'
        );

      signatureError.code =
        'INVALID_SIGNATURE';

      throw signatureError;
    }


    verifiedMimeType =
      'application/pdf';
  } else {
    verifiedMimeType =
      detectImageMimeType(
        body
      );


    if (!verifiedMimeType) {
      const signatureError =
        new Error(
          'The local file is not a valid JPEG, PNG or WebP image.'
        );

      signatureError.code =
        'INVALID_SIGNATURE';

      throw signatureError;
    }
  }


  /*
   * RateGuide already stores MIME metadata, so verify it against
   * the physical historical file before migration.
   */
  if (
    asset.expectedMimeType &&
    asset.expectedMimeType !==
      verifiedMimeType
  ) {
    const mimeError =
      new Error(
        `Database MIME type ${asset.expectedMimeType} does not match verified MIME type ${verifiedMimeType}.`
      );

    mimeError.code =
      'MIME_MISMATCH';

    throw mimeError;
  }


  /*
   * RateGuide also stores its original file size.
   */
  if (
    Number.isInteger(
      asset.expectedFileSize
    ) &&
    asset.expectedFileSize !==
      body.length
  ) {
    const sizeError =
      new Error(
        `Database file size ${asset.expectedFileSize} does not match local size ${body.length}.`
      );

    sizeError.code =
      'SIZE_MISMATCH';

    throw sizeError;
  }


  const sha256 =
    calculateSha256(
      body
    );


  const storageKey =
    createStorageKey({
      asset,

      mimeType:
        verifiedMimeType
    });


  const objectKey =
    `${configuration.objectPrefix}/${storageKey}`;


  const targetUrl =
    buildPublicR2Url(
      objectKey
    );


  return {
    filename,
    localPath,
    body,

    byteLength:
      body.length,

    verifiedMimeType,

    sha256,

    storageKey,

    objectKey,

    targetUrl
  };
}


async function updateDatabaseUrls(
  plannedUpdates
) {
  await prisma.$transaction(
    async (transaction) => {
      for (
        const update of
          plannedUpdates
      ) {
        let result;


        switch (
          update.recordType
        ) {
          case 'DailyDigest':
            result =
              await transaction
                .dailyDigest
                .updateMany({
                  where: {
                    id:
                      update.id,

                    filePath:
                      update.sourceUrl
                  },

                  data: {
                    filePath:
                      update.targetUrl
                  }
                });

            break;


          case 'RateGuide':
            result =
              await transaction
                .rateGuide
                .updateMany({
                  where: {
                    id:
                      update.id,

                    imageUrl:
                      update.sourceUrl
                  },

                  data: {
                    imageUrl:
                      update.targetUrl
                  }
                });

            break;


          case 'NewsArticle':
            result =
              await transaction
                .newsArticle
                .updateMany({
                  where: {
                    id:
                      update.id,

                    coverImage:
                      update.sourceUrl
                  },

                  data: {
                    coverImage:
                      update.targetUrl
                  }
                });

            break;


          case 'NewsImage':
            result =
              await transaction
                .newsImage
                .updateMany({
                  where: {
                    id:
                      update.id,

                    imageUrl:
                      update.sourceUrl
                  },

                  data: {
                    imageUrl:
                      update.targetUrl
                  }
                });

            break;


          default:
            throw new Error(
              `Unsupported database record type: ${update.recordType}`
            );
        }


        /*
         * Optimistic concurrency check.
         *
         * If an administrator changed this record while the
         * migration was running, abort the complete DB cutover
         * rather than overwriting the newer value.
         */
        if (
          result.count !== 1
        ) {
          throw new Error(
            `${update.recordType} ${update.id} changed while the migration was running. Database cutover was cancelled.`
          );
        }
      }
    }
  );
}


async function main() {
  console.log('');

  console.log(
    'Historical public asset R2 migration'
  );

  console.log(
    '===================================='
  );


  console.log(
    `Mode: ${
      executeMode
        ? 'EXECUTE'
        : 'DRY RUN'
    }`
  );


  console.log(
    `Configured storage driver: ${env.storageDriver}`
  );


  console.log('');


  if (
    executeMode &&
    !executionApproved
  ) {
    throw new Error(
      'Execution blocked. Set MIGRATE_PUBLIC_ASSETS_TO_R2=YES before using --execute.'
    );
  }


  if (
    executeMode &&
    env.storageDriver !==
      'r2'
  ) {
    throw new Error(
      'Execution requires STORAGE_DRIVER=r2 for this process.'
    );
  }


  const assets =
    await collectAssets();


  console.log(
    `Database asset references found: ${assets.length}`
  );


  const results = [];

  const plannedUpdates = [];


  for (
    const asset of assets
  ) {
    const result = {
      recordType:
        asset.recordType,

      recordId:
        asset.id,

      field:
        asset.field,

      sourceUrl:
        asset.sourceUrl,

      targetUrl:
        null,

      objectKey:
        null,

      localBytes:
        null,

      sha256:
        null,

      storageStatus:
        null,

      databaseUpdated:
        false,

      error:
        null
    };


    try {
      /*
       * Assets uploaded through Parts 19A-19D already point at
       * the configured public R2 base URL.
       *
       * They require no historical migration.
       */
      if (
        isAlreadyR2Url(
          asset.sourceUrl
        )
      ) {
        result.storageStatus =
          'already_migrated';

        console.log(
          `[SKIP R2] ${asset.recordType} ${asset.id}`
        );

        results.push(
          result
        );

        continue;
      }


      const inspected =
        await inspectLocalAsset(
          asset
        );


      result.targetUrl =
        inspected.targetUrl;

      result.objectKey =
        inspected.objectKey;

      result.localBytes =
        inspected.byteLength;

      result.sha256 =
        inspected.sha256;


      /*
       * Dry run validates the DB URL, filesystem path,
       * physical file and content signature, but creates
       * nothing in R2.
       */
      if (!executeMode) {
        result.storageStatus =
          'ready';

        console.log(
          `[READY] ${asset.recordType} ${asset.id}: ${asset.sourceUrl} -> ${inspected.targetUrl}`
        );

        results.push(
          result
        );

        continue;
      }


      /*
       * Never blindly overwrite an existing migration object.
       *
       * A previous partial execution may already have uploaded
       * and verified it.
       */
      const existingObject =
        await inspectExistingR2Object({
          objectKey:
            inspected.objectKey,

          expectedHash:
            inspected.sha256,

          expectedSize:
            inspected.byteLength
        });


      if (
        existingObject.exists &&
        !existingObject.matches
      ) {
        const conflictError =
          new Error(
            'An R2 object already exists under the planned key, but its bytes do not match the local source file.'
          );

        conflictError.code =
          'R2_CONFLICT';

        throw conflictError;
      }


      if (
        existingObject.exists &&
        existingObject.matches
      ) {
        result.storageStatus =
          'already_verified';

        console.log(
          `[VERIFIED EXISTING] ${asset.recordType} ${asset.id}: ${inspected.objectKey}`
        );
      } else {
        await putR2Object({
          visibility:
            'public',

          objectKey:
            inspected.objectKey,

          body:
            inspected.body,

          contentType:
            inspected.verifiedMimeType,

          /*
           * Historical migrated assets use deterministic
           * versioned object names, so long-lived browser/CDN
           * caching is safe.
           */
          cacheControl:
            'public, max-age=31536000, immutable'
        });


        /*
         * Download it again and verify the actual R2 bytes.
         */
        const verification =
          await inspectExistingR2Object({
            objectKey:
              inspected.objectKey,

            expectedHash:
              inspected.sha256,

            expectedSize:
              inspected.byteLength
          });


        if (
          !verification.exists ||
          !verification.matches
        ) {
          const verificationError =
            new Error(
              'The uploaded R2 object could not be verified against the local source file.'
            );

          verificationError.code =
            'VERIFICATION_FAILED';

          throw verificationError;
        }


        result.storageStatus =
          'uploaded_and_verified';


        console.log(
          `[UPLOADED + VERIFIED] ${asset.recordType} ${asset.id}: ${inspected.objectKey}`
        );
      }


      /*
       * Do NOT update PostgreSQL yet.
       *
       * We first require every historical file in the entire
       * migration to pass.
       */
      plannedUpdates.push({
        recordType:
          asset.recordType,

        id:
          asset.id,

        sourceUrl:
          asset.sourceUrl,

        targetUrl:
          inspected.targetUrl
      });

    } catch (error) {
      result.storageStatus =
        error.code ||
        'failed';

      result.error =
        error.message;


      console.error(
        `[FAILED] ${asset.recordType} ${asset.id}: ${error.message}`
      );
    }


    results.push(
      result
    );
  }


  const successfulStatuses =
    new Set([
      'ready',
      'already_migrated',
      'already_verified',
      'uploaded_and_verified'
    ]);


  const failedResults =
    results.filter(
      (result) =>
        !successfulStatuses.has(
          result.storageStatus
        )
    );


  let databaseCutover =
    'not_attempted';


  /*
   * Only perform the DB cutover if EVERY historical asset
   * passed its storage checks.
   */
  if (
    executeMode &&
    failedResults.length === 0
  ) {
    try {
      if (
        plannedUpdates.length > 0
      ) {
        await updateDatabaseUrls(
          plannedUpdates
        );
      }


      databaseCutover =
        'committed';


      const migratedKeys =
        new Set(
          plannedUpdates.map(
            (update) =>
              `${update.recordType}:${update.id}`
          )
        );


      for (
        const result of results
      ) {
        const resultKey =
          `${result.recordType}:${result.recordId}`;


        if (
          migratedKeys.has(
            resultKey
          )
        ) {
          result.databaseUpdated =
            true;
        }
      }

    } catch (error) {
      databaseCutover =
        'failed';


      console.error('');

      console.error(
        `Database cutover failed: ${error.message}`
      );


      /*
       * The Prisma transaction rolls back, so PostgreSQL
       * remains on the original local URLs.
       *
       * Verified R2 objects may remain and will simply be
       * recognised as already_verified on the next execution.
       */
      for (
        const result of results
      ) {
        if (
          result.storageStatus ===
            'uploaded_and_verified' ||
          result.storageStatus ===
            'already_verified'
        ) {
          result.error =
            `R2 verified, but database cutover failed: ${error.message}`;
        }
      }
    }
  }


  const countStatus =
    (status) =>
      results.filter(
        (result) =>
          result.storageStatus ===
          status
      ).length;


  const report = {
    generatedAt:
      new Date()
        .toISOString(),

    mode:
      executeMode
        ? 'execute'
        : 'dry-run',

    storageDriver:
      env.storageDriver,

    databaseCutover,

    summary: {
      assetReferences:
        results.length,

      ready:
        countStatus(
          'ready'
        ),

      alreadyMigrated:
        countStatus(
          'already_migrated'
        ),

      uploadedAndVerified:
        countStatus(
          'uploaded_and_verified'
        ),

      alreadyVerified:
        countStatus(
          'already_verified'
        ),

      databaseUpdated:
        results.filter(
          (result) =>
            result.databaseUpdated
        ).length,

      failed:
        failedResults.length +
        (
          databaseCutover ===
            'failed'
            ? 1
            : 0
        )
    },

    results
  };


  const reportPath =
    await writeMigrationReport(
      report
    );


  console.log('');

  console.log(
    'Migration summary'
  );

  console.log(
    '-----------------'
  );


  console.log(
    JSON.stringify(
      report.summary,
      null,
      2
    )
  );


  console.log('');

  console.log(
    `Database cutover: ${databaseCutover}`
  );


  console.log(
    `Report: ${reportPath}`
  );


  if (
    failedResults.length > 0 ||
    databaseCutover ===
      'failed'
  ) {
    process.exitCode =
      1;


    console.error('');

    console.error(
      'Migration did not fully pass. PostgreSQL URLs were not partially cut over.'
    );

    return;
  }


  if (executeMode) {
    console.log('');

    console.log(
      'Historical public assets were verified in R2 and eligible local database URLs were updated.'
    );

    console.log(
      'Local source files were NOT deleted.'
    );
  } else {
    console.log('');

    console.log(
      'Dry run passed. No R2 objects were created and no database records were modified.'
    );
  }
}


main()
  .catch(
    (error) => {
      console.error(
        'Public asset migration failed:',
        error
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      try {
        await prisma
          .$disconnect();
      } catch (error) {
        console.error(
          'Could not disconnect Prisma cleanly:',
          error
        );
      }
    }
  );