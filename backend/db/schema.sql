-- =============================================================================
-- AS Decoration — PostgreSQL schema
-- Plain SQL, no ORM. Targets PostgreSQL 14+ (local brew build and Neon free tier).
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Admin',
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Catalogue taxonomy
-- -----------------------------------------------------------------------------
-- The homepage is a category showcase: each visible category becomes a major
-- section, and each visible subcategory a sub-heading with a grid of designs.
-- Hidden rows stay in the database and can be switched back on from the admin.
CREATE TABLE IF NOT EXISTS categories (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  sort_order   INT  NOT NULL DEFAULT 0,
  show_on_home BOOLEAN NOT NULL DEFAULT TRUE,
  intro        TEXT
);

CREATE TABLE IF NOT EXISTS subcategories (
  id           SERIAL PRIMARY KEY,
  category_id  INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  sort_order   INT  NOT NULL DEFAULT 0,
  show_on_home BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_subcats_category ON subcategories(category_id);

-- Bring pre-existing databases up to date (CREATE TABLE IF NOT EXISTS above is a
-- no-op once the table exists, so the new columns need their own guarded ALTER).
ALTER TABLE categories    ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories    ADD COLUMN IF NOT EXISTS intro        TEXT;
ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT TRUE;

-- -----------------------------------------------------------------------------
-- Media: image bytes live in Postgres (small site, ~20 photos, keeps hosting to
-- one platform). Swap the storage backend later by changing `imageStore` only.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media (
  id             SERIAL PRIMARY KEY,
  filename       TEXT NOT NULL,
  mime           TEXT NOT NULL DEFAULT 'image/webp',
  data           BYTEA NOT NULL,
  thumb          BYTEA,
  width          INT,
  height         INT,
  bytes          INT NOT NULL DEFAULT 0,
  alt            TEXT,
  is_placeholder BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Designs: catalogue entries AND real projects (is_inspiration = false)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS designs (
  id              SERIAL PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  category_id     INT REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id  INT REFERENCES subcategories(id) ON DELETE SET NULL,
  description     TEXT NOT NULL DEFAULT '',
  highlights      TEXT[] NOT NULL DEFAULT '{}',
  cover_media_id  INT REFERENCES media(id) ON DELETE SET NULL,
  is_inspiration  BOOLEAN NOT NULL DEFAULT true,
  featured        BOOLEAN NOT NULL DEFAULT false,
  active          BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  town            TEXT,
  event_date      DATE,
  views           INT NOT NULL DEFAULT 0,
  enquiry_count   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_designs_category  ON designs(category_id);
CREATE INDEX IF NOT EXISTS idx_designs_active    ON designs(active);
ALTER TABLE designs ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_designs_featured  ON designs(featured);
-- Free-text search over name + description
CREATE INDEX IF NOT EXISTS idx_designs_search ON designs
  USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));

-- Ordered image list per design (2-3 photos typical, cap enforced in app)
CREATE TABLE IF NOT EXISTS design_images (
  id         SERIAL PRIMARY KEY,
  design_id  INT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  media_id   INT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_design_images_design ON design_images(design_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_design_images_media  ON design_images(media_id);

-- -----------------------------------------------------------------------------
-- Gallery ("Our Work" — real projects)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gallery_items (
  id             SERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  category_id    INT REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id INT REFERENCES subcategories(id) ON DELETE SET NULL,
  media_id       INT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  town           TEXT,
  event_date     DATE,
  description    TEXT NOT NULL DEFAULT '',
  featured       BOOLEAN NOT NULL DEFAULT false,
  active         BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gallery_active ON gallery_items(active, sort_order);

-- -----------------------------------------------------------------------------
-- Upcoming / seasonal events (auto-expire by date)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  media_id    INT REFERENCES media(id) ON DELETE SET NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);

-- -----------------------------------------------------------------------------
-- Reviews (pending -> approved/rejected)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  location    TEXT NOT NULL DEFAULT '',
  event_type  TEXT NOT NULL DEFAULT '',
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_customer BOOLEAN NOT NULL DEFAULT false,
  reply       TEXT,
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at DESC);

-- -----------------------------------------------------------------------------
-- Enquiries (leads)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enquiries (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT NOT NULL DEFAULT '',
  event_type   TEXT NOT NULL DEFAULT '',
  event_date   DATE,
  budget_note  TEXT NOT NULL DEFAULT '',
  requirement  TEXT NOT NULL DEFAULT '',
  district     TEXT NOT NULL DEFAULT '',
  town         TEXT NOT NULL DEFAULT '',
  design_id    INT REFERENCES designs(id) ON DELETE SET NULL,
  design_name  TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'website',
  utm_source   TEXT NOT NULL DEFAULT '',
  utm_medium   TEXT NOT NULL DEFAULT '',
  referrer     TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','contacted','quoted','confirmed','completed','cancelled')),
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_phone  ON enquiries(phone);

-- -----------------------------------------------------------------------------
-- Customer photo submissions (pending -> approved/rejected)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_uploads (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  town       TEXT NOT NULL DEFAULT '',
  media_id   INT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON customer_uploads(status, created_at DESC);

-- -----------------------------------------------------------------------------
-- Social video embeds (YouTube) and Instagram posts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS videos (
  id          SERIAL PRIMARY KEY,
  youtube_id  TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instagram_posts (
  id          SERIAL PRIMARY KEY,
  permalink   TEXT UNIQUE NOT NULL,
  embed_html  TEXT NOT NULL DEFAULT '',
  caption     TEXT NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_links (
  id         SERIAL PRIMARY KEY,
  platform   TEXT NOT NULL CHECK (platform IN ('youtube','instagram','facebook','whatsapp')),
  url        TEXT NOT NULL,
  handle     TEXT NOT NULL DEFAULT '',
  label      TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- Key/value settings (business info, whatsapp number, etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Lightweight analytics: page hits, used to spot slow (cold-start) first visits
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page_views (
  id         SERIAL PRIMARY KEY,
  path       TEXT NOT NULL,
  referrer   TEXT NOT NULL DEFAULT '',
  is_bot     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pageviews_created ON page_views(created_at DESC);

-- -----------------------------------------------------------------------------
-- Convenience view: design with its taxonomy + cover, used across the app
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW design_cards AS
SELECT
  d.id, d.slug, d.name, d.description, d.highlights, d.is_inspiration,
  d.featured, d.active, d.town, d.event_date, d.views, d.enquiry_count,
  d.created_at,
  c.id  AS category_id,  c.slug AS category_slug,  c.name AS category_name,
  s.id  AS subcategory_id, s.slug AS subcategory_slug, s.name AS subcategory_name,
  d.cover_media_id, m.filename AS cover_filename, m.width AS cover_width,
  m.height AS cover_height, m.is_placeholder AS cover_placeholder
FROM designs d
LEFT JOIN categories    c ON c.id = d.category_id
LEFT JOIN subcategories s ON s.id = d.subcategory_id
LEFT JOIN media         m ON m.id = d.cover_media_id;
