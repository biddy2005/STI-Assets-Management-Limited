const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const router = express.Router();
const prisma = require('../config/db');
const { cleanText, isHoneypotTriggered, isValidEmail } = require('../middleware/validation.middleware');

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

async function renderCareerError(res, error) {
  const jobs = await prisma.jobPosting.findMany({
    where: { status: 'open' },
    orderBy: { createdAt: 'desc' }
  }).catch(() => []);
  return res.status(400).render('careers', { title: 'Careers', jobs, error });
}

// Resumes are stored in public/uploads/resumes for now.
// In production, swap this for cloud storage (S3, Cloudinary, etc).
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/resumes')),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) return cb(new Error('Please upload a PDF, DOC, or DOCX resume.'));
    return cb(null, true);
  }
});

router.post('/apply', upload.single('resume'), async (req, res) => {
  if (isHoneypotTriggered(req)) return res.redirect('/careers?applied=1');

  const applicantName = cleanText(req.body.applicantName, 100);
  const email = cleanText(req.body.email, 254).toLowerCase();
  const phone = cleanText(req.body.phone, 30) || null;
  const coverNote = cleanText(req.body.coverNote, 5000) || null;
  const jobId = Number(req.body.jobId);

  if (!applicantName || !isValidEmail(email) || !Number.isInteger(jobId) || jobId < 1 || !req.file) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    return renderCareerError(res, 'Please select a job and provide your name, email, and resume.');
  }

  try {
    const job = await prisma.jobPosting.findFirst({ where: { id: jobId, status: 'open' } });
    if (!job) {
      await fs.unlink(req.file.path).catch(() => {});
      return renderCareerError(res, 'That job is no longer accepting applications.');
    }

    await prisma.jobApplication.create({
      data: {
        applicantName,
        email,
        phone,
        coverNote,
        jobId,
        resumeUrl: `/uploads/resumes/${req.file.filename}`
      }
    });

    return res.redirect('/careers?applied=1');
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    console.error(err);
    return res.status(500).render('500', { title: 'Server Error' });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Please upload a PDF, DOC, or DOCX resume.') {
    return renderCareerError(res, err.message);
  }
  return next(err);
});

module.exports = router;
