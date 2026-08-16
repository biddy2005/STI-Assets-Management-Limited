const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fs = require('fs/promises');
const {
  requireAuth,
  requireRole
} = require('../middleware/auth.middleware');
const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);
const prisma = require('../config/db');
const {
  writeAuditLog
} = require(
  '../services/audit.service'
);
const allowedContactStatuses =
  new Set([
    'NEW',
    'IN_PROGRESS',
    'RESOLVED',
    'ARCHIVED'
  ]);
const allowedApplicationStatuses =
  new Set([
    'NEW',
    'REVIEWING',
    'SHORTLISTED',
    'REJECTED',
    'HIRED'
  ]);

const {
  newsUploadDirectory
} = require(
  '../config/storage'
);

const {
  savePublicFile,
  deletePublicFile,
  getPrivateFile,
  deletePrivateFile
} = require(
  '../services/storage.service'
);
const { DAY_ORDER, DAY_LABELS, getActiveWeekRange, getDateForDay } = require('../utils/digestWeek');
const { slugify } = require('../utils/slugify');
const {
  csrfSynchronisedProtection,
  csrfAfterUpload
} = require(
  '../middleware/csrf.middleware'
);

// Login page (public)
router.get('/login', (req, res) => res.render('admin/login', { error: null }));

// Everything below this line requires a logged-in admin
router.use(requireAuth);

/*
 * Content editors can create and update public website content.
 */
const contentManagerOnly =
  requireRole(
    'SUPERADMIN',
    'EDITOR'
  );

/*
 * Sensitive data and permanent deletion are restricted
 * to SUPERADMIN accounts.
 */
const superAdminOnly =
  requireRole(
    'SUPERADMIN'
  );

/*
 * ============================================================
 * EDITOR ACCOUNT MANAGEMENT
 * ============================================================
 */

const EDITOR_MIN_PASSWORD_LENGTH =
  14;

const EDITOR_MAX_PASSWORD_LENGTH =
  128;

const ADMIN_EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


/*
 * Return only EDITOR accounts.
 *
 * SUPERADMIN accounts are deliberately excluded from the
 * normal Editor-management interface.
 */
async function getEditorAccounts() {

  return prisma.admin.findMany({

    where: {
      role:
        'EDITOR'
    },

    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      failedLogins: true,
      lockedUntil: true,
      lastLoginAt: true,
      sessionVersion: true,
      createdAt: true,
      updatedAt: true
    },

    orderBy: {
      email:
        'asc'
    }

  });

}


/*
 * Re-render the Editor-management page after validation
 * failures.
 */
async function renderEditorManager(
  res,
  {
    error = null,
    success = null,
    status = 200
  } = {}
) {

  const editors =
    await getEditorAccounts();


  return res
    .status(status)
    .render(
      'admin/editor-manager',
      {
        editors,
        error,
        success
      }
    );

}


  /*
 * Only these image formats are accepted for news cover and
 * gallery uploads.
 */
const allowedImageMimeTypes =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);

/*
 * The original file extension must agree with the submitted
 * MIME type.
 */
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

/*
 * Use one consistent stored extension for each accepted image
 * MIME type.
 */
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

/**
 * Confirms that an image's extension agrees with its submitted
 * MIME type.
 *
 * This is only the first validation layer. The actual file
 * bytes are inspected after Multer stores the file.
 */
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

/**
 * Reads only the beginning of a file.
 *
 * File signatures are stored in the first few bytes, so the
 * complete upload does not need to be loaded into memory.
 */
async function readFileHeader(
  filePath,
  numberOfBytes
) {
  let fileHandle;

  try {
    fileHandle =
      await fs.open(
        filePath,
        'r'
      );

    const buffer =
      Buffer.alloc(
        numberOfBytes
      );

    const {
      bytesRead
    } = await fileHandle.read(
      buffer,
      0,
      numberOfBytes,
      0
    );

    return buffer.subarray(
      0,
      bytesRead
    );
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (closeError) {
        console.error(
          'Could not close uploaded file after inspection:',
          closeError
        );
      }
    }
  }
}

/**
 * Confirms that a stored digest starts with the normal PDF
 * signature:
 *
 * %PDF-
 */
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
      .subarray(0, 5)
      .toString('ascii') ===
      '%PDF-'
  );
}

/**
 * Detects JPEG, PNG or WebP using the file's opening bytes.
 *
 * Returns:
 *
 * image/jpeg
 * image/png
 * image/webp
 * null
 */
async function detectImageMimeType(
  fileSource
) {
  let header;

  /*
   * Memory-backed uploads, such as the R2 Rate Guide flow,
   * already have their bytes available in a Buffer.
   */
  if (
    Buffer.isBuffer(
      fileSource
    )
  ) {
    header =
      fileSource.subarray(
        0,
        12
      );
  } else if (
    /*
     * Existing News uploads still use disk storage for now.
     * Keep supporting their filesystem path until Parts
     * 19C and 19D migrate them as well.
     */
    typeof fileSource ===
      'string' &&
    fileSource
  ) {
    header =
      await readFileHeader(
        fileSource,
        12
      );
  } else {
    return null;
  }

  /*
   * JPEG:
   *
   * FF D8 FF
   */
  const isJpeg =
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff;

  if (isJpeg) {
    return 'image/jpeg';
  }

  /*
   * PNG:
   *
   * 89 50 4E 47 0D 0A 1A 0A
   */
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

  /*
   * WebP:
   *
   * Bytes 0-3: RIFF
   * Bytes 8-11: WEBP
   */
  const isWebp =
    header.length >= 12 &&
    header
      .subarray(0, 4)
      .toString('ascii') ===
      'RIFF' &&
    header
      .subarray(8, 12)
      .toString('ascii') ===
      'WEBP';

  if (isWebp) {
    return 'image/webp';
  }

  return null;
}

/**
 * The detected image format must match the MIME type accepted
 * by the Multer metadata filter.
 */
async function hasMatchingImageSignature(
  file
) {
  if (!file) {
    return false;
  }

  /*
   * Prefer the in-memory Buffer when Multer uses memoryStorage.
   *
   * Fall back to file.path so the existing News routes continue
   * working until their own R2 migration.
   */
  const fileSource =
    Buffer.isBuffer(
      file.buffer
    )
      ? file.buffer
      : file.path;

  if (!fileSource) {
    return false;
  }

  const detectedMimeType =
    await detectImageMimeType(
      fileSource
    );

  return (
    detectedMimeType ===
    file.mimetype
  );
}

/**
 * Deletes one file.
 *
 * A missing file is treated as already deleted.
 */
async function deleteFileIfExists(
  filePath
) {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Converts either one Multer file or an array of Multer files
 * into an array and removes every uploaded file.
 */
async function deleteMulterFiles(
  files
) {
  const fileList =
    Array.isArray(files)
      ? files
      : [files].filter(Boolean);

  await Promise.all(
    fileList.map((file) => {
      return deleteFileIfExists(
        file?.path
      );
    })
  );
}

/**
 * Attempts to clean newly uploaded files without replacing
 * the original route error with a cleanup error.
 */
async function deleteMulterFilesSafely(
  files,
  context
) {
  try {
    await deleteMulterFiles(files);
  } catch (cleanupError) {
    console.error(
      context,
      cleanupError
    );
  }
}

/**
 * Converts a stored public URL such as:
 *
 * /uploads/news/example.jpg
 *
 * into the corresponding physical file path.
 *
 * path.posix.basename keeps only the filename portion and
 * prevents directory traversal.
 */
function storedUrlToFilePath(
  storedUrl,
  uploadDirectory
) {
  if (
    typeof storedUrl !== 'string' ||
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

/**
 * Removes an old stored file after the database has already
 * been updated successfully.
 *
 * Cleanup failure is logged but does not make a successful
 * database operation appear unsuccessful to the administrator.
 */
async function deleteStoredFileSafely(
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
    console.error(
      context,
      {
        filePath,
        error: cleanupError
      }
    );
  }
}

/**
 * Extract the generated filename from a stored public URL or
 * local public path.
 *
 * Examples:
 *
 * /uploads/digests/example.pdf
 * https://assets.example.com/digests/example.pdf
 *
 * both become:
 *
 * example.pdf
 */
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
      new URL(pathname)
        .pathname;
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

/**
 * Remove one public file through the storage abstraction
 * without turning a successful database operation into an
 * error when cleanup fails.
 */
async function deletePublicFileSafely({
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
    console.error(
      context,
      {
        category,
        storageKey,
        error:
          cleanupError
      }
    );
  }
}
/**
 * Remove a News image from whichever storage backend originally
 * produced its browser-facing URL.
 *
 * During the R2 migration period, historical News cover/gallery
 * images may still use /uploads/news/... while newly uploaded
 * images use the public R2 bucket.
 */
async function deleteNewsAssetSafely(
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
      storedUrl,
      newsUploadDirectory,
      context
    );

    return;
  }

  /*
   * R2-backed News image.
   */
  const storageKey =
    storedPublicUrlToStorageKey(
      storedUrl
    );

  await deletePublicFileSafely({
    category:
      'news',

    storageKey,

    context
  });
}

router.get(
  '/dashboard',

  (req, res) => {
    return res.render(
      'admin/dashboard',
      {
        admin:
          res.locals.admin
      }
    );
  }
);

/*
 * ============================================================
 * EDITOR MANAGEMENT PAGE
 * ============================================================
 */

router.get(
  '/editors',

  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    const successCode =
      typeof req.query.success ===
      'string'
        ? req.query.success
        : '';


    const successMessages = {

      created:
        'Editor account created successfully.',

      status:
        'Editor account status updated successfully.',

      password:
        'Editor password updated successfully.',

      unlocked:
        'Editor account unlocked successfully.'

    };


    return renderEditorManager(
      res,
      {
        success:
          successMessages[
            successCode
          ] || null
      }
    );

  })
);

router.post(
  '/editors',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const submittedEmail =
      typeof req.body.email ===
      'string'
        ? req.body.email
            .trim()
            .toLowerCase()
        : '';


    const email =
      submittedEmail.length <=
        254
        ? submittedEmail
        : '';


    const password =
      typeof req.body.password ===
      'string'
        ? req.body.password
        : '';


    const confirmPassword =
      typeof req.body.confirmPassword ===
      'string'
        ? req.body.confirmPassword
        : '';


    /*
     * Validate email.
     */
    if (
      !email ||
      !ADMIN_EMAIL_PATTERN.test(
        email
      )
    ) {

      return renderEditorManager(
        res,
        {
          error:
            'Please provide a valid email address.',

          status:
            400
        }
      );

    }


    /*
     * Validate password length.
     */
    if (
      password.length <
        EDITOR_MIN_PASSWORD_LENGTH ||
      password.length >
        EDITOR_MAX_PASSWORD_LENGTH
    ) {

      return renderEditorManager(
        res,
        {
          error:
            'The password must be between 14 and 128 characters.',

          status:
            400
        }
      );

    }


    if (
      password !==
      confirmPassword
    ) {

      return renderEditorManager(
        res,
        {
          error:
            'The passwords do not match.',

          status:
            400
        }
      );

    }


    /*
     * Prevent duplicate administrator emails.
     */
    const existingAdmin =
      await prisma.admin.findUnique({

        where: {
          email
        },

        select: {
          id:
            true
        }

      });


    if (existingAdmin) {

      return renderEditorManager(
        res,
        {
          error:
            'An administrator account already exists with that email address.',

          status:
            400
        }
      );

    }


    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );


    try {

      await prisma.$transaction(
        async (
          transaction
        ) => {

          const editor =
            await transaction
              .admin
              .create({

                data: {
                  email,

                  passwordHash,

                  /*
                   * Role is assigned by the server.
                   *
                   * The browser is never permitted to choose
                   * SUPERADMIN.
                   */
                  role:
                    'EDITOR',

                  isActive:
                    true,

                  sessionVersion:
                    0
                }

              });


          await writeAuditLog({

            client:
              transaction,

            req,

            action:
              'EDITOR_ACCOUNT_CREATED',

            entityType:
              'Admin',

            entityId:
              editor.id,

            metadata: {
              targetEmail:
                editor.email,

              role:
                editor.role,

              isActive:
                editor.isActive
            }

          });

        }
      );

    } catch (error) {

      /*
       * A second request may theoretically create the same
       * email between the earlier lookup and this insert.
       */
      if (
        error?.code ===
        'P2002'
      ) {

        return renderEditorManager(
          res,
          {
            error:
              'An administrator account already exists with that email address.',

            status:
              400
          }
        );

      }


      throw error;

    }


    return res.redirect(
      '/admin/editors?success=created'
    );

  })
);

/*
 * ============================================================
 * ACTIVATE / DEACTIVATE EDITOR
 * ============================================================
 */

router.post(
  '/editors/:id/status',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const editorId =
      Number(
        req.params.id
      );


    const submittedStatus =
      typeof req.body.status ===
      'string'
        ? req.body.status.trim()
        : '';


    if (
      !Number.isInteger(
        editorId
      ) ||
      editorId < 1
    ) {

      return res.status(400).send(
        'Invalid Editor ID.'
      );

    }


    if (
      submittedStatus !== 'active' &&
      submittedStatus !== 'inactive'
    ) {

      return res.status(400).send(
        'Invalid account status.'
      );

    }


    const editor =
      await prisma.admin.findUnique({

        where: {
          id:
            editorId
        }

      });


    /*
     * Never allow this route to modify a SUPERADMIN.
     */
    if (
      !editor ||
      editor.role !==
        'EDITOR'
    ) {

      return res.status(404).send(
        'Editor account not found.'
      );

    }


    const nextIsActive =
      submittedStatus ===
      'active';


    /*
     * Nothing needs changing.
     */
    if (
      editor.isActive ===
      nextIsActive
    ) {

      return res.redirect(
        '/admin/editors?success=status'
      );

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .admin
          .update({

            where: {
              id:
                editor.id
            },

            data: {

              isActive:
                nextIsActive,

              /*
               * Immediately invalidate all sessions belonging
               * to this Editor.
               */
              sessionVersion: {
                increment:
                  1
              }

            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'EDITOR_STATUS_UPDATED',

          entityType:
            'Admin',

          entityId:
            editor.id,

          metadata: {

            targetEmail:
              editor.email,

            previousIsActive:
              editor.isActive,

            newIsActive:
              nextIsActive

          }

        });

      }
    );


    return res.redirect(
      '/admin/editors?success=status'
    );

  })
);

/*
 * ============================================================
 * RESET EDITOR PASSWORD
 * ============================================================
 */

router.post(
  '/editors/:id/password',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const editorId =
      Number(
        req.params.id
      );


    const password =
      typeof req.body.password ===
      'string'
        ? req.body.password
        : '';


    const confirmPassword =
      typeof req.body.confirmPassword ===
      'string'
        ? req.body.confirmPassword
        : '';


    if (
      !Number.isInteger(
        editorId
      ) ||
      editorId < 1
    ) {

      return res.status(400).send(
        'Invalid Editor ID.'
      );

    }


    if (
      password.length <
        EDITOR_MIN_PASSWORD_LENGTH ||
      password.length >
        EDITOR_MAX_PASSWORD_LENGTH
    ) {

      return renderEditorManager(
        res,
        {
          error:
            'The new password must be between 14 and 128 characters.',

          status:
            400
        }
      );

    }


    if (
      password !==
      confirmPassword
    ) {

      return renderEditorManager(
        res,
        {
          error:
            'The new passwords do not match.',

          status:
            400
        }
      );

    }


    const editor =
      await prisma.admin.findUnique({

        where: {
          id:
            editorId
        }

      });


    if (
      !editor ||
      editor.role !==
        'EDITOR'
    ) {

      return res.status(404).send(
        'Editor account not found.'
      );

    }


    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .admin
          .update({

            where: {
              id:
                editor.id
            },

            data: {

              passwordHash,

              /*
               * A password reset should also recover an
               * account that was locked by failed logins.
               */
              failedLogins:
                0,

              lockedUntil:
                null,

              /*
               * Log the Editor out of every existing session.
               */
              sessionVersion: {
                increment:
                  1
              }

            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'EDITOR_PASSWORD_UPDATED',

          entityType:
            'Admin',

          entityId:
            editor.id,

          metadata: {

            targetEmail:
              editor.email

          }

        });

      }
    );


    return res.redirect(
      '/admin/editors?success=password'
    );

  })
);

/*
 * ============================================================
 * UNLOCK EDITOR ACCOUNT
 * ============================================================
 */

router.post(
  '/editors/:id/unlock',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const editorId =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        editorId
      ) ||
      editorId < 1
    ) {

      return res.status(400).send(
        'Invalid Editor ID.'
      );

    }


    const editor =
      await prisma.admin.findUnique({

        where: {
          id:
            editorId
        }

      });


    if (
      !editor ||
      editor.role !==
        'EDITOR'
    ) {

      return res.status(404).send(
        'Editor account not found.'
      );

    }


    /*
     * Account is already clean.
     */
    if (
      !editor.lockedUntil &&
      editor.failedLogins === 0
    ) {

      return res.redirect(
        '/admin/editors?success=unlocked'
      );

    }


    await prisma.$transaction(
      async (
        transaction
      ) => {

        await transaction
          .admin
          .update({

            where: {
              id:
                editor.id
            },

            data: {

              failedLogins:
                0,

              lockedUntil:
                null,

              sessionVersion: {
                increment:
                  1
              }

            }

          });


        await writeAuditLog({

          client:
            transaction,

          req,

          action:
            'EDITOR_ACCOUNT_UNLOCKED',

          entityType:
            'Admin',

          entityId:
            editor.id,

          metadata: {

            targetEmail:
              editor.email,

            previousFailedLogins:
              editor.failedLogins,

            previousLockedUntil:
              editor.lockedUntil

          }

        });

      }
    );


    return res.redirect(
      '/admin/editors?success=unlocked'
    );

  })
);

// --- Daily Digest uploads ---
const uploadDigest =
  multer({
    /*
     * Keep the PDF in memory until validation succeeds.
     * The storage abstraction then writes it to either local
     * storage or the configured R2 public bucket.
     */
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
      files: 1
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
        extension === '.pdf';

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
  '/downloads',

  /*
   * Editors and superadmins can manage daily digests.
   */
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const {
      weekStart,
      weekEnd
    } = getActiveWeekRange();

    const digests =
      await prisma.dailyDigest.findMany({
        where: {
          publishDate: {
            gte: weekStart,
            lte: weekEnd
          }
        },

        orderBy: {
          publishDate: 'asc'
        }
      });

    const byDay = {};

    digests.forEach((digest) => {
      byDay[digest.dayOfWeek] =
        digest;
    });

    const days =
      DAY_ORDER.map((day) => ({
        key: day,
        label: DAY_LABELS[day],
        digest: byDay[day] || null
      }));

    return res.render(
      'admin/downloads-manager',
      {
        days,
        error: null
      }
    );
  })
);

router.post(
  '/downloads',
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

  asyncHandler(async (req, res) => {
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
    } = getActiveWeekRange();

    const publishDate =
      getDateForDay(
        weekStart,
        dayOfWeek
      );

    const storageKey =
      `${crypto.randomUUID()}.pdf`;

    /*
     * savePublicFile() decides whether this goes to the local
     * public uploads folder or the configured R2 public bucket.
     */
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

    let previousFileUrl = null;

    try {
      const existing =
        await prisma.dailyDigest.findFirst({
          where: {
            dayOfWeek,
            publishDate
          }
        });

      if (existing) {
        /*
         * Save the old path before updating the database.
         */
        previousFileUrl =
          existing.filePath;

        await prisma.$transaction(
          async (transaction) => {
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
          async (transaction) => {
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
      /*
       * The new PDF has already been persisted through the
       * storage abstraction. If the database operation fails,
       * remove that new object/file so it does not become an
       * orphan.
       */
      await deletePublicFileSafely({
        category:
          'digests',

        storageKey:
          savedFile.storageKey,

        context:
          'Could not remove digest after database failure:'
      });

      throw error;
    }

    /*
     * The database now points to the new PDF. Remove the old
     * object only after the database update succeeds.
     */
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
        category:
          'digests',

        storageKey:
          previousStorageKey,

        context:
          'Digest was replaced, but the previous PDF could not be removed:'
      });
    }

    return res.redirect(
      '/admin/downloads'
    );
  })
);

router.post(
  '/downloads/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const digestId =
      Number(req.params.id);

    if (
      !Number.isInteger(digestId) ||
      digestId < 1
    ) {
      return res.status(400).send(
        'Invalid digest ID.'
      );
    }

    /*
     * Retrieve the record before deleting it because we need
     * its filePath to locate the stored PDF afterward.
     */
    const digest =
      await prisma.dailyDigest.findUnique({
        where: {
          id: digestId
        }
      });

    if (!digest) {
      return res.status(404).send(
        'Daily digest not found.'
      );
    }

    /*
     * Delete the database record first. If this operation fails,
     * asyncHandler forwards the error and the stored PDF remains
     * available.
     */
    await prisma.$transaction(
      async (transaction) => {
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
     * The database deletion succeeded. Remove the PDF through
     * the storage abstraction. Cleanup failure is logged without
     * changing the successful database result into a 500 error.
     */
    const storageKey =
      storedPublicUrlToStorageKey(
        digest.filePath
      );

    await deletePublicFileSafely({
      category:
        'digests',

      storageKey,

      context:
        'Digest record was deleted, but its PDF could not be removed:'
    });

    return res.redirect(
      '/admin/downloads'
    );
  })
);

// --- News & Articles ---
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
 * Cover images remain in memory until their actual file
 * signature has been validated.
 *
 * savePublicFile() then sends the validated image to either
 * local public storage or R2 depending on STORAGE_DRIVER.
 */
const uploadCoverImage =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      /*
       * Maximum cover image size: 5 MB.
       */
      fileSize:
        5 * 1024 * 1024,

      files: 1
    },

    fileFilter:
      imageFileFilter
  });

/*
 * Gallery images follow the same memory-first flow as News
 * cover images.
 *
 * Nothing is persisted until every selected image passes
 * validation.
 */
const uploadGalleryImages =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      /*
       * Maximum size per gallery image: 5 MB.
       */
      fileSize:
        5 * 1024 * 1024,

      /*
       * Maximum number of gallery images per upload request.
       */
      files: 10
    },

    fileFilter:
      imageFileFilter
  });

/*
 * Rate Guide uploads stay in memory until validation succeeds.
 *
 * The storage abstraction then writes the validated image to
 * either local public storage or the configured R2 bucket.
 */
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

      files: 1
    },

    /*
     * Reuse the same secure JPEG / PNG / WebP metadata
     * validation used by News images.
     */
    fileFilter:
      imageFileFilter
  });

/*
 * ============================================================
 * RATE GUIDE MANAGEMENT
 * ============================================================
 */

router.get(
  '/rate-guide',

  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const rateGuide =
      await prisma.rateGuide.findUnique({
        where: {
          id: 1
        }
      });


    return res.render(
      'admin/rate-guide-manager',
      {
        rateGuide,

        error:
          null,

        success:
          req.query.updated === '1'
      }
    );
  })
);

router.post(
  '/rate-guide',

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

  asyncHandler(async (req, res) => {

    /*
     * An image is required whenever this form is submitted.
     */
    if (!req.file) {
      const rateGuide =
        await prisma.rateGuide.findUnique({
          where: {
            id: 1
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
            id: 1
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

    /*
     * The storage abstraction decides whether this is written
     * locally or to the public R2 bucket.
     */
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
            id: 1
          }
        });

      previousImageUrl =
        existing?.imageUrl || null;

      /*
       * Update the Rate Guide and create its audit record in
       * the same PostgreSQL transaction.
       */
      await prisma.$transaction(
        async (transaction) => {

          const savedRateGuide =
            await transaction
              .rateGuide
              .upsert({
                where: {
                  id: 1
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
                  id: 1,

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
       * The new image has already been persisted through the
       * storage abstraction.
       *
       * If PostgreSQL fails, remove the new file/object so it
       * does not become orphaned.
       */
      await deletePublicFileSafely({
        category:
          'rateGuide',

        storageKey:
          savedFile.storageKey,

        context:
          'Could not remove Rate Guide after database failure:'
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
        category:
          'rateGuide',

        storageKey:
          previousStorageKey,

        context:
          'Rate Guide was replaced, but the previous image could not be removed:'
      });
    }

    return res.redirect(
      '/admin/rate-guide?updated=1'
    );
  })
);

router.get(
  '/news',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const articles =
      await prisma.newsArticle.findMany({
        orderBy: {
          createdAt: 'desc'
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
  '/news/new',
  contentManagerOnly,
  (req, res) => {
    return res.render(
      'admin/news-form',
      {
        article: null,
        error: null
      }
    );
  }
);

router.post(
  '/news',
  contentManagerOnly,

  /*
   * Parse the multipart form and keep the optional cover image
   * in req.file.buffer.
   */
  uploadCoverImage.single(
    'coverImage'
  ),

  csrfAfterUpload,

  asyncHandler(async (req, res) => {
    const title =
      typeof req.body.title ===
        'string'
        ? req.body.title.trim()
        : '';

    const body =
      typeof req.body.body ===
        'string'
        ? req.body.body.trim()
        : '';

    const isPublished =
      req.body.published ===
      'on';

    /*
     * Nothing has been persisted yet because the cover image
     * exists only in memory.
     */
    if (!title || !body) {
      return res.status(400).render(
        'admin/news-form',
        {
          article: null,

          error:
            'Article title and body are required.'
        }
      );
    }

    /*
     * The Multer file filter has already checked extension and
     * submitted MIME type.
     *
     * Now inspect the actual bytes before storing anything.
     */
    if (req.file) {
      const coverImageIsValid =
        await hasMatchingImageSignature(
          req.file
        );

      if (!coverImageIsValid) {
        return res.status(400).render(
          'admin/news-form',
          {
            article: null,

            error:
              'The cover file is not a valid JPEG, PNG or WebP image.'
          }
        );
      }
    }

    /*
     * Generate and validate the slug before uploading the cover
     * so invalid articles do not create unnecessary R2 objects.
     */
    const baseSlug =
      slugify(title);

    if (!baseSlug) {
      return res.status(400).render(
        'admin/news-form',
        {
          article: null,

          error:
            'The article title must contain valid letters or numbers.'
        }
      );
    }

    let slug =
      baseSlug;

    let counter = 1;

    while (
      await prisma.newsArticle.findUnique({
        where: {
          slug
        }
      })
    ) {
      slug =
        `${baseSlug}-${counter}`;

      counter += 1;
    }

    let savedCoverFile =
      null;

    try {
      /*
       * The cover image is optional.
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
        async (transaction) => {
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
      /*
       * If R2 succeeded but PostgreSQL failed, remove the newly
       * created cover so it does not become an orphan.
       */
      if (savedCoverFile) {
        await deletePublicFileSafely({
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
  '/news/:id/edit',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    if (
      !Number.isInteger(articleId) ||
      articleId < 1
    ) {
      return res.redirect(
        '/admin/news'
      );
    }

    const article =
      await prisma.newsArticle.findUnique({
        where: {
          id: articleId
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
        error: null
      }
    );
  })
);

router.post(
  '/news/:id',
  contentManagerOnly,

  uploadCoverImage.single(
    'coverImage'
  ),

  csrfAfterUpload,

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    const title =
      typeof req.body.title ===
        'string'
        ? req.body.title.trim()
        : '';

    const body =
      typeof req.body.body ===
        'string'
        ? req.body.body.trim()
        : '';

    const isNowPublished =
      req.body.published ===
      'on';

    /*
     * The replacement cover is still only in memory here, so
     * invalid requests require no filesystem cleanup.
     */
    if (
      !Number.isInteger(articleId) ||
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

    if (!title || !body) {
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
            'Article title and body are required.'
        }
      );
    }

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
        async (transaction) => {
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
  '/news/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    if (
      !Number.isInteger(articleId) ||
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

    /*
     * Gallery images are still local during Part 19C.
     */
    const galleryImageUrls =
      article.images
        .map(
          (image) =>
            image.imageUrl
        )
        .filter(Boolean);

    /*
     * Remove the database records atomically.
     */
    await prisma.$transaction(
      async (transaction) => {
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
 * Both cover and gallery images now use the News public
 * storage abstraction.
 *
 * deleteNewsAssetSafely() also understands historical
 * /uploads/news/... URLs, so older local News assets remain
 * safely deletable during the migration period.
 */
await Promise.all([
  deleteNewsAssetSafely(
    article.coverImage,
    'Article record was deleted, but its cover image could not be removed:'
  ),

  ...galleryImageUrls.map(
    (storedImageUrl) => {
      return deleteNewsAssetSafely(
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

// --- News gallery management ---
router.get(
  '/news/:id/images',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    if (
      !Number.isInteger(articleId) ||
      articleId < 1
    ) {
      return res.redirect(
        '/admin/news'
      );
    }

    const article =
      await prisma.newsArticle.findUnique({
        where: {
          id: articleId
        },

        include: {
          images: {
            orderBy: {
              order: 'asc'
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
        error: null
      }
    );
  })
);

router.post(
  '/news/:id/images',
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

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    const files =
      Array.isArray(req.files)
        ? req.files
        : [];

    /*
     * No file has been persisted yet.
     *
     * Invalid requests therefore require no storage cleanup.
     */
    if (
      !Number.isInteger(articleId) ||
      articleId < 1
    ) {
      return res.status(400).send(
        'Invalid article ID.'
      );
    }

    if (files.length === 0) {
      return res.status(400).send(
        'Please select at least one image.'
      );
    }

    /*
     * Multer has already checked extension and submitted MIME
     * type.
     *
     * Now validate the actual bytes of every image before any
     * R2 object is created.
     */
    const galleryValidationResults =
      await Promise.all(
        files.map(
          (file) => {
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

    /*
     * Confirm the parent article exists before uploading
     * anything to R2.
     */
    const article =
      await prisma.newsArticle.findUnique({
        where: {
          id:
            articleId
        },

        select: {
          id: true
        }
      });

    if (!article) {
      return res.status(404).send(
        'News article not found.'
      );
    }

    /*
     * Preserve the existing gallery ordering behaviour.
     */
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

    /*
     * Keep track of every successfully uploaded object.
     *
     * If a later upload or PostgreSQL operation fails, these
     * objects can all be rolled back.
     */
    const savedGalleryFiles =
      [];

    try {
      /*
       * Upload sequentially.
       *
       * This gives us deterministic cleanup if, for example,
       * image 1 and image 2 succeed but image 3 fails.
       */
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
      /*
       * An R2 upload failed partway through the batch.
       *
       * Remove any images that were already successfully
       * uploaded before rethrowing the error.
       */
      await Promise.all(
        savedGalleryFiles.map(
          (savedFile) => {
            return deletePublicFileSafely({
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
      /*
       * Create every gallery database record and the audit
       * event atomically.
       */
      await prisma.$transaction(
        async (transaction) => {
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
      /*
       * PostgreSQL rolled back all gallery rows.
       *
       * Remove the newly uploaded R2 objects so they do not
       * become orphaned.
       */
      await Promise.all(
        savedGalleryFiles.map(
          (savedFile) => {
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
  '/news/:id/images/:imageId/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const articleId =
      Number(req.params.id);

    const imageId =
      Number(req.params.imageId);

    if (
      !Number.isInteger(articleId) ||
      articleId < 1
    ) {
      return res.status(400).send(
        'Invalid article ID.'
      );
    }

    if (
      !Number.isInteger(imageId) ||
      imageId < 1
    ) {
      return res.status(400).send(
        'Invalid image ID.'
      );
    }

    /*
     * Confirm that:
     *
     * 1. The image exists.
     * 2. The image belongs to the article in the URL.
     */
    const image =
      await prisma.newsImage.findFirst({
        where: {
          id: imageId,
          newsArticleId:
            articleId
        }
      });

    if (!image) {
      return res.status(404).send(
        'News gallery image not found.'
      );
    }

    /*
     * Delete the database record first.
     */
await prisma.$transaction(
  async (transaction) => {
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
    /*
    * The database deletion succeeded.
    *
    * Remove the image through the News storage-aware helper.
    * This supports both new R2 gallery URLs and historical local
    * /uploads/news/... gallery URLs.
    */
    await deleteNewsAssetSafely(
      image.imageUrl,
      'Gallery image record was deleted, but its stored image could not be removed:'
    );

    return res.redirect(
      `/admin/news/${articleId}/images`
    );
  })
);

// --- Job Postings ---
router.get(
  '/jobs',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const jobs =
      await prisma.jobPosting.findMany({
        orderBy: {
          createdAt: 'desc'
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
  '/jobs/new',
  contentManagerOnly,
  (req, res) => {
    return res.render(
      'admin/jobs-form',
      {
        job: null,
        error: null
      }
    );
  }
);

router.post(
  '/jobs',
  contentManagerOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const title =
      typeof req.body.title === 'string'
        ? req.body.title.trim()
        : '';

    const department =
      typeof req.body.department === 'string'
        ? req.body.department.trim()
        : '';

    const location =
      typeof req.body.location === 'string'
        ? req.body.location.trim()
        : '';

    const description =
      typeof req.body.description === 'string'
        ? req.body.description.trim()
        : '';

    const responsibilities =
      typeof req.body.responsibilities === 'string'
    ? req.body.responsibilities.trim() || null
    : null;

    const qualifications =
      typeof req.body.qualifications === 'string'
        ? req.body.qualifications.trim() || null
        : null;

    const experience =
      typeof req.body.experience === 'string'
        ? req.body.experience.trim() || null
        : null;

    const competencies =
      typeof req.body.competencies === 'string'
        ? req.body.competencies.trim() || null
        : null;

    const jobCategory =
      typeof req.body.jobCategory === 'string'
        ? req.body.jobCategory.trim() || null
        : null;

    const jobType =
      typeof req.body.jobType === 'string'
        ? req.body.jobType.trim() || null
        : null;
        
    const deadline =
      typeof req.body.deadline === 'string'
        ? req.body.deadline.trim()
        : '';

    const submittedStatus =
      typeof req.body.status === 'string'
        ? req.body.status.trim()
        : '';

    if (
      !title ||
      !department ||
      !location ||
      !description
    ) {
      return res.status(400).render(
        'admin/jobs-form',
        {
          job: null,
          error:
            'Title, department, location and description are required.'
        }
      );
    }

    let parsedDeadline = null;

    if (deadline) {
      parsedDeadline =
        new Date(deadline);

      if (
        Number.isNaN(
          parsedDeadline.getTime()
        )
      ) {
        return res.status(400).render(
          'admin/jobs-form',
          {
            job: null,
            error:
              'Please provide a valid application deadline.'
          }
        );
      }
    }

await prisma.$transaction(
  async (transaction) => {
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
  '/jobs/:id/edit',
  contentManagerOnly,

  asyncHandler(async (req, res) => {
    const jobId =
      Number(req.params.id);

    if (
      !Number.isInteger(jobId) ||
      jobId < 1
    ) {
      return res.redirect(
        '/admin/jobs'
      );
    }

    const job =
      await prisma.jobPosting.findUnique({
        where: {
          id: jobId
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
        error: null
      }
    );
  })
);

router.post(
  '/jobs/:id',
  contentManagerOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const jobId =
      Number(req.params.id);

    if (
      !Number.isInteger(jobId) ||
      jobId < 1
    ) {
      return res.status(400).send(
        'Invalid job ID.'
      );
    }

    const existingJob =
      await prisma.jobPosting.findUnique({
        where: {
          id: jobId
        }
      });

    if (!existingJob) {
      return res.status(404).send(
        'Job posting not found.'
      );
    }

    const title =
      typeof req.body.title === 'string'
        ? req.body.title.trim()
        : '';

    const department =
      typeof req.body.department === 'string'
        ? req.body.department.trim()
        : '';

    const location =
      typeof req.body.location === 'string'
        ? req.body.location.trim()
        : '';

    const description =
      typeof req.body.description === 'string'
        ? req.body.description.trim()
        : '';

    const responsibilities =
      typeof req.body.responsibilities === 'string'
        ? req.body.responsibilities.trim() || null
        : null;

    const qualifications =
      typeof req.body.qualifications === 'string'
        ? req.body.qualifications.trim() || null
        : null;

    const experience =
      typeof req.body.experience === 'string'
        ? req.body.experience.trim() || null
        : null;

    const competencies =
      typeof req.body.competencies === 'string'
        ? req.body.competencies.trim() || null
        : null;

    const jobCategory =
      typeof req.body.jobCategory === 'string'
        ? req.body.jobCategory.trim() || null
        : null;

    const jobType =
      typeof req.body.jobType === 'string'
        ? req.body.jobType.trim() || null
        : null;

    const deadline =
      typeof req.body.deadline === 'string'
        ? req.body.deadline.trim()
        : '';

    const submittedStatus =
      typeof req.body.status === 'string'
        ? req.body.status.trim()
        : '';

    if (
      !title ||
      !department ||
      !location ||
      !description
    ) {
      return res.status(400).render(
        'admin/jobs-form',
        {
          job: existingJob,
          error:
            'Title, department, location and description are required.'
        }
      );
    }

    let parsedDeadline = null;

    if (deadline) {
      parsedDeadline =
        new Date(deadline);

      if (
        Number.isNaN(
          parsedDeadline.getTime()
        )
      ) {
        return res.status(400).render(
          'admin/jobs-form',
          {
            job: existingJob,
            error:
              'Please provide a valid application deadline.'
          }
        );
      }
    }

const newStatus =
  submittedStatus === 'open'
    ? 'open'
    : 'closed';

await prisma.$transaction(
  async (transaction) => {
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
  '/jobs/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const jobId =
      Number(req.params.id);

    if (
      !Number.isInteger(jobId) ||
      jobId < 1
    ) {
      return res.status(400).send(
        'Invalid job ID.'
      );
    }

    const job =
      await prisma.jobPosting.findUnique({
        where: {
          id: jobId
        },

        include: {
          _count: {
            select: {
              applications: true
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
      job._count.applications > 0
    ) {
      return res.status(409).send(
        'This job has applications and cannot be deleted. Change its status to closed instead.'
      );
    }

await prisma.$transaction(
  async (transaction) => {
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

// --- Job Applications (read-only, tied to Job Postings) ---
router.get(
  '/applications',
  superAdminOnly,

  asyncHandler(async (req, res) => {
    const rawJobId =
      req.query.jobId;

    let jobIdFilter = null;

    /*
     * Only use the filter when it is a valid positive integer.
     */
    if (rawJobId) {
      const convertedJobId =
        Number(rawJobId);

      if (
        Number.isInteger(convertedJobId) &&
        convertedJobId > 0
      ) {
        jobIdFilter =
          convertedJobId;
      }
    }

    const applications =
      await prisma.jobApplication.findMany({
        where: jobIdFilter
          ? {
              jobId: jobIdFilter
            }
          : {},

        include: {
          job: true
        },

        orderBy: {
          submittedAt: 'desc'
        }
      });

    const jobs =
      await prisma.jobPosting.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });

    return res.render(
      'admin/applications-manager',
      {
        applications,
        jobs,
        jobIdFilter
      }
    );
  })
);

/*
 * Download an applicant's private résumé.
 *
 * Only SUPERADMIN accounts can reach this route.
 *
 * storage.service.js decides whether the file comes from:
 *
 * - storage/private/resumes when STORAGE_DRIVER=local
 * - private Cloudflare R2 when STORAGE_DRIVER=r2
 */
router.get(
  '/applications/:id/resume',
  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {
    const applicationId =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        applicationId
      ) ||
      applicationId < 1
    ) {
      return res.status(400).send(
        'Invalid application ID.'
      );
    }


    const application =
      await prisma
        .jobApplication
        .findUnique({
          where: {
            id:
              applicationId
          }
        });


    if (!application) {
      return res.status(404).render(
        '404',
        {
          title:
            'Application Not Found'
        }
      );
    }


    /*
     * Ask the storage abstraction for the résumé.
     *
     * The route no longer knows or cares whether the file is
     * local or stored in Cloudflare R2.
     */
    let storedResume;


    try {
      storedResume =
        await getPrivateFile({
          storageKey:
            application
              .resumeStorageKey
        });
    } catch (error) {
      /*
       * storage.service.js converts both:
       *
       * local ENOENT
       * R2 404 / NoSuchKey
       *
       * into one application-level error code.
       */
      if (
        error.code ===
          'STORAGE_FILE_NOT_FOUND'
      ) {
        return res.status(404).send(
          'The résumé file could not be found.'
        );
      }


      throw error;
    }


    /*
     * Applicant résumés contain private information and must
     * not be cached by the browser or intermediary proxies.
     */
    res.setHeader(
      'Cache-Control',
      'private, no-store, max-age=0'
    );


    res.setHeader(
      'Pragma',
      'no-cache'
    );


    res.setHeader(
      'X-Content-Type-Options',
      'nosniff'
    );


    /*
     * Preserve the applicant's original filename when the
     * SUPERADMIN downloads the résumé.
     *
     * path.basename() prevents directory information from
     * being included in Content-Disposition.
     */
    const downloadName =
      path.basename(
        application
          .resumeOriginalName ||
        'resume.pdf'
      );


    /*
     * Tell the browser this should be downloaded rather than
     * rendered as a normal website response.
     */
    res.attachment(
      downloadName
    );


    /*
     * Prefer the MIME type recorded when the application was
     * originally accepted.
     */
    res.setHeader(
      'Content-Type',

      application
        .resumeMimeType ||
      storedResume
        .contentType ||
      'application/octet-stream'
    );


    /*
     * The storage abstraction returns a Buffer regardless of
     * whether its source was local disk or private R2.
     */
    return res.send(
      storedResume.body
    );
  })
);

router.post(
  '/applications/:id/status',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const applicationId =
      Number(req.params.id);

    const status =
      typeof req.body.status === 'string'
        ? req.body.status.trim()
        : '';

    if (
      !Number.isInteger(applicationId) ||
      applicationId < 1
    ) {
      return res.status(400).send(
        'Invalid application ID.'
      );
    }

    if (
      !allowedApplicationStatuses.has(
        status
      )
    ) {
      return res.status(400).send(
        'Invalid application status.'
      );
    }

const application =
  await prisma.jobApplication.findUnique({
    where: {
      id:
        applicationId
    },

    select: {
      id: true,
      status: true
    }
  });

    if (!application) {
      return res.status(404).send(
        'Application not found.'
      );
    }

await prisma.$transaction(
  async (transaction) => {
    await transaction
      .jobApplication
      .update({
        where: {
          id:
            applicationId
        },

        data: {
          status
        }
      });

    await writeAuditLog({
      client:
        transaction,

      req,

      action:
        'APPLICATION_STATUS_UPDATED',

      entityType:
        'JobApplication',

      entityId:
        applicationId,

      metadata: {
        previousStatus:
          application.status,

        newStatus:
          status
      }
    });
  }
);

    return res.redirect(
      '/admin/applications'
    );
  })
);

router.post(
  '/applications/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const applicationId =
      Number(req.params.id);

    if (
      !Number.isInteger(applicationId) ||
      applicationId < 1
    ) {
      return res.status(400).send(
        'Invalid application ID.'
      );
    }

    const application =
      await prisma.jobApplication.findUnique({
        where: {
          id: applicationId
        }
      });

    if (!application) {
      return res.status(404).send(
        'Application not found.'
      );
    }

await prisma.$transaction(
  async (transaction) => {
    await transaction
      .jobApplication
      .delete({
        where: {
          id:
            applicationId
        }
      });

    await writeAuditLog({
      client:
        transaction,

      req,

      action:
        'APPLICATION_DELETED',

      entityType:
        'JobApplication',

      entityId:
        applicationId,

      metadata: {
        jobId:
          application.jobId,

        previousStatus:
          application.status,

        originalResumeName:
          application.resumeOriginalName
      }
    });
  }
);

        /*
     * The database deletion and audit event have already
     * succeeded.
     *
     * Remove the applicant's résumé from whichever storage
     * backend is currently configured:
     *
     * local → storage/private/resumes
     * r2    → private Cloudflare R2
     *
     * A storage cleanup failure must not make the successful
     * database deletion appear to have failed.
     */
    try {
      await deletePrivateFile({
        storageKey:
          application
            .resumeStorageKey
      });
    } catch (storageError) {
      req.log.error(
        {
          err:
            storageError,

          applicationId,

          storageKey:
            application
              .resumeStorageKey
        },

        'Application deleted, but résumé storage cleanup failed'
      );
    }

    return res.redirect(
      '/admin/applications'
    );
  })
);

// --- Contact Submissions (read-only) ---
router.get(
  '/contact-submissions',
  superAdminOnly,

  asyncHandler(async (req, res) => {
    const submissions =
      await prisma.contactSubmission.findMany({
        orderBy: {
          submittedAt: 'desc'
        }
      });

    return res.render(
      'admin/contact-submissions',
      {
        submissions
      }
    );
  })
);

router.post(
  '/contact-submissions/:id/status',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const submissionId =
      Number(
        req.params.id
      );

    const status =
      typeof req.body.status ===
      'string'
        ? req.body.status.trim()
        : '';

    if (
      !Number.isInteger(
        submissionId
      ) ||
      submissionId < 1
    ) {
      return res.status(400).send(
        'Invalid contact submission ID.'
      );
    }

    if (
      !allowedContactStatuses.has(
        status
      )
    ) {
      return res.status(400).send(
        'Invalid contact status.'
      );
    }

    const submission =
      await prisma
        .contactSubmission
        .findUnique({
          where: {
            id:
              submissionId
          },

          select: {
            id: true,
            status: true
          }
        });

    if (!submission) {
      return res.status(404).send(
        'Contact submission not found.'
      );
    }

    await prisma.$transaction(
      async (transaction) => {
        await transaction
          .contactSubmission
          .update({
            where: {
              id:
                submissionId
            },

            data: {
              status
            }
          });

        await writeAuditLog({
          client:
            transaction,

          req,

          action:
            'CONTACT_STATUS_UPDATED',

          entityType:
            'ContactSubmission',

          entityId:
            submissionId,

          metadata: {
            previousStatus:
              submission.status,

            newStatus:
              status
          }
        });
      }
    );

    return res.redirect(
      '/admin/contact-submissions'
    );
  })
);

router.post(
  '/contact-submissions/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const submissionId =
      Number(
        req.params.id
      );

    if (
      !Number.isInteger(
        submissionId
      ) ||
      submissionId < 1
    ) {
      return res.status(400).send(
        'Invalid contact submission ID.'
      );
    }

    const submission =
      await prisma
        .contactSubmission
        .findUnique({
          where: {
            id:
              submissionId
          },

          select: {
            id: true,
            subject: true,
            status: true,
            submittedAt: true
          }
        });

    if (!submission) {
      return res.status(404).send(
        'Contact submission not found.'
      );
    }

    await prisma.$transaction(
      async (transaction) => {
        await transaction
          .contactSubmission
          .delete({
            where: {
              id:
                submissionId
            }
          });

        await writeAuditLog({
          client:
            transaction,

          req,

          action:
            'CONTACT_DELETED',

          entityType:
            'ContactSubmission',

          entityId:
            submissionId,

          metadata: {
            subject:
              submission.subject,

            previousStatus:
              submission.status,

            submittedAt:
              submission.submittedAt
          }
        });
      }
    );

    return res.redirect(
      '/admin/contact-submissions'
    );
  })
);

// --- Newsletter Subscribers (read-only) ---
router.get(
  '/newsletter',
  superAdminOnly,

  asyncHandler(async (req, res) => {
    const subscribers =
      await prisma.newsletterSubscriber.findMany({
        orderBy: {
          subscribedAt: 'desc'
        }
      });

    return res.render(
      'admin/newsletter-manager',
      {
        subscribers
      }
    );
  })
);

router.get(
  '/audit-logs',

  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    /*
     * ==========================================================
     * FILTER VALUES
     * ==========================================================
     */

    const action =
      typeof req.query.action ===
      'string'
        ? req.query.action
            .trim()
            .slice(0, 100)
        : '';


    const entityType =
      typeof req.query.entityType ===
      'string'
        ? req.query.entityType
            .trim()
            .slice(0, 100)
        : '';


    const from =
      typeof req.query.from ===
      'string'
        ? req.query.from.trim()
        : '';


    const to =
      typeof req.query.to ===
      'string'
        ? req.query.to.trim()
        : '';


    const submittedAdminId =
      Number(
        req.query.adminId
      );


    const adminId =
      Number.isInteger(
        submittedAdminId
      ) &&
      submittedAdminId > 0
        ? submittedAdminId
        : null;


    /*
     * ==========================================================
     * PAGINATION
     * ==========================================================
     */

    const submittedPage =
      Number(
        req.query.page
      );


    const requestedPage =
      Number.isInteger(
        submittedPage
      ) &&
      submittedPage > 0
        ? submittedPage
        : 1;


    const pageSize =
      25;


    /*
     * ==========================================================
     * BUILD PRISMA FILTER
     * ==========================================================
     */

    const where = {};


    if (action) {
      where.action =
        action;
    }


    if (entityType) {
      where.entityType =
        entityType;
    }


    if (adminId) {
      where.adminId =
        adminId;
    }


    const createdAtFilter =
      {};


    if (from) {
      const fromDate =
        new Date(
          `${from}T00:00:00.000`
        );


      if (
        !Number.isNaN(
          fromDate.getTime()
        )
      ) {
        createdAtFilter.gte =
          fromDate;
      }
    }


    if (to) {
      const toDate =
        new Date(
          `${to}T23:59:59.999`
        );


      if (
        !Number.isNaN(
          toDate.getTime()
        )
      ) {
        createdAtFilter.lte =
          toDate;
      }
    }


    if (
      Object.keys(
        createdAtFilter
      ).length > 0
    ) {
      where.createdAt =
        createdAtFilter;
    }


    /*
     * Count matching records first so we can calculate
     * a safe page number.
     */
    const totalLogs =
      await prisma.auditLog.count({
        where
      });


    const totalPages =
      Math.max(
        1,
        Math.ceil(
          totalLogs /
          pageSize
        )
      );


    const currentPage =
      Math.min(
        requestedPage,
        totalPages
      );


    const skip =
      (
        currentPage - 1
      ) *
      pageSize;


    /*
     * ==========================================================
     * RETRIEVE PAGE + FILTER OPTIONS
     * ==========================================================
     */

    const [
      auditLogs,
      actionOptions,
      admins,
      entityTypeOptions
    ] =
      await Promise.all([

        prisma.auditLog.findMany({
          where,

          include: {
            admin: {
              select: {
                id: true,
                email: true
              }
            }
          },

          orderBy: {
            createdAt:
              'desc'
          },

          skip,

          take:
            pageSize
        }),


        prisma.auditLog.findMany({
          select: {
            action:
              true
          },

          distinct: [
            'action'
          ],

          orderBy: {
            action:
              'asc'
          }
        }),


        prisma.admin.findMany({
          select: {
            id: true,
            email: true
          },

          orderBy: {
            email:
              'asc'
          }
        }),


        prisma.auditLog.findMany({
          where: {
            entityType: {
              not:
                null
            }
          },

          select: {
            entityType:
              true
          },

          distinct: [
            'entityType'
          ],

          orderBy: {
            entityType:
              'asc'
          }
        })

      ]);


    return res.render(
      'admin/audit-logs',
      {
        auditLogs,

        actionOptions:
          actionOptions.map(
            (item) =>
              item.action
          ),

        admins,

        entityTypeOptions:
          entityTypeOptions
            .map(
              (item) =>
                item.entityType
            )
            .filter(Boolean),

        filters: {
          action,

          adminId:
            adminId
              ? String(adminId)
              : '',

          entityType,

          from,

          to
        },

        pagination: {
          currentPage,
          totalPages,
          pageSize,
          totalLogs
        }
      }
    );
  })
);

router.post(
  '/newsletter/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const subscriberId =
      Number(
        req.params.id
      );

    if (
      !Number.isInteger(
        subscriberId
      ) ||
      subscriberId < 1
    ) {
      return res.status(400).send(
        'Invalid newsletter subscriber ID.'
      );
    }

    const subscriber =
      await prisma
        .newsletterSubscriber
        .findUnique({
          where: {
            id:
              subscriberId
          },

          select: {
            id: true,
            email: true,
            subscribedAt: true
          }
        });

    if (!subscriber) {
      return res.status(404).send(
        'Newsletter subscriber not found.'
      );
    }

    await prisma.$transaction(
      async (transaction) => {
        await transaction
          .newsletterSubscriber
          .delete({
            where: {
              id:
                subscriberId
            }
          });

        await writeAuditLog({
          client:
            transaction,

          req,

          action:
            'NEWSLETTER_SUBSCRIBER_DELETED',

          entityType:
            'NewsletterSubscriber',

          entityId:
            subscriberId,

          metadata: {
            email:
              subscriber.email,

            subscribedAt:
              subscriber.subscribedAt
          }
        });
      }
    );

    return res.redirect(
      '/admin/newsletter'
    );
  })
);

// --- Future Admin Resources ---
// Admin management for FAQs and team profiles can be added
// later when those resources are moved into the database.


/*
 * Handle Multer and upload metadata errors.
 *
 * This middleware must keep all four Express error-middleware
 * parameters:
 *
 * error, req, res, next
 */
router.use(
  (
    error,
    req,
    res,
    next
  ) => {
    return Promise
      .resolve()
      .then(async () => {
        /*
         * csrfAfterUpload already removes files rejected by
         * CSRF verification.
         *
         * Forward the error to the application's main CSRF
         * handler.
         */
        if (
          error.code ===
          'EBADCSRFTOKEN'
        ) {
          return next(error);
        }

        /*
         * Clean up any files Multer may have stored before
         * reporting another multipart error.
         */
        const uploadedFiles =
          Array.isArray(req.files) &&
          req.files.length > 0
            ? req.files
            : req.file;

        await deleteMulterFilesSafely(
          uploadedFiles,
          'Could not remove files after an upload error:'
        );

        if (
          error instanceof
          multer.MulterError
        ) {
          if (
            error.code ===
            'LIMIT_FILE_SIZE'
          ) {
            return res.status(400).send(
              'The uploaded file exceeds the allowed size.'
            );
          }

          if (
            error.code ===
            'LIMIT_FILE_COUNT'
          ) {
            return res.status(400).send(
              'Too many files were uploaded.'
            );
          }

          if (
            error.code ===
            'LIMIT_UNEXPECTED_FILE'
          ) {
            return res.status(400).send(
              'The upload field was not recognised or too many files were selected.'
            );
          }

          return res.status(400).send(
            'The file upload could not be completed.'
          );
        }

        if (
          error.message ===
          'Please upload a PDF file with a .pdf extension.'
        ) {
          return res.status(400).send(
            error.message
          );
        }

        if (
          error.message ===
          'Please upload only JPEG, PNG or WebP images.'
        ) {
          return res.status(400).send(
            error.message
          );
        }

        /*
         * Forward unrelated errors to the global Express error
         * handler.
         */
        return next(error);
      })
      .catch(next);
  }
);

module.exports = router;