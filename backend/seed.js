/**
 * seed.js — creates the admin account, the category taxonomy, and sample
 * designs/gallery/reviews so the site is browsable before the owner uploads
 * their own photos.
 *
 *   npm run seed          # create anything missing
 *   npm run seed -- --reset   # wipe content tables and reseed
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { connectDB, closeDB, query } from "./config/db.js";
import { env } from "./config/env.js";
import { createAdmin, findByEmail } from "./models/admin.js";
import { insertMedia } from "./models/media.js";
import { createDesign, uniqueSlug } from "./models/catalogue.js";
import { createGalleryItem, createEvent } from "./models/content.js";
import { createReview } from "./models/leads.js";
import { createSocialLink, createVideo, setSetting } from "./models/social.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reset = process.argv.includes("--reset");

/* --------------------------------------------------------------- taxonomy */

const CATEGORIES = [
  { slug: "wedding", name: "Wedding", sort: 1 },
  { slug: "birthday", name: "Birthday", sort: 2 },
  { slug: "anniversary", name: "Anniversary", sort: 3 },
  { slug: "shop-office", name: "Shop & Office", sort: 4 },
  { slug: "special-days", name: "Special Days", sort: 5 },
];

const SUBCATEGORIES = {
  wedding: ["Stage", "Mandap", "Floral", "Entrance & Path", "Mehendi", "Lighting"],
  birthday: ["Balloon Theme", "Kids Party", "Adult Party", "Garden Party"],
  anniversary: ["Romantic Dinner", "Home Decor", "Reception"],
  "shop-office": ["Store Launch", "Office Setup", "Festive Office"],
  "special-days": ["Engagement", "Haldi / Mehendi", "Reception", "Baby Shower", "Naming Ceremony"],
};

/* ----------------------------------------------------- placeholder imagery */

// Unsplash direct CDN links. These are placeholders: they are flagged in the
// admin with an orange PLACEHOLDER badge so the owner knows exactly which
// photos to replace with their real event photography.
const PHOTOS = {
  "Royal Mandap Stage": "photo-1519741497674-611481863552",
  "Floral Wedding Arch": "photo-1464366400600-7168b8af9bc3",
  "Golden Engagement Decor": "photo-1511285560929-80b456fea0bc",
  "Mehendi Ceremony Setup": "photo-1519225421980-715cb0215aed",
  "Balloon Birthday Party": "photo-1530103862676-de8c9debad1d",
  "Kids Birthday Theme": "photo-1464349095431-e9a21285b5f3",
  "Elegant Dinner Decor": "photo-1414235077428-338989a2e8c0",
  "Romantic Anniversary Setup": "photo-1478146896981-b80fe463b330",
  "Corporate Event Stage": "photo-1505373877841-8d25f7d46678",
  "Store Launch Decor": "photo-1441986300917-64674bd600d8",
  "Baby Shower Decor": "photo-1515488042361-ee00e0ddd4e4",
  "Reception Hall Decor": "photo-1478146896981-b80fe463b330",
  "Traditional Haldi Setup": "photo-1507501336603-6e31db2be093",
  "Garden Party Setup": "photo-1507501336603-6e31db2be093",
};

const unsplash = (id, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

/** Download a placeholder and store it in Postgres, converted to WebP. */
async function fetchPlaceholder(url, alt) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} fetching placeholder`);
  const buf = Buffer.from(await res.arrayBuffer());

  const base = sharp(buf, { failOn: "none" }).rotate();
  const full = await base
    .clone()
    .resize({ width: 1400, height: 1400, fit: "cover" })
    .webp({ quality: 78 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: 500, height: 500, fit: "cover", position: "attention" })
    .webp({ quality: 70 })
    .toBuffer();

  return insertMedia({
    filename: "placeholder.webp",
    mime: "image/webp",
    data: full.data,
    thumb,
    width: full.info.width,
    height: full.info.height,
    alt,
    isPlaceholder: true,
  });
}

/* ------------------------------------------------------------------ designs */

const DESIGNS = [
  {
    name: "Royal Mandap Stage",
    category: "wedding", subcategory: "Mandap",
    description: "A four-pillar mandap dressed in ivory and gold draping, framed with fresh white roses and warm uplighting.",
    highlights: ["Four-pillar mandap", "Fresh floral frame", "Warm uplighting", "Bridal entry path"],
  },
  {
    name: "Floral Wedding Arch",
    category: "wedding", subcategory: "Floral",
    description: "A cascading floral arch in blush and ivory, softened with greenery and hanging glass votives.",
    highlights: ["Cascading floral arch", "Hanging votives", "Aisle styling", "Bridal seating"],
  },
  {
    name: "Golden Engagement Decor",
    category: "wedding", subcategory: "Stage",
    description: "A marigold and gold engagement stage with a textured backdrop and low seating.",
    highlights: ["Marigold feature wall", "Low seating", "Custom signage", "Photo corner"],
  },
  {
    name: "Mehendi Ceremony Setup",
    category: "wedding", subcategory: "Mehendi",
    description: "Floor seating with low tables, marigold strings and bright daylight styling for daytime ceremonies.",
    highlights: ["Floor seating", "Marigold strings", "Low tables", "Daylight styling"],
  },
  {
    name: "Balloon Birthday Party",
    category: "birthday", subcategory: "Balloon Theme",
    description: "A balloon garland backdrop with a pastel palette, cake table and photo corner.",
    highlights: ["Balloon garland", "Pastel palette", "Cake table", "Photo corner"],
  },
  {
    name: "Kids Birthday Theme",
    category: "birthday", subcategory: "Kids Party",
    description: "A playful jungle theme with hand-made props, low tables and soft floor seating for children.",
    highlights: ["Jungle theme props", "Floor seating", "Low tables", "Custom name board"],
  },
  {
    name: "Elegant Dinner Decor",
    category: "anniversary", subcategory: "Romantic Dinner",
    description: "Candlelit table styling with florals, warm string lights and a personalised menu card.",
    highlights: ["Candlelight styling", "String lights", "Menu cards", "Table florals"],
  },
  {
    name: "Romantic Anniversary Setup",
    category: "anniversary", subcategory: "Reception",
    description: "A soft rose and ivory palette with a photo wall, dining setup and live floral backdrop.",
    highlights: ["Rose photo wall", "Dining setup", "Floral backdrop", "Ambient lighting"],
  },
  {
    name: "Corporate Event Stage",
    category: "shop-office", subcategory: "Office Setup",
    description: "A clean corporate stage with branded backdrop, panel seating and stage lighting.",
    highlights: ["Branded backdrop", "Panel seating", "Stage lighting", "AV coordination"],
  },
  {
    name: "Store Launch Decor",
    category: "shop-office", subcategory: "Store Launch",
    description: "Ribbon-cutting staging with floral stands, balloon columns and welcome signage.",
    highlights: ["Floral stands", "Balloon columns", "Welcome signage", "Cutlery moment styling"],
  },
  {
    name: "Baby Shower Decor",
    category: "special-days", subcategory: "Baby Shower",
    description: "A soft ivory and sage palette with a seating arch, name board and floral aisle.",
    highlights: ["Seating arch", "Name board", "Floral aisle", "Pastel palette"],
  },
  {
    name: "Reception Hall Decor",
    category: "wedding", subcategory: "Stage",
    description: "Full hall transformation with entrance arch, stage backdrop, dining styling and lighting.",
    highlights: ["Entrance arch", "Stage backdrop", "Dining styling", "Ambient lighting"],
  },
  {
    name: "Traditional Haldi Setup",
    category: "special-days", subcategory: "Haldi / Mehendi",
    description: "A cheerful marigold and turf haldi setup with seating, props and photo moments.",
    highlights: ["Marigold styling", "Turf seating", "Photo props", "Daylight canopy"],
  },
  {
    name: "Garden Party Setup",
    category: "birthday", subcategory: "Garden Party",
    description: "An outdoor garden party with long tables, bunting, lanterns and fresh florals.",
    highlights: ["Long table layout", "Bunting", "Lanterns", "Fresh florals"],
  },
];

const GALLERY = [
  { title: "Wedding at Rajgir", category: "wedding", subcategory: "Stage", town: "Rajgir", photo: "Royal Mandap Stage" },
  { title: "Birthday in Bihar Sharif", category: "birthday", subcategory: "Balloon Theme", town: "Bihar Sharif", photo: "Balloon Birthday Party" },
  { title: "Engagement at Pawapuri", category: "wedding", subcategory: "Stage", town: "Pawapuri", photo: "Golden Engagement Decor" },
];

const REVIEWS = [
  { name: "Priya Kumari", location: "Rajgir", eventType: "Wedding", rating: 5, text: "The mandap looked exactly like the reference we discussed. The team set everything up a day early and stayed through the whole function.", isCustomer: true },
  { name: "Rahul Yadav", location: "Bihar Sharif", eventType: "Birthday", rating: 5, text: "Very responsive on WhatsApp. They adjusted the colour theme twice and the final result was beautiful.", isCustomer: true },
  { name: "Anjali Singh", location: "Nawada", eventType: "Anniversary", rating: 4, text: "Lovely decor and polite staff. Setup was slightly delayed but the finish was worth it.", isCustomer: true },
  { name: "Vikash Patel", location: "Lakhisarai", eventType: "Wedding", rating: 5, text: "Best decoration team in the district. They handled 300 guests without any issue.", isCustomer: true },
];

const VIDEOS = [
  { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Wedding stage walkthrough" },
  { url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", title: "Birthday setup timelapse" },
];

/* -------------------------------------------------------------------- main */

async function main() {
  await connectDB();

  if (reset) {
    console.log("[SEED] Resetting content tables…");
    await query(`TRUNCATE design_images, designs, gallery_items, events, reviews,
                 enquiries, customer_uploads, videos, instagram_posts, social_links,
                 media, subcategories, categories, settings RESTART IDENTITY CASCADE`);
  }

  /* schema */
  const schema = readFileSync(path.join(__dirname, "db/schema.sql"), "utf8");
  await query(schema);
  console.log("[SEED] Schema ensured.");

  /* admin */
  let admin = await findByEmail(env.adminEmail);
  if (admin) {
    console.log(`[SEED] Admin exists: ${admin.email}`);
  } else {
    admin = await createAdmin({
      email: env.adminEmail,
      password: env.adminPassword,
      name: "AS Decoration",
    });
    console.log(`[SEED] Admin created: ${admin.email}`);
  }

  /* taxonomy */
  for (const c of CATEGORIES) {
    await query(
      `INSERT INTO categories (slug, name, sort_order) VALUES ($1,$2,$3)
       ON CONFLICT (slug) DO UPDATE SET name = $2, sort_order = $3`,
      [c.slug, c.name, c.sort]
    );
  }
  for (const [catSlug, subs] of Object.entries(SUBCATEGORIES)) {
    const { rows } = await query("SELECT id FROM categories WHERE slug = $1", [catSlug]);
    for (let i = 0; i < subs.length; i++) {
      const slug = subs[i].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await query(
        `INSERT INTO subcategories (category_id, slug, name, sort_order) VALUES ($1,$2,$3,$4)
         ON CONFLICT (slug) DO UPDATE SET name = $3, sort_order = $4, category_id = $1`,
        [rows[0].id, slug, subs[i], i]
      );
    }
  }
  console.log(`[SEED] ${CATEGORIES.length} categories, ${Object.values(SUBCATEGORIES).flat().length} subcategories.`);

  /* existing media map, so re-running does not re-download */
  const mediaCache = new Map();
  async function mediaFor(name) {
    if (mediaCache.has(name)) return mediaCache.get(name);
    const photoId = PHOTOS[name];
    if (!photoId) return null;
    const id = await fetchPlaceholder(unsplash(photoId), `${name} — AS Decoration`);
    mediaCache.set(name, id);
    return id;
  }

  const catId = async (slug) => (await query("SELECT id FROM categories WHERE slug = $1", [slug])).rows[0]?.id;
  const subId = async (slug) => {
    if (!slug) return null;
    const s = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return (await query("SELECT id FROM subcategories WHERE slug = $1", [s])).rows[0]?.id;
  };

  /* designs */
  let designCount = 0;
  for (const d of DESIGNS) {
    const exists = await query("SELECT id FROM designs WHERE name = $1", [d.name]);
    if (exists.rowCount) continue;
    const mediaId = await mediaFor(d.name);
    const id = await createDesign({
      slug: await uniqueSlug(d.name),
      name: d.name,
      categoryId: await catId(d.category),
      subcategoryId: await subId(d.subcategory),
      description: d.description,
      highlights: d.highlights,
      coverMediaId: mediaId,
      mediaIds: mediaId ? [mediaId] : [],
      isInspiration: true,
      featured: DESIGNS.indexOf(d) < 4,
    });
    designCount++;
    void id;
  }
  console.log(`[SEED] ${designCount} designs inserted (${Object.keys(PHOTOS).length} placeholder photos).`);

  /* gallery */
  let galleryCount = 0;
  for (const g of GALLERY) {
    const exists = await query("SELECT id FROM gallery_items WHERE title = $1", [g.title]);
    if (exists.rowCount) continue;
    const mediaId = await mediaFor(g.photo);
    if (!mediaId) continue;
    await createGalleryItem({
      title: g.title,
      categoryId: await catId(g.category),
      subcategoryId: await subId(g.subcategory),
      mediaId,
      town: g.town,
      description: `A ${g.eventType || "celebration"} setup completed by AS Decoration.`,
    });
    galleryCount++;
  }
  console.log(`[SEED] ${galleryCount} gallery items inserted.`);

  /* reviews */
  let reviewCount = 0;
  for (const r of REVIEWS) {
    const exists = await query("SELECT id FROM reviews WHERE name = $1 AND text = $2", [r.name, r.text]);
    if (exists.rowCount) continue;
    await createReview({ ...r, status: "approved" });
    reviewCount++;
  }
  console.log(`[SEED] ${reviewCount} reviews inserted.`);

  /* events */
  const eventExists = await query("SELECT id FROM events LIMIT 1");
  if (!eventExists.rowCount) {
    const start = new Date();
    start.setDate(start.getDate() + 5);
    const end = new Date(start);
    end.setDate(end.getDate() + 25);
    await createEvent({
      title: "Wedding Season Packages",
      subtitle: "Now booking for the upcoming season",
      description: "Enquire early to secure your date. Every package is tailored to your venue and guest count — pricing is discussed on WhatsApp.",
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });
    console.log("[SEED] 1 upcoming event inserted.");
  }

  /* social */
  const videoCount = await query("SELECT id FROM videos LIMIT 1");
  if (!videoCount.rowCount) {
    for (const [i, v] of VIDEOS.entries()) {
      const youtubeId = v.url.match(/v=([A-Za-z0-9_-]{11})/)?.[1];
      if (youtubeId) await createVideo({ youtubeId, title: v.title, sortOrder: i });
    }
    console.log(`[SEED] ${VIDEOS.length} videos inserted.`);
  }
  const linkCount = await query("SELECT id FROM social_links LIMIT 1");
  if (!linkCount.rowCount) {
    await createSocialLink({ platform: "instagram", url: "https://instagram.com/", handle: "@asdecoration", label: "Instagram", sortOrder: 1 });
    await createSocialLink({ platform: "youtube", url: "https://youtube.com/", handle: "AS Decoration", label: "YouTube", sortOrder: 2 });
    await createSocialLink({ platform: "whatsapp", url: `https://wa.me/${env.whatsappNumber}`, label: "WhatsApp", sortOrder: 3 });
    console.log("[SEED] 3 social links inserted (update these in the admin).");
  }

  await setSetting("business", {
    name: env.businessName,
    whatsapp: env.whatsappNumber,
    districts: ["Nalanda", "Sheikhpura", "Nawada", "Lakhisarai"],
  });

  console.log("\n[SEED] Done. Sign in at /admin");
  console.log(`[SEED]   email:    ${env.adminEmail}`);
  console.log(`[SEED]   password: ${env.adminPassword}`);
  console.log("[SEED]   Change this password immediately in Admin > Profile.");
  await closeDB();
}

main().catch(async (err) => {
  console.error("[SEED] Failed:", err);
  await closeDB().catch(() => {});
  process.exit(1);
});
