const crypto =
  require('crypto');

const {
  putR2Object,
  getR2Object,
  deleteR2Object,
  buildPublicR2Url
} = require(
  '../services/r2-storage.service'
);


async function bodyToString(
  body
) {
  if (!body) {
    return '';
  }


  if (
    typeof body.transformToString ===
      'function'
  ) {
    return body.transformToString();
  }


  const chunks =
    [];


  for await (
    const chunk of body
  ) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }


  return Buffer
    .concat(chunks)
    .toString('utf8');
}


async function main() {
  const testId =
    crypto.randomUUID();


  const publicKey =
    `integration-tests/public-${testId}.txt`;


  const privateKey =
    `integration-tests/private-${testId}.txt`;


  const publicContents =
    `STI R2 public connectivity test ${testId}`;


  const privateContents =
    `STI R2 private connectivity test ${testId}`;


  let publicUploaded =
    false;

  let privateUploaded =
    false;


  try {
    console.log(
      'Uploading public R2 test object...'
    );


    await putR2Object({
      visibility:
        'public',

      objectKey:
        publicKey,

      body:
        Buffer.from(
          publicContents
        ),

      contentType:
        'text/plain',

      cacheControl:
        'no-store'
    });


    publicUploaded =
      true;


    console.log(
      'Public upload successful.'
    );


    console.log(
      'Reading public object through the S3 API...'
    );


    const publicObject =
      await getR2Object({
        visibility:
          'public',

        objectKey:
          publicKey
      });


    const downloadedPublicContents =
      await bodyToString(
        publicObject.Body
      );


    if (
      downloadedPublicContents !==
        publicContents
    ) {
      throw new Error(
        'Public R2 object content did not match the uploaded content.'
      );
    }


    console.log(
      'Public S3 read successful.'
    );


    const publicUrl =
      buildPublicR2Url(
        publicKey
      );


    console.log(
      'Checking the public development URL...'
    );


    const publicResponse =
      await fetch(
        publicUrl,
        {
          cache:
            'no-store'
        }
      );


    if (!publicResponse.ok) {
      throw new Error(
        `Public R2 URL returned HTTP ${publicResponse.status}.`
      );
    }


    const browserContents =
      await publicResponse.text();


    if (
      browserContents !==
        publicContents
    ) {
      throw new Error(
        'Public R2 URL returned unexpected content.'
      );
    }


    console.log(
      'Public development URL successful.'
    );


    console.log(
      'Uploading private R2 test object...'
    );


    await putR2Object({
      visibility:
        'private',

      objectKey:
        privateKey,

      body:
        Buffer.from(
          privateContents
        ),

      contentType:
        'text/plain',

      cacheControl:
        'no-store'
    });


    privateUploaded =
      true;


    console.log(
      'Private upload successful.'
    );


    console.log(
      'Reading private object through the authenticated S3 API...'
    );


    const privateObject =
      await getR2Object({
        visibility:
          'private',

        objectKey:
          privateKey
      });


    const downloadedPrivateContents =
      await bodyToString(
        privateObject.Body
      );


    if (
      downloadedPrivateContents !==
        privateContents
    ) {
      throw new Error(
        'Private R2 object content did not match the uploaded content.'
      );
    }


    console.log(
      'Private authenticated read successful.'
    );


    console.log(
      ''
    );


    console.log(
      'Cloudflare R2 connectivity verification passed.'
    );
  } finally {
    /*
     * Always clean up temporary objects when possible.
     */
    if (publicUploaded) {
      try {
        await deleteR2Object({
          visibility:
            'public',

          objectKey:
            publicKey
        });

        console.log(
          'Public test object deleted.'
        );
      } catch (error) {
        console.error(
          'Could not delete public R2 test object:',
          error.message
        );
      }
    }


    if (privateUploaded) {
      try {
        await deleteR2Object({
          visibility:
            'private',

          objectKey:
            privateKey
        });

        console.log(
          'Private test object deleted.'
        );
      } catch (error) {
        console.error(
          'Could not delete private R2 test object:',
          error.message
        );
      }
    }
  }
}


main()
  .catch(
    (error) => {
      console.error(
        'R2 verification failed:',
        error.message
      );

      process.exitCode =
        1;
    }
  );