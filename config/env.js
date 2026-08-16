require('dotenv').config();

const allowedNodeEnvironments =
  new Set([
    'development',
    'test',
    'production'
  ]);

const allowedStorageDrivers =
  new Set([
    'local',
    'r2'
  ]);

const allowedLogLevels =
  new Set([
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent'
  ]);

function readTrimmedEnvironmentValue(
  variableName
) {
  return typeof process.env[
    variableName
  ] === 'string'
    ? process.env[
        variableName
      ].trim()
    : '';
}

function requireEnvironmentValue(
  variableName
) {
  const value =
    readTrimmedEnvironmentValue(
      variableName
    );

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${variableName}`
    );
  }

  return value;
}

const nodeEnv =
  readTrimmedEnvironmentValue(
    'NODE_ENV'
  ) || 'development';

if (
  !allowedNodeEnvironments.has(
    nodeEnv
  )
) {
  throw new Error(
    'NODE_ENV must be development, test or production.'
  );
}

const isProduction =
  nodeEnv === 'production';

const databaseUrl =
  requireEnvironmentValue(
    'DATABASE_URL'
  );

if (
  !databaseUrl.startsWith(
    'postgresql://'
  ) &&
  !databaseUrl.startsWith(
    'postgres://'
  )
) {
  throw new Error(
    'DATABASE_URL must be a PostgreSQL connection URL.'
  );
}


/*
 * Parse the database URL once so production can fail fast when
 * an obviously incorrect local database URL is configured.
 */
let parsedDatabaseUrl;

try {
  parsedDatabaseUrl =
    new URL(
      databaseUrl
    );
} catch (error) {
  throw new Error(
    'DATABASE_URL must be a valid PostgreSQL connection URL.'
  );
}


/*
 * A production deployment must never accidentally point back
 * at the developer workstation.
 */
if (
  isProduction &&
  [
    'localhost',
    '127.0.0.1',
    '::1'
  ].includes(
    parsedDatabaseUrl.hostname
  )
) {
  throw new Error(
    'DATABASE_URL must not point to localhost in production.'
  );
}


/*
 * ============================================================
 * POSTGRESQL CONNECTION POOLS
 * ============================================================
 *
 * Prisma and the PostgreSQL-backed session store use separate
 * connection pools.
 *
 * Explicit limits make production database usage predictable
 * and leave connection capacity available for migrations,
 * administration and future application instances.
 */

const dbPoolMax =
  Number(
    process.env.DB_POOL_MAX ||
    10
  );

const sessionDbPoolMax =
  Number(
    process.env
      .SESSION_DB_POOL_MAX ||
    5
  );

const dbIdleTimeoutMs =
  Number(
    process.env
      .DB_IDLE_TIMEOUT_MS ||
    30000
  );

const dbConnectionTimeoutMs =
  Number(
    process.env
      .DB_CONNECTION_TIMEOUT_MS ||
    5000
  );


for (
  const [
    variableName,
    value
  ] of [
    [
      'DB_POOL_MAX',
      dbPoolMax
    ],

    [
      'SESSION_DB_POOL_MAX',
      sessionDbPoolMax
    ],

    [
      'DB_IDLE_TIMEOUT_MS',
      dbIdleTimeoutMs
    ],

    [
      'DB_CONNECTION_TIMEOUT_MS',
      dbConnectionTimeoutMs
    ]
  ]
) {
  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      `${variableName} must be a positive integer.`
    );
  }
}

const sessionSecret =
  requireEnvironmentValue(
    'SESSION_SECRET'
  );

if (
  isProduction &&
  sessionSecret.length < 64
) {
  throw new Error(
    'SESSION_SECRET must contain at least 64 characters in production.'
  );
}

const port =
  Number(
    process.env.PORT || 3000
  );

if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  throw new Error(
    'PORT must be an integer between 1 and 65535.'
  );
}

const appBaseUrl =
  readTrimmedEnvironmentValue(
    'APP_BASE_URL'
  ).replace(/\/+$/, '');

if (
  isProduction &&
  !appBaseUrl
) {
  throw new Error(
    'APP_BASE_URL is required in production.'
  );
}

if (appBaseUrl) {
  let parsedBaseUrl;

  try {
    parsedBaseUrl =
      new URL(appBaseUrl);
  } catch (error) {
    throw new Error(
      'APP_BASE_URL must be a valid absolute URL.'
    );
  }

  if (
    isProduction &&
    parsedBaseUrl.protocol !==
      'https:'
  ) {
    throw new Error(
      'APP_BASE_URL must use HTTPS in production.'
    );
  }
}

const trustProxy =
  readTrimmedEnvironmentValue(
    'TRUST_PROXY'
  );

if (
  isProduction &&
  !trustProxy
) {
  throw new Error(
    'TRUST_PROXY is required in production.'
  );
}

const smtpHost =
  readTrimmedEnvironmentValue(
    'SMTP_HOST'
  );

const smtpUser =
  readTrimmedEnvironmentValue(
    'SMTP_USER'
  );

const smtpPass =
  typeof process.env.SMTP_PASS ===
    'string'
    ? process.env.SMTP_PASS
    : '';

const notifyEmail =
  readTrimmedEnvironmentValue(
    'NOTIFY_EMAIL'
  );

const smtpPort =
  Number(
    process.env.SMTP_PORT || 587
  );

if (
  !Number.isInteger(smtpPort) ||
  smtpPort < 1 ||
  smtpPort > 65535
) {
  throw new Error(
    'SMTP_PORT must be an integer between 1 and 65535.'
  );
}

/*
 * SMTP is optional during development.
 *
 * However, once any meaningful SMTP value is provided,
 * all required values must be provided.
 *
 * SMTP_PORT alone does not count because it normally has a
 * default value of 587.
 */
const smtpConfigurationStarted =
  Boolean(
    smtpHost ||
    smtpUser ||
    smtpPass ||
    notifyEmail
  );

if (
  smtpConfigurationStarted &&
  (
    !smtpHost ||
    !smtpUser ||
    !smtpPass ||
    !notifyEmail
  )
) {
  throw new Error(
    'SMTP_HOST, SMTP_USER, SMTP_PASS and NOTIFY_EMAIL must all be provided when email is enabled.'
  );
}

const mailerConfigured =
  smtpConfigurationStarted;

const logLevel =
  readTrimmedEnvironmentValue(
    'LOG_LEVEL'
  ) ||
  (
    isProduction
      ? 'info'
      : 'debug'
  );

if (
  !allowedLogLevels.has(
    logLevel
  )
) {
  throw new Error(
    'LOG_LEVEL contains an unsupported value.'
  );
}

/*
 * ============================================================
 * FILE / OBJECT STORAGE
 * ============================================================
 *
 * Development and automated tests may use the local
 * filesystem.
 *
 * Production will use Cloudflare R2 so uploaded files survive
 * application redeployments and do not depend on one server's
 * filesystem.
 */

const storageDriver =
  readTrimmedEnvironmentValue(
    'STORAGE_DRIVER'
  ) ||
  'local';


if (
  !allowedStorageDrivers.has(
    storageDriver
  )
) {
  throw new Error(
    'STORAGE_DRIVER must be either local or r2.'
  );
}


/*
 * Cloudflare R2 S3-compatible endpoint.
 *
 * Example:
 *
 * https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 */
const r2Endpoint =
  readTrimmedEnvironmentValue(
    'R2_ENDPOINT'
  );


const r2AccessKeyId =
  readTrimmedEnvironmentValue(
    'R2_ACCESS_KEY_ID'
  );


/*
 * Do not trim the secret key.
 *
 * Credentials should be treated as opaque values rather than
 * modified by application code.
 */
const r2SecretAccessKey =
  typeof process.env
    .R2_SECRET_ACCESS_KEY ===
    'string'
    ? process.env
        .R2_SECRET_ACCESS_KEY
    : '';


const r2PublicBucket =
  readTrimmedEnvironmentValue(
    'R2_PUBLIC_BUCKET'
  );


const r2PrivateBucket =
  readTrimmedEnvironmentValue(
    'R2_PRIVATE_BUCKET'
  );


/*
 * Remove trailing slashes so later code can safely construct:
 *
 * `${r2PublicBaseUrl}/${objectKey}`
 *
 * without creating double slashes.
 */
const r2PublicBaseUrl =
  readTrimmedEnvironmentValue(
    'R2_PUBLIC_BASE_URL'
  ).replace(
    /\/+$/,
    ''
  );


/*
 * R2 credentials are required only when the R2 storage driver
 * is enabled.
 *
 * This allows development and automated tests to continue
 * using local filesystem storage without Cloudflare
 * credentials.
 */
if (
  storageDriver ===
    'r2'
) {
  const missingR2Variables =
    [];


  if (!r2Endpoint) {
    missingR2Variables.push(
      'R2_ENDPOINT'
    );
  }


  if (!r2AccessKeyId) {
    missingR2Variables.push(
      'R2_ACCESS_KEY_ID'
    );
  }


  if (!r2SecretAccessKey) {
    missingR2Variables.push(
      'R2_SECRET_ACCESS_KEY'
    );
  }


  if (!r2PublicBucket) {
    missingR2Variables.push(
      'R2_PUBLIC_BUCKET'
    );
  }


  if (!r2PrivateBucket) {
    missingR2Variables.push(
      'R2_PRIVATE_BUCKET'
    );
  }


  if (!r2PublicBaseUrl) {
    missingR2Variables.push(
      'R2_PUBLIC_BASE_URL'
    );
  }


  if (
    missingR2Variables.length >
    0
  ) {
    throw new Error(
      `Missing R2 configuration: ${missingR2Variables.join(', ')}`
    );
  }


  /*
   * Validate the R2 API endpoint.
   */
  let parsedR2Endpoint;


  try {
    parsedR2Endpoint =
      new URL(
        r2Endpoint
      );
  } catch (error) {
    throw new Error(
      'R2_ENDPOINT must be a valid absolute URL.'
    );
  }


  if (
    parsedR2Endpoint.protocol !==
      'https:'
  ) {
    throw new Error(
      'R2_ENDPOINT must use HTTPS.'
    );
  }


  /*
   * Validate the public browser-facing asset URL.
   */
  let parsedPublicBaseUrl;


  try {
    parsedPublicBaseUrl =
      new URL(
        r2PublicBaseUrl
      );
  } catch (error) {
    throw new Error(
      'R2_PUBLIC_BASE_URL must be a valid absolute URL.'
    );
  }


  if (
    parsedPublicBaseUrl.protocol !==
      'https:'
  ) {
    throw new Error(
      'R2_PUBLIC_BASE_URL must use HTTPS.'
    );
  }
}

module.exports = {
  nodeEnv,
  isProduction,
  port,
  databaseUrl,
  dbPoolMax,
  sessionDbPoolMax,
  dbIdleTimeoutMs,
  dbConnectionTimeoutMs,
  sessionSecret,
  appBaseUrl,
  trustProxy,
  smtpHost,
  smtpPort,
  smtpUser,
  smtpPass,
  notifyEmail,
  mailerConfigured,
  logLevel,
  storageDriver,
  r2Endpoint,
  r2AccessKeyId,
  r2SecretAccessKey,
  r2PublicBucket,
  r2PrivateBucket,
  r2PublicBaseUrl
};