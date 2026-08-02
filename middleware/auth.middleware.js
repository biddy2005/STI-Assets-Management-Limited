function requireAuth(req, res, next) {
  if (req.session?.adminId) {
    return next();
  }

  return res.redirect('/admin/login');
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session?.adminId) {
      return res.redirect('/admin/login');
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