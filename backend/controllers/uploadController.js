/**
 * controllers/uploadController.js
 * Public: submit customer photo (status=pending). Admin: moderate + list.
 */
import CustomerUpload from "../models/CustomerUpload.js";
import { sanitizeString } from "../middleware/sanitize.js";

export async function submitUpload(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: "Image file is required." });
    // NOTE: for a real deployment, persist req.file.buffer to disk/S3 and store the URL.
    // Here we store a placeholder path; wire it to your storage adapter.
    const imagePath = `/uploads/customer/${Date.now()}-${req.file.originalname}`;
    const upload = await CustomerUpload.create({
      name: sanitizeString(req.body.name || ""),
      eventType: sanitizeString(req.body.eventType || ""),
      image: imagePath,
    });
    res.status(201).json({ message: "Photo submitted for moderation.", id: upload._id });
  } catch (err) {
    next(err);
  }
}

export async function listUploads(req, res, next) {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const uploads = await CustomerUpload.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ uploads });
  } catch (err) {
    next(err);
  }
}

export async function moderateUpload(req, res, next) {
  try {
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(422).json({ error: "Invalid status." });
    }
    const upload = await CustomerUpload.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!upload) return res.status(404).json({ error: "Upload not found." });
    res.json({ upload });
  } catch (err) {
    next(err);
  }
}
