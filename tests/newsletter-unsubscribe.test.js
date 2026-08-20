const fs =
  require('node:fs');

const path =
  require('node:path');

const ejs =
  require('ejs');

const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  createNewsletterUnsubscribeToken,
  verifyNewsletterUnsubscribeToken,
  buildNewsletterUnsubscribeUrl
} = require(
  '../utils/newsletterUnsubscribe'
);


const subscriber = {
  id:
    42,

  email:
    'subscriber@example.com',

  subscribedAt:
    new Date(
      '2026-08-20T00:00:00.000Z'
    )
};


test(
  'newsletter unsubscribe token verifies successfully',
  () => {
    const token =
      createNewsletterUnsubscribeToken(
        subscriber
      );

    assert.equal(
      verifyNewsletterUnsubscribeToken(
        subscriber,
        token
      ),
      true
    );
  }
);


test(
  'newsletter unsubscribe token rejects tampering',
  () => {
    const token =
      createNewsletterUnsubscribeToken(
        subscriber
      );

    const replacementCharacter =
      token.endsWith('A')
        ? 'B'
        : 'A';


    const tamperedToken =
      `${token.slice(0, -1)}` +
      replacementCharacter;

    assert.equal(
      verifyNewsletterUnsubscribeToken(
        subscriber,
        tamperedToken
      ),
      false
    );
  }
);


test(
  'newsletter unsubscribe token is bound to the subscriber',
  () => {
    const token =
      createNewsletterUnsubscribeToken(
        subscriber
      );

    const anotherSubscriber = {
      ...subscriber,

      id:
        43
    };

    assert.equal(
      verifyNewsletterUnsubscribeToken(
        anotherSubscriber,
        token
      ),
      false
    );
  }
);


test(
  'newsletter unsubscribe URL contains no email address',
  () => {
    const url =
      buildNewsletterUnsubscribeUrl(
        subscriber
      );

    assert.equal(
      url.includes(
        subscriber.email
      ),
      false
    );

    assert.match(
      url,
      /\/newsletter\/unsubscribe\/42\/[A-Za-z0-9_-]{43}$/
    );
  }
);

test(
  'newsletter unsubscribe views contain valid EJS',
  () => {
    const viewFiles = [
      'newsletter-unsubscribe.ejs',
      'newsletter-unsubscribed.ejs'
    ];


    for (const viewFile of viewFiles) {
      const viewPath =
        path.join(
          __dirname,
          '..',
          'views',
          viewFile
        );


      const template =
        fs.readFileSync(
          viewPath,
          'utf8'
        );


      assert.doesNotThrow(
        () => {
          ejs.compile(
            template,
            {
              filename:
                viewPath
            }
          );
        }
      );
    }
  }
);