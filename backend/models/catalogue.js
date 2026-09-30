/**
 * models/catalogue.js
 * Categories, subcategories and designs (catalogue entries + real projects).
 */
import { many, one, query, transaction } from "../config/db.js";
import { mediaUrl, thumbUrl, toMediaJson } from "./media.js";

/* ------------------------------------------------------------------ taxonomy */

export async function listCategories() {
  return many(
    `SELECT c.id, c.slug, c.name, c.sort_order, c.show_on_home, c.intro,
            (SELECT COUNT(*) FROM designs d
              WHERE d.category_id = c.id AND d.active) AS design_count
       FROM categories c ORDER BY c.sort_order, c.name`
  );
}

export async function listSubcategories(categoryId = null) {
  if (categoryId) {
    return many(
      "SELECT id, category_id, slug, name, sort_order, show_on_home FROM subcategories WHERE category_id = $1 ORDER BY sort_order, name",
      [categoryId]
    );
  }
  return many(
    `SELECT s.id, s.category_id, s.slug, s.name, s.sort_order, s.show_on_home, c.slug AS category_slug
       FROM subcategories s JOIN categories c ON c.id = s.category_id
      ORDER BY c.sort_order, s.sort_order, s.name`
  );
}

export async function getCategoryBySlug(slug) {
  return one("SELECT * FROM categories WHERE slug = $1", [slug]);
}

/**
 * The homepage showcase, in one round trip.
 *
 * Returns only categories/subcategories flagged show_on_home, each carrying its
 * active designs (cover + image count). A subcategory with no designs is kept as
 * an empty group only if it has none at all and the category has other content --
 * empty groups are dropped so the page never shows a bare heading.
 *
 * @param {object} o  { limitPerGroup } - max designs per subcategory (default 12)
 */
export async function homeSections(o = {}) {
  const per = Math.min(Number(o.limitPerGroup) || 12, 60);

  const cats = await many(
    `SELECT c.id, c.slug, c.name, c.sort_order, c.intro,
            (SELECT COUNT(*) FROM designs d JOIN subcategories s2 ON s2.id = d.subcategory_id
              WHERE d.category_id = c.id AND d.active AND s2.show_on_home) AS design_count
       FROM categories c
      WHERE c.show_on_home
      ORDER BY c.sort_order, c.name`
  );
  if (!cats.length) return { sections: [] };

  const subs = await many(
    `SELECT s.id, s.category_id, s.slug, s.name, s.sort_order
       FROM subcategories s
      WHERE s.show_on_home
        AND s.category_id = ANY($1::int[])
      ORDER BY s.sort_order, s.name`,
    [cats.map((c) => c.id)]
  );
  if (!subs.length) return { sections: [] };

  const rows = await many(
    `${DESIGN_SELECT}
      WHERE d.active
        AND d.subcategory_id = ANY($1::int[])
      ORDER BY d.featured DESC, d.sort_order, d.id`,
    [subs.map((s) => s.id)]
  );

  // Keep the admin's manual ordering within each subcategory.
  const perSub = new Map();
  for (const r of rows) {
    const key = r.subcategory_id;
    if (!perSub.has(key)) perSub.set(key, []);
    const list = perSub.get(key);
    if (list.length < per) list.push({ ...shapeDesign(r), imageCount: 0 });
  }

  const counts = await designImageCounts([...perSub.values()].flat().map((d) => d.id));
  for (const list of perSub.values()) {
    for (const d of list) d.imageCount = counts.get(d.id) || 0;
  }

  const subsByCat = new Map();
  for (const s of subs) {
    if (!subsByCat.has(s.category_id)) subsByCat.set(s.category_id, []);
    subsByCat.get(s.category_id).push({
      id: s.id,
      slug: s.slug,
      name: s.name,
      designs: perSub.get(s.id) || [],
    });
  }

  const sections = cats
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      intro: c.intro,
      total: c.design_count,
      groups: (subsByCat.get(c.id) || []).filter((g) => g.designs.length > 0),
    }))
    .filter((s) => s.groups.length > 0);

  return { sections };
}

/* -------------------------------------------------------------------- designs */

const DESIGN_SELECT = `
  SELECT d.id, d.slug, d.name, d.description, d.highlights, d.is_inspiration, d.featured,
         d.active, d.sort_order, d.town, d.event_date, d.views, d.enquiry_count,
         d.created_at, d.updated_at,
         d.category_id, d.subcategory_id, d.cover_media_id,
         c.slug AS category_slug, c.name AS category_name,
         s.slug AS subcategory_slug, s.name AS subcategory_name,
         m.filename AS cover_filename, m.width AS cover_width, m.height AS cover_height,
         m.is_placeholder AS cover_placeholder
    FROM designs d
    LEFT JOIN categories    c ON c.id = d.category_id
    LEFT JOIN subcategories s ON s.id = d.subcategory_id
    LEFT JOIN media         m ON m.id = d.cover_media_id`;

function shapeDesign(row, images = []) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    highlights: row.highlights,
    isInspiration: row.is_inspiration,
    featured: row.featured,
    active: row.active,
    sortOrder: row.sort_order,
    town: row.town,
    eventDate: row.event_date,
    views: row.views,
    enquiryCount: row.enquiry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    subcategoryId: row.subcategory_id,
    subcategorySlug: row.subcategory_slug,
    subcategoryName: row.subcategory_name,
    cover: row.cover_media_id
      ? {
          id: row.cover_media_id,
          url: mediaUrl(row.cover_media_id),
          thumb: thumbUrl(row.cover_media_id),
          width: row.cover_width,
          height: row.cover_height,
          isPlaceholder: row.cover_placeholder,
        }
      : null,
    images,
    whatsappText: `Hello AS Decoration, I am interested in the ${row.name}. I would like to discuss the details.`,
  };
}

/** All images for a design, in display order. */
export async function designImages(designId) {
  const rows = await many(
    `SELECT m.id, m.width, m.height, m.alt, m.is_placeholder, m.filename
       FROM design_images di JOIN media m ON m.id = di.media_id
      WHERE di.design_id = $1 ORDER BY di.sort_order, di.id`,
    [designId]
  );
  return rows.map(toMediaJson);
}

export async function designImageCounts(designIds) {
  if (!designIds.length) return new Map();
  const rows = await many(
    `SELECT design_id, COUNT(*)::int AS n FROM design_images
      WHERE design_id = ANY($1::int[]) GROUP BY design_id`,
    [designIds]
  );
  return new Map(rows.map((r) => [r.design_id, r.n]));
}

/**
 * Filtered, paginated design list.
 * @param {object} f  category, subcategory, q, featured, isInspiration, town, sort, limit, offset
 */
export async function listDesigns(f = {}) {
  const where = ["d.active"];
  const params = [];
  const add = (frag, val) => {
    params.push(val);
    where.push(frag.replace("?", `$${params.length}`));
  };

  if (f.category) add("c.slug = ?", f.category);
  if (f.subcategory) add("s.slug = ?", f.subcategory);
  if (f.town) add("LOWER(d.town) = LOWER(?)", f.town);
  if (f.featured) where.push("d.featured");
  if (f.isInspiration !== undefined && f.isInspiration !== null && f.isInspiration !== "") {
    add("d.is_inspiration = ?", f.isInspiration === "true" || f.isInspiration === true);
  }
  if (f.q) {
    params.push(f.q);
    where.push(
      `(d.name ILIKE $${params.length} OR d.description ILIKE $${params.length} OR d.town ILIKE $${params.length}
        OR c.name ILIKE $${params.length} OR s.name ILIKE $${params.length})`
    );
  }

  const order =
    {
      newest: "d.created_at DESC",
      popular: "d.views DESC, d.enquiry_count DESC",
      name: "d.name ASC",
    }[f.sort] || "d.featured DESC, d.created_at DESC";

  const limit = Math.min(Number(f.limit) || 24, 60);
  const offset = Number(f.offset) || 0;
  params.push(limit, offset);

  const rows = await many(
    `${DESIGN_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const counts = await designImageCounts(rows.map((r) => r.id));
  const total = await one(
    `SELECT COUNT(*)::int AS n FROM designs d
       LEFT JOIN categories c ON c.id = d.category_id
       LEFT JOIN subcategories s ON s.id = d.subcategory_id
      WHERE ${where.join(" AND ")}`,
    params.slice(0, params.length - 2)
  );

  return {
    designs: rows.map((r) => ({ ...shapeDesign(r), imageCount: counts.get(r.id) || 0 })),
    total: total?.n ?? rows.length,
    limit,
    offset,
  };
}

export async function getDesignBySlug(slug) {
  const row = await one(`${DESIGN_SELECT} WHERE d.slug = $1 AND d.active`, [slug]);
  if (!row) return null;
  const images = await designImages(row.id);
  return shapeDesign(row, images);
}

export async function getDesignById(id) {
  const row = await one(`${DESIGN_SELECT} WHERE d.id = $1`, [id]);
  if (!row) return null;
  return shapeDesign(row, await designImages(row.id));
}

/** Designs in the same category, excluding this one. `design` is the shaped object. */
export async function relatedDesigns(design, limit = 4) {
  const rows = await many(
    `${DESIGN_SELECT} WHERE d.active AND d.id <> $1 AND d.is_inspiration = $2
       AND (d.category_id = $3 OR (d.subcategory_id IS NOT NULL AND d.subcategory_id = $4))
     ORDER BY d.featured DESC, d.views DESC LIMIT $5`,
    [design.id, design.isInspiration, design.categoryId, design.subcategoryId, limit]
  );
  return rows.map((r) => shapeDesign(r));
}

export async function incrementDesignViews(id) {
  await query("UPDATE designs SET views = views + 1 WHERE id = $1", [id]);
}

export async function incrementDesignEnquiries(id) {
  await query("UPDATE designs SET enquiry_count = enquiry_count + 1 WHERE id = $1", [id]);
}

export async function adminListDesigns() {
  const rows = await many(`${DESIGN_SELECT} ORDER BY d.updated_at DESC`);
  const counts = await designImageCounts(rows.map((r) => r.id));
  return rows.map((r) => ({ ...shapeDesign(r), imageCount: counts.get(r.id) || 0 }));
}

/** Create a design and attach its images in one transaction. */
export async function createDesign(input) {
  return transaction(async (t) => {
    const { rows } = await t.query(
      `INSERT INTO designs
         (slug, name, category_id, subcategory_id, description, highlights,
          cover_media_id, is_inspiration, featured, active, town, event_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        input.slug, input.name, input.categoryId || null, input.subcategoryId || null,
        input.description || "", input.highlights || [],
        input.coverMediaId || null, input.isInspiration ?? true,
        input.featured ?? false, input.active ?? true,
        input.town || null, input.eventDate || null,
      ]
    );
    const id = rows[0].id;
    await setDesignImages(t, id, input.mediaIds || []);
    return id;
  });
}

export async function updateDesign(id, input) {
  const sets = [];
  const params = [id];
  const set = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  if (input.name !== undefined) set("name", input.name);
  if (input.slug !== undefined) set("slug", input.slug);
  if (input.description !== undefined) set("description", input.description);
  if (input.highlights !== undefined) set("highlights", input.highlights);
  if (input.categoryId !== undefined) set("category_id", input.categoryId || null);
  if (input.subcategoryId !== undefined) set("subcategory_id", input.subcategoryId || null);
  if (input.coverMediaId !== undefined) set("cover_media_id", input.coverMediaId || null);
  if (input.isInspiration !== undefined) set("is_inspiration", input.isInspiration);
  if (input.featured !== undefined) set("featured", input.featured);
  if (input.active !== undefined) set("active", input.active);
  if (input.town !== undefined) set("town", input.town || null);
  if (input.eventDate !== undefined) set("event_date", input.eventDate || null);

  if (sets.length) {
    sets.push("updated_at = now()");
    await query(`UPDATE designs SET ${sets.join(", ")} WHERE id = $1`, params);
  }
  if (input.mediaIds) await replaceDesignImages(id, input.mediaIds);
  return getDesignById(id);
}

export async function deleteDesign(id) {
  const res = await query("DELETE FROM designs WHERE id = $1", [id]);
  return res.rowCount > 0;
}

/* ------------------------------------------------------------------- images */

async function setDesignImages(t, designId, mediaIds) {
  for (let i = 0; i < mediaIds.length; i++) {
    await t.query(
      "INSERT INTO design_images (design_id, media_id, sort_order) VALUES ($1,$2,$3)",
      [designId, mediaIds[i], i]
    );
  }
}

export async function replaceDesignImages(designId, mediaIds) {
  await transaction(async (t) => {
    await t.query("DELETE FROM design_images WHERE design_id = $1", [designId]);
    await setDesignImages(t, designId, mediaIds);
    // Keep the cover in sync with the first image.
    await t.query("UPDATE designs SET cover_media_id = $2 WHERE id = $1", [
      designId,
      mediaIds[0] ?? null,
    ]);
  });
}

export async function addDesignImages(designId, mediaIds) {
  return transaction(async (t) => {
    const cur = await t.one(
      "SELECT COALESCE(MAX(sort_order), -1) AS m FROM design_images WHERE design_id = $1",
      [designId]
    );
    let order = (cur?.m ?? -1) + 1;
    for (const mediaId of mediaIds) {
      await t.query(
        "INSERT INTO design_images (design_id, media_id, sort_order) VALUES ($1,$2,$3)",
        [designId, mediaId, order++]
      );
    }
    // Set the cover if the design has none yet.
    await t.query(
      "UPDATE designs SET cover_media_id = COALESCE(cover_media_id, $2) WHERE id = $1",
      [designId, mediaIds[0] ?? null]
    );
  });
}

export async function removeDesignImage(designId, mediaId) {
  return transaction(async (t) => {
    await t.query("DELETE FROM design_images WHERE design_id = $1 AND media_id = $2", [
      designId,
      mediaId,
    ]);
    const first = await t.one(
      `SELECT m.id FROM design_images di JOIN media m ON m.id = di.media_id
        WHERE di.design_id = $1 ORDER BY di.sort_order, di.id LIMIT 1`,
      [designId]
    );
    await t.query("UPDATE designs SET cover_media_id = $2 WHERE id = $1", [
      designId,
      first?.id ?? null,
    ]);
  });
}

export async function reorderDesignImages(designId, mediaIds) {
  await transaction(async (t) => {
    for (let i = 0; i < mediaIds.length; i++) {
      await t.query(
        "UPDATE design_images SET sort_order = $3 WHERE design_id = $1 AND media_id = $2",
        [designId, mediaIds[i], i]
      );
    }
    await t.query("UPDATE designs SET cover_media_id = $2, updated_at = now() WHERE id = $1", [
      designId,
      mediaIds[0] ?? null,
    ]);
  });
}

/* -------------------------------------------------------------- slug helper */

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "design";
}

/** Ensure a slug is unique, appending -2, -3 … as needed. */
export async function uniqueSlug(base, ignoreId = null) {
  let slug = slugify(base);
  let n = 1;
  for (;;) {
    const row = await one("SELECT id FROM designs WHERE slug = $1", [slug]);
    if (!row || (ignoreId && row.id === ignoreId)) return slug;
    slug = `${slugify(base)}-${++n}`;
  }
}

/* ------------------------------------------------- admin taxonomy management
 * The owner builds the homepage from the admin, so categories and
 * subcategories need full CRUD plus a show/hide switch. Hiding never deletes:
 * a hidden row keeps its designs and reappears the moment the toggle is flipped.
 * ------------------------------------------------------------------------- */

export async function createCategory({ name, intro = null, sortOrder = 0, showOnHome = true }) {
  const base = slugify(name);
  const slug = base || `category-${Date.now()}`;
  const { rows } = await query(
    `INSERT INTO categories (slug, name, sort_order, show_on_home, intro)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [slug, name, sortOrder, showOnHome, intro]
  );
  return rows[0];
}

export async function updateCategory(id, patch) {
  const sets = [];
  const params = [];
  const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.intro !== undefined) add("intro", patch.intro);
  if (patch.sortOrder !== undefined) add("sort_order", patch.sortOrder);
  if (patch.showOnHome !== undefined) add("show_on_home", patch.showOnHome);
  if (patch.slug !== undefined) add("slug", patch.slug);
  if (!sets.length) return getCategoryById(id);
  params.push(id);
  const { rows } = await query(
    `UPDATE categories SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0] || null;
}

export async function getCategoryById(id) {
  return one("SELECT * FROM categories WHERE id = $1", [id]);
}

export async function removeCategory(id) {
  const res = await query("DELETE FROM categories WHERE id = $1", [id]);
  return res.rowCount > 0;
}

export async function createSubcategory({ categoryId, name, sortOrder = 0, showOnHome = true }) {
  const slug = slugify(name) || `group-${Date.now()}`;
  const { rows } = await query(
    `INSERT INTO subcategories (category_id, slug, name, sort_order, show_on_home)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [categoryId, slug, name, sortOrder, showOnHome]
  );
  return rows[0];
}

export async function updateSubcategory(id, patch) {
  const sets = [];
  const params = [];
  const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.sortOrder !== undefined) add("sort_order", patch.sortOrder);
  if (patch.showOnHome !== undefined) add("show_on_home", patch.showOnHome);
  if (patch.categoryId !== undefined) add("category_id", patch.categoryId);
  if (patch.slug !== undefined) add("slug", patch.slug);
  if (!sets.length) return getSubcategoryById(id);
  params.push(id);
  const { rows } = await query(
    `UPDATE subcategories SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0] || null;
}

export async function getSubcategoryById(id) {
  return one("SELECT * FROM subcategories WHERE id = $1", [id]);
}

export async function removeSubcategory(id) {
  const res = await query("DELETE FROM subcategories WHERE id = $1", [id]);
  return res.rowCount > 0;
}

/** Full taxonomy tree with design counts, for the admin categories screen. */
export async function taxonomyTree() {
  const cats = await many(
    `SELECT c.id, c.slug, c.name, c.sort_order, c.show_on_home, c.intro,
            (SELECT COUNT(*) FROM designs d WHERE d.category_id = c.id) AS design_count
       FROM categories c ORDER BY c.sort_order, c.name`
  );
  const subs = await many(
    `SELECT s.id, s.category_id, s.slug, s.name, s.sort_order, s.show_on_home,
            (SELECT COUNT(*) FROM designs d WHERE d.subcategory_id = s.id) AS design_count
       FROM subcategories s ORDER BY s.sort_order, s.name`
  );
  return cats.map((c) => ({
    ...c,
    subcategories: subs.filter((s) => s.category_id === c.id),
  }));
}

/** Persist a new display order for categories or subcategories. */
export async function reorderTaxonomy(kind, ids) {
  const table = kind === "subcategory" ? "subcategories" : "categories";
  if (!["categories", "subcategories"].includes(table)) throw new Error("Unknown taxonomy type.");
  return transaction(async (t) => {
    for (let i = 0; i < ids.length; i++) {
      await t.query(`UPDATE ${table} SET sort_order = $2 WHERE id = $1`, [ids[i], i + 1]);
    }
  });
}
