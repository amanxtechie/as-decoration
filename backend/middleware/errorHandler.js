/**
 * middleware/errorHandler.js
 * Centralised error responses. Every error body uses `message`; `error` is
 * mirrored for backwards compatibility with the original front end.
 */
import { env } from "../config/env.js";

const body = (message, extra = {}) => ({ message, error: message, ...extra });

export function notFound(req, res) {
  res.status(404).json(body("Resource not found."));
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `File is too large. Maximum is ${Math.round(env.maxUploadSize / 1024 / 1024)} MB.`
        : err.code === "LIMIT_FILE_COUNT"
          ? "Too many files in one upload."
          : "Upload failed.";
    return res.status(400).json(body(message));
  }

  if (err.name === "ValidationError") {
    return res.status(422).json(body("Validation failed.", { details: err.message }));
  }

  // Postgres constraint violations
  if (err.code === "23505") {
    return res.status(409).json(body("That record already exists."));
  }
  if (err.code === "23503") {
    return res.status(400).json(body("That record is still linked to something else."));
  }
  if (err.code === "22P02" || err.code === "23514") {
    return res.status(400).json(body("Invalid value supplied."));
  }

  if (err.status && err.status < 500) {
    return res.status(err.status).json(body(err.message || "Request failed."));
  }

  console.error("[ERROR]", req.method, req.originalUrl, err);
  res.status(500).json(
    body(env.nodeEnv === "production" ? "Something went wrong. Please try again." : err.message)
  );
}

export default { notFound, errorHandler };
