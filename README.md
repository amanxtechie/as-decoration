# AS Decoration — Full-Stack Website

Premium digital **design catalogue & enquiry platform** for AS Decoration, a decoration
studio serving **Nalanda, Sheikhpura, Nawada & Lakhisarai** districts in Bihar, India.

> Strict rule: **no pricing is displayed anywhere.** All pricing and customisation is handled
> via WhatsApp / enquiry consultation. The journey is **Show → Inspire → Build Trust → Contact → Discuss → Finalize.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript — no frameworks, no build step |
| **Backend** | Node.js + Express.js, REST API (routes / controllers / models / middleware) |
| **Database** | **PostgreSQL**, plain SQL (no ORM) |
| **Auth** | JWT admin sessions, bcrypt password hashing |
| **Images** | Uploaded to Postgres as WebP via sharp; served through a caching endpoint |
| **Video/Social** | YouTube embeds + Instagram oEmbed (token-free since June 2026) |
| **Security** | Helmet CSP, CORS, express-validator, sanitize-html, rate limiting, honeypots |

---

## Project Structure

```
AS-DECORATION/
├── frontend/                    # Public website (static, vanilla)
│   ├── index.html               # Home
│   ├── catalogue.html           # Filterable catalogue
│   ├── design.html              # Single design (?slug=)
│   ├── our-work.html            # Gallery + video walkthroughs
│   ├── about.html
│   ├── contact.html             # Enquiry form
│   ├── reviews.html             # Reviews + customer photo upload
│   ├── privacy.html
│   ├── 404.html
│   ├── favicon.svg · robots.txt · manifest.webmanifest · sw.js
│   └── assets/
│       ├── css/styles.css       # Design system (tokens → components)
│       └── js/
│           ├── config.js        # API base + WhatsApp number  ← edit here
│           ├── api.js           # fetch wrapper
│           ├── ui.js            # esc(), toasts, modals, lightbox, formatting
│           ├── layout.js        # shared header/footer/mobile nav/search
│           ├── location.js      # district → town selector (localStorage)
│           ├── whatsapp.js      # contextual click-to-chat
│           ├── components.js    # card renderers (all values escaped)
│           ├── saved.js         # localStorage shortlist + "send all to WhatsApp"
│           ├── home.js · catalogue-page.js · design-page.js
│           └── work-page.js · about-page.js · contact-page.js · reviews-page.js
├── admin/                       # Admin dashboard (vanilla, same-origin)
│   ├── index.html
│   └── assets/{css/admin.css, js/admin.js}
├── backend/
│   ├── server.js                # entrypoint
│   ├── app.js                   # express app: API + static site + SEO routes
│   ├── seed.js                  # schema, admin, taxonomy, sample content
│   ├── db/schema.sql            # full PostgreSQL schema (idempotent)
│   ├── config/{env,db,locations}.js
│   ├── models/                  # SQL data-access (catalogue, content, leads, media, social, analytics, admin)
│   ├── controllers/             # request handlers
│   ├── routes/                  # public / auth / admin
│   └── middleware/              # auth, validate, upload, images, security, errorHandler
├── render.yaml                  # Render blueprint
└── package.json
```

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   - set DATABASE_URL, JWT_SECRET, ADMIN_EMAIL/PASSWORD

# 3. Start PostgreSQL (local)
brew services start postgresql@16
createdb asdecoration

# 4. Seed — creates the schema, admin account, categories and sample designs
npm run seed
#   add -- --reset to wipe content and reseed

# 5. Run (one process serves the API, the website and the admin)
npm start
```

Open:
- **Website:** http://localhost:5000/
- **Admin:** http://localhost:5000/admin — sign in with the seeded `ADMIN_EMAIL` / `ADMIN_PASSWORD`

> Change the default admin password immediately in **Admin → Profile**.

---

## Key Features

### Public site
- **Location-aware** — first-visit district → town selector, stored in `localStorage`, shown in the
  header, and injected into every WhatsApp message and enquiry.
- **Design catalogue** — category → subcategory filters, live search, four sort orders, pagination.
- **Design detail pages** — photo gallery with lightbox, highlights list, related designs, and an
  enquiry form pre-filled with the design being viewed.
- **Our Work** — filterable gallery by occasion and town, keyboard-navigable lightbox.
- **Videos & Instagram** — YouTube click-to-load embeds and live Instagram oEmbed posts, both
  managed from the admin by pasting a URL. No video hosting, no cost.
- **Reviews** — aggregate score with star distribution, public replies, review submission and
  customer photo upload, both moderated.
- **Saved designs** — `localStorage` shortlist with a *"send my whole shortlist to WhatsApp"* action.
- **Conversion layer** — floating WhatsApp button, sticky mobile bar [Call | WhatsApp | Enquire],
  contextual messages that name the design and the visitor's town.
- **SEO** — semantic HTML, JSON-LD, database-generated `sitemap.xml`, `robots.txt`, per-page meta.
- **PWA** — manifest + service worker; the catalogue is browsable offline.
- **Accessibility** — skip link, focus-visible rings, Escape-to-close modals, arrow-key lightbox,
  `prefers-reduced-motion` support.

### Admin dashboard
- **Drag-and-drop photo manager** — multi-select, real upload progress, drag-to-reorder,
  "make cover", delete. Up to 8 photos per design.
- **Placeholder tracking** — stock images are flagged with a `PLACEHOLDER` badge; a dashboard
  counter shows how many are still waiting to be replaced with the owner's real photography.
- **Enquiries** — status workflow, private notes, per-enquiry WhatsApp/call links, CSV export.
- **Analytics** — hand-rolled SVG charts for enquiries over time, by area, by occasion,
  a views → design-page → enquiry funnel, and most-viewed designs.
- **Media library** — every image in one place, usage counts, placeholder flags, storage total.
- **Moderation** — reviews and customer photo submissions, pending first.
- **YouTube & Instagram manager** — paste a URL, get an embed, with a live preview.
- **Profile** — change name, email and password; a warning shows while the seeded password is in use.

---

## API Reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/bootstrap` | public | one-shot page bootstrap (categories, videos, social) |
| GET | `/api/categories` | public | categories + subcategories with counts |
| GET | `/api/designs` | public | catalogue — `?category&subcategory&q&town&sort&limit&offset&featured` |
| GET | `/api/designs/:slug` | public | one design + related designs |
| GET | `/api/gallery` | public | approved "Our Work" |
| GET | `/api/reviews` | public | approved reviews + rating summary |
| GET | `/api/events` | public | live events (auto-expire by date) |
| GET | `/api/videos` · `/api/instagram` · `/api/social` | public | embeds and links |
| GET | `/api/locations` | public | served districts and towns |
| GET | `/api/media/:id` | public | image bytes (`?w=400` for thumbnail), ETag + immutable cache |
| POST | `/api/enquiries` | public | create lead (rate limited, honeypot) |
| POST | `/api/reviews` · `/api/uploads` | public | submit for moderation |
| POST | `/api/auth/login` | — | admin login → JWT |
| GET/PATCH | `/api/auth/me`, `/api/auth/password` | admin | profile and password |
| GET | `/api/admin/stats` · `/api/admin/analytics` | admin | dashboard counters and reports |
| CRUD | `/api/admin/enquiries` · `designs` · `gallery` · `events` | admin | content and leads |
| POST/PATCH/DELETE | `/api/admin/designs/:id/images` | admin | photo manager |
| GET/PATCH/DELETE | `/api/admin/reviews/:id` · `uploads/:id` | admin | moderation |
| GET/POST/PATCH/DELETE | `/api/admin/media` | admin | photo library |
| GET/POST/PATCH/DELETE | `/api/admin/videos` · `instagram` · `social` | admin | video and social |
| GET | `/sitemap.xml` · `/robots.txt` | public | generated from the database |

---

## Deployment (free tier)

1. Push the repo to GitHub.
2. Create a free **Neon** project and copy its `DATABASE_URL`.
3. Render Dashboard → **New → Blueprint** → point at the repo (`render.yaml` provisions the service).
4. Set `DATABASE_URL`, `JWT_SECRET` (auto-generated), and `CLIENT_ORIGIN` in the dashboard.
5. Run the seed once against the hosted database: `DATABASE_URL=… npm run seed`.
6. Attach a custom domain in the Render dashboard when ready.

**One process** serves the API, the website and the admin dashboard, so there is no CORS
configuration and no second service to pay for.

> **Free-tier caveat:** Render's free web service sleeps after ~15 minutes of inactivity, so the
> first visitor after a quiet period waits for it to wake. Static assets are served from the CDN
> and the analytics endpoint records page views, so you can measure whether this is hurting you.
> Upgrading that single service to Starter ($7/mo) removes the delay.

---

## Notes

- **Images live in PostgreSQL.** At ~20 photos this keeps hosting to a single free platform.
  Every upload is converted to WebP with a thumbnail, so 20 photos total roughly 8 MB.
  The `media` table is isolated — moving to S3/R2 later is a change to `models/media.js` only.
- **PostgreSQL lower-cases unquoted SQL aliases**, so camelCase columns are mapped explicitly in
  JS rather than relying on the alias. This is why `models/analytics.js` spells the mapping out.
- **Never trust API output in the DOM.** Both front ends escape every value through `esc()` /
  `escAttr()` before interpolation. This was a real stored-XSS hole in the previous version.
- **Change the WhatsApp number** in `frontend/assets/js/config.js` and `WHATSAPP_NUMBER` in `.env`.
