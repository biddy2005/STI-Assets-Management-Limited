const {
  S3Client
} = require(
  '@aws-sdk/client-s3'
);

const env =
  require('./env');


/*
 * ============================================================
 * CLOUDFLARE R2 CLIENT
 * ============================================================
 *
 * The R2 client is created only when STORAGE_DRIVER=r2.
 *
 * Development and automated tests currently use:
 *
 * STORAGE_DRIVER=local
 *
 * so they do not require Cloudflare credentials and cannot
 * accidentally send files to production storage.
 */


/**
 * Returns true only when the application has explicitly been
 * configured to use Cloudflare R2.
 */
function isR2Enabled() {
  return (
    env.storageDriver ===
    'r2'
  );
}


/*
 * Cloudflare R2 provides an S3-compatible API.
 *
 * Cloudflare requires the AWS SDK to receive a region even
 * though R2 itself does not use normal AWS regions.
 *
 * "auto" is the value documented by Cloudflare.
 */
const r2Client =
  isR2Enabled()
    ? new S3Client({
        region:
          'auto',

        endpoint:
          env.r2Endpoint,

        credentials: {
          accessKeyId:
            env.r2AccessKeyId,

          secretAccessKey:
            env.r2SecretAccessKey
        }
      })
    : null;


module.exports = {
  r2Client,
  isR2Enabled
};