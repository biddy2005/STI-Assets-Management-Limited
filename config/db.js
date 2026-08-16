const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const env = require('./env');

const adapter =
  new PrismaPg({
    connectionString:
      env.databaseUrl,

    /*
     * Maximum PostgreSQL connections used by Prisma from this
     * Node.js process.
     */
    max:
      env.dbPoolMax,

    /*
     * Release idle connections instead of keeping unnecessary
     * database connections open indefinitely.
     */
    idleTimeoutMillis:
      env.dbIdleTimeoutMs,

    /*
     * Fail reasonably quickly if PostgreSQL cannot accept a
     * connection.
     */
    connectionTimeoutMillis:
      env.dbConnectionTimeoutMs
  });

const prisma = new PrismaClient({
  adapter
});

module.exports = prisma;