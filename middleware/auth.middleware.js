// Protects any route placed after it. Checks for a logged-in admin session.
function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.redirect('/admin/login');
}

module.exports = { requireAuth };
