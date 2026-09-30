# Deploying AS Decoration to asdecoration.in

Two accounts are involved, and both steps need **you** — I have no Render or Neon
credentials, and DNS cannot be changed from here.

| Step | Who | Where |
|---|---|---|
| 1. Create the database | **You** | [neon.tech](https://neon.tech) |
| 2. Create the Render service | **You** | [render.com](https://render.com) |
| 3. Point the domain | **You** | domain registrar + Render |
| 4. Load the designs | **You** | one command |

The code is already production-tested. `npm start` applies the database schema and
creates the first admin automatically, so there is no manual migration step.

---

## Step 1 — Create the free Neon database

1. Sign up at [neon.tech](https://neon.tech) (free tier, no card).
2. **Create a project**, region **Asia Pacific (Singapore)** — closest to India.
3. Choose the **Free** plan.
4. Neon shows a connection string. Copy it — it looks like:
   ```
   postgresql://asdecoration_owner:AbCdEf123@ep-cool-name-a1b2c3.ap-southeast-1.aws.neon.tech/asdecoration?sslmode=require
   ```
   Keep the `?sslmode=require` at the end.

---

## Step 2 — Create the Render service

1. Sign in at [render.com](https://render.com) with your GitHub account.
2. **New → Blueprint**.
3. Select the repository **`amanxtechie/as-decoration`**.
   Render reads `render.yaml` and does the rest.
4. When prompted, supply:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string from step 1 |
   | `ADMIN_EMAIL` | your admin email |
   | `ADMIN_PASSWORD` | a strong password (16+ random characters) |

   `JWT_SECRET` is generated for you automatically.
5. Click **Apply**. The first deploy takes 3–5 minutes (it installs `sharp`).

When it finishes you get a URL like
`https://as-decoration.onrender.com`. The site is live at that address already.

Check it: `https://as-decoration.onrender.com/api/health` should return
`{"status":"ok",...}`.

---

## Step 3 — Load your designs (once)

A brand-new database has no designs, so the homepage will say *"Designs are being
added"*. Load them once from your Mac:

```bash
cd /Users/amankumar/Desktop/AS-DECORATION
DATABASE_URL="<paste the Neon string>" npm run seed-showcase
```

This downloads the placeholder photos and creates the Wedding / Birthday /
Shop Decoration sections. Run it **once** — never add it as a Render deploy
command, because it would overwrite your real content on every deploy.

---

## Step 4 — Point asdecoration.in at Render

**First confirm you actually own the domain.** A `.in` domain has to be registered
with a registrar (GoDaddy, Hostinger, BigRock, etc.). If you have not bought
`asdecoration.in` yet, buy it first — Render cannot register domains for you.

Then:

1. **Render → your service → Custom Domains → Add Custom Domain**
2. Enter `asdecoration.in` (and optionally `www.asdecoration.in`).
3. Render shows the DNS records it needs. At your registrar, set:
   - an **A record**: `@` → the IPv4 address Render gives you
   - a **CNAME**: `www` → the same address
4. Wait for DNS to propagate — usually a few minutes, sometimes a few hours.
5. Render provisions the TLS certificate automatically. The padlock appears when
   the domain goes **Live**.

> **Use `www` as your primary address.** Set `www` as the canonical host in
> Render so `asdecoration.in` redirects to `www.asdecoration.in` — one address
   is better for SEO than two serving the same content.

Finally, update `CLIENT_ORIGIN` in Render to your real domain and redeploy.

---

## Things that will bite you, and what to do

**The free plan sleeps after 15 minutes idle.** The first visitor after a quiet
period waits ~30 seconds while Render wakes the service. The analytics page
records page views, so you can check whether it is actually costing you
enquiries. If it is, upgrading that one service to **Starter ($7/month)** removes
the delay and nothing else changes.

**Change the admin password immediately.** Whatever you set as
`ADMIN_PASSWORD` on Render is the real one — the one you use locally
(`12341234`) is not what production uses, but if you reuse a weak password there,
it is exposed. Sign in, go to **Profile**, set a strong one.

**Uploads live in PostgreSQL.** About 3.5 MB for 32 photos, so the free Neon
0.5 GB tier has enormous headroom. If you ever exceed roughly 1,000 photos,
move the bytes to object storage — that is a change to
`backend/models/media.js` only.

**Free Neon can be paused by inactivity.** If the database sleeps, the first
query after it wakes takes a few seconds. The free plan keeps it awake with
light activity; if you notice intermittent slow loads, Neon has a paid "always on"
option.

**Back up before bulk edits.** The admin deletes are real deletes. The safe habit
is a Neon branch: in the Neon console, create a branch and point a second Render
preview service at it.
