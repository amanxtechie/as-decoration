/**
 * middleware/auth.js
 * JWT authentication for the admin API. The token is verified AND the account
 * is re-checked against Postgres on every request, so deleting an admin
 * immediately invalidates their sessions.
 */
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { findById } from "../models/admin.js";

export function signToken(adminId, role = "admin") {
  return jwt.sign({ sub: adminId, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) return res.status(401).json({ message: "Authentication required." });

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return res.status(401).json({ message: "Session expired. Please sign in again." });
  }

  const admin = await findById(payload.sub);
  if (!admin) return res.status(401).json({ message: "Account no longer exists." });

  req.admin = admin;
  req.adminId = admin.id;
  next();
}

/** Role gate, used for destructive operations such as deleting media. */
export function requireRole(role) {
  return (req, res, next) => {
    if (req.admin?.role !== role) {
      return res.status(403).json({ message: "Your role does not allow this action." });
    }
    next();
  };
}

export default { signToken, requireAuth, requireRole };
