/**
 * middleware/images.js
 * Normalises every uploaded image: strips EXIF, converts to WebP, bounds the
 * dimensions and builds a thumbnail. Phone photos are 3-5 MB; after this they
 * are ~150-400 KB, which is what makes a 20-photo site cheap to host.
 */
import sharp from "sharp";
import { env } from "../config/env.js";

const MAX_DIMENSION = 1600; // full-size long edge
const THUMB_DIMENSION = 500;
const QUALITY = 80;
const THUMB_QUALITY = 72;

export async function processImage(buffer, alt = "") {
  const base = sharp(buffer, { failOn: "none" }).rotate(); // .rotate() honours EXIF orientation

  const meta = await base.metadata();

  const full = await base
    .clone()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  const thumb = await base
    .clone()
    .resize({ width: THUMB_DIMENSION, height: THUMB_DIMENSION, fit: "cover", position: "attention" })
    .webp({ quality: THUMB_QUALITY, effort: 4 })
    .toBuffer();

  return {
    mime: "image/webp",
    data: full.data,
    thumb,
    width: full.info.width,
    height: full.info.height,
    originalWidth: meta.width,
    originalHeight: meta.height,
    bytes: full.data.length,
    alt,
  };
}

export function validateImageType(mimetype) {
  if (!env.allowedImageTypes.includes(mimetype)) {
    throw Object.assign(new Error("Unsupported file type. Use JPG, PNG or WEBP."), { status: 415 });
  }
}

/** Guard against decompression bombs: reject absurd pixel counts. */
export async function assertReasonableDimensions(buffer) {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  const pixels = (meta.width || 0) * (meta.height || 0);
  if (pixels > 60_000_000) {
    throw Object.assign(new Error("Image is too large to process."), { status: 413 });
  }
  return meta;
}
