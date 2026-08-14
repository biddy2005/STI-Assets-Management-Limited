const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('fs/promises');

const path =
  require('path');

const crypto =
  require('crypto');


const {
  resumeDirectory,
  newsUploadDirectory
} = require(
  '../config/storage'
);


const {
  getStorageDriver,
  savePublicFile,
  getPublicFileUrl,
  deletePublicFile,
  savePrivateFile,
  getPrivateFile,
  deletePrivateFile
} = require(
  '../services/storage.service'
);


/*
 * Automated tests use STORAGE_DRIVER=local.
 *
 * They must never contact the real Cloudflare R2 account.
 */

test(
  'storage abstraction uses local driver during automated tests',
  () => {
    assert.equal(
      getStorageDriver(),
      'local'
    );
  }
);


test(
  'private file can be saved, read and deleted through the storage abstraction',
  async () => {
    const storageKey =
      `${crypto.randomUUID()}.pdf`;

    const testContents =
      Buffer.from(
        '%PDF-storage-service-test'
      );

    const expectedPath =
      path.join(
        resumeDirectory,
        storageKey
      );


    try {
      const saved =
        await savePrivateFile({
          storageKey,

          body:
            testContents,

          contentType:
            'application/pdf'
        });


      assert.equal(
        saved.driver,
        'local'
      );


      assert.equal(
        saved.storageKey,
        storageKey
      );


      const storedBytes =
        await fs.readFile(
          expectedPath
        );


      assert.deepEqual(
        storedBytes,
        testContents
      );


      const retrieved =
        await getPrivateFile({
          storageKey
        });


      assert.equal(
        retrieved.driver,
        'local'
      );


      assert.equal(
        retrieved.contentType,
        'application/pdf'
      );


      assert.deepEqual(
        retrieved.body,
        testContents
      );


      const deletion =
        await deletePrivateFile({
          storageKey
        });


      assert.equal(
        deletion.deleted,
        true
      );


      await assert.rejects(
        fs.access(
          expectedPath
        ),
        {
          code:
            'ENOENT'
        }
      );
    } finally {
      await fs
        .unlink(
          expectedPath
        )
        .catch(
          () => {}
        );
    }
  }
);


test(
  'missing private file can be deleted safely',
  async () => {
    const storageKey =
      `${crypto.randomUUID()}.pdf`;


    const result =
      await deletePrivateFile({
        storageKey
      });


    assert.equal(
      result.driver,
      'local'
    );


    assert.equal(
      result.deleted,
      false
    );
  }
);


test(
  'public News file can be saved and deleted through the storage abstraction',
  async () => {
    const storageKey =
      `${crypto.randomUUID()}.jpg`;

    const testContents =
      Buffer.from([
        0xff,
        0xd8,
        0xff,
        0xe0
      ]);

    const expectedPath =
      path.join(
        newsUploadDirectory,
        storageKey
      );


    try {
      const saved =
        await savePublicFile({
          category:
            'news',

          storageKey,

          body:
            testContents,

          contentType:
            'image/jpeg'
        });


      assert.equal(
        saved.driver,
        'local'
      );


      assert.equal(
        saved.publicUrl,
        `/uploads/news/${storageKey}`
      );


      const storedBytes =
        await fs.readFile(
          expectedPath
        );


      assert.deepEqual(
        storedBytes,
        testContents
      );


      assert.equal(
        getPublicFileUrl({
          category:
            'news',

          storageKey
        }),

        `/uploads/news/${storageKey}`
      );


      const deletion =
        await deletePublicFile({
          category:
            'news',

          storageKey
        });


      assert.equal(
        deletion.deleted,
        true
      );
    } finally {
      await fs
        .unlink(
          expectedPath
        )
        .catch(
          () => {}
        );
    }
  }
);


test(
  'storage abstraction rejects unsupported public categories',
  async () => {
    await assert.rejects(
      savePublicFile({
        category:
          'unknown',

        storageKey:
          `${crypto.randomUUID()}.jpg`,

        body:
          Buffer.from('test'),

        contentType:
          'image/jpeg'
      }),

      /Unsupported public storage category/
    );
  }
);


test(
  'storage abstraction rejects path traversal in storage keys',
  async () => {
    await assert.rejects(
      savePrivateFile({
        storageKey:
          '../resume.pdf',

        body:
          Buffer.from('test'),

        contentType:
          'application/pdf'
      }),

      /Storage key contains unsupported characters/
    );
  }
);


test(
  'storage abstraction rejects directory separators in generated filenames',
  async () => {
    await assert.rejects(
      savePrivateFile({
        storageKey:
          'folder\\resume.pdf',

        body:
          Buffer.from('test'),

        contentType:
          'application/pdf'
      }),

      /Storage key contains unsupported characters/
    );
  }
);