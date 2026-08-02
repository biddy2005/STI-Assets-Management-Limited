require('dotenv').config();

const requiredVariables = [
  'DATABASE_URL',
  'SESSION_SECRET'
];

for (const variableName of requiredVariables) {
  if (!process.env[variableName]) {
    throw new Error(
      `Missing required environment variable: ${variableName}`
    );
  }
}

const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid number.');
}

const isProduction =
  process.env.NODE_ENV === 'production';

if (
  isProduction &&
  process.env.SESSION_SECRET.length < 64
) {
  throw new Error(
    'SESSION_SECRET must contain at least 64 characters in production.'
  );
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port,
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET
};