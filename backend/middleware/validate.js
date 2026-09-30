/**
 * middleware/validate.js
 * Wraps express-validator result handling into a reusable middleware.
 */
import { validationResult } from "express-validator";

export function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      message: "Please check the highlighted fields.",
      error: "Validation failed.",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

export default handleValidation;
