# STI Assets Management Website — Codex Instructions

## Project purpose

This is the production website for STI Assets Management Limited.

Changes must prioritize:

1. Production stability
2. Security
3. Accessibility
4. Maintainability
5. Responsive design consistency
6. Performance

Do not make unrelated improvements while completing a requested task.

---

## Working principles

Before editing:

1. Inspect the existing implementation.
2. Identify all files directly involved in the requested behavior.
3. Understand existing conventions before introducing a new pattern.
4. Prefer the smallest safe change that satisfies the task.
5. Reuse established project patterns where appropriate.
6. Do not perform broad refactors unless explicitly requested.

If the requested change conflicts with the current architecture or requires substantially broader changes than expected, stop and explain the issue before proceeding.

---

## Frontend architecture

The public frontend uses:

- EJS templates
- Server-rendered HTML
- Vanilla JavaScript
- CSS
- Shared EJS partials
- Page-specific stylesheets where appropriate

Do not migrate the frontend to:

- React
- Vue
- Angular
- Next.js
- Tailwind
- Bootstrap
- another frontend framework

unless explicitly requested.

Do not introduce a new frontend framework or dependency just to solve a styling or interaction problem.

---

## Visual identity

Preserve the STI Assets Management visual identity.

Primary brand colors include:

- Navy: `#033669`
- Orange: `#f68634`

Do not replace or materially change the brand palette unless explicitly requested.

Visual improvements should preserve the professional financial-services character of the website.

The homepage is the preferred reference for the newer visual direction when consolidating inconsistent frontend patterns.

---

## Change scope

Only modify files necessary for the task.

Do not:

- rename unrelated CSS classes
- restructure unrelated templates
- reformat entire files unnecessarily
- change unrelated copy
- move files without a clear need
- delete code merely because it appears unused without verifying usage
- change public routes unless requested
- change form field names unless requested
- change request/response contracts unless requested

Avoid large diffs for small tasks.

---

## Backend protection

Frontend tasks must not alter backend behavior unless the task explicitly requires it.

Do not modify any of the following unless explicitly requested:

- Prisma schema
- Prisma migrations
- PostgreSQL/database structure
- authentication
- authorization
- admin/editor permissions
- sessions
- CSRF protection
- rate limiting
- security middleware
- upload validation
- file cleanup behavior
- Cloudflare R2/storage integration
- email/SMTP configuration
- environment-variable validation
- audit logging
- server startup/security configuration

Never weaken an existing security control in order to make a frontend change work.

---

## Tests

Existing tests represent required behavior unless the requested change explicitly changes that behavior.

Never modify a test merely to make a failing implementation pass.

If an existing test fails:

1. Investigate the implementation first.
2. Determine whether the requested change caused the regression.
3. Fix the implementation where appropriate.
4. Only change a test when the intended behavior itself was explicitly changed.

Do not remove, skip, disable, or weaken security tests.

---

## Accessibility requirements

When modifying public frontend components:

- Prefer semantic HTML.
- Prefer native interactive elements such as `<button>` and `<a>`.
- Preserve keyboard accessibility.
- Preserve visible focus states.
- Maintain logical heading structure.
- Use ARIA only where native HTML does not provide sufficient semantics.
- Do not remove accessibility attributes without understanding their purpose.
- Ensure interactive controls have accessible names.
- Respect `prefers-reduced-motion`.
- Aim for WCAG 2.2 AA color contrast.
- Do not make important content dependent on animation JavaScript being successful.

JavaScript enhancements should fail open wherever practical.

Server-rendered page content should remain visible and usable if non-essential JavaScript fails.

---

## Responsive behavior

Changes must be checked at minimum around:

- 360px
- 390px
- 768px
- 1024px
- 1280px
- 1440px

Do not fix one viewport by breaking another.

Avoid solving layout problems solely by globally hiding overflow.

Prefer fixing the element responsible for overflow.

---

## CSS rules

Prefer existing project tokens and shared component styles.

Avoid:

- unnecessary `!important`
- highly specific selectors
- duplicate media queries
- duplicate component implementations
- arbitrary one-off colors when an existing token is appropriate
- unnecessary permanent `will-change`
- hiding server-rendered content by default when JavaScript is required to reveal it

Do not perform a wholesale CSS rewrite unless explicitly requested.

When extracting shared styles, do so incrementally and preserve existing appearance.

---

## JavaScript rules

Prefer small, reusable behavior modules.

Do not:

- introduce global state unnecessarily
- duplicate interaction logic across pages
- silently change existing behavior
- make content inaccessible when JavaScript fails

For animations and progressive enhancement:

- content should be visible by default
- JavaScript may opt elements into animation after successful initialization
- `prefers-reduced-motion` must remain supported

---

## EJS rules

Preserve server-rendered behavior.

Shared behavior should use existing partials or carefully introduced reusable partials where appropriate.

Avoid duplicating shared navigation/footer/component markup.

Do not introduce invalid landmark nesting.

There should normally be one `<main>` landmark per page.

---

## Dependencies

Do not install, remove, or upgrade npm packages unless explicitly requested.

If you believe a new dependency is necessary:

1. Do not install it.
2. Explain why it is needed.
3. Suggest the dependency.
4. Wait for approval.

---

## Production safety

Do not assume development-only behavior is acceptable in production.

Preserve compatibility with the current hosting environment.

Do not make changes to:

- environment variables
- persistent storage
- database migrations
- production file paths
- storage providers
- authentication/session configuration

unless explicitly requested.

---

## Required verification after every implementation task

After modifying files:

1. Run the project's existing test suite if available.
2. Run relevant lint/check commands if configured.
3. Check for syntax errors.
4. Inspect the final diff.
5. Confirm no unrelated files were modified.
6. Report any tests that could not be run.

Do not claim a check passed unless it was actually executed.

---

## Required final report

After every task, report:

### Files changed

List every changed file.

### What changed

Briefly describe each meaningful modification.

### What was intentionally not changed

Identify important adjacent areas that were preserved.

### Verification

List the exact commands/tests executed and their results.

### Risks or follow-up

Describe anything that still requires manual verification.

Keep the report factual and concise.
