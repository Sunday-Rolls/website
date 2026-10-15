# Railway storefront cutover

Goal: serve the React SPA from Railway (`website` service), point DNS at it, and send analytics + API traffic to production.

Today: GitHub Pages (`/website` base) + Railway `contact-api`.  
Target: Railway `website` at `https://www.sundayrollsgolf.com` (and apex) + same `contact-api`.

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

Then generate a public domain on `website` (Railway dashboard or CLI) before DNS.

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
| `CORS_ORIGINS` | Include `https://www.sundayrollsgolf.com,https://sundayrollsgolf.com` (keep localhost / Pages during overlap if needed) |
| `DASHBOARD_SECURE_COOKIES` | `true` |
| `WEBSITE_CUTOVER_AT` | Cutover date `YYYY-MM-DD` |
| `GA4_PROPERTY_RESOURCE` | `properties/513898453` (already) |
| `SEARCH_CONSOLE_SITE_URL` | `https://www.sundayrollsgolf.com/` |

### Shopify Customer events pixel

Point the purchase pixel at the **same** measurement ID as `VITE_GA4_MEASUREMENT_ID` — see [SHOPIFY_WEB_PIXEL.md](./SHOPIFY_WEB_PIXEL.md).

## DNS (after Railway TLS domain is attached)

1. In Railway → `website` → Settings → Networking → custom domains: add `www.sundayrollsgolf.com` and `sundayrollsgolf.com`.
2. At the DNS host (currently Squarespace DNS for the brand domain):
   - `www` → CNAME to the Railway-provided target  
   - Apex → Railway A/ALIAS records as shown in the dashboard (or redirect apex → `www`)
3. Wait for Railway certificate **Active**.
4. Smoke: `/`, `/shop`, a product URL, `/order/thank-you?...`, contact form submit.

## Cutover sequence

1. **Apply IaC / create `website` service** and attach a Railway `*.up.railway.app` URL.
2. **Set live `VITE_*` on `website`**, deploy, verify on the Railway URL (not DNS yet).
3. **Stage analytics:** Realtime on production GA4 while shopping the Railway URL; Sync GA4 on the dashboard.
4. **Flip Shopify pixel** to the live measurement ID; place a test order / thank-you hit.
5. **Expand `CORS_ORIGINS`** on `contact-api` for the production hostnames; redeploy API.
6. **Attach custom domains + DNS**; confirm HTTPS and deep links.
7. **Set `WEBSITE_CUTOVER_AT`**; update `SITE_URL` for QR scripts if used.
8. **Post-cutover:** contact form, GA4 funnel mid-steps + purchase, Search Console, cancel/export Squarespace when ready ([DASHBOARD_ACCESS.md](./DASHBOARD_ACCESS.md)).

Pages can keep deploying previews under `/website/previews/…` during overlap; production traffic should hit Railway.

## Local smoke for the SPA server

```bash
npm run build:railway
PORT=4173 npm run start:spa
# open http://127.0.0.1:4173/shop  (hard refresh / deep link)
curl -s http://127.0.0.1:4173/health
```
