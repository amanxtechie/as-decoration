/**
 * models/admin.js — admin accounts and password hashing.
 */
import bcrypt from "bcryptjs";
import { many, one, query } from "../config/db.js";

export async function findByEmail(email) {
  return one("SELECT * FROM admins WHERE email = $1", [String(email).toLowerCase().trim()]);
}

export async function findById(id) {
  return one("SELECT id, email, name, role, last_login_at, created_at FROM admins WHERE id = $1", [id]);
}

export async function createAdmin({ email, password, name = "Admin", role = "admin" }) {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    "INSERT INTO admins (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role",
    [String(email).toLowerCase().trim(), hash, name, role]
  );
  return rows[0];
}

export async function touchLogin(id) {
  await query("UPDATE admins SET last_login_at = now() WHERE id = $1", [id]);
}

export async function updateProfile(id, { name, email }) {
  return one(
    "UPDATE admins SET name = COALESCE($2, name), email = COALESCE($3, email) WHERE id = $1 RETURNING id, name, email, role",
    [id, name || null, email ? String(email).toLowerCase().trim() : null]
  );
}

/** Verify current password and set a new one. */
export async function changePassword(id, currentPassword, newPassword) {
  const admin = await one("SELECT password_hash FROM admins WHERE id = $1", [id]);
  if (!admin) return { ok: false, error: "Account not found." };
  const matches = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!matches) return { ok: false, error: "Current password is incorrect." };
  const hash = await bcrypt.hash(newPassword, 12);
  await query("UPDATE admins SET password_hash = $2 WHERE id = $1", [id, hash]);
  return { ok: true };
}

export async function listAdmins() {
  return many("SELECT id, email, name, role, last_login_at, created_at FROM admins ORDER BY id");
}
