/**
 * middleware/sanitize.js
 * Sanitizes user-supplied HTML strings to prevent stored XSS.
 */
import sanitizeHtml from "sanitize-html";

export function sanitizeString(value) {
  if (typeof value !== "string") return value;
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

export function sanitizeBodyFields(fields) {
  return (req, res, next) => {
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        req.body[f] = sanitizeString(req.body[f]);
      }
    });
    next();
  };
}

export default { sanitizeString, sanitizeBodyFields };
