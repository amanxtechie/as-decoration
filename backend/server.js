/**
 * server.js
 * Production entry point. On boot it applies the (idempotent) schema and, on a
 * brand-new database, creates the first admin from ADMIN_EMAIL/ADMIN_PASSWORD.
 * Both steps are safe to repeat, which is what makes a Render deploy work
 * without anyone having to shell into the box and run the seed by hand.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { connectDB, query, one } from "./config/db.js";
import { env } from "./config/env.js";
import { createAdmin } from "./models/admin.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** schema.sql is written with IF NOT EXISTS throughout, so re-running is a no-op. */
async function applySchema() {
  const sql = await fs.readFile(path.join(here, "db", "schema.sql"), "utf8");
  await query(sql);
  console.log("[SERVER] Schema is up to date.");
}

/** Create the first admin only when the table is empty, so restarts never reset it. */
async function bootstrapAdmin() {
  const existing = await one("SELECT COUNT(*)::int AS n FROM admins");
  if (existing?.n > 0) {
    console.log("[SERVER] Admin account already exists, leaving it alone.");
    return;
  }
  await createAdmin({ email: env.adminEmail, password: env.adminPassword, name: env.businessName });
  console.log(`[SERVER] Created the first admin account for ${env.adminEmail}`);
  console.log("[SERVER]   Sign in at /admin and change the password straight away.");
}

async function start() {
  try {
    await connectDB();
    await applySchema();
    await bootstrapAdmin();
  } catch (err) {
    // A schema/seed problem must not take the process down silently, but the
    // site is useless without tables, so fail loudly and let Render retry.
    console.error("[SERVER] Database preparation failed:", err.message);
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[SERVER] AS Decoration running on port ${env.port}`);
    console.log(`[SERVER] CORS origins: ${env.clientOrigin.join(", ")}`);
  });
}

start();
