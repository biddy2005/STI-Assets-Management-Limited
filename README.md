# AssetCo Website — Setup Guide

This is a working scaffold: every page and subpage in the sitemap renders, navigation works
(desktop dropdowns + mobile hamburger), forms are wired to a backend, and there's an admin
login flow ready for a dashboard. Content is placeholder — swap it in once you have real copy.

**Verified before hand-off:** `npm install` succeeds, every JS file passes a syntax check, and
all 13 page routes (including the 404 handler) returned HTTP 200/404 correctly during a local
Express test run.

---

## 1. Prerequisites (install these first)

1. **Node.js LTS** — download from https://nodejs.org (v20 or v22). Verify:
   ```
   node -v
   npm -v
   ```
2. **PostgreSQL** — either install locally (https://www.postgresql.org/download/) or use a free
   hosted instance (Neon, Supabase, Railway all have free tiers — easier for a first pass).
3. **VS Code extensions** — install:
   - ESLint
   - Prettier
   - Prisma (official, by Prisma)
   - EJS language support (e.g. "EJS language support" by DigitalBrainstem)
   - Thunder Client (to test API routes without leaving VS Code)

---

## 2. First-time setup

Open this folder in VS Code (`File > Open Folder`), then open the integrated terminal
(`` Ctrl+` ``) and run:

```bash
npm install
```

Then create your local environment file:

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `DATABASE_URL` — your real Postgres connection string
- `SESSION_SECRET` — any long random string
- SMTP fields — leave blank for now, needed later for email notifications

---

## 3. Set up the database

With `DATABASE_URL` set in `.env`, run:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

This creates every table defined in `prisma/schema.prisma` (NewsArticle, JobPosting, FAQ, etc.).

Then seed your first admin login:

```bash
node prisma/seed.js
```

This prints an email/password to the terminal — use it to log in at `/admin/login`, and
**change the password immediately** (we'll build the "change password" screen in the admin
panel phase).

Optional: run `npx prisma studio` any time to view/edit your database in a browser GUI.

---

## 4. Run the site

```bash
npm run dev
```

Visit **http://localhost:3000**. `nodemon` restarts the server automatically when you save a file.

---

## 5. What's already built

| Feature | Status |
|---|---|
| All 7 pages + 9 subpages, routed and rendering | ✅ Done (placeholder content) |
| Shared header/nav/footer via EJS partials | ✅ Done |
| Responsive nav (hamburger on mobile, dropdowns on desktop) | ✅ Done |
| Mobile-first responsive CSS | ✅ Done |
| Contact form → saves to database | ✅ Done |
| Careers "Apply" form → file upload + saves to database | ✅ Done |
| Database schema (Prisma) for all content types | ✅ Done |
| Admin login/logout with hashed passwords + sessions | ✅ Done |
| Admin dashboard shell | ✅ Done (links only, no CRUD screens yet) |
| Admin CRUD screens (add/edit/delete news, jobs, FAQs, etc.) | 🔲 Next phase |
| Real content on every page | 🔲 Waiting on you |
| Email notifications on form submit | 🔲 Next phase (nodemailer is installed, not wired up) |
| SEO (meta tags, sitemap.xml) | 🔲 Deferred, as agreed |

---

## 6. Project structure

```
views/            → EJS templates (one file per page/subpage)
views/partials/   → shared header, nav, footer — edit once, updates everywhere
public/css/       → style.css (all responsive breakpoints live here)
public/js/        → nav.js (mobile menu + dropdown logic)
routes/           → one file per route group (pages, admin, auth, contact API, careers API)
middleware/       → auth.middleware.js protects everything under /admin
prisma/schema.prisma → every database table
prisma/seed.js    → creates your first admin login
```

---

## 7. Suggested next steps (in order)

1. Get the site running locally and click through every page/subpage — confirm nav works on
   both mobile width and desktop width (resize the browser or use DevTools device toolbar).
2. Build the first admin CRUD screen (News & Articles is the best one to start with — the
   pattern is commented out in `routes/admin.routes.js`, ready to uncomment and adapt).
3. Once one CRUD screen works end-to-end, repeat the same pattern for Downloads, Jobs, FAQs,
   Team Members.
4. Connect the public-facing pages (`resources/news.ejs`, `careers.ejs`, etc.) to pull real data
   from the database instead of placeholder text.
5. Wire up nodemailer so contact/application submissions trigger an email.
6. Replace placeholder text/images with real content once it's provided.
7. SEO + deployment pass at the end.

---

## 8. A note on security before you go live

- Change the seeded admin password immediately.
- Never commit `.env` — it's already in `.gitignore`.
- Move resume/file uploads to cloud storage (S3, Cloudinary) before production — local disk
  storage (`public/uploads/`) is fine for development only.
- Add rate-limiting to `/auth/login` and the public form routes before launch (e.g.
  `express-rate-limit`) to prevent brute-force and spam.
