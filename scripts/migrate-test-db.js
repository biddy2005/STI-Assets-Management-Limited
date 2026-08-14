const {
  spawnSync
} = require(
  'child_process'
);


require('dotenv').config({
  path:
    '.env.test',

  /*
   * The test environment must override values that may already
   * have been loaded from the normal development .env file.
   */
  override:
    true
});


if (
  process.env.NODE_ENV !==
  'test'
) {
  throw new Error(
    'Test database migration refused: NODE_ENV must be test.'
  );
}


const databaseUrl =
  process.env.DATABASE_URL;


if (!databaseUrl) {
  throw new Error(
    'Test database migration refused: DATABASE_URL is missing.'
  );
}


let parsedDatabaseUrl;

try {
  parsedDatabaseUrl =
    new URL(
      databaseUrl
    );
} catch (error) {
  throw new Error(
    'Test database migration refused: DATABASE_URL is invalid.'
  );
}


const databaseName =
  parsedDatabaseUrl.pathname
    .replace(
      /^\/+/,
      ''
    );


/*
 * Never run this script against a database whose name does not
 * clearly identify it as a test database.
 */
if (
  !databaseName ||
  !databaseName
    .toLowerCase()
    .includes(
      'test'
    )
) {
  throw new Error(
    `Test database migration refused: "${databaseName}" does not appear to be a test database.`
  );
}


console.log(
  `Applying migrations to test database: ${databaseName}`
);


/*
 * Run Prisma through Node directly instead of spawning npx.cmd.
 *
 * This avoids Windows .cmd spawning problems and works on
 * Windows, Linux and macOS.
 */
const prismaCliPath =
  require.resolve(
    'prisma/build/index.js'
  );


const result =
  spawnSync(
    process.execPath,
    [
      prismaCliPath,
      'migrate',
      'deploy'
    ],
    {
      stdio:
        'inherit',

      env:
        process.env
    }
  );


if (
  result.error
) {
  throw result.error;
}


process.exit(
  result.status ?? 1
);