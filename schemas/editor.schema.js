const { z } = require('zod');

const EDITOR_MIN_PASSWORD_LENGTH =
  14;

const EDITOR_MAX_PASSWORD_LENGTH =
  128;


const editorEmailSchema =
  z.preprocess(
    (value) => (
      typeof value === 'string'
        ? value
            .trim()
            .toLowerCase()
        : ''
    ),

    z
      .string()
      .max(254)
      .email()
  );


const editorPasswordSchema =
  z.preprocess(
    (value) => (
      typeof value === 'string'
        ? value
        : ''
    ),

    z
      .string()
      .min(
        EDITOR_MIN_PASSWORD_LENGTH
      )
      .max(
        EDITOR_MAX_PASSWORD_LENGTH
      )
  );


const createEditorSchema =
  z
    .object({
      email:
        editorEmailSchema,

      password:
        editorPasswordSchema,

      confirmPassword:
        editorPasswordSchema
    })
    .refine(
      (data) => (
        data.password ===
        data.confirmPassword
      ),
      {
        message:
          'The passwords do not match.',

        path: [
          'confirmPassword'
        ]
      }
    );


const resetEditorPasswordSchema =
  z
    .object({
      password:
        editorPasswordSchema,

      confirmPassword:
        editorPasswordSchema
    })
    .refine(
      (data) => (
        data.password ===
        data.confirmPassword
      ),
      {
        message:
          'The new passwords do not match.',

        path: [
          'confirmPassword'
        ]
      }
    );


const editorStatusSchema =
  z.object({
    status:
      z.preprocess(
        (value) => (
          typeof value === 'string'
            ? value.trim()
            : ''
        ),

        z.enum([
          'active',
          'inactive'
        ])
      )
  });


const editorIdSchema =
  z.preprocess(
    (value) => {
      if (
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        return Number(value);
      }

      return value;
    },

    z
      .number()
      .int()
      .positive()
  );


module.exports = {
  createEditorSchema,
  resetEditorPasswordSchema,
  editorStatusSchema,
  editorIdSchema
};