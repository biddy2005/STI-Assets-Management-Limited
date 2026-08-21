const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viewsDir = path.join(__dirname, '..', 'views');

function getEjsFiles(directory) {
  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });

  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return getEjsFiles(fullPath);
    }

    return entry.isFile() && entry.name.endsWith('.ejs')
      ? [fullPath]
      : [];
  });
}

test('EJS raw output is only used for includes', () => {
  const files = getEjsFiles(viewsDir);

  const violations = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');

    const rawOutputPattern = /<%-([\s\S]*?)%>/g;

    for (const match of source.matchAll(rawOutputPattern)) {
      const expression = match[1].trim();

      if (!expression.startsWith('include(')) {
        violations.push({
          file: path.relative(process.cwd(), file),
          expression,
        });
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Unsafe raw EJS output found:\n${violations
      .map(
        ({ file, expression }) =>
          `${file}: <%- ${expression} %>`
      )
      .join('\n')}`
  );
});

test('application views do not use unsafe DOM HTML injection APIs', () => {
  const files = getEjsFiles(viewsDir);

  const unsafePatterns = [
    '.innerHTML',
    '.outerHTML',
    'insertAdjacentHTML(',
  ];

  const violations = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');

    for (const pattern of unsafePatterns) {
      if (source.includes(pattern)) {
        violations.push({
          file: path.relative(process.cwd(), file),
          pattern,
        });
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Unsafe DOM HTML API found:\n${violations
      .map(
        ({ file, pattern }) =>
          `${file}: ${pattern}`
      )
      .join('\n')}`
  );
});