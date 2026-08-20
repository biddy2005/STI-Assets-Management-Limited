const crypto =
  require('crypto');

const env =
  require('../config/env');


/*
 * SHA-256 encoded as base64url produces a 43-character token.
 *
 * Restricting the accepted format lets us reject obviously
 * malformed input before doing unnecessary work.
 */
const TOKEN_PATTERN =
  /^[A-Za-z0-9_-]{43}$/;


/**
 * Creates the canonical value that is cryptographically signed.
 *
 * subscribedAt is included so the token is tied to the
 * subscriber record and not merely to a numeric ID.
 */
function buildTokenPayload({
  id,
  email
}) {
  const normalizedEmail =
    String(email)
      .trim()
      .toLowerCase();

  return [
    id,
    normalizedEmail
  ].join('\n');
}


/**
 * Generates the token placed in the unsubscribe URL.
 *
 * The signing secret itself is never placed in the URL.
 */
function createNewsletterUnsubscribeToken(
  subscriber
) {
  if (
    !env.newsletterUnsubscribeSecret
  ) {
    throw new Error(
      'Newsletter unsubscribe signing is not configured.'
    );
  }

  return crypto
    .createHmac(
      'sha256',
      env.newsletterUnsubscribeSecret
    )
    .update(
      buildTokenPayload(
        subscriber
      )
    )
    .digest(
      'base64url'
    );
}


/**
 * Constant-time comparison prevents timing information from
 * being useful when an attacker submits guessed tokens.
 */
function verifyNewsletterUnsubscribeToken(
  subscriber,
  suppliedToken
) {
  if (
    typeof suppliedToken !==
      'string' ||
    !TOKEN_PATTERN.test(
      suppliedToken
    )
  ) {
    return false;
  }

  let expectedToken;

  try {
    expectedToken =
      createNewsletterUnsubscribeToken(
        subscriber
      );
  } catch (error) {
    return false;
  }

  const suppliedBuffer =
    Buffer.from(
      suppliedToken,
      'utf8'
    );

  const expectedBuffer =
    Buffer.from(
      expectedToken,
      'utf8'
    );

  if (
    suppliedBuffer.length !==
      expectedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    suppliedBuffer,
    expectedBuffer
  );
}


/**
 * Builds the complete public URL that is sent to Power
 * Automate and eventually inserted into newsletter emails.
 */
function buildNewsletterUnsubscribeUrl(
  subscriber
) {
  if (!env.appBaseUrl) {
    throw new Error(
      'APP_BASE_URL is required to create newsletter unsubscribe links.'
    );
  }

  const token =
    createNewsletterUnsubscribeToken(
      subscriber
    );

  return (
    `${env.appBaseUrl}` +
    `/newsletter/unsubscribe/` +
    `${subscriber.id}/` +
    `${token}`
  );
}


module.exports = {
  createNewsletterUnsubscribeToken,
  verifyNewsletterUnsubscribeToken,
  buildNewsletterUnsubscribeUrl
};