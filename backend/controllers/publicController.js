/**
 * controllers/publicController.js
 * Public read API. Nothing here ever exposes an unpublished record.
 */
import * as catalogue from "../models/catalogue.js";
import * as content from "../models/content.js";
import * as social from "../models/social.js";
import * as leads from "../models/leads.js";
import { recordPageView } from "../models/analytics.js";
import { DISTRICTS } from "../config/locations.js";
import { env } from "../config/env.js";

export async function getLocations(req, res) {
  res.json({ districts: DISTRICTS });
}

export async function getDesigns(req, res) {
  const { designs, total, limit, offset } = await catalogue.listDesigns(req.query);
  res.json({ designs, total, limit, offset });
}

export async function getDesign(req, res) {
  const design = await catalogue.getDesignBySlug(req.params.slug);
  if (!design) return res.status(404).json({ message: "Design not found." });
  catalogue.incrementDesignViews(design.id).catch(() => {});
  design.related = await catalogue.relatedDesigns(design);
  res.json({ design });
}

export async function getDesignsByCategory(req, res) {
  const { designs, total } = await catalogue.listDesigns({
    ...req.query,
    category: req.params.slug,
  });
  const category = await catalogue.getCategoryBySlug(req.params.slug);
  if (!category) return res.status(404).json({ message: "Category not found." });
  res.json({ category, designs, total });
}

export async function getCategories(req, res) {
  const [categories, subcategories] = await Promise.all([
    catalogue.listCategories(),
    catalogue.listSubcategories(),
  ]);
  res.json({ categories, subcategories });
}

/**
 * Everything the homepage showcase needs in one request: the visible categories,
 * their visible sub-headings, and the design cards for each.
 */
export async function getHomeSections(req, res) {
  const { sections } = await catalogue.homeSections({
    limitPerGroup: req.query.limit,
  });
  res.json({ sections });
}

export async function getGallery(req, res) {
  res.json({ items: await content.listGallery(req.query) });
}

export async function getEvents(req, res) {
  res.json({ events: await content.listLiveEvents() });
}

export async function getReviews(req, res) {
  const [reviews, summary] = await Promise.all([
    leads.listReviews("approved"),
    leads.reviewSummary(),
  ]);
  res.json({ reviews, summary });
}

export async function getVideos(req, res) {
  res.json({ videos: await social.listVideos() });
}

export async function getInstagram(req, res) {
  res.json({ posts: await social.listInstagramPosts() });
}

export async function getSocialLinks(req, res) {
  res.json({ links: await social.listSocialLinks() });
}

/** One call that bootstraps the whole page, so the front end is a single round trip. */
export async function getBootstrap(req, res) {
  const [categories, subcategories, videos, links] = await Promise.all([
    catalogue.listCategories(),
    catalogue.listSubcategories(),
    social.listVideos(),
    social.listSocialLinks(),
  ]);
  res.json({
    categories,
    subcategories,
    videos,
    links,
    whatsapp: env.whatsappNumber,
    business: await social.getSetting("business", {
      name: env.businessName,
      whatsapp: env.whatsappNumber,
    }),
  });
}

export async function trackView(req, res) {
  await recordPageView(req.body?.path || "/", req.body?.referrer || "").catch(() => {});
  res.status(204).end();
}

/**
 * Sitemap generated from the database, so every design is individually
 * indexable without rebuilding anything when new designs are added.
 */
export async function sitemap(req, res) {
  const origin = (req.query.origin || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const today = new Date().toISOString().slice(0, 10);

  const staticPages = [
    ["/", "1.0", "daily"],
    ["/catalogue.html", "0.9", "weekly"],
    ["/our-work.html", "0.8", "weekly"],
    ["/about.html", "0.6", "monthly"],
    ["/reviews.html", "0.7", "weekly"],
    ["/contact.html", "0.8", "monthly"],
    ["/privacy.html", "0.2", "yearly"],
  ];

  const categories = await catalogue.listCategories();
  const designs = await catalogue.listDesigns({ limit: 60, sort: "newest" });

  const urls = [
    ...staticPages.map(([path, priority, freq]) => ({
      loc: `${origin}${path}`,
      lastmod: today,
      priority,
      freq,
    })),
    ...categories
      .filter((c) => c.design_count > 0)
      .map((c) => ({
        loc: `${origin}/catalogue.html?category=${c.slug}`,
        lastmod: today,
        priority: "0.7",
        freq: "weekly",
      })),
    ...designs.designs.map((d) => ({
      loc: `${origin}/design.html?slug=${d.slug}`,
      lastmod: (d.updatedAt || d.createdAt || today).toString().slice(0, 10),
      priority: "0.6",
      freq: "monthly",
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc.replace(/&/g, "&amp;")}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  res.type("application/xml").send(xml);
}
