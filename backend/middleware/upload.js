/**
 * middleware/upload.js
 * Multer keeps the file in memory only for the length of one request; sharp
 * converts it to WebP and the bytes are written to Postgres before the response
 * is sent, so nothing is lost on restart.
 */
import multer from "multer";
import { env } from "../config/env.js";

const fileFilter = (req, file, cb) => {
  if (env.allowedImageTypes.includes(file.mimetype)) return cb(null, true);
  cb(Object.assign(new Error("Unsupported file type. Use JPG, PNG or WEBP."), { status: 415 }));
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: env.maxUploadSize, files: 20, fields: 30 },
});

/** Accepts a single `image` field. */
export const uploadSingle = upload.single("image");

/** Accepts many `images` fields (admin photo manager bulk upload). */
export const uploadMany = upload.array("images", 20);
