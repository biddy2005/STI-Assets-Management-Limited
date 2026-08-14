const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  cleanText,
  isValidEmail,
  isHoneypotTriggered
} = require(
  '../middleware/validation.middleware'
);


test(
  'cleanText trims and limits text',
  () => {
    assert.equal(
      cleanText(
        '  abcdef  ',
        4
      ),
      'abcd'
    );
  }
);


test(
  'isValidEmail accepts a normal email address',
  () => {
    assert.equal(
      isValidEmail(
        'person@example.com'
      ),
      true
    );
  }
);


test(
  'isValidEmail rejects malformed email addresses',
  () => {
    assert.equal(
      isValidEmail(
        'not-an-email'
      ),
      false
    );
  }
);


test(
  'honeypot detects automated submissions',
  () => {
    assert.equal(
      isHoneypotTriggered({
        body: {
          website:
            'spam.example'
        }
      }),
      true
    );

    assert.equal(
      isHoneypotTriggered({
        body: {
          website: ''
        }
      }),
      false
    );
  }
);