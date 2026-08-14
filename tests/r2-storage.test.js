const test =
  require('node:test');

const assert =
  require('node:assert/strict');


const {
  r2Client,
  isR2Enabled
} = require(
  '../config/r2'
);


const {
  putR2Object,
  getR2Object,
  deleteR2Object
} = require(
  '../services/r2-storage.service'
);


test(
  'R2 client is disabled when STORAGE_DRIVER is local',
  () => {
    assert.equal(
      isR2Enabled(),
      false
    );

    assert.equal(
      r2Client,
      null
    );
  }
);


test(
  'R2 upload cannot run when R2 storage is disabled',
  async () => {
    await assert.rejects(
      putR2Object({
        visibility:
          'public',

        objectKey:
          'tests/example.txt',

        body:
          Buffer.from(
            'test'
          ),

        contentType:
          'text/plain'
      }),

      /Cloudflare R2 storage is not enabled/
    );
  }
);


test(
  'R2 private download cannot run when R2 storage is disabled',
  async () => {
    await assert.rejects(
      getR2Object({
        visibility:
          'private',

        objectKey:
          'resumes/example.pdf'
      }),

      /Cloudflare R2 storage is not enabled/
    );
  }
);


test(
  'R2 delete cannot run when R2 storage is disabled',
  async () => {
    await assert.rejects(
      deleteR2Object({
        visibility:
          'public',

        objectKey:
          'news/example.jpg'
      }),

      /Cloudflare R2 storage is not enabled/
    );
  }
);