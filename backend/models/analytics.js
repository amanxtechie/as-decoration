/**
 * models/analytics.js
 * Dashboard counters plus the reporting queries behind them. This is the payoff
 * of moving to SQL — GROUP BY is the whole point.
 */
import { many, one, query } from "../config/db.js";

/* ------------------------------------------------------------ page tracking */

const BOT_RE = /bot|crawl|spider|preview|facebookexternalhit|slurp|whatsapp/i;

export async function recordPageView(path, referrer = "") {
  await query(
    "INSERT INTO page_views (path, referrer, is_bot) VALUES ($1, $2, $3)",
    [String(path).slice(0, 300), String(referrer).slice(0, 300), BOT_RE.test(referrer)]
  );
}

/* ---------------------------------------------------------------- dashboard */

export async function dashboardStats() {
  const counts = await one(`
    SELECT
      (SELECT COUNT(*) FROM enquiries)                                        AS totalEnquiries,
      (SELECT COUNT(*) FROM enquiries WHERE status = 'new')                   AS newEnquiries,
      (SELECT COUNT(*) FROM enquiries
         WHERE created_at > now() - interval '30 days')                      AS monthEnquiries,
      (SELECT COUNT(*) FROM reviews WHERE status = 'pending')                 AS pendingReviews,
      (SELECT COUNT(*) FROM reviews WHERE status = 'approved')                AS approvedReviews,
      (SELECT COUNT(*) FROM customer_uploads WHERE status = 'pending')        AS pendingUploads,
      (SELECT COUNT(*) FROM designs WHERE active)                             AS activeDesigns,
      (SELECT COUNT(*) FROM designs WHERE active AND featured)                AS featuredDesigns,
      (SELECT COUNT(*) FROM gallery_items WHERE active)                       AS galleryItems,
      (SELECT COUNT(*) FROM events WHERE active
         AND end_date >= CURRENT_DATE)                                        AS liveEvents,
      (SELECT COUNT(*) FROM media WHERE is_placeholder)                       AS placeholders,
      (SELECT COUNT(*) FROM videos WHERE active)                               AS videos,
      (SELECT COUNT(*) FROM instagram_posts WHERE active)                     AS instagramPosts,
      (SELECT COUNT(*) FROM page_views
         WHERE is_bot = false AND created_at > now() - interval '30 days')    AS views30d
  `);

  const rating = await one(
    "SELECT COALESCE(ROUND(AVG(rating)::numeric,1),0) AS average FROM reviews WHERE status = 'approved'"
  );

  const conversion = await one(`
    SELECT
      (SELECT COUNT(DISTINCT phone) FROM enquiries) AS unique_leads,
      (SELECT COUNT(*) FROM page_views WHERE is_bot = false
         AND created_at > now() - interval '30 days') AS views_30d
  `);

  // Postgres lower-cases unquoted aliases, so map to camelCase explicitly.
  return {
    totalEnquiries: counts.totalenquiries,
    newEnquiries: counts.newenquiries,
    monthEnquiries: counts.monthenquiries,
    pendingReviews: counts.pendingreviews,
    approvedReviews: counts.approvedreviews,
    pendingUploads: counts.pendinguploads,
    activeDesigns: counts.activedesigns,
    featuredDesigns: counts.featureddesigns,
    galleryItems: counts.galleryitems,
    liveEvents: counts.liveevents,
    placeholders: counts.placeholders,
    videos: counts.videos,
    instagramPosts: counts.instagramposts,
    views30d: counts.views30d,
    averageRating: Number(rating?.average ?? 0),
    uniqueLeads: conversion?.unique_leads ?? 0,
  };
}

/** Enquiries per day for the last N days (dashboard line chart). */
export async function enquiriesOverTime(days = 30) {
  return many(
    `SELECT d::date AS day, COUNT(e.id)::int AS enquiries
       FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, '1 day') d
       LEFT JOIN enquiries e ON e.created_at::date = d::date
      GROUP BY d ORDER BY d`,
    [days]
  );
}

/** Enquiry count grouped by district/town. */
export async function enquiriesByArea(limit = 8) {
  return many(
    `SELECT COALESCE(NULLIF(town,''), NULLIF(district,''), 'Unspecified') AS area, COUNT(*)::int AS enquiries
       FROM enquiries GROUP BY 1 ORDER BY enquiries DESC LIMIT $1`,
    [limit]
  );
}

/** Enquiry count grouped by event type. */
export async function enquiriesByEventType() {
  return many(
    `SELECT COALESCE(NULLIF(event_type,''), 'Unspecified') AS event_type, COUNT(*)::int AS enquiries
       FROM enquiries GROUP BY 1 ORDER BY enquiries DESC`
  );
}

/** Most-viewed designs. */
export async function topDesigns(limit = 5) {
  return many(
    `SELECT d.id, d.name, d.slug, d.views, d.enquiry_count, c.name AS category
       FROM designs d LEFT JOIN categories c ON c.id = d.category_id
      WHERE d.active ORDER BY d.views DESC, d.enquiry_count DESC LIMIT $1`,
    [limit]
  );
}

/** Funnel: views -> design clicks -> enquiries. */
export async function funnel(days = 30) {
  const row = await one(
    `SELECT
       (SELECT COUNT(*) FROM page_views WHERE is_bot = false
          AND created_at > now() - ($1::int || ' days')::interval)      AS views,
       (SELECT COUNT(*) FROM page_views WHERE is_bot = false
          AND path LIKE '%/design/%' AND created_at > now() - ($1::int || ' days')::interval) AS designViews,
       (SELECT COUNT(*) FROM enquiries WHERE created_at > now() - ($1::int || ' days')::interval) AS enquiries`,
    [days]
  );
  return row;
}
