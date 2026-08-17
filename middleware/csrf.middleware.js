const fs = require('fs/promises');

const {
  csrfSync
} = require('csrf-sync');

/*
 * csrf-sync stores the expected token in req.session.
 *
 * We configure it to read submitted tokens from:
 *
 * 1. req.body._csrf for normal HTML forms
 * 2. x-csrf-token for future JavaScript/API requests
 */
const {
  generateToken,
  csrfSynchronisedProtection
} = csrfSync({
  getTokenFromRequest: (req) => {
    const bodyToken =
      req.body?._csrf;

    if (
      typeof bodyToken === 'string' &&
      bodyToken.length > 0
    ) {
      return bodyToken;
    }

    const headerToken =
      req.get('x-csrf-token');

    if (
      typeof headerToken === 'string' &&
      headerToken.length > 0
    ) {
      return headerToken;
    }

    return null;
  },

  errorConfig: {
    statusCode: 403,
    message:
      'The form could not be verified.',
    code: 'EBADCSRFTOKEN'
  }
});

/*
 * Makes csrfToken available in every EJS view.
 *
 * The view can then use:
 *
 * <input type="hidden" name="_csrf" value="<%= csrfToken %>">
 */
function exposeCsrfToken(
  req,
  res,
  next
) {
  res.locals.csrfToken =
    generateToken(req);

  return next();
}

/*
 * Collects files created by Multer.
 *
 * req.file is used by:
 * - digest uploads
 * - news cover uploads
 * - résumé uploads
 *
 * req.files is used by:
 * - news gallery uploads
 */
function getUploadedFiles(req) {
  const files = [];

  if (req.file) {
    files.push(req.file);
  }

  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (
    req.files &&
    typeof req.files === 'object'
  ) {
    for (
      const value of Object.values(
        req.files
      )
    ) {
      if (Array.isArray(value)) {
        files.push(...value);
      }
    }
  }

  return files;
}

/*
 * Removes files that Multer saved before a CSRF request was
 * rejected.
 */
async function removeRejectedUploads(req) {
  const files =
    getUploadedFiles(req);

  await Promise.all(
    files.map(async (file) => {
      if (!file?.path) {
        return;
      }

      try {
        await fs.unlink(file.path);
      } catch (error) {
        if (error.code !== 'ENOENT') {
        req.log.error(
          {
            err:
              error,

            event:
              'CSRF_UPLOAD_CLEANUP_FAILED'
          },

          'Could not remove upload after CSRF rejection'
        );
      }
      }
    })
  );
}

/*
 * Use this after Multer on multipart/form-data routes.
 *
 * Multer must first populate req.body._csrf. If the token is
 * invalid, the uploaded file is removed.
 */
function csrfAfterUpload(
  req,
  res,
  next
) {
  return csrfSynchronisedProtection(
    req,
    res,
    (error) => {
      if (!error) {
        return next();
      }

      return removeRejectedUploads(req)
        .then(() => next(error))
        .catch(next);
    }
  );
}

module.exports = {
  exposeCsrfToken,
  csrfSynchronisedProtection,
  csrfAfterUpload
};