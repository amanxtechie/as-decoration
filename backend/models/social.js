/**
 * models/social.js — YouTube videos, Instagram embeds, social links, settings.
 * The owner's YouTube and Instagram stay the source of truth; the site only
 * embeds them, so there is no video hosting cost.
 */
import { many, one, query } from "../config/db.js";

/* ------------------------------------------------------------------ youtube */

const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** Accept a full URL or a bare 11-character id. */
export function parseYoutubeId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(YOUTUBE_RE);
  return m ? m[1] : null;
}

export async function listVideos(includeInactive = false) {
  return many(
    `SELECT v.id, v.youtube_id, v.title, v.description, v.sort_order, v.active, v.category_id,
            c.slug AS category_slug, c.name AS category_name
       FROM videos v LEFT JOIN categories c ON c.id = v.category_id
      ${includeInactive ? "" : "WHERE v.active"}
      ORDER BY v.sort_order, v.id DESC`
  ).then((rows) => rows.map((r) => ({ ...r, embedUrl: `https://www.youtube-nocookie.com/embed/${r.youtube_id}` })));
}

export async function createVideo(input) {
  const { rows } = await query(
    `INSERT INTO videos (youtube_id, title, description, category_id, sort_order, active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [input.youtubeId, input.title || "", input.description || "", input.categoryId || null,
     input.sortOrder ?? 0, input.active ?? true]
  );
  return rows[0].id;
}

export async function updateVideo(id, input) {
  const sets = [];
  const params = [id];
  const set = (c, v) => { params.push(v); sets.push(`${c} = $${params.length}`); };
  if (input.youtubeId !== undefined) set("youtube_id", input.youtubeId);
  if (input.title !== undefined) set("title", input.title);
  if (input.description !== undefined) set("description", input.description);
  if (input.categoryId !== undefined) set("category_id", input.categoryId || null);
  if (input.sortOrder !== undefined) set("sort_order", input.sortOrder);
  if (input.active !== undefined) set("active", input.active);
  if (sets.length) await query(`UPDATE videos SET ${sets.join(", ")} WHERE id = $1`, params);
  return one("SELECT * FROM videos WHERE id = $1", [id]);
}

export async function deleteVideo(id) {
  const res = await query("DELETE FROM videos WHERE id = $1", [id]);
  return res.rowCount > 0;
}

/* ---------------------------------------------------------------- instagram */

export function parseInstagramUrl(input) {
  if (!input) return null;
  const m = String(input).trim().match(/instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/` : null;
}

/**
 * Fetch embed HTML from Meta's oEmbed endpoint. As of June 2026 this endpoint
 * is callable without an access token and without App Review.
 * Returns the raw embed HTML on success, or null so the caller can fall back to
 * a simple link card.
 */
export async function fetchInstagramEmbed(permalink) {
  const endpoint = `https://graph.facebook.com/v25.0/instagram_oembed?url=${encodeURIComponent(permalink)}&hidecaption=true&maxwidth=658`;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return { html: data.html || "", title: data.title || "" };
  } catch {
    return null;
  }
}

export async function listInstagramPosts(includeInactive = false) {
  return many(
    `SELECT * FROM instagram_posts ${includeInactive ? "" : "WHERE active"}
      ORDER BY sort_order, id DESC`
  );
}

export async function createInstagramPost({ permalink, embedHtml = "", caption = "" }) {
  const { rows } = await query(
    `INSERT INTO instagram_posts (permalink, embed_html, caption, sort_order)
     VALUES ($1,$2,$3,COALESCE((SELECT MAX(sort_order)+1 FROM instagram_posts),0)) RETURNING id`,
    [permalink, embedHtml, caption]
  );
  return rows[0].id;
}

export async function updateInstagramPost(id, input) {
  const sets = [];
  const params = [id];
  const set = (c, v) => { params.push(v); sets.push(`${c} = $${params.length}`); };
  if (input.permalink !== undefined) set("permalink", input.permalink);
  if (input.embedHtml !== undefined) set("embed_html", input.embedHtml);
  if (input.caption !== undefined) set("caption", input.caption);
  if (input.sortOrder !== undefined) set("sort_order", input.sortOrder);
  if (input.active !== undefined) set("active", input.active);
  if (sets.length) await query(`UPDATE instagram_posts SET ${sets.join(", ")} WHERE id = $1`, params);
  return one("SELECT * FROM instagram_posts WHERE id = $1", [id]);
}

export async function deleteInstagramPost(id) {
  const res = await query("DELETE FROM instagram_posts WHERE id = $1", [id]);
  return res.rowCount > 0;
}

/* ------------------------------------------------------------ social links */

export async function listSocialLinks(includeInactive = false) {
  return many(
    `SELECT * FROM social_links ${includeInactive ? "" : "WHERE active"} ORDER BY sort_order, id`
  );
}

export async function createSocialLink(input) {
  const { rows } = await query(
    `INSERT INTO social_links (platform, url, handle, label, sort_order, active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [input.platform, input.url, input.handle || "", input.label || "", input.sortOrder ?? 0, input.active ?? true]
  );
  return rows[0].id;
}

export async function updateSocialLink(id, input) {
  const sets = [];
  const params = [id];
  const set = (c, v) => { params.push(v); sets.push(`${c} = $${params.length}`); };
  if (input.url !== undefined) set("url", input.url);
  if (input.handle !== undefined) set("handle", input.handle);
  if (input.label !== undefined) set("label", input.label);
  if (input.sortOrder !== undefined) set("sort_order", input.sortOrder);
  if (input.active !== undefined) set("active", input.active);
  if (sets.length) await query(`UPDATE social_links SET ${sets.join(", ")} WHERE id = $1`, params);
  return one("SELECT * FROM social_links WHERE id = $1", [id]);
}

export async function deleteSocialLink(id) {
  const res = await query("DELETE FROM social_links WHERE id = $1", [id]);
  return res.rowCount > 0;
}

/* ---------------------------------------------------------------- settings */

export async function getSetting(key, fallback = null) {
  const row = await one("SELECT value FROM settings WHERE key = $1", [key]);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  return one(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now() RETURNING key, value`,
    [key, JSON.stringify(value)]
  );
}
