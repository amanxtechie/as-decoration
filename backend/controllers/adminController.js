/**
 * controllers/adminController.js
 * Everything behind /api/admin. JWT-protected, rate limited where it matters.
 */
import * as catalogue from "../models/catalogue.js";
import * as content from "../models/content.js";
import * as leads from "../models/leads.js";
import * as media from "../models/media.js";
import * as social from "../models/social.js";
import * as analytics from "../models/analytics.js";
import { uploadMany } from "../middleware/upload.js";
import { processImage, validateImageType, assertReasonableDimensions } from "../middleware/images.js";
import { safeUrl } from "../middleware/security.js";

const MAX_IMAGES_PER_DESIGN = 8; // the owner said 2-3 is normal; this is a hard ceiling

const bad = (res, message) => res.status(400).json({ message });
const notFound = (res) => res.status(404).json({ message: "Not found." });

/* =================================================================== stats */

export async function stats(req, res) {
  res.json({ stats: await analytics.dashboardStats() });
}

export async function analyticsReport(req, res) {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const [timeline, byArea, byEventType, top, funnel] = await Promise.all([
    analytics.enquiriesOverTime(days),
    analytics.enquiriesByArea(),
    analytics.enquiriesByEventType(),
    analytics.topDesigns(6),
    analytics.funnel(days),
  ]);
  res.json({ timeline, byArea, byEventType, top, funnel, storage: await media.storageStats() });
}

/* ================================================================ enquiries */

export async function listEnquiries(req, res) {
  res.json({ enquiries: await leads.listEnquiries(req.query) });
}

export async function getEnquiry(req, res) {
  const row = await leads.getEnquiry(req.params.id);
  if (!row) return notFound(res);
  res.json({ enquiry: row });
}

export async function setEnquiryStatus(req, res) {
  const allowed = ["new", "contacted", "quoted", "confirmed", "completed", "cancelled"];
  const { status } = req.body || {};
  if (!allowed.includes(status)) return bad(res, "Unknown status.");
  await leads.updateEnquiryStatus(req.params.id, status);
  res.json({ enquiry: await leads.getEnquiry(req.params.id) });
}

export async function setEnquiryNotes(req, res) {
  await leads.updateEnquiryNotes(req.params.id, String(req.body?.notes ?? "").slice(0, 4000));
  res.json({ enquiry: await leads.getEnquiry(req.params.id) });
}

export async function removeEnquiry(req, res) {
  const ok = await leads.deleteEnquiry(req.params.id);
  if (!ok) return notFound(res);
  res.json({ ok: true });
}

/** CSV export of every lead, for the owner to open in Excel. */
export async function exportEnquiries(req, res) {
  const rows = await leads.allEnquiriesForExport();
  const cols = [
    ["id", "ID"], ["created_at", "Date"], ["name", "Name"], ["phone", "Phone"],
    ["email", "Email"], ["event_type", "Event type"], ["event_date", "Event date"],
    ["town", "Town"], ["district", "District"], ["design_name", "Design"],
    ["budget_note", "Budget note"], ["status", "Status"], ["requirement", "Requirement"],
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    cols.map(([, label]) => esc(label)).join(","),
    ...rows.map((r) => cols.map(([k]) => esc(r[k])).join(",")),
  ].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="as-decoration-enquiries.csv"`);
  res.send("﻿" + csv); // BOM so Excel reads UTF-8 correctly
}

/* ================================================================= reviews */

export async function listReviews(req, res) {
  res.json({ reviews: await leads.listReviews(req.query.status || "all") });
}

export async function moderateReview(req, res) {
  const { status, reply } = req.body || {};
  if (!["pending", "approved", "rejected"].includes(status)) return bad(res, "Unknown status.");
  const updated = await leads.moderateReview(req.params.id, status, reply);
  res.json({ review: updated });
}

export async function removeReview(req, res) {
  if (!(await leads.deleteReview(req.params.id))) return notFound(res);
  res.json({ ok: true });
}

/* ================================================================= uploads */

export async function listUploads(req, res) {
  res.json({ uploads: await leads.listUploads(req.query.status || "all") });
}

export async function moderateUpload(req, res) {
  const { status } = req.body || {};
  if (!["pending", "approved", "rejected"].includes(status)) return bad(res, "Unknown status.");
  await leads.moderateUpload(req.params.id, status);
  res.json({ ok: true });
}

export async function removeUpload(req, res) {
  if (!(await leads.deleteUpload(req.params.id))) return notFound(res);
  res.json({ ok: true });
}

/* ================================================================== designs */

export async function listDesigns(req, res) {
  res.json({ items: await catalogue.adminListDesigns() });
}

export async function getDesign(req, res) {
  const d = await catalogue.getDesignById(req.params.id);
  if (!d) return notFound(res);
  res.json({ design: d });
}

export async function createDesign(req, res) {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return bad(res, "Design name is required.");

  const slug = await catalogue.uniqueSlug(req.body.slug || name);
  const mediaIds = normaliseMediaIds(req.body.mediaIds);

  const id = await catalogue.createDesign({
    slug,
    name,
    categoryId: toId(req.body.categoryId),
    subcategoryId: toId(req.body.subcategoryId),
    description: req.body.description || "",
    highlights: Array.isArray(req.body.highlights) ? req.body.highlights.slice(0, 10) : [],
    coverMediaId: mediaIds[0] ?? null,
    isInspiration: req.body.isInspiration ?? true,
    featured: !!req.body.featured,
    active: req.body.active ?? true,
    town: req.body.town || null,
    eventDate: req.body.eventDate || null,
    mediaIds,
  });

  res.status(201).json({ design: await catalogue.getDesignById(id) });
}

export async function updateDesign(req, res) {
  const existing = await catalogue.getDesignById(req.params.id);
  if (!existing) return notFound(res);

  const patch = { ...req.body };
  if (patch.name && patch.name !== existing.name) {
    patch.slug = await catalogue.uniqueSlug(patch.slug || patch.name, existing.id);
  }
  if (patch.mediaIds) patch.mediaIds = normaliseMediaIds(patch.mediaIds);
  if (patch.highlights && !Array.isArray(patch.highlights)) {
    patch.highlights = String(patch.highlights).split("\n").map((s) => s.trim()).filter(Boolean);
  }
  ["categoryId", "subcategoryId", "coverMediaId", "isInspiration", "featured", "active", "town", "eventDate"]
    .forEach((k) => { if (patch[k] !== undefined && typeof patch[k] === "string") patch[k] = coerce(k, patch[k]); });

  const design = await catalogue.updateDesign(existing.id, patch);
  res.json({ design });
}

export async function removeDesign(req, res) {
  if (!(await catalogue.deleteDesign(req.params.id))) return notFound(res);
  res.json({ ok: true });
}

export async function addDesignImages(req, res) {
  const design = await catalogue.getDesignById(req.params.id);
  if (!design) return notFound(res);

  const incoming = [];
  for (const file of req.files || []) {
    validateImageType(file.mimetype);
    await assertReasonableDimensions(file.buffer);
    const processed = await processImage(file.buffer, design.name);
    incoming.push(await media.insertMedia({ filename: `design-${Date.now()}-${file.originalname}`, ...processed }));
  }

  const urls = normaliseMediaIds(req.body?.mediaUrls);
  if (urls.length) incoming.push(...urls);

  const total = design.imageCount ?? design.images.length;
  if (total + incoming.length > MAX_IMAGES_PER_DESIGN) {
    return bad(res, `A design can hold at most ${MAX_IMAGES_PER_DESIGN} photos.`);
  }

  await catalogue.addDesignImages(design.id, incoming);
  res.json({ design: await catalogue.getDesignById(design.id) });
}

export async function removeDesignImage(req, res) {
  const design = await catalogue.getDesignById(req.params.id);
  if (!design) return notFound(res);
  await catalogue.removeDesignImage(design.id, Number(req.params.mediaId));
  res.json({ design: await catalogue.getDesignById(design.id) });
}

export async function reorderDesignImages(req, res) {
  const ids = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.map(Number) : [];
  if (!ids.length) return bad(res, "mediaIds is required.");
  await catalogue.reorderDesignImages(Number(req.params.id), ids);
  res.json({ design: await catalogue.getDesignById(req.params.id) });
}

/* ================================================================== gallery */

export async function listGallery(req, res) {
  res.json({ items: await content.adminListGallery() });
}

export async function createGalleryItem(req, res) {
  const title = String(req.body?.title ?? "").trim();
  const mediaId = toId(req.body?.mediaId);
  if (!title) return bad(res, "Title is required.");
  if (!mediaId) return bad(res, "A photo is required.");

  const id = await content.createGalleryItem({
    title,
    description: req.body.description || "",
    categoryId: toId(req.body.categoryId),
    subcategoryId: toId(req.body.subcategoryId),
    mediaId,
    town: req.body.town || null,
    eventDate: req.body.eventDate || null,
    featured: !!req.body.featured,
    active: req.body.active ?? true,
    sortOrder: Number(req.body.sortOrder) || 0,
  });
  res.status(201).json({ item: await content.getGalleryItem(id) });
}

export async function updateGalleryItem(req, res) {
  const item = await content.getGalleryItem(req.params.id);
  if (!item) return notFound(res);
  const updated = await content.updateGalleryItem(item.id, req.body || {});
  res.json({ item: updated });
}

export async function removeGalleryItem(req, res) {
  if (!(await content.deleteGalleryItem(req.params.id))) return notFound(res);
  res.json({ ok: true });
}

/* =================================================================== events */

export async function listEvents(req, res) {
  res.json({ items: await content.adminListEvents() });
}

export async function createEvent(req, res) {
  const title = String(req.body?.title ?? "").trim();
  if (!title) return bad(res, "Title is required.");
  if (!req.body?.startDate || !req.body?.endDate) return bad(res, "Start and end dates are required.");
  if (req.body.endDate < req.body.startDate) return bad(res, "End date must be after the start date.");
  const id = await content.createEvent({
    title,
    subtitle: req.body.subtitle || "",
    description: req.body.description || "",
    mediaId: toId(req.body.mediaId),
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    active: req.body.active ?? true,
    sortOrder: Number(req.body.sortOrder) || 0,
  });
  res.status(201).json({ item: await content.adminListEvents().then((r) => r.find((x) => x.id === id)) });
}

export async function updateEvent(req, res) {
  const updated = await content.updateEvent(req.params.id, req.body || {});
  res.json({ item: updated });
}

export async function removeEvent(req, res) {
  if (!(await content.deleteEvent(req.params.id))) return notFound(res);
  res.json({ ok: true });
}

/* ==================================================================== media */

export async function listMedia(req, res) {
  res.json({ items: await media.listMedia(), placeholders: await media.countPlaceholders() });
}

export async function uploadMedia(req, res) {
  const files = req.files?.length ? req.files : req.file ? [req.file] : [];
  if (!files.length) return bad(res, "No file received.");

  const created = [];
  for (const file of files) {
    validateImageType(file.mimetype);
    await assertReasonableDimensions(file.buffer);
    const alt = String(req.body?.alt || file.originalname || "").slice(0, 200);
    const processed = await processImage(file.buffer, alt);
    const id = await media.insertMedia({
      filename: file.originalname?.replace(/\.[^.]+$/, "") + `.webp` || `upload-${Date.now()}.webp`,
      ...processed,
      isPlaceholder: false,
    });
    created.push({ id, ...media.toMediaJson({ id, width: processed.width, height: processed.height, is_placeholder: false, alt }) });
  }

  res.status(201).json({ items: created });
}

export async function updateMediaMeta(req, res) {
  const id = Number(req.params.id);
  if (req.body?.alt !== undefined) await media.updateMediaAlt(id, String(req.body.alt).slice(0, 200));
  if (req.body?.isPlaceholder !== undefined) {
    await media.markPlaceholder(id, !!req.body.isPlaceholder);
  }
  res.json({ media: await media.getMediaMeta(id) });
}

export async function removeMedia(req, res) {
  if (!(await media.deleteMedia(Number(req.params.id)))) return notFound(res);
  res.json({ ok: true });
}

/* =================================================== videos / social / insta */

export async function listVideos(req, res) {
  res.json({ items: await social.listVideos(true) });
}

export async function createVideo(req, res) {
  const youtubeId = social.parseYoutubeId(req.body?.youtubeId || req.body?.url);
  if (!youtubeId) return bad(res, "That does not look like a YouTube video URL.");
  const id = await social.createVideo({
    youtubeId,
    title: req.body.title || "Our work",
    description: req.body.description || "",
    categoryId: toId(req.body.categoryId),
    sortOrder: Number(req.body.sortOrder) || 0,
    active: req.body.active ?? true,
  });
  res.status(201).json({ items: await social.listVideos(true).then((r) => r.find((v) => v.id === id)) });
}

export async function updateVideo(req, res) {
  const patch = { ...(req.body || {}) };
  if (patch.url || patch.youtubeId) {
    const id = social.parseYoutubeId(patch.url || patch.youtubeId);
    if (!id) return bad(res, "That does not look like a YouTube video URL.");
    patch.youtubeId = id;
  }
  if (patch.categoryId !== undefined) patch.categoryId = toId(patch.categoryId);
  res.json({ item: await social.updateVideo(req.params.id, patch) });
}

export async function removeVideo(req, res) {
  if (!(await social.deleteVideo(req.params.id))) return notFound(res);
  res.json({ ok: true });
}

export async function listInstagram(req, res) {
  res.json({ items: await social.listInstagramPosts(true) });
}

export async function createInstagramPost(req, res) {
  const permalink = social.parseInstagramUrl(req.body?.url || req.body?.permalink);
  if (!permalink) return bad(res, "That does not look like an Instagram post or reel URL.");

  // Meta's oEmbed is tokenless as of June 2026; if it is unreachable we still
  // save the permalink and the front end falls back to a link card.
  const embed = await social.fetchInstagramEmbed(permalink);
  const id = await social.createInstagramPost({
    permalink,
    embedHtml: embed?.html || "",
    caption: req.body.caption || embed?.title || "",
  });
  res.status(201).json({
    item: await social.listInstagramPosts(true).then((r) => r.find((p) => p.id === id)),
    embedFetched: Boolean(embed?.html),
  });
}

export async function updateInstagramPost(req, res) {
  res.json({ item: await social.updateInstagramPost(req.params.id, req.body || {}) });
}

export async function removeInstagramPost(req, res) {
  if (!(await social.deleteInstagramPost(req.params.id))) return notFound(res);
  res.json({ ok: true });
}

export async function listSocialLinks(req, res) {
  res.json({ items: await social.listSocialLinks(true) });
}

export async function createSocialLink(req, res) {
  if (!req.body?.platform || !req.body?.url) return bad(res, "Platform and URL are required.");
  const id = await social.createSocialLink({
    platform: req.body.platform,
    url: safeUrl(req.body.url) || req.body.url,
    handle: req.body.handle || "",
    label: req.body.label || "",
    sortOrder: Number(req.body.sortOrder) || 0,
    active: req.body.active ?? true,
  });
  res.status(201).json({ items: await social.listSocialLinks(true).then((r) => r.find((x) => x.id === id)) });
}

export async function updateSocialLink(req, res) {
  const patch = { ...(req.body || {}) };
  if (patch.url) patch.url = safeUrl(patch.url) || patch.url;
  res.json({ item: await social.updateSocialLink(req.params.id, patch) });
}

export async function removeSocialLink(req, res) {
  if (!(await social.deleteSocialLink(req.params.id))) return notFound(res);
  res.json({ ok: true });
}

/* ================================================================= helpers */

function toId(v) {
  if (v === null || v === undefined || v === "" || v === "null") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function coerce(key, value) {
  if (key === "isInspiration" || key === "featured" || key === "active") return value === true || value === "true";
  return toId(value);
}

/** Accept media ids as numbers, and admin-pasted http(s) image URLs. */
function normaliseMediaIds(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => (typeof v === "string" && /^https?:\/\//i.test(v) ? safeUrl(v) : toId(v)))
    .filter((v) => v !== null && v !== "")
    .slice(0, MAX_IMAGES_PER_DESIGN);
}

// Wired up in routes so the file parser only runs on the upload endpoints.
export { uploadMany };

/* ============================================== taxonomy (homepage structure)
 * The homepage is assembled from these rows, so the owner controls which
 * category and subcategory headings appear, and in what order.
 * ======================================================================== */

export async function listTaxonomy(req, res) {
  res.json({ taxonomy: await catalogue.taxonomyTree() });
}

export async function createCategory(req, res) {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return bad(res, "Category name is required.");
  const cat = await catalogue.createCategory({
    name: String(name).trim(),
    intro: req.body.intro ? String(req.body.intro).trim() : null,
    sortOrder: Number(req.body.sortOrder) || 0,
    showOnHome: req.body.showOnHome !== false,
  });
  res.status(201).json({ category: cat });
}

export async function updateCategory(req, res) {
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body.intro !== undefined) patch.intro = req.body.intro ? String(req.body.intro).trim() : null;
  if (req.body.sortOrder !== undefined) patch.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body.showOnHome !== undefined) patch.showOnHome = !!req.body.showOnHome;
  const cat = await catalogue.updateCategory(Number(req.params.id), patch);
  if (!cat) return notFound(res);
  res.json({ category: cat });
}

export async function removeCategory(req, res) {
  const ok = await catalogue.removeCategory(Number(req.params.id));
  if (!ok) return notFound(res);
  res.json({ ok: true });
}

export async function createSubcategory(req, res) {
  const { name, categoryId } = req.body || {};
  if (!name || !String(name).trim()) return bad(res, "Subcategory name is required.");
  if (!categoryId) return bad(res, "Choose which category this belongs to.");
  const sub = await catalogue.createSubcategory({
    categoryId: Number(categoryId),
    name: String(name).trim(),
    sortOrder: Number(req.body.sortOrder) || 0,
    showOnHome: req.body.showOnHome !== false,
  });
  res.status(201).json({ subcategory: sub });
}

export async function updateSubcategory(req, res) {
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body.sortOrder !== undefined) patch.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body.showOnHome !== undefined) patch.showOnHome = !!req.body.showOnHome;
  if (req.body.categoryId !== undefined) patch.categoryId = Number(req.body.categoryId);
  const sub = await catalogue.updateSubcategory(Number(req.params.id), patch);
  if (!sub) return notFound(res);
  res.json({ subcategory: sub });
}

export async function removeSubcategory(req, res) {
  const ok = await catalogue.removeSubcategory(Number(req.params.id));
  if (!ok) return notFound(res);
  res.json({ ok: true });
}

/** Reorder a whole category or subcategory list in one call. */
export async function reorderTaxonomy(req, res) {
  const { kind, ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return bad(res, "Nothing to reorder.");
  try {
    await catalogue.reorderTaxonomy(kind === "subcategory" ? "subcategory" : "category", ids);
  } catch (e) {
    return bad(res, e.message);
  }
  res.json({ ok: true });
}
