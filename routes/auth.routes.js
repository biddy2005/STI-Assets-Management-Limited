const express =
  require('express');

const bcrypt =
  require('bcrypt');

const router =
  express.Router();

const prisma =
  require('../config/db');

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);

const {
  writeAuditLog
} = require(
  '../services/audit.service'
);

const {
  csrfSynchronisedProtection
} = require(
  '../middleware/csrf.middleware'
);

/*
 * Lock an administrator account after five consecutive
 * incorrect password attempts.
 */
const MAX_FAILED_LOGINS =
  5;

/*
 * Account lock duration:
 *
 * 15 minutes.
 */
const LOCKOUT_DURATION_MS =
  15 * 60 * 1000;

/*
 * Always show the same message for:
 *
 * - unknown email;
 * - wrong password;
 * - inactive account;
 * - locked account.
 *
 * This prevents the login page from revealing whether an
 * administrator account exists.
 */
const GENERIC_LOGIN_ERROR =
  'Invalid credentials or the account is temporarily unavailable.';

/*
 * This hash is used only when the submitted email does not
 * belong to an administrator.
 *
 * Running bcrypt.compare() even for an unknown email makes the
 * response time closer to a normal password check.
 */
const DUMMY_PASSWORD_HASH =
  bcrypt.hashSync(
    'not-a-real-admin-password',
    12
  );

/*
 * Convert req.session.regenerate() into a Promise so it works
 * cleanly with asyncHandler and await.
 */
function regenerateSession(
  req
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      req.session.regenerate(
        (error) => {
          if (error) {
            return reject(
              error
            );
          }

          return resolve();
        }
      );
    }
  );
}

/*
 * Save the session before redirecting.
 *
 * This ensures that the administrator session has reached the
 * PostgreSQL session store before the dashboard request begins.
 */
function saveSession(
  req
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      req.session.save(
        (error) => {
          if (error) {
            return reject(
              error
            );
          }

          return resolve();
        }
      );
    }
  );
}

/*
 * Convert session destruction into a Promise.
 */
function destroySession(
  req
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      if (!req.session) {
        return resolve();
      }

      req.session.destroy(
        (error) => {
          if (error) {
            return reject(
              error
            );
          }

          return resolve();
        }
      );
    }
  );
}

// ============================================================
// ADMIN LOGIN
// ============================================================

router.post(
  '/login',
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {
    /*
     * Normalise the submitted email so account lookup is
     * consistent.
     */
const submittedEmail =
  typeof req.body.email ===
  'string'
    ? req.body.email
        .trim()
        .toLowerCase()
    : '';

const email =
  submittedEmail.length <= 254
    ? submittedEmail
    : '';

    /*
     * Do not trim passwords because spaces may legitimately be
     * part of a password.
     */
    const password =
      typeof req.body.password ===
      'string'
        ? req.body.password
        : '';

    /*
     * Do not continue when either login field is empty.
     */
    if (
      !email ||
      !password
    ) {
      return res.status(401).render(
        'admin/login',
        {
          error:
            GENERIC_LOGIN_ERROR
        }
      );
    }

    const admin =
      await prisma.admin.findUnique({
        where: {
          email
        }
      });

    // ========================================================
    // UNKNOWN ADMIN ACCOUNT
    // ========================================================

    if (!admin) {
      /*
       * Perform a bcrypt comparison even though the account
       * does not exist.
       */
      await bcrypt.compare(
        password,
        DUMMY_PASSWORD_HASH
      );

      await writeAuditLog({
        req,

        /*
         * Explicitly use null because no administrator record
         * exists for this email.
         */
        adminId:
          null,

        action:
          'ADMIN_LOGIN_FAILED',

        entityType:
          'Admin',

        metadata: {
          reason:
            'UNKNOWN_ACCOUNT',

          attemptedEmail:
            email
        }
      });

      return res.status(401).render(
        'admin/login',
        {
          error:
            GENERIC_LOGIN_ERROR
        }
      );
    }

    // ========================================================
    // INACTIVE ADMIN ACCOUNT
    // ========================================================

    if (!admin.isActive) {
      await writeAuditLog({
        req,

        adminId:
          admin.id,

        action:
          'ADMIN_LOGIN_FAILED',

        entityType:
          'Admin',

        entityId:
          admin.id,

        metadata: {
          reason:
            'INACTIVE_ACCOUNT'
        }
      });

      return res.status(401).render(
        'admin/login',
        {
          error:
            GENERIC_LOGIN_ERROR
        }
      );
    }

    const now =
      new Date();

    // ========================================================
    // LOCKED ADMIN ACCOUNT
    // ========================================================

    if (
      admin.lockedUntil &&
      admin.lockedUntil > now
    ) {
      await writeAuditLog({
        req,

        adminId:
          admin.id,

        action:
          'ADMIN_LOGIN_BLOCKED',

        entityType:
          'Admin',

        entityId:
          admin.id,

        metadata: {
          reason:
            'ACCOUNT_LOCKED',

          lockedUntil:
            admin.lockedUntil
        }
      });

      return res.status(401).render(
        'admin/login',
        {
          error:
            GENERIC_LOGIN_ERROR
        }
      );
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        admin.passwordHash
      );

    // ========================================================
    // INCORRECT PASSWORD
    // ========================================================

    if (!passwordMatches) {
      /*
       * When the previous lock has already expired, begin the
       * failed-attempt count again from zero.
       */
      const previousLockExpired =
        Boolean(
          admin.lockedUntil &&
          admin.lockedUntil <= now
        );

      const currentFailedLogins =
        previousLockExpired
          ? 0
          : admin.failedLogins;

      const nextFailedLogins =
        currentFailedLogins + 1;

      const shouldLockAccount =
        nextFailedLogins >=
        MAX_FAILED_LOGINS;

      const lockedUntil =
        shouldLockAccount
          ? new Date(
              Date.now() +
              LOCKOUT_DURATION_MS
            )
          : null;

      /*
       * Update the administrator record and write the audit
       * record in one database transaction.
       */
      await prisma.$transaction(
        async (
          transaction
        ) => {
          await transaction
            .admin
            .update({
              where: {
                id:
                  admin.id
              },

              data: {
                failedLogins:
                  nextFailedLogins,

                lockedUntil
              }
            });

          await writeAuditLog({
            client:
              transaction,

            req,

            adminId:
              admin.id,

            action:
              shouldLockAccount
                ? 'ADMIN_ACCOUNT_LOCKED'
                : 'ADMIN_LOGIN_FAILED',

            entityType:
              'Admin',

            entityId:
              admin.id,

            metadata: {
              reason:
                'INVALID_PASSWORD',

              failedLogins:
                nextFailedLogins,

              lockedUntil
            }
          });
        }
      );

      return res.status(401).render(
        'admin/login',
        {
          error:
            GENERIC_LOGIN_ERROR
        }
      );
    }

    // ========================================================
    // SUCCESSFUL LOGIN
    // ========================================================

    /*
     * Reset the failed-attempt fields, record the latest login
     * time and create an audit record.
     */
    await prisma.$transaction(
      async (
        transaction
      ) => {
        await transaction
          .admin
          .update({
            where: {
              id:
                admin.id
            },

            data: {
              failedLogins:
                0,

              lockedUntil:
                null,

              lastLoginAt:
                new Date()
            }
          });

        await writeAuditLog({
          client:
            transaction,

          req,

          adminId:
            admin.id,

          action:
            'ADMIN_LOGIN_SUCCESS',

          entityType:
            'Admin',

          entityId:
            admin.id
        });
      }
    );

    /*
     * Replace the pre-login session ID with a fresh session ID.
     *
     * This helps protect against session fixation.
     */
    await regenerateSession(
      req
    );

    req.session.adminId =
      admin.id;

    req.session.adminEmail =
      admin.email;

    req.session.adminRole =
  admin.role;

    /*
    * Save the security version of the account that authenticated
    * this session.
    *
    * If the account password or status is later changed by the
    * SUPERADMIN, sessionVersion will be incremented and this
    * existing session will become invalid.
    */
    req.session.adminSessionVersion =
      admin.sessionVersion;

    /*
    * Save the session before redirecting.
    */
    await saveSession(
      req
    );

    return res.redirect(
      '/admin/dashboard'
    );
  })
);

// ============================================================
// ADMIN LOGOUT
// ============================================================

router.post(
  '/logout',
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {
    const adminId =
      req.session?.adminId ||
      null;

    /*
     * Attempt to record the logout before destroying the
     * session.
     *
     * An audit failure must not prevent the administrator from
     * logging out.
     */
    if (adminId) {
      try {
        await writeAuditLog({
          req,

          adminId,

          action:
            'ADMIN_LOGOUT',

          entityType:
            'Admin',

          entityId:
            adminId
        });
      } catch (error) {
        req.log.error(
          {
            err:
              error,

            event:
              'ADMIN_LOGOUT_AUDIT_FAILED',

            adminId
          },

          'Could not record administrator logout'
        );
      }
    }

    await destroySession(
      req
    );

    res.clearCookie(
      'stiassets.sid',
      {
        path: '/'
      }
    );

    return res.redirect(
      '/admin/login'
    );
  })
);

module.exports =
  router;