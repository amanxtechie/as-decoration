/**
 * routes/auth.js
 */
import { Router } from "express";
import * as authCtl from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { handleValidation } from "../middleware/validate.js";
import { body } from "express-validator";
import { authLimiter } from "../middleware/security.js";

const router = Router();

router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Enter a valid email."),
    body("password").isLength({ min: 6 }).withMessage("Enter your password."),
  ],
  handleValidation,
  authCtl.login
);

router.get("/me", requireAuth, authCtl.me);
router.patch("/me", requireAuth, authCtl.updateProfile);
router.post(
  "/password",
  requireAuth,
  [body("newPassword").isLength({ min: 8 }).withMessage("Use at least 8 characters.")],
  handleValidation,
  authCtl.changePassword
);

export default router;
