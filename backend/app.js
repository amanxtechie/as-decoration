/**
 * app.js — Express application factory.
 *
 * In production this one process serves everything: the REST API, the public
 * website and the admin dashboard. That keeps hosting to a single Render service
 * and means there is no CORS configuration and no cross-origin cookie worry.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { getMedia } from "./models/media.js";

import publicRoutes from "./routes/public.js";
import * as publicCtl from "./controllers/publicController.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://www.instagram.com", "https://platform.twitter.com"],
          frameSrc: ["'self'", "https://www.youtube-nocookie.com", "https://www.youtube.com", "https://www.instagram.com"],
          imgSrc: ["'self'", "data:", "https:"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          connectSrc: ["'self'"],
        },
      },
    })
  );

  // Same-origin in production; the array still allows split local dev servers.
  app.use(cors({ origin: env.clientOrigin, credentials: true }));

  if (env.nodeEnv !== "test") app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  /* ---- image bytes out of Postgres, with long cache + in-memory hot cache ---- */
  const mediaCache = new Map(); // "id:full" | "id:thumb" -> { buffer, mime, etag }
  const MEDIA_CACHE_MAX = 80;

  app.get("/api/media/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Bad image id." });

      const wantsThumb = req.query.w === "400";
      const cacheKey = `${id}:${wantsThumb ? "thumb" : "full"}`;

      let entry = mediaCache.get(cacheKey);
      if (!entry) {
        const row = await getMedia(id, wantsThumb);
        if (!row) return res.status(404).json({ message: "Image not found." });
        entry = {
          buffer: row.bytes,
          mime: row.mime,
          etag: `"${id}-${wantsThumb ? "t" : "f"}-${row.bytes.length}"`,
        };
        if (mediaCache.size >= MEDIA_CACHE_MAX) {
          mediaCache.delete(mediaCache.keys().next().value);
        }
        mediaCache.set(cacheKey, entry);
      }

      if (req.headers["if-none-match"] === entry.etag) return res.status(304).end();

      res.setHeader("Content-Type", entry.mime);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("ETag", entry.etag);
      res.setHeader("Content-Length", entry.buffer.length);
      res.end(entry.buffer);
    } catch (err) {
      next(err);
    }
  });

  /* ---- static site (production single-service mode) ---- */
  const frontendDir = path.join(ROOT, "frontend");
  const adminDir = path.join(ROOT, "admin");
  app.use(express.static(frontendDir, { extensions: ["html"], maxAge: "1h" }));
  app.use("/assets", express.static(path.join(frontendDir, "assets"), { maxAge: "7d" }));
  app.use("/admin", express.static(adminDir, { extensions: ["html"], maxAge: "1h" }));

  /* ---- SEO endpoints (root level, XML/TXT not JSON) ---- */
  app.get("/sitemap.xml", (req, res, next) =>
    publicCtl.sitemap(req, res).catch(next)
  );
  app.get("/robots.txt", (req, res) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.type("text/plain").send(
      `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${origin}/sitemap.xml\n`
    );
  });

  /* ---- API ---- */
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api", publicRoutes);

  /* ---- error handling ---- */
  app.use("/api", notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
