const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const prisma = require('../config/db');

// Login page (public)
router.get('/login', (req, res) => res.render('admin/login', { error: null }));

// Everything below this line requires a logged-in admin
router.use(requireAuth);

router.get('/dashboard', (req, res) => {
  res.render('admin/dashboard', { admin: { email: req.session.adminEmail } });
});

// --- CRUD route stubs ---
// Build these out next: list + create + edit + delete for each resource.
// Pattern for each resource (news shown as the example to copy):
//
// router.get('/news', async (req, res) => {
//   const articles = await prisma.newsArticle.findMany({ orderBy: { createdAt: 'desc' } });
//   res.render('admin/news-manager', { articles });
// });
//
// router.post('/news', async (req, res) => {
//   await prisma.newsArticle.create({ data: { ...req.body } });
//   res.redirect('/admin/news');
// });
//
// router.post('/news/:id/delete', async (req, res) => {
//   await prisma.newsArticle.delete({ where: { id: Number(req.params.id) } });
//   res.redirect('/admin/news');
// });

module.exports = router;
