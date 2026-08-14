const fs =
  require('fs');

const path =
  require('path');


/*
 * ============================================================
 * PRIVATE STORAGE
 * ============================================================
 */

const resumeDirectory =
  path.join(
    __dirname,
    '..',
    'storage',
    'private',
    'resumes'
  );


/*
 * ============================================================
 * PUBLIC UPLOAD STORAGE
 * ============================================================
 */

const publicUploadDirectory =
  path.join(
    __dirname,
    '..',
    'public',
    'uploads'
  );


const digestUploadDirectory =
  path.join(
    publicUploadDirectory,
    'digests'
  );


const newsUploadDirectory =
  path.join(
    publicUploadDirectory,
    'news'
  );


const rateGuideUploadDirectory =
  path.join(
    publicUploadDirectory,
    'rate-guide'
  );


/*
 * These directories are intentionally ignored by Git.
 *
 * Create them when the application starts so a clean checkout,
 * CI environment or new deployment can accept uploads.
 */
const requiredStorageDirectories =
  [
    resumeDirectory,
    digestUploadDirectory,
    newsUploadDirectory,
    rateGuideUploadDirectory
  ];


requiredStorageDirectories.forEach(
  (directory) => {
    fs.mkdirSync(
      directory,
      {
        recursive: true
      }
    );
  }
);


module.exports = {
  resumeDirectory,
  digestUploadDirectory,
  newsUploadDirectory,
  rateGuideUploadDirectory
};