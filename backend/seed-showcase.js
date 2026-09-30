/**
 * seed-showcase.js
 *
 * Rebuilds the catalogue into the homepage showcase layout the owner asked for:
 *
 *   WEDDING
 *     Stage .............. 5 designs
 *     Mehendi ............ 5 designs
 *     Haldi .............. 5 designs
 *     Car Decoration ..... 5 designs
 *   BIRTHDAY
 *     Balloon Decoration . 4 designs
 *   SHOP DECORATION
 *     Decorations by Occasion .. 5 designs
 *
 * Photos come from Openverse (Creative Commons, commercial-use filter) and are
 * stored as PLACEHOLDERs so the owner can swap in real photography from the
 * admin without touching code. Everything else in the database is left alone.
 *
 *   node backend/seed-showcase.js [--reset]
 */
import sharp from "sharp";
import { query, many, one } from "./config/db.js";
import { processImage } from "./middleware/images.js";
import { insertMedia } from "./models/media.js";

const UA = "asdecoration-showcase/1.0 (contact: admin@asdecoration.com)";
const WANT_PER_GROUP = 5;

/* ------------------------------------------------------------------ taxonomy */

const TAXONOMY = [
  {
    slug: "wedding",
    name: "Wedding",
    order: 1,
    show: true,
    intro:
      "Stage, mehendi, haldi and car decoration for every kind of wedding function.",
    subs: [
      { slug: "stage", name: "Stage", order: 1, show: true, q: "wedding stage decoration" },
      { slug: "mehendi", name: "Mehendi", order: 2, show: true, q: "mehndi ceremony henna decoration" },
      { slug: "haldi", name: "Haldi", order: 3, show: true, q: "haldi ceremony decoration" },
      { slug: "car-decoration", name: "Car Decoration", order: 4, show: true, q: "wedding car decoration flowers" },
    ],
  },
  {
    slug: "birthday",
    name: "Birthday",
    order: 2,
    show: true,
    intro: "Balloon decoration setups for kids parties and adult birthdays.",
    subs: [
      { slug: "balloon-decoration", name: "Balloon Decoration", order: 1, show: true, q: "birthday balloon decoration party" },
    ],
  },
  {
    slug: "anniversary",
    name: "Anniversary",
    order: 3,
    show: false,
    intro: "Romantic dinner and home anniversary decor.",
    subs: [
      { slug: "romantic-dinner", name: "Romantic Dinner", order: 1, show: false, q: "anniversary dinner decoration" },
      { slug: "home-decor", name: "Home Decor", order: 2, show: false, q: "anniversary home decoration" },
    ],
  },
  {
    slug: "shop-office",
    name: "Shop Decoration",
    order: 4,
    show: true,
    intro: "How we decorate shops and showrooms for each occasion.",
    subs: [
      { slug: "decor-by-occasion", name: "Decorations by Occasion", order: 1, show: true, q: "shop store decoration festive" },
    ],
  },
  {
    slug: "special-days",
    name: "Special Days",
    order: 5,
    show: false,
    intro: "Engagement, reception, baby shower and naming ceremonies.",
    subs: [
      { slug: "engagement", name: "Engagement", order: 1, show: false, q: "engagement decoration" },
      { slug: "reception", name: "Reception", order: 2, show: false, q: "reception decoration stage" },
      { slug: "baby-shower", name: "Baby Shower", order: 3, show: false, q: "baby shower decoration" },
      { slug: "naming-ceremony", name: "Naming Ceremony", order: 4, show: false, q: "naming ceremony decoration" },
    ],
  },
];

async function applyTaxonomy() {
  for (const c of TAXONOMY) {
    await query(
      `INSERT INTO categories (slug, name, sort_order, show_on_home, intro)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
             show_on_home = EXCLUDED.show_on_home, intro = EXCLUDED.intro`,
      [c.slug, c.name, c.order, c.show, c.intro]
    );
    for (const s of c.subs) {
      await query(
        `INSERT INTO subcategories (category_id, slug, name, sort_order, show_on_home)
         SELECT c.id, $2, $3, $4, $5 FROM categories c WHERE c.slug = $1
         ON CONFLICT (slug) DO UPDATE
           SET category_id = EXCLUDED.category_id, name = EXCLUDED.name,
               sort_order = EXCLUDED.sort_order, show_on_home = EXCLUDED.show_on_home`,
        [c.slug, s.slug, s.name, s.order, s.show]
      );
    }
  }
  console.log(`[SHOWCASE] ${TAXONOMY.length} categories, ${TAXONOMY.reduce((n, c) => n + c.subs.length, 0)} subcategories.`);
}

/* -------------------------------------------------------------------- images */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Openverse is a general-purpose archive: a search for "anniversary dinner
   decoration" happily returns protest photography. A photo only qualifies if
   its title actually describes decoration, and never if it trips a reject word. */
const RELEVANT = new RegExp(
  [
    "decor", "decoration", "mandap", "mehndi", "mehendi", "haldi", "haldi", "sangeet",
    "wedding", "marriage", "bridal", "bride", "marriage", "stage", "backdrop", "arch",
    "floral", "flower", "garland", "marigold", "rose", "balloon", "birthday", "cake",
    "car", "carriage", "auto.?rickshaw", "car.?decoration", "reception", "engagement",
    "party", "celebration", "anniversary", "festive", "diwali", "holi", "christmas",
    "xmas", "shop", "store", "boutique", "display", "showroom", "launch", "opening",
    "table", "centrepiece", "centerpiece", "lights", "lighting", "candles", "candle",
    "drape", "draping", "setup", "arrange", "ornament", "welcome", "gate", "path",
  ].join("|"),
  "i"
);

const REJECT = new RegExp(
  [
    "effigy", "protest", "vigil", "riot", "police", "military", "corpse", "coffin",
    "funeral", "memorial", "burn", "riot", "riot", "crime", "court", "prison",
    "shuttered window", "frustrat", "abandoned", "derelict", "ruin", "demolition",
    "portrait of", "selfie", "nude", "corpse", "cadaver", "morgue", "tattoo",
    "asíо", "asio", "statue of", "graffiti", "signage only", "map of", "diagram",
  ].join("|"),
  "i"
);

function isRelevant(result) {
  const text = `${result.title || ""} ${result.tags?.map((t) => t.name).join(" ") || ""}`;
  if (REJECT.test(text)) return false;
  return RELEVANT.test(text);
}

async function searchOpenverse(query, want) {
  const url =
    "https://api.openverse.org/v1/images/?" +
    new URLSearchParams({
      q: query,
      license_type: "commercial",
      page_size: String(Math.min(want * 6, 20)),
      mature: "false",
    });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`openverse ${res.status}`);
  const data = await res.json();
  return (data.results || []).filter(isRelevant);
}

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!/image\/(jpeg|png|webp)/.test(type)) throw new Error(`not an image (${type})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 12_000) throw new Error("suspiciously small");
  if (buf.length > 14_000_000) throw new Error("too large");
  return buf;
}

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function uniqueSlug(base) {
  let slug = base;
  let n = 2;
  /* eslint-disable no-await-in-loop */
  while (await one("SELECT id FROM designs WHERE slug = $1", [slug])) slug = `${base}-${n++}`;
  return slug;
}

async function buildGroup(catSlug, sub) {
  const cat = await one("SELECT id, name FROM categories WHERE slug = $1", [catSlug]);
  const sb = await one("SELECT id, name FROM subcategories WHERE slug = $1", [sub.slug]);
  if (!cat || !sb) throw new Error(`missing taxonomy for ${catSlug}/${sub.slug}`);

  const existing = await many(
    `SELECT d.id, d.name, d.sort_order FROM designs d
      WHERE d.subcategory_id = $1 ORDER BY d.sort_order, d.id`,
    [sb.id]
  );
  if (existing.length >= WANT_PER_GROUP) {
    console.log(`[SHOWCASE]   ${cat.name} / ${sb.name}: ${existing.length} designs already present, skipped.`);
    return;
  }

  console.log(`[SHOWCASE]   ${cat.name} / ${sb.name}: searching Openverse for "${sub.q}"`);
  let results = [];
  try {
    results = await searchOpenverse(sub.q, WANT_PER_GROUP - existing.length);
  } catch (e) {
    console.error(`[SHOWCASE]     search failed (${e.message})`);
    return;
  }
  if (!results.length) {
    console.error(`[SHOWCASE]     no results`);
    return;
  }

  let added = 0;
  for (const r of results) {
    if (added >= WANT_PER_GROUP - existing.length) break;
    let buf;
    try {
      buf = await download(r.url);
    } catch (e) {
      console.error(`[SHOWCASE]     skip ${(r.title || r.url).slice(0, 40)} (${e.message})`);
      continue;
    }
    let img;
    try {
      img = await processImage(buf, `${sb.name} decoration by AS Decoration`);
    } catch (e) {
      console.error(`[SHOWCASE]     unprocessable image, skipped (${e.message})`);
      continue;
    }

    /* Source photo titles are unpredictable ("Frustrated", "Shuttered Window;
       Mdina, Malta"), so the design gets a clean sequential name. The owner
       renames these from the admin once real photos are in. */
    const seq = String(existing.length + added + 1).padStart(2, "0");
    const label = /\bdecoration\b/i.test(sb.name) ? sb.name : `${sb.name} Decoration`;
    const name = `${label} ${seq}`;
    const mediaId = await insertMedia({
      filename: `${slugify(name)}.webp`,
      mime: img.mime,
      data: img.data,
      thumb: img.thumb,
      width: img.width,
      height: img.height,
      alt: `${sb.name} decoration by AS Decoration`,
      isPlaceholder: true,
    });

    const slug = await uniqueSlug(slugify(name));
    await query(
      `INSERT INTO designs
         (slug, name, category_id, subcategory_id, description, highlights,
          cover_media_id, is_inspiration, featured, active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,true,true,$8)`,
      [
        slug,
        name,
        cat.id,
        sb.id,
        `${sb.name} decoration by AS Decoration. This is a sample design — replace the photo with your own work from the admin panel.`,
        [],
        mediaId,
        existing.length + added,
      ]
    );
    await query(
      `INSERT INTO design_images (design_id, media_id, sort_order) VALUES ($1,$2,0)`,
      [ (await one("SELECT id FROM designs WHERE slug = $1", [slug])).id, mediaId ]
    );
    added++;
    process.stdout.write(".");
  }
  console.log(` ${added} added`);
  await sleep(400);
}

/* ---------------------------------------------------------------------- main */

async function main() {
  if (process.argv.includes("--photos")) {
    // Swap the stock photos for a fresh, relevance-filtered set. Only the
    // designs in show_on_home categories are touched; the owner-facing
    // taxonomy is left exactly as configured.
    console.log("[SHOWCASE] Removing current showcase designs to refetch photos…");
    const cats = await many("SELECT id FROM categories WHERE show_on_home");
    for (const c of cats) {
      const ds = await many("SELECT id FROM designs WHERE category_id = $1", [c.id]);
      for (const d of ds) await query("DELETE FROM designs WHERE id = $1", [d.id]);
    }
    await query(
      `DELETE FROM media WHERE is_placeholder
         AND id NOT IN (SELECT media_id FROM gallery_items WHERE media_id IS NOT NULL)
         AND id NOT IN (SELECT media_id FROM customer_uploads WHERE media_id IS NOT NULL)`
    );
  }

  if (process.argv.includes("--reset")) {
    console.log("[SHOWCASE] Clearing existing designs and their media…");
    const rows = await many("SELECT id FROM designs");
    for (const d of rows) await query("DELETE FROM designs WHERE id = $1", [d.id]);
    await query("DELETE FROM media WHERE is_placeholder AND id NOT IN (SELECT media_id FROM gallery_items WHERE media_id IS NOT NULL) AND id NOT IN (SELECT media_id FROM customer_uploads WHERE media_id IS NOT NULL)");
  }

  await applyTaxonomy();
  for (const c of TAXONOMY) {
    for (const s of c.subs) await buildGroup(c.slug, s);
  }

  const stat = await one(
    `SELECT (SELECT COUNT(*) FROM designs WHERE active) AS designs,
            (SELECT COUNT(*) FROM media WHERE is_placeholder) AS placeholders,
            (SELECT COALESCE(SUM(bytes),0) FROM media) AS bytes`
  );
  console.log(
    `\n[SHOWCASE] Done. ${stat.designs} active designs, ${stat.placeholders} placeholder photos, ` +
      `${(Number(stat.bytes) / 1_048_576).toFixed(1)} MB stored.`
  );
  console.log("[SHOWCASE] Replace any photo from Admin > Designs > Manage photos.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
