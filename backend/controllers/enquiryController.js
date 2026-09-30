/**
 * controllers/enquiryController.js
 * Public lead capture. Rate limited, honeypot-guarded, and sanitised on write.
 */
import sanitizeHtml from "sanitize-html";
import * as leads from "../models/leads.js";
import { incrementDesignEnquiries } from "../models/catalogue.js";
import { isHoneypot } from "../middleware/security.js";
import { env } from "../config/env.js";

const clean = (text, max = 2000) =>
  sanitizeHtml(String(text ?? ""), { allowedTags: [], allowedAttributes: {} }).slice(0, max);

/** Indian mobile numbers: 10 digits starting 6-9, tolerant of spacing/prefix. */
const cleanPhone = (raw) => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
};

export async function createEnquiry(req, res) {
  if (isHoneypot(req.body)) {
    // Answer as if it worked, so the bot learns nothing.
    return res.status(201).json({ ok: true, id: null });
  }

  const name = clean(req.body.name, 120).trim();
  const phone = cleanPhone(req.body.phone);

  if (!name || name.length < 2) {
    return res.status(400).json({ message: "Please enter your name." });
  }
  if (!phone) {
    return res.status(400).json({ message: "Please enter a valid 10-digit phone number." });
  }

  const email = clean(req.body.email, 160).trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Please check the email address." });
  }

  // Guard against past/far-future dates that are obviously mistakes.
  let eventDate = null;
  if (req.body.eventDate) {
    const d = new Date(req.body.eventDate);
    const now = new Date();
    const year = d.getFullYear();
    if (!Number.isNaN(d.getTime()) && year >= now.getFullYear() - 1 && year <= now.getFullYear() + 3) {
      eventDate = req.body.eventDate;
    }
  }

  const id = await leads.createEnquiry({
    name,
    phone,
    email,
    eventType: clean(req.body.eventType, 60),
    eventDate,
    budgetNote: clean(req.body.budget, 120),
    requirement: clean(req.body.requirement, 2000),
    district: clean(req.body.district, 80),
    town: clean(req.body.town, 80),
    designId: req.body.designId ? Number(req.body.designId) : null,
    designName: clean(req.body.designName, 160),
    source: clean(req.body.source, 60) || "website",
    utmSource: clean(req.body.utmSource, 120),
    utmMedium: clean(req.body.utmMedium, 120),
    referrer: clean(req.body.referrer, 300),
  });

  if (req.body.designId) incrementDesignEnquiries(Number(req.body.designId)).catch(() => {});

  res.status(201).json({
    ok: true,
    id,
    message: "Thank you! We have received your enquiry and will call you shortly.",
    whatsapp: `https://wa.me/${env.whatsappNumber}`,
  });
}
