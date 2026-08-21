function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHoneypotTriggered(req) {
  return Boolean(cleanText(req.body.website, 200));
}

function validateSchema(schema, data) {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      errors: []
    };
  }

  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message
  }));

  return {
    success: false,
    data: null,
    errors
  };
}

module.exports = {
  cleanText,
  isValidEmail,
  isHoneypotTriggered,
  validateSchema
};
