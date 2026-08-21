const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  createEditorSchema,
  resetEditorPasswordSchema,
  editorStatusSchema,
  editorIdSchema
} = require(
  '../schemas/editor.schema'
);


test(
  'create Editor schema accepts valid input',
  () => {
    const result =
      createEditorSchema.safeParse({
        email:
          'editor@example.com',

        password:
          'VeryStrongPass1',

        confirmPassword:
          'VeryStrongPass1'
      });

    assert.equal(
      result.success,
      true
    );
  }
);


test(
  'create Editor schema normalizes email',
  () => {
    const result =
      createEditorSchema.parse({
        email:
          '  EDITOR@EXAMPLE.COM  ',

        password:
          'VeryStrongPass1',

        confirmPassword:
          'VeryStrongPass1'
      });

    assert.equal(
      result.email,
      'editor@example.com'
    );
  }
);


test(
  'create Editor schema rejects invalid email',
  () => {
    const result =
      createEditorSchema.safeParse({
        email:
          'invalid-email',

        password:
          'VeryStrongPass1',

        confirmPassword:
          'VeryStrongPass1'
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'create Editor schema rejects short password',
  () => {
    const result =
      createEditorSchema.safeParse({
        email:
          'editor@example.com',

        password:
          'short',

        confirmPassword:
          'short'
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'create Editor schema rejects password over 128 characters',
  () => {
    const password =
      'a'.repeat(129);

    const result =
      createEditorSchema.safeParse({
        email:
          'editor@example.com',

        password,

        confirmPassword:
          password
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'create Editor schema rejects mismatched passwords',
  () => {
    const result =
      createEditorSchema.safeParse({
        email:
          'editor@example.com',

        password:
          'VeryStrongPass1',

        confirmPassword:
          'DifferentPass1'
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'reset Editor password schema accepts matching passwords',
  () => {
    const result =
      resetEditorPasswordSchema.safeParse({
        password:
          'AnotherStrong1',

        confirmPassword:
          'AnotherStrong1'
      });

    assert.equal(
      result.success,
      true
    );
  }
);


test(
  'reset Editor password schema rejects mismatched passwords',
  () => {
    const result =
      resetEditorPasswordSchema.safeParse({
        password:
          'AnotherStrong1',

        confirmPassword:
          'DifferentStrong1'
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'Editor status schema accepts active',
  () => {
    const result =
      editorStatusSchema.safeParse({
        status:
          'active'
      });

    assert.equal(
      result.success,
      true
    );
  }
);


test(
  'Editor status schema accepts inactive',
  () => {
    const result =
      editorStatusSchema.safeParse({
        status:
          'inactive'
      });

    assert.equal(
      result.success,
      true
    );
  }
);


test(
  'Editor status schema rejects unknown status',
  () => {
    const result =
      editorStatusSchema.safeParse({
        status:
          'SUPERADMIN'
      });

    assert.equal(
      result.success,
      false
    );
  }
);

test(
  'Editor ID schema converts a valid route parameter to a number',
  () => {
    const result =
      editorIdSchema.parse(
        '12'
      );

    assert.equal(
      result,
      12
    );
  }
);


test(
  'Editor ID schema rejects zero',
  () => {
    const result =
      editorIdSchema.safeParse(
        '0'
      );

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'Editor ID schema rejects a negative ID',
  () => {
    const result =
      editorIdSchema.safeParse(
        '-1'
      );

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  'Editor ID schema rejects a non-numeric ID',
  () => {
    const result =
      editorIdSchema.safeParse(
        'abc'
      );

    assert.equal(
      result.success,
      false
    );
  }
);