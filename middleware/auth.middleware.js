const prisma =
  require('../config/db');

/*
 * Destroy an invalid or deactivated administrator session.
 */
function destroyCurrentSession(
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

/*
 * Confirm that:
 *
 * 1. The session contains an administrator ID.
 * 2. The administrator still exists.
 * 3. The administrator account is still active.
 *
 * This database check also invalidates an existing session
 * after an administrator account has been deactivated.
 */
async function requireAuth(
  req,
  res,
  next
) {
  const adminId =
    req.session?.adminId;

  if (!adminId) {
    return res.redirect(
      '/admin/login'
    );
  }

  try {
    const admin =
      await prisma.admin.findUnique({
        where: {
          id:
            adminId
        },

        select: {
          id: true,
          email: true,
          role: true,
          isActive: true
        }
      });

    /*
     * Destroy the session when the administrator was deleted or
     * deactivated.
     */
    if (
      !admin ||
      !admin.isActive
    ) {
      await destroyCurrentSession(
        req
      );

      res.clearCookie(
        'assetco.sid',
        {
          path: '/'
        }
      );

      return res.redirect(
        '/admin/login'
      );
    }

    /*
     * Refresh session information from PostgreSQL.
     *
     * This means role changes take effect during the current
     * session instead of waiting for the administrator to log
     * out and back in.
     */
    req.session.adminEmail =
      admin.email;

    req.session.adminRole =
      admin.role;

    /*
     * Make administrator information available to EJS views.
     */
    res.locals.admin = {
      id:
        admin.id,

      email:
        admin.email,

      role:
        admin.role
    };

    return next();
  } catch (error) {
    return next(
      error
    );
  }
}

/*
 * Restrict a route to one or more administrator roles.
 *
 * Example:
 *
 * requireRole('superadmin')
 *
 * requireRole('superadmin', 'editor')
 */
function requireRole(
  ...allowedRoles
) {
  return (
    req,
    res,
    next
  ) => {
    if (!req.session?.adminId) {
      return res.redirect(
        '/admin/login'
      );
    }

    if (
      !allowedRoles.includes(
        req.session.adminRole
      )
    ) {
      return res.status(403).send(
        'You do not have permission to perform this action.'
      );
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};