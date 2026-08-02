const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const prisma = require('../config/db');

router.post('/login', async (req, res) => {
 const email =
  typeof req.body.email === 'string'
    ? req.body.email.trim().toLowerCase()
    : '';

const password =
  typeof req.body.password === 'string'
    ? req.body.password
    : '';

  try {
    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin) {
          return res.status(401).render(
      'admin/login',
      {
        error: 'Invalid credentials'
      }
);
    }

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) {
      return res.render('admin/login', { error: 'Invalid credentials' });
    }

    return req.session.regenerate((sessionError) => {
      if (sessionError) {
        console.error(sessionError);
        return res.render('admin/login', { error: 'Something went wrong. Try again.' });
      }
      req.session.adminId = admin.id;
      req.session.adminEmail = admin.email;
      req.session.adminRole = admin.role;
      return res.redirect('/admin/dashboard');
    });
  } catch (err) {
    console.error(err);
    return res.render('admin/login', { error: 'Something went wrong. Try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('assetco.sid');
    res.redirect('/admin/login');
  });
});

module.exports = router;
