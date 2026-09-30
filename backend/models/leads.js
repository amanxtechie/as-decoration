/**
 * models/leads.js — enquiries, reviews and customer photo submissions.
 * All three arrive from the public site and sit in a moderation/fulfilment queue.
 */
import { many, one, query } from "../config/db.js";
import { mediaUrl, thumbUrl } from "./media.js";

/* ---------------------------------------------------------------- enquiries */

const ENQUIRY_SELECT = `
  SELECT e.id, e.name, e.phone, e.email, e.event_type, e.event_date, e.budget_note,
         e.requirement, e.district, e.town, e.design_id, e.design_name, e.source,
         e.utm_source, e.utm_medium, e.referrer, e.status, e.notes, e.created_at, e.updated_at,
         d.slug AS design_slug
    FROM enquiries e LEFT JOIN designs d ON d.id = e.design_id`;

function shapeEnquiry(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    eventType: r.event_type,
    eventDate: r.event_date,
    budgetNote: r.budget_note,
    requirement: r.requirement,
    district: r.district,
    town: r.town,
    designId: r.design_id,
    designName: r.design_name,
    designSlug: r.design_slug,
    source: r.source,
    utmSource: r.utm_source,
    utmMedium: r.utm_medium,
    referrer: r.referrer,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    whatsappLink: `https://wa.me/91${r.phone.replace(/\D/g, "").slice(-10)}`,
  };
}

export async function createEnquiry(input) {
  const { rows } = await query(
    `INSERT INTO enquiries
       (name, phone, email, event_type, event_date, budget_note, requirement,
        district, town, design_id, design_name, source, utm_source, utm_medium, referrer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [input.name, input.phone, input.email || "", input.eventType || "", input.eventDate || null,
     input.budgetNote || "", input.requirement || "", input.district || "", input.town || "",
     input.designId || null, input.designName || "", input.source || "website",
     input.utmSource || "", input.utmMedium || "", input.referrer || ""]
  );
  return rows[0].id;
}

export async function listEnquiries(f = {}) {
  const where = [];
  const params = [];
  if (f.status && f.status !== "all") {
    params.push(f.status);
    where.push(`e.status = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`(e.name ILIKE $${params.length} OR e.phone ILIKE $${params.length} OR e.email ILIKE $${params.length} OR e.town ILIKE $${params.length})`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Number(f.limit) || 100, 500);
  const rows = await many(
    `${ENQUIRY_SELECT} ${clause} ORDER BY e.created_at DESC LIMIT ${limit}`, params
  );
  return rows.map(shapeEnquiry);
}

export async function getEnquiry(id) {
  return shapeEnquiry(await one(`${ENQUIRY_SELECT} WHERE e.id = $1`, [id]));
}

export async function updateEnquiryStatus(id, status) {
  return one(
    `UPDATE enquiries SET status = $2, updated_at = now(),
       contacted_at = CASE WHEN $2 <> 'new' THEN COALESCE(contacted_at, now()) ELSE contacted_at END
     WHERE id = $1 RETURNING id`,
    [id, status]
  );
}

export async function updateEnquiryNotes(id, notes) {
  return one("UPDATE enquiries SET notes = $2, updated_at = now() WHERE id = $1 RETURNING id, notes", [id, notes]);
}

export async function deleteEnquiry(id) {
  const res = await query("DELETE FROM enquiries WHERE id = $1", [id]);
  return res.rowCount > 0;
}

/** Every enquiry, for CSV export. */
export async function allEnquiriesForExport() {
  return many(`${ENQUIRY_SELECT} ORDER BY e.created_at DESC`);
}

/* ------------------------------------------------------------------ reviews */

function shapeReview(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    location: r.location,
    eventType: r.event_type,
    rating: r.rating,
    text: r.text,
    status: r.status,
    isCustomer: r.is_customer,
    reply: r.reply,
    repliedAt: r.replied_at,
    createdAt: r.created_at,
  };
}

export async function listReviews(status = "approved") {
  const rows = status === "all"
    ? await many("SELECT * FROM reviews ORDER BY created_at DESC")
    : await many("SELECT * FROM reviews WHERE status = $1 ORDER BY created_at DESC", [status]);
  return rows.map(shapeReview);
}

export async function createReview(input) {
  const { rows } = await query(
    `INSERT INTO reviews (name, location, event_type, rating, text, status, is_customer)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.name, input.location || "", input.eventType || "", input.rating,
     input.text, input.status || "pending", input.isCustomer ?? false]
  );
  return rows[0].id;
}

export async function moderateReview(id, status, reply) {
  const sets = ["status = $2"];
  const params = [id, status];
  if (reply !== undefined) {
    params.push(reply);
    sets.push(`reply = $${params.length}`);
    sets.push(reply ? "replied_at = now()" : "replied_at = NULL");
  }
  return one(`UPDATE reviews SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, params)
    .then(shapeReview);
}

export async function deleteReview(id) {
  const res = await query("DELETE FROM reviews WHERE id = $1", [id]);
  return res.rowCount > 0;
}

/** Aggregate rating + star distribution for the public trust bar. */
export async function reviewSummary() {
  const agg = await one(
    `SELECT COUNT(*)::int AS total,
            COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average
       FROM reviews WHERE status = 'approved'`
  );
  const dist = await many(
    `SELECT rating, COUNT(*)::int AS n FROM reviews
      WHERE status = 'approved' GROUP BY rating ORDER BY rating DESC`
  );
  return { total: agg?.total ?? 0, average: Number(agg?.average ?? 0), distribution: dist };
}

/* ----------------------------------------------------------- photo uploads */

export async function createUpload({ name, eventType, town, mediaId }) {
  const { rows } = await query(
    `INSERT INTO customer_uploads (name, event_type, town, media_id)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [name || "", eventType || "", town || "", mediaId]
  );
  return rows[0].id;
}

function shapeUpload(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    eventType: r.event_type,
    town: r.town,
    status: r.status,
    createdAt: r.created_at,
    image: { id: r.media_id, url: mediaUrl(r.media_id), thumb: thumbUrl(r.media_id), alt: r.name || "customer photo" },
  };
}

export async function listUploads(status = "all") {
  const rows = status === "all"
    ? await many(`SELECT u.*, m.alt FROM customer_uploads u JOIN media m ON m.id = u.media_id ORDER BY u.created_at DESC`)
    : await many(
        `SELECT u.*, m.alt FROM customer_uploads u JOIN media m ON m.id = u.media_id
          WHERE u.status = $1 ORDER BY u.created_at DESC`,
        [status]
      );
  return rows.map(shapeUpload);
}

export async function moderateUpload(id, status) {
  return one("UPDATE customer_uploads SET status = $2 WHERE id = $1 RETURNING id, status", [id, status]);
}

export async function deleteUpload(id) {
  const res = await query("DELETE FROM customer_uploads WHERE id = $1", [id]);
  return res.rowCount > 0;
}
