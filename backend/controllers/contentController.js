/**
 * controllers/contentController.js
 * Generic CRUD for Design, Gallery, UpcomingEvent (admin only).
 */
import Design from "../models/Design.js";
import Gallery from "../models/Gallery.js";
import UpcomingEvent from "../models/UpcomingEvent.js";
import { sanitizeString } from "../middleware/sanitize.js";

const MODELS = { design: Design, gallery: Gallery, event: UpcomingEvent };

function pickModel(kind) {
  const model = MODELS[kind];
  if (!model) throw new Error("Invalid content kind");
  return model;
}

export async function listContent(req, res, next) {
  try {
    const model = pickModel(req.params.kind);
    const items = await model.find().sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createContent(req, res, next) {
  try {
    const model = pickModel(req.params.kind);
    const doc = await model.create(sanitizeBody(req.body, req.params.kind));
    res.status(201).json({ item: doc });
  } catch (err) {
    next(err);
  }
}

export async function updateContent(req, res, next) {
  try {
    const model = pickModel(req.params.kind);
    const doc = await model.findByIdAndUpdate(req.params.id, sanitizeBody(req.body, req.params.kind), {
      new: true,
    }).lean();
    if (!doc) return res.status(404).json({ error: "Not found." });
    res.json({ item: doc });
  } catch (err) {
    next(err);
  }
}

export async function deleteContent(req, res, next) {
  try {
    const model = pickModel(req.params.kind);
    const doc = await model.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found." });
    res.json({ message: "Deleted." });
  } catch (err) {
    next(err);
  }
}

function sanitizeBody(body, kind) {
  const out = {};
  // whitelist editable fields
  const allowed = {
    design: ["name", "category", "subcategory", "description", "images", "isInspiration", "featured", "sortOrder", "active"],
    gallery: ["title", "category", "image", "approved", "featured"],
    event: ["title", "subtitle", "description", "image", "startDate", "endDate", "active"],
  };
  (allowed[kind] || []).forEach((f) => {
    if (body[f] !== undefined) out[f] = body[f];
  });
  // string sanitization
  Object.keys(out).forEach((k) => {
    if (typeof out[k] === "string") out[k] = sanitizeString(out[k]);
  });
  return out;
}
