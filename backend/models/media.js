/**
 * models/media.js
 * Image bytes are stored in Postgres (this site has ~20 photos, which keeps
 * hosting to a single platform). Every read path returns an /api/media/:id URL
 * so moving to S3/R2 later is a change to this file only.
 */
import { many, one, query } from "../config/db.js";

export const mediaUrl = (id) => `/api/media/${id}`;
export const thumbUrl = (id) => `/api/media/${id}?w=400`;

/** Shape a media row for API responses (never include the bytes). */
export function toMediaJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    url: mediaUrl(row.id),
    thumb: thumbUrl(row.id),
    width: row.width,
    height: row.height,
    alt: row.alt || "",
    isPlaceholder: row.is_placeholder,
  };
}

export async function insertMedia({
  filename,
  mime,
  data,
  thumb = null,
  width = null,
  height = null,
  alt = "",
  isPlaceholder = false,
}) {
  const { rows } = await query(
    `INSERT INTO media (filename, mime, data, thumb, width, height, bytes, alt, is_placeholder)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [filename, mime, data, thumb, width, height, data.length, alt, isPlaceholder]
  );
  return rows[0].id;
}

/** Fetch the bytes for a variant: full image or the pre-built thumbnail. */
export async function getMedia(id, variant = "full") {
  const wantsThumb = variant === "thumb" || variant === true;
  const column = wantsThumb ? "COALESCE(thumb, data)" : "data";
  return one(`SELECT ${column} AS bytes, mime FROM media WHERE id = $1`, [id]);
}

export async function getMediaBytes(id) {
  return one("SELECT id, mime, data, alt, width, height FROM media WHERE id = $1", [id]);
}

export async function getMediaMeta(id) {
  return one(
    "SELECT id, filename, mime, width, height, bytes, alt, is_placeholder, created_at FROM media WHERE id = $1",
    [id]
  );
}

export async function updateMediaAlt(id, alt) {
  return one("UPDATE media SET alt = $2 WHERE id = $1 RETURNING id, alt", [id, alt]);
}

export async function markPlaceholder(id, isPlaceholder) {
  return one("UPDATE media SET is_placeholder = $2 WHERE id = $1 RETURNING id, is_placeholder", [
    id,
    isPlaceholder,
  ]);
}

export async function deleteMedia(id) {
  const res = await query("DELETE FROM media WHERE id = $1", [id]);
  return res.rowCount > 0;
}

/** Every media row as metadata, newest first (admin library screen). */
export async function listMedia() {
  const rows = await many(
    `SELECT m.id, m.filename, m.mime, m.width, m.height, m.bytes, m.alt, m.is_placeholder, m.created_at,
            (SELECT COUNT(*) FROM design_images di WHERE di.media_id = m.id) AS design_uses,
            (SELECT COUNT(*) FROM gallery_items g WHERE g.media_id = m.id)  AS gallery_uses,
            (SELECT COUNT(*) FROM customer_uploads cu WHERE cu.media_id = m.id) AS upload_uses
       FROM media m ORDER BY m.created_at DESC`
  );
  return rows.map((r) => ({ ...r, url: mediaUrl(r.id), thumb: thumbUrl(r.id) }));
}

/** Count of placeholder images still awaiting the owner's real photo. */
export async function countPlaceholders() {
  const row = await one("SELECT COUNT(*)::int AS n FROM media WHERE is_placeholder = true");
  return row?.n ?? 0;
}

/** Aggregate storage footprint, shown in the admin dashboard. */
export async function storageStats() {
  return one(
    `SELECT COUNT(*)::int AS files,
            COALESCE(SUM(bytes), 0)::bigint AS total_bytes
       FROM media`
  );
}
