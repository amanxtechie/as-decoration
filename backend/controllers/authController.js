/**
 * controllers/authController.js — JWT admin sessions.
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import * as admins from "../models/admin.js";
import { env } from "../config/env.js";
import { authLimiter } from "../middleware/security.js";

export async function login(req, res) {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const admin = await admins.findByEmail(email);
  // Compare regardless of whether the account exists, to keep timing constant.
  const hash = admin?.password_hash || "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi";
  const ok = await bcrypt.compare(password, hash);

  if (!admin || !ok) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const token = jwt.sign({ sub: admin.id, role: admin.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

  admins.touchLogin(admin.id).catch(() => {});

  res.json({
    token,
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  });
}

export async function me(req, res) {
  res.json({ admin: await admins.findById(req.admin.id) });
}

export async function updateProfile(req, res) {
  const updated = await admins.updateProfile(req.admin.id, {
    name: req.body?.name,
    email: req.body?.email,
  });
  res.json({ admin: updated });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters." });
  }
  const result = await admins.changePassword(req.admin.id, currentPassword, newPassword);
  if (!result.ok) return res.status(400).json({ message: result.error });
  res.json({ message: "Password updated." });
}
