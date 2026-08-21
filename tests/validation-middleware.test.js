const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');

const {
  cleanText,
  isValidEmail,
  isHoneypotTriggered,
  validateSchema
} = require('../middleware/validation.middleware');


test('cleanText trims and limits strings', () => {
  assert.equal(
    cleanText('  hello world  ', 5),
    'hello'
  );
});


test('cleanText returns an empty string for non-string values', () => {
  assert.equal(cleanText(null, 100), '');
  assert.equal(cleanText(undefined, 100), '');
  assert.equal(cleanText(123, 100), '');
});


test('isValidEmail accepts a valid email address', () => {
  assert.equal(
    isValidEmail('person@example.com'),
    true
  );
});


test('isValidEmail rejects an invalid email address', () => {
  assert.equal(
    isValidEmail('not-an-email'),
    false
  );
});


test('isHoneypotTriggered detects a populated website field', () => {
  const req = {
    body: {
      website: 'spam.example.com'
    }
  };

  assert.equal(
    isHoneypotTriggered(req),
    true
  );
});


test('isHoneypotTriggered allows an empty website field', () => {
  const req = {
    body: {
      website: ''
    }
  };

  assert.equal(
    isHoneypotTriggered(req),
    false
  );
});


test('validateSchema returns parsed data when validation succeeds', () => {
  const schema = z.object({
    name: z.string().trim().min(1)
  });

  const result = validateSchema(schema, {
    name: '  Odunayo  '
  });

  assert.equal(result.success, true);
  assert.equal(result.data.name, 'Odunayo');
  assert.deepEqual(result.errors, []);
});


test('validateSchema returns structured errors when validation fails', () => {
  const schema = z.object({
    email: z.string().email('Invalid email address.')
  });

  const result = validateSchema(schema, {
    email: 'invalid'
  });

  assert.equal(result.success, false);
  assert.equal(result.data, null);

  assert.deepEqual(result.errors, [
    {
      field: 'email',
      message: 'Invalid email address.'
    }
  ]);
});