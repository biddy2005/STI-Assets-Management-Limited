require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const pageRoutes = require('./routes/pages.routes');
const adminRoutes = require('./routes/admin.routes');
const authRoutes = require('./routes/auth.routes');
const contactRoutes = require('./routes/api.contact.routes');
const careersRoutes = require('./routes/api.careers.routes');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set. Add a long, random value to .env.');
}

if (isProduction) app.set('trust proxy', 1);

// ---- View engine ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Middleware ----
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    name: 'assetco.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 2
    }
  })
);

// ---- Routes ----
app.use('/', pageRoutes);
app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/careers', careersRoutes);

// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500', { title: 'Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
