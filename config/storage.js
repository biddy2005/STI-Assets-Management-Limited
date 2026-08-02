const fs = require('fs');
const path = require('path');

/*
 * This folder is outside the public directory.
 *
 * Express only exposes files inside /public, so files stored
 * here cannot be accessed using a normal public URL.
 */
const resumeDirectory = path.join(
  __dirname,
  '..',
  'storage',
  'private',
  'resumes'
);

/*
 * Create the folder automatically when the application starts.
 *
 * recursive: true means Node will create all missing parent
 * folders, including storage/private/resumes.
 */
fs.mkdirSync(resumeDirectory, {
  recursive: true
});

module.exports = {
  resumeDirectory
};