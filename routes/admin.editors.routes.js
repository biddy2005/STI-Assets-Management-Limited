const express =
  require('express');

const router =
  express.Router();

const prisma =
  require('../config/db');

const bcrypt =
  require('bcrypt');

const {
  validateSchema
} = require(
  '../middleware/validation.middleware'
);

const {
  createEditorSchema,
  editorStatusSchema,
  resetEditorPasswordSchema,
  editorIdSchema
} = require(
  '../schemas/editor.schema'
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

const superAdminOnly =
  requireRole(
    'SUPERADMIN'
  );


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
      id:
        true,

      email:
        true,

      role:
        true,

      isActive:
        true,

      failedLogins:
        true,

      lockedUntil:
        true,

      lastLoginAt:
        true,

      sessionVersion:
        true,

      createdAt:
        true,

      updatedAt:
        true
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
 * ============================================================
 * EDITOR MANAGEMENT PAGE
 * ============================================================
 */

router.get(
  '/',

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
  '/',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const validation =
      validateSchema(
        createEditorSchema,
        req.body
      );


    const email =
      validation.success
        ? validation.data.email
        : '';


    const password =
      validation.success
        ? validation.data.password
        : '';


    const confirmPassword =
      validation.success
        ? validation.data.confirmPassword
        : '';


    if (!validation.success) {

      const emailError =
        validation.errors.find(
          (error) =>
            error.field ===
              'email'
        );


      if (emailError) {
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

    }


    if (!validation.success) {

      const passwordError =
        validation.errors.find(
          (error) =>
            error.field ===
              'password' ||
            error.field ===
              'confirmPassword'
        );


      const passwordsMismatch =
        validation.errors.some(
          (error) =>
            error.field ===
              'confirmPassword' &&
            error.message ===
              'The passwords do not match.'
        );


      if (
        passwordError &&
        !passwordsMismatch
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

    }


    if (!validation.success) {

      const passwordsMismatch =
        validation.errors.some(
          (error) =>
            error.field ===
              'confirmPassword' &&
            error.message ===
              'The passwords do not match.'
        );


      if (passwordsMismatch) {
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

    }


    if (!validation.success) {
      return renderEditorManager(
        res,
        {
          error:
            'Please review the submitted Editor account details.',

          status:
            400
        }
      );
    }


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
  '/:id/status',

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


    const validation =
      validateSchema(
        editorStatusSchema,
        req.body
      );


    const submittedStatus =
      validation.success
        ? validation.data.status
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


    if (!validation.success) {

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
  '/:id/password',

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


    const validation =
      validateSchema(
        resetEditorPasswordSchema,
        req.body
      );


    const password =
      validation.success
        ? validation.data.password
        : '';


    const confirmPassword =
      validation.success
        ? validation.data.confirmPassword
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


    if (!validation.success) {

      const passwordLengthError =
        validation.errors.some(
          (error) =>
            error.field ===
              'password' ||
            (
              error.field ===
                'confirmPassword' &&
              error.message !==
                'The new passwords do not match.'
            )
        );


      if (passwordLengthError) {
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

    }


    if (!validation.success) {

      const passwordsMismatch =
        validation.errors.some(
          (error) =>
            error.field ===
              'confirmPassword' &&
            error.message ===
              'The new passwords do not match.'
        );


      if (passwordsMismatch) {
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

    }


    if (!validation.success) {
      return renderEditorManager(
        res,
        {
          error:
            'Please review the submitted password details.',

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
  '/:id/unlock',

  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {

    const validation =
      editorIdSchema.safeParse(
        req.params.id
      );


    if (!validation.success) {

      return res.status(400).send(
        'Invalid Editor ID.'
      );

    }


    const editorId =
      validation.data;


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

module.exports =
  router;