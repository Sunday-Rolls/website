# Railway storefront cutover

Goal: serve the React SPA from Railway (`website` service), point DNS at it, send analytics + API traffic to production, and expose the analytics dashboard on a brand subdomain.

Today: GitHub Pages (`/website` base) + Railway `contact-api` at `*.up.railway.app`.  
Target:

| Surface | Host |
|---------|------|
| Storefront | `https://www.sundayrollsgolf.com` (+ apex) → Railway **`website`** |
| Contact / reviews API | Same `contact-api` (keep `*.up.railway.app` or a future `api.` host) |
| Analytics dashboard | `https://dashboard.sundayrollsgolf.com/dashboard/` → Railway **`contact-api`** |

The dashboard is **not** a separate service — it is served by `contact-api` at `/dashboard` (see [DASHBOARD_ACCESS.md](./DASHBOARD_ACCESS.md)). A custom domain on that service is enough; path stays `/dashboard` unless you add a host-based `/` → `/dashboard` redirect later.

## What’s in the repo

| Piece | Location |
|-------|----------|
| SPA static server + `/health` + HTML fallback | `scripts/serve-spa.mjs` |
| Production build (`VITE_BASE_PATH=/`) | `npm run build:railway` |
| Railway IaC (`contact-api` + `website` + Postgres) | `server/.railway/railway.ts` |

Apply IaC from `server/` when ready:

```bash
cd server
npx railway config plan
npx railway config apply
```

Then generate a public domain on `website` (Railway dashboard or CLI) before DNS. `contact-api` already has `contact-api-production-9af6.up.railway.app`.

## Env checklist

### `website` (build-time `VITE_*`)

Set these on the Railway **website** service, then redeploy/rebuild:

| Variable | Live value |
|----------|------------|
| `VITE_BASE_PATH` | `/` |
| `VITE_GTM_ID` | `GTM-PPTR6V3B` |
| `VITE_GA4_MEASUREMENT_ID` | Confirm in GA4 Admin (Railway API already uses property `513898453`; stream is `G-YKOBBOTPM4` there) |
| `VITE_GA4_SEND_DIRECT` | `true` |
| `VITE_CONTACT_API_URL` | `https://contact-api-production-9af6.up.railway.app` (or custom API domain) |
| `VITE_CONTACT_API_KEY` | Match `CONTACT_API_KEY` on API if set |
| `VITE_SHOPIFY_STORE_DOMAIN` | Production shop host |
| `VITE_SHOPIFY_STOREFRONT_TOKEN` | Production Storefront token |
| `VITE_SHOPIFY_API_VERSION` | e.g. `2025-01` |

### `contact-api`

| Variable | Action |
|----------|--------|
| `RESEND_API_KEY` | **Required on Hobby** — Resend free plan (3k/mo, 100/day). SMTP is blocked on Hobby even when paid. |
| `RESEND_FROM_EMAIL` | `Sunday Rolls Contact <onboarding@resend.dev>` until a domain is verified in Resend |
| `CONTACT_TO_EMAIL` | Inbox for form submissions (e.g. `sundayrollsdevops@gmail.com`) |
| `CORS_ORIGINS` | Include `https://www.sundayrollsgolf.com,https://sundayrollsgolf.com` (keep localhost / Pages / Railway preview hosts during overlap if needed). Dashboard same-origin calls do not need the subdomain listed here. |
| `DASHBOARD_SECURE_COOKIES` | `true` (required once the dashboard is on HTTPS / the custom subdomain) |
| `DASHBOARD_ENABLED` | `true` |
| `WEBSITE_CUTOVER_AT` | Cutover date `YYYY-MM-DD` |
| `GA4_PROPERTY_RESOURCE` | `properties/513898453` (already) |
| `SEARCH_CONSOLE_SITE_URL` | `https://www.sundayrollsgolf.com/` |

Contact mail uses **Resend over HTTPS**, not Gmail SMTP. Submissions are also stored in Postgres `contact_messages`. See [server/README.md](../server/README.md).

### Shopify Customer events pixel

Point the purchase pixel at the **same** measurement ID as `VITE_GA4_MEASUREMENT_ID` — see [SHOPIFY_WEB_PIXEL.md](./SHOPIFY_WEB_PIXEL.md).

## DNS (after Railway TLS domains are attached)

### Storefront → `website`

1. In Railway → **`website`** → Settings → Networking → custom domains: add `www.sundayrollsgolf.com` and `sundayrollsgolf.com`.
2. At the DNS host (currently Squarespace DNS for the brand domain):
   - `www` → CNAME to the Railway-provided target for **`website`**
   - Apex → Railway A/ALIAS records as shown in the dashboard (or redirect apex → `www`)
3. Wait for Railway certificate **Active**.
4. Smoke: `/`, `/shop`, a product URL, `/order/thank-you?...`, contact form submit.

### Dashboard subdomain → `contact-api`

1. In Railway → **`contact-api`** → Settings → Networking → custom domains: add **`dashboard.sundayrollsgolf.com`**.
2. At the DNS host, create:
   - `dashboard` → **CNAME** to the Railway-provided target for **`contact-api`** (this is a different target than `website` — copy it from the contact-api domain screen, not the storefront one).
3. Wait for Railway certificate **Active** on that domain.
4. Confirm `DASHBOARD_SECURE_COOKIES=true`, then redeploy/restart `contact-api` if you just flipped it.
5. Smoke:
   - `https://dashboard.sundayrollsgolf.com/health` → `{ ok: true }`
   - `https://dashboard.sundayrollsgolf.com/dashboard/` → login UI
   - Sign in, Overview / Data sync, logout (session cookie must stick on the subdomain)

**Bookmark URL:** `https://dashboard.sundayrollsgolf.com/dashboard/`  
(`contact-api` still mounts the UI under `/dashboard`; the bare host `/` is not the dashboard unless you add a redirect later.)

Optional later: also attach `api.sundayrollsgolf.com` to `contact-api` and point `VITE_CONTACT_API_URL` at it so the storefront and dashboard share a branded API host.

## Cutover sequence

1. **Apply IaC / create `website` service** and attach a Railway `*.up.railway.app` URL.
2. **Set live `VITE_*` on `website`**, deploy, verify on the Railway URL (not DNS yet).
3. **Stage analytics:** Realtime on production GA4 while shopping the Railway URL; Sync GA4 on the dashboard (Railway URL or existing API host is fine before DNS).
4. **Flip Shopify pixel** to the live measurement ID; place a test order / thank-you hit.
5. **Expand `CORS_ORIGINS`** on `contact-api` for the production storefront hostnames; redeploy API.
6. **Attach storefront custom domains + DNS** on `website`; confirm HTTPS and deep links.
7. **Attach `dashboard.sundayrollsgolf.com` + DNS** on `contact-api`; confirm login / cookies ([section above](#dashboard-subdomain--contact-api)).
8. **Set `WEBSITE_CUTOVER_AT`**; update `SITE_URL` for QR scripts if used.
9. **Post-cutover:** contact form, GA4 funnel mid-steps + purchase, Search Console, cancel/export Squarespace when ready ([DASHBOARD_ACCESS.md](./DASHBOARD_ACCESS.md)). Update team bookmarks from the `*.up.railway.app/dashboard/` URL to `https://dashboard.sundayrollsgolf.com/dashboard/`.

Pages can keep deploying previews under `/website/previews/…` during overlap; production traffic should hit Railway.

## Local smoke for the SPA server

```bash
npm run build:railway
PORT=4173 npm run start:spa
# open http://127.0.0.1:4173/shop  (hard refresh / deep link)
curl -s http://127.0.0.1:4173/health
```
