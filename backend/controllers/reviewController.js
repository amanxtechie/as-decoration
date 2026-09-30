/**
 * controllers/reviewController.js + customer photo submissions.
 */
import sanitizeHtml from "sanitize-html";
import * as leads from "../models/leads.js";
import { insertMedia } from "../models/media.js";
import { processImage, validateImageType, assertReasonableDimensions } from "../middleware/images.js";
import { isHoneypot } from "../middleware/security.js";

const clean = (text, max = 2000) =>
  sanitizeHtml(String(text ?? ""), { allowedTags: [], allowedAttributes: {} }).slice(0, max);

export async function submitReview(req, res) {
  if (isHoneypot(req.body)) return res.status(201).json({ ok: true });

  const name = clean(req.body.name, 120).trim();
  const text = clean(req.body.text, 1500).trim();
  const rating = Number(req.body.rating);

  if (!name || name.length < 2) return res.status(400).json({ message: "Please enter your name." });
  if (!text || text.length < 5) return res.status(400).json({ message: "Please write a short review." });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Please choose a rating." });
  }

  const id = await leads.createReview({
    name,
    location: clean(req.body.location, 120),
    eventType: clean(req.body.eventType, 60),
    rating,
    text,
    status: "pending",
  });

  res.status(201).json({
    ok: true,
    id,
    message: "Thank you! Your review will appear once it has been approved.",
  });
}

export async function submitUpload(req, res) {
  if (isHoneypot(req.body)) return res.status(201).json({ ok: true });
  if (!req.file) return res.status(400).json({ message: "Please choose a photo to upload." });

  validateImageType(req.file.mimetype);
  await assertReasonableDimensions(req.file.buffer);

  const name = clean(req.body.name, 120);
  const processed = await processImage(req.file.buffer, `${name || "Customer"} event photo`);

  const mediaId = await insertMedia({
    filename: `customer-${Date.now()}.webp`,
    ...processed,
  });

  const id = await leads.createUpload({
    name,
    eventType: clean(req.body.eventType, 60),
    town: clean(req.body.town, 80),
    mediaId,
  });

  res.status(201).json({
    ok: true,
    id,
    message: "Thanks! Your photo has been submitted and will appear after approval.",
  });
}
