function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHoneypotTriggered(req) {
  return Boolean(cleanText(req.body.website, 200));
}

module.exports = { cleanText, isValidEmail, isHoneypotTriggered };
