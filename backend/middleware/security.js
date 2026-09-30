/**
 * middleware/security.js
 * Rate limiting, HTML escaping and bot traps.
 *
 * The escaping helper exists because the previous version injected API content
 * (design names, review text, admin-authored copy) into the DOM through
 * innerHTML without escaping, which is a stored-XSS hole.
 */
import rateLimit from "express-rate-limit";

const json = (message) => ({ message });

/* ------------------------------------------------------------- rate limits */

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many login attempts. Please try again in 15 minutes."),
});

export const enquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many enquiries sent. Please try again later or message us on WhatsApp."),
});

export const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many submissions. Please try again later."),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Upload limit reached. Please try again later."),
});

/* ---------------------------------------------------------------- escaping */

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/**
 * Escape a value for safe interpolation into innerHTML.
 * Use for any value that came from the database or a user.
 */
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (c) => HTML_ENTITIES[c]);
}

/**
 * Escape a value destined for an HTML attribute (src, href, alt).
 * Blocks javascript: URLs as well as markup.
 */
export function escAttr(value) {
  const s = esc(value);
  return /^\s*(javascript|data|vbscript):/i.test(String(value ?? ""))
    ? ""
    : s;
}

/** Only allow http(s) URLs through, for admin-supplied image links. */
export function safeUrl(value) {
  const s = String(value ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

/* -------------------------------------------------------------- bot traps */

/**
 * Honeypot. Real users never see the field; bots fill everything in.
 * Returns true when the submission looks automated.
 */
export function isHoneypot(body) {
  return Boolean(body?.website || body?.company || body?._gotcha);
}

/* ------------------------------------------------------------ header policy */

export function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
}
