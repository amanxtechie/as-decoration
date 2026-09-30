/**
 * models/content.js — gallery ("Our Work") and upcoming events.
 */
import { many, one, query } from "../config/db.js";
import { mediaUrl, thumbUrl } from "./media.js";

/* ------------------------------------------------------------------ gallery */

const GALLERY_SELECT = `
  SELECT g.id, g.title, g.description, g.town, g.event_date, g.featured, g.active, g.sort_order,
         g.created_at, g.category_id, g.subcategory_id, g.media_id,
         c.slug AS category_slug, c.name AS category_name,
         s.slug AS subcategory_slug, s.name AS subcategory_name,
         m.filename, m.width, m.height, m.alt, m.is_placeholder
    FROM gallery_items g
    LEFT JOIN categories    c ON c.id = g.category_id
    LEFT JOIN subcategories s ON s.id = g.subcategory_id
    JOIN media              m ON m.id = g.media_id`;

function shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    town: row.town,
    eventDate: row.event_date,
    featured: row.featured,
    active: row.active,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    subcategoryId: row.subcategory_id,
    subcategorySlug: row.subcategory_slug,
    subcategoryName: row.subcategory_name,
    image: {
      id: row.media_id,
      url: mediaUrl(row.media_id),
      thumb: thumbUrl(row.media_id),
      width: row.width,
      height: row.height,
      alt: row.alt || row.title,
      isPlaceholder: row.is_placeholder,
    },
  };
}

export async function listGallery(f = {}) {
  const where = ["g.active"];
  const params = [];
  if (f.category) {
    params.push(f.category);
    where.push(`c.slug = $${params.length}`);
  }
  if (f.town) {
    params.push(f.town);
    where.push(`LOWER(g.town) = LOWER($${params.length})`);
  }
  return (await many(`${GALLERY_SELECT} WHERE ${where.join(" AND ")}
                      ORDER BY g.featured DESC, g.sort_order, g.event_date DESC NULLS LAST, g.id DESC`, params)).map(shape);
}

export async function adminListGallery() {
  return (await many(`${GALLERY_SELECT} ORDER BY g.id DESC`)).map(shape);
}

export async function getGalleryItem(id) {
  return shape(await one(`${GALLERY_SELECT} WHERE g.id = $1`, [id]));
}

export async function createGalleryItem(input) {
  const { rows } = await query(
    `INSERT INTO gallery_items (title, description, category_id, subcategory_id, media_id, town, event_date, featured, active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [input.title, input.description || "", input.categoryId || null, input.subcategoryId || null,
     input.mediaId, input.town || null, input.eventDate || null,
     input.featured ?? false, input.active ?? true, input.sortOrder ?? 0]
  );
  return rows[0].id;
}

export async function updateGalleryItem(id, input) {
  const sets = [];
  const params = [id];
  const set = (c, v) => { params.push(v); sets.push(`${c} = $${params.length}`); };
  if (input.title !== undefined) set("title", input.title);
  if (input.description !== undefined) set("description", input.description);
  if (input.categoryId !== undefined) set("category_id", input.categoryId || null);
  if (input.subcategoryId !== undefined) set("subcategory_id", input.subcategoryId || null);
  if (input.mediaId !== undefined) set("media_id", input.mediaId);
  if (input.town !== undefined) set("town", input.town || null);
  if (input.eventDate !== undefined) set("event_date", input.eventDate || null);
  if (input.featured !== undefined) set("featured", input.featured);
  if (input.active !== undefined) set("active", input.active);
  if (input.sortOrder !== undefined) set("sort_order", input.sortOrder);
  if (sets.length) await query(`UPDATE gallery_items SET ${sets.join(", ")} WHERE id = $1`, params);
  return getGalleryItem(id);
}

export async function deleteGalleryItem(id) {
  const res = await query("DELETE FROM gallery_items WHERE id = $1", [id]);
  return res.rowCount > 0;
}

/* ------------------------------------------------------------------- events */

/** Only events whose window contains today are public. */
export async function listLiveEvents() {
  return many(
    `SELECT e.id, e.title, e.subtitle, e.description, e.start_date, e.end_date, e.media_id, m.filename,
            CASE
              WHEN CURRENT_DATE BETWEEN e.start_date AND e.end_date THEN 'live'
              WHEN e.start_date > CURRENT_DATE THEN 'upcoming'
              ELSE 'past'
            END AS state,
            (e.end_date - CURRENT_DATE) AS days_left
       FROM events e LEFT JOIN media m ON m.id = e.media_id
      WHERE e.active AND e.end_date >= CURRENT_DATE
      ORDER BY e.start_date ASC`
  );
}

export async function adminListEvents() {
  return many(
    `SELECT e.id, e.title, e.subtitle, e.description, e.start_date, e.end_date, e.active,
            e.sort_order, e.media_id, m.filename,
            CASE
              WHEN e.end_date < CURRENT_DATE THEN 'expired'
              WHEN CURRENT_DATE BETWEEN e.start_date AND e.end_date THEN 'live'
              ELSE 'upcoming'
            END AS state
       FROM events e LEFT JOIN media m ON m.id = e.media_id
      ORDER BY e.start_date DESC`
  );
}

export async function createEvent(input) {
  const { rows } = await query(
    `INSERT INTO events (title, subtitle, description, media_id, start_date, end_date, active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [input.title, input.subtitle || "", input.description || "", input.mediaId || null,
     input.startDate, input.endDate, input.active ?? true, input.sortOrder ?? 0]
  );
  return rows[0].id;
}

export async function updateEvent(id, input) {
  const sets = [];
  const params = [id];
  const set = (c, v) => { params.push(v); sets.push(`${c} = $${params.length}`); };
  if (input.title !== undefined) set("title", input.title);
  if (input.subtitle !== undefined) set("subtitle", input.subtitle);
  if (input.description !== undefined) set("description", input.description);
  if (input.mediaId !== undefined) set("media_id", input.mediaId || null);
  if (input.startDate !== undefined) set("start_date", input.startDate);
  if (input.endDate !== undefined) set("end_date", input.endDate);
  if (input.active !== undefined) set("active", input.active);
  if (input.sortOrder !== undefined) set("sort_order", input.sortOrder);
  if (sets.length) await query(`UPDATE events SET ${sets.join(", ")} WHERE id = $1`, params);
  return one("SELECT * FROM events WHERE id = $1", [id]);
}

export async function deleteEvent(id) {
  const res = await query("DELETE FROM events WHERE id = $1", [id]);
  return res.rowCount > 0;
}
