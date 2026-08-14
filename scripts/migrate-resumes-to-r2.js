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
  resumeDirectory
} = require(
  '../config/storage'
);

const {
  putR2Object,
  getR2Object
} = require(
  '../services/r2-storage.service'
);


/*
 * ============================================================
 * PRIVATE RÉSUMÉ → CLOUDFLARE R2 MIGRATION
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
 *   MIGRATE_RESUMES_TO_R2=YES
 *
 * The script:
 *
 * - never deletes local résumés;
 * - never modifies JobApplication records;
 * - never makes the private bucket public.
 */


const executeMode =
  process.argv.includes(
    '--execute'
  );


const executionApproved =
  process.env
    .MIGRATE_RESUMES_TO_R2 ===
  'YES';


const privateObjectPrefix =
  'resumes';


/*
 * Migration reports are kept inside private application
 * storage rather than the public website directory.
 */
const migrationReportDirectory =
  path.join(
    resumeDirectory,
    '..',
    'migration-reports'
  );


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
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 5
  ) {
    return false;
  }


  return (
    buffer
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


function validateStorageKey(
  storageKey
) {
  if (
    typeof storageKey !==
      'string'
  ) {
    return false;
  }


  const trimmedKey =
    storageKey.trim();


  if (
    !trimmedKey ||
    trimmedKey.length > 255
  ) {
    return false;
  }


  /*
   * Existing résumé records should contain only the generated
   * filename, not a path.
   */
  const safePattern =
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;


  if (
    !safePattern.test(
      trimmedKey
    )
  ) {
    return false;
  }


  return (
    path.basename(
      trimmedKey
    ) ===
    trimmedKey
  );
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


  const chunks =
    [];


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
          'private',

        objectKey
      });


    const body =
      await bodyToBuffer(
        object.Body
      );


    const hash =
      calculateSha256(
        body
      );


    return {
      exists:
        true,

      matches:
        hash ===
          expectedHash &&
        body.length ===
          expectedSize,

      actualHash:
        hash,

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


  const filePath =
    path.join(
      migrationReportDirectory,
      `resume-r2-migration-${timestamp}.json`
    );


  await fs.writeFile(
    filePath,

    JSON.stringify(
      report,
      null,
      2
    ),

    'utf8'
  );


  return filePath;
}


async function main() {
  console.log('');
  console.log(
    'Private résumé R2 migration'
  );
  console.log(
    '============================'
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
      'Execution blocked. Set MIGRATE_RESUMES_TO_R2=YES before using --execute.'
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


  const applications =
    await prisma
      .jobApplication
      .findMany({
        select: {
          id:
            true,

          resumeStorageKey:
            true,

          resumeMimeType:
            true,

          resumeFileSize:
            true
        },

        orderBy: {
          id:
            'asc'
        }
      });


  console.log(
    `Applications found: ${applications.length}`
  );


  const results =
    [];


  for (
    const application of
      applications
  ) {
    const {
      id:
        applicationId,

      resumeStorageKey,
      resumeMimeType,
      resumeFileSize
    } =
      application;


    const result = {
      applicationId,
      storageKey:
        resumeStorageKey,

      status:
        null,

      localBytes:
        null,

      databaseBytes:
        resumeFileSize,

      sha256:
        null,

      error:
        null
    };


    try {
      /*
       * Do not allow historical database values to influence
       * filesystem paths unexpectedly.
       */
      if (
        !validateStorageKey(
          resumeStorageKey
        )
      ) {
        result.status =
          'invalid_storage_key';

        throw new Error(
          'The database storage key is not a safe generated filename.'
        );
      }


      const localPath =
        path.join(
          resumeDirectory,
          resumeStorageKey
        );


      let localBody;


      try {
        localBody =
          await fs.readFile(
            localPath
          );
      } catch (error) {
        if (
          error.code ===
            'ENOENT'
        ) {
          result.status =
            'missing_local_file';

          throw new Error(
            'The local résumé file does not exist.'
          );
        }


        throw error;
      }


      result.localBytes =
        localBody.length;


      /*
       * The physical file size should agree with what was
       * recorded when the application was accepted.
       */
      if (
        Number.isInteger(
          resumeFileSize
        ) &&
        resumeFileSize !==
          localBody.length
      ) {
        result.status =
          'size_mismatch';

        throw new Error(
          `Database size ${resumeFileSize} does not match local size ${localBody.length}.`
        );
      }


      if (
        !hasPdfSignature(
          localBody
        )
      ) {
        result.status =
          'invalid_pdf_signature';

        throw new Error(
          'The local file does not begin with the expected PDF signature.'
        );
      }


      const localHash =
        calculateSha256(
          localBody
        );


      result.sha256 =
        localHash;


      const objectKey =
        `${privateObjectPrefix}/${resumeStorageKey}`;


      /*
       * DRY RUN stops here.
       */
      if (!executeMode) {
        result.status =
          'ready';

        console.log(
          `[READY] Application ${applicationId}: ${resumeStorageKey}`
        );

        results.push(
          result
        );

        continue;
      }


      /*
       * Check whether the R2 object already exists.
       *
       * Never blindly overwrite an existing object with the
       * same key.
       */
      const existingObject =
        await inspectExistingR2Object({
          objectKey,

          expectedHash:
            localHash,

          expectedSize:
            localBody.length
        });


      if (
        existingObject.exists
      ) {
        if (
          existingObject.matches
        ) {
          result.status =
            'already_verified';

          console.log(
            `[VERIFIED EXISTING] Application ${applicationId}: ${resumeStorageKey}`
          );

          results.push(
            result
          );

          continue;
        }


        result.status =
          'r2_conflict';

        throw new Error(
          'An R2 object already exists under this key but its content does not match the local résumé.'
        );
      }


      /*
       * Copy the local résumé to the PRIVATE R2 bucket.
       */
      await putR2Object({
        visibility:
          'private',

        objectKey,

        body:
          localBody,

        contentType:
          resumeMimeType ||
          'application/pdf',

        cacheControl:
          'private, no-store'
      });


      /*
       * Download the R2 object again.
       *
       * We verify the actual stored bytes rather than assuming
       * that a successful PUT means migration is complete.
       */
      const verification =
        await inspectExistingR2Object({
          objectKey,

          expectedHash:
            localHash,

          expectedSize:
            localBody.length
        });


      if (
        !verification.exists ||
        !verification.matches
      ) {
        result.status =
          'verification_failed';

        throw new Error(
          'The uploaded R2 object could not be verified against the local résumé.'
        );
      }


      result.status =
        'uploaded_and_verified';


      console.log(
        `[UPLOADED + VERIFIED] Application ${applicationId}: ${resumeStorageKey}`
      );

    } catch (error) {
      if (!result.status) {
        result.status =
          'failed';
      }


      result.error =
        error.message;


      console.error(
        `[FAILED] Application ${applicationId}: ${result.error}`
      );
    }


    results.push(
      result
    );
  }


  const countStatus =
    (status) =>
      results.filter(
        (result) =>
          result.status ===
          status
      ).length;


  const successfulStatuses =
    executeMode
      ? new Set([
          'uploaded_and_verified',
          'already_verified'
        ])
      : new Set([
          'ready'
        ]);


  const failedResults =
    results.filter(
      (result) =>
        !successfulStatuses.has(
          result.status
        )
    );


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

    summary: {
      applications:
        results.length,

      ready:
        countStatus(
          'ready'
        ),

      uploadedAndVerified:
        countStatus(
          'uploaded_and_verified'
        ),

      alreadyVerified:
        countStatus(
          'already_verified'
        ),

      missingLocal:
        countStatus(
          'missing_local_file'
        ),

      sizeMismatch:
        countStatus(
          'size_mismatch'
        ),

      invalidStorageKey:
        countStatus(
          'invalid_storage_key'
        ),

      invalidPdfSignature:
        countStatus(
          'invalid_pdf_signature'
        ),

      r2Conflict:
        countStatus(
          'r2_conflict'
        ),

      verificationFailed:
        countStatus(
          'verification_failed'
        ),

      failed:
        failedResults.length
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
    `Report: ${reportPath}`
  );


  if (
    failedResults.length >
    0
  ) {
    process.exitCode =
      1;

    console.error('');
    console.error(
      'Migration did not fully pass. Do not switch the website to R2.'
    );

    return;
  }


  if (executeMode) {
    console.log('');
    console.log(
      'Every existing résumé was verified in private R2.'
    );

    console.log(
      'Local originals were NOT deleted.'
    );

    console.log(
      'Database records were NOT modified.'
    );
  } else {
    console.log('');
    console.log(
      'Dry run passed. No R2 objects were created.'
    );
  }
}


main()
  .catch(
    (error) => {
      console.error(
        'Résumé migration failed:',
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