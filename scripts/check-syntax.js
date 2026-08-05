const fs =
  require('node:fs');

const path =
  require('node:path');

const {
  spawnSync
} = require(
  'node:child_process'
);

const projectRoot =
  path.resolve(
    __dirname,
    '..'
  );

const ignoredDirectories =
  new Set([
    'node_modules',
    '.git',
    'coverage',
    'dist',
    'build'
  ]);

const ignoredPathPrefixes = [
  path.join(
    'public',
    'uploads'
  ),

  path.join(
    'storage',
    'private'
  )
];

const supportedExtensions =
  new Set([
    '.js',
    '.cjs',
    '.mjs'
  ]);

const discoveredFiles =
  [];

function shouldIgnoreDirectory(
  absolutePath,
  directoryName
) {
  if (
    ignoredDirectories.has(
      directoryName
    )
  ) {
    return true;
  }

  const relativePath =
    path.relative(
      projectRoot,
      absolutePath
    );

  return ignoredPathPrefixes.some(
    (prefix) => {
      return (
        relativePath === prefix ||
        relativePath.startsWith(
          `${prefix}${path.sep}`
        )
      );
    }
  );
}

function discoverJavaScriptFiles(
  directory
) {
  const entries =
    fs.readdirSync(
      directory,
      {
        withFileTypes: true
      }
    );

  for (
    const entry
    of entries
  ) {
    const absolutePath =
      path.join(
        directory,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      if (
        shouldIgnoreDirectory(
          absolutePath,
          entry.name
        )
      ) {
        continue;
      }

      discoverJavaScriptFiles(
        absolutePath
      );

      continue;
    }

    if (
      !entry.isFile()
    ) {
      continue;
    }

    const extension =
      path.extname(
        entry.name
      );

    if (
      supportedExtensions.has(
        extension
      )
    ) {
      discoveredFiles.push(
        absolutePath
      );
    }
  }
}

discoverJavaScriptFiles(
  projectRoot
);

discoveredFiles.sort();

let failedFiles =
  0;

for (
  const filePath
  of discoveredFiles
) {
  const relativePath =
    path.relative(
      projectRoot,
      filePath
    );

  const result =
    spawnSync(
      process.execPath,
      [
        '--check',
        filePath
      ],
      {
        encoding: 'utf8'
      }
    );

  if (
    result.status === 0
  ) {
    console.log(
      `✓ ${relativePath}`
    );

    continue;
  }

  failedFiles += 1;

  console.error(
    `✗ ${relativePath}`
  );

  if (result.stdout) {
    console.error(
      result.stdout.trim()
    );
  }

  if (result.stderr) {
    console.error(
      result.stderr.trim()
    );
  }
}

if (
  failedFiles > 0
) {
  console.error(
    `\n${failedFiles} JavaScript file(s) failed syntax validation.`
  );

  process.exit(1);
}

console.log(
  `\n${discoveredFiles.length} JavaScript file(s) passed syntax validation.`
);