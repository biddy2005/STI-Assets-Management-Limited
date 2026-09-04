const crypto =
  require('crypto');

const env =
  require('../config/env');


/*
 * Field-level encryption for regulated identifiers.
 *
 * BVN and NIN are personal data under the Nigeria Data
 * Protection Act. They are encrypted before they reach
 * PostgreSQL and decrypted only inside the authenticated
 * admin area, by staff whose access is written to the
 * audit log.
 *
 * AES-256-GCM is used rather than AES-CBC because it
 * authenticates the ciphertext. A tampered value fails to
 * decrypt instead of silently returning wrong plaintext.
 */

const ALGORITHM =
  'aes-256-gcm';


/*
 * GCM is specified for a 96-bit nonce. Longer nonces are
 * permitted but are rehashed internally and gain nothing.
 */
const IV_BYTES =
  12;


const AUTH_TAG_BYTES =
  16;


/*
 * Stored format: v1.<iv>.<authTag>.<ciphertext>
 *
 * The version prefix exists so a future key rotation can
 * decrypt old records while writing new ones under v2.
 */
const FORMAT_VERSION =
  'v1';


let cachedKey =
  null;


/**
 * Resolve and cache the 32-byte encryption key.
 *
 * The key is supplied as base64 in FIELD_ENCRYPTION_KEY.
 * Generate one with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function getKey() {
  if (cachedKey) {
    return cachedKey;
  }


  const rawKey =
    env.fieldEncryptionKey;


  if (!rawKey) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY is not configured. ' +
      'Subscription submissions cannot be stored without it.'
    );
  }


  const keyBuffer =
    Buffer.from(
      rawKey,
      'base64'
    );


  if (
    keyBuffer.length !== 32
  ) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes ' +
      `for AES-256. Received ${keyBuffer.length} bytes.`
    );
  }


  cachedKey =
    keyBuffer;


  return cachedKey;
}


/**
 * Encrypt one sensitive field value.
 *
 * Returns null for empty input so optional fields stay null
 * in the database rather than storing ciphertext of "".
 */
function encryptField(
  plainValue
) {
  if (
    plainValue === null ||
    plainValue === undefined ||
    String(plainValue).trim() === ''
  ) {
    return null;
  }


  const key =
    getKey();


  const iv =
    crypto.randomBytes(
      IV_BYTES
    );


  const cipher =
    crypto.createCipheriv(
      ALGORITHM,
      key,
      iv
    );


  const ciphertext =
    Buffer.concat([
      cipher.update(
        String(plainValue).trim(),
        'utf8'
      ),

      cipher.final()
    ]);


  const authTag =
    cipher.getAuthTag();


  return [
    FORMAT_VERSION,

    iv.toString('base64'),

    authTag.toString('base64'),

    ciphertext.toString('base64')
  ].join('.');
}


/**
 * Decrypt one stored field value.
 *
 * Call this only where an administrator has requested the
 * full value. Do not decrypt for list views.
 */
function decryptField(
  storedValue
) {
  if (
    storedValue === null ||
    storedValue === undefined ||
    storedValue === ''
  ) {
    return null;
  }


  const parts =
    String(storedValue).split('.');


  if (
    parts.length !== 4
  ) {
    throw new Error(
      'Stored value is not in the expected encrypted format.'
    );
  }


  const [
    version,
    ivPart,
    authTagPart,
    ciphertextPart
  ] = parts;


  if (
    version !== FORMAT_VERSION
  ) {
    throw new Error(
      `Unsupported field encryption version: ${version}.`
    );
  }


  const iv =
    Buffer.from(
      ivPart,
      'base64'
    );


  const authTag =
    Buffer.from(
      authTagPart,
      'base64'
    );


  if (
    iv.length !== IV_BYTES ||
    authTag.length !== AUTH_TAG_BYTES
  ) {
    throw new Error(
      'Encrypted value has a malformed nonce or authentication tag.'
    );
  }


  const decipher =
    crypto.createDecipheriv(
      ALGORITHM,
      getKey(),
      iv
    );


  decipher.setAuthTag(
    authTag
  );


  /*
   * decipher.final() throws when the auth tag does not match,
   * which is the behaviour we want: a tampered or wrong-key
   * value must fail loudly rather than return garbage.
   */
  const plaintext =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          ciphertextPart,
          'base64'
        )
      ),

      decipher.final()
    ]);


  return plaintext.toString(
    'utf8'
  );
}


/**
 * Produce a safe display hint for list views.
 *
 * Shows only the final four digits so staff can match a
 * record against a phone call without the full identifier
 * being rendered, logged or screenshotted.
 */
function maskTail(
  plainValue
) {
  const value =
    String(
      plainValue || ''
    ).trim();


  if (
    value.length <= 4
  ) {
    return '•'.repeat(
      value.length
    );
  }


  return (
    '•'.repeat(
      value.length - 4
    ) +
    value.slice(-4)
  );
}


module.exports = {
  encryptField,
  decryptField,
  maskTail
};