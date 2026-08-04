require('dotenv').config();

const allowedNodeEnvironments =
  new Set([
    'development',
    'test',
    'production'
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

module.exports = {
  nodeEnv,
  isProduction,
  port,
  databaseUrl,
  sessionSecret,
  appBaseUrl,
  trustProxy,
  smtpHost,
  smtpPort,
  smtpUser,
  smtpPass,
  notifyEmail,
  mailerConfigured,
  logLevel
};