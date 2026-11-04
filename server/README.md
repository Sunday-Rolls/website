# Sunday Rolls API

Hono service on Railway: contact form email, product reviews, and the internal analytics dashboard.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /contact` JSON `{ name, email, subject, message }` → `{ ok: true, emailed?: boolean }`
- `GET|POST /reviews` — product reviews (requires `DATABASE_URL`)
- `GET /dashboard/` — analytics UI (requires `DATABASE_URL`)
- `POST /dashboard/api/login|logout`, `GET /dashboard/api/overview|pnl|roas|sync-status`
- `GET /dashboard/api/review-qrs.pdf?target=pages|live` — printable review QR PDF (Tools → Review QR codes)
- `POST /webhooks/shopify` — Shopify product/inventory webhooks (HMAC-signed); re-syncs Google Merchant Center ([docs/GOOGLE_MERCHANT_SYNC.md](../docs/GOOGLE_MERCHANT_SYNC.md))

## Sync on open

Opening the dashboard (or logging in) syncs every data source in parallel, driving a thin progress bar at the top of the page: Shopify orders, Sales Tracker (Drive `SALES_TRACKER_DRIVE_FILE_ID`), GA4 traffic and Search Console. Each is `POST /dashboard/api/sync/auto/:source` ([src/dashboard/auto-sync.ts](src/dashboard/auto-sync.ts)): it is skipped while its last good sync is fresh (Shopify 5 min, Sales Tracker and GA4 30 min, Search Console 6 h), shares one run between tabs, and reports "not set up" when credentials are missing. The **Refresh** button in the header runs the same calls with `?force=1`, which syncs even fresh sources. The page redraws when anything changed. Tools → Connections shows each source's status from `GET /dashboard/api/health`.

## Dashboard pages

The UI is plain HTML/CSS/JS with no build step: the shell is `src/dashboard/ui/app.js`, shared helpers are in `ui/lib/` (`ui.js` documents the page-module contract, `charts.js` wraps ApexCharts, served from `/dashboard/vendor/apexcharts.js`), and each page is one module in `ui/pages/`: Overview, Sales (`/api/orders`), Products (`/api/products`), Marketing (`/api/marketing`), Funnel (`/api/funnel`), Money (`/api/pnl`) and Tools (review QR PDFs, manual entries, workbook import/export, connections, checks). The page data builders are in `src/analytics/views.ts`.

Shopify orders upsert by Shopify id; cancelled, voided and `analytics-test` orders are removed. Dashboard days and months are **America/Chicago** calendar days (`STORE_TIME_ZONE` in `src/analytics/period.ts`).

## Contact email (Resend free plan)

**Current production setup:** contact mail goes through **[Resend](https://resend.com)** over HTTPS (`RESEND_API_KEY`), not Gmail SMTP.

| Detail | Value |
|--------|--------|
| Provider | Resend (HTTPS API) |
| Plan | **Free forever** — 3,000 emails/month, 100/day |
| Why not SMTP | Railway **Hobby** (including paid Hobby) blocks outbound SMTP (465/587) |
| Fallback | Every submission is also saved to Postgres `contact_messages` |
| From address | `RESEND_FROM_EMAIL` (defaults to `onboarding@resend.dev` until a domain is verified) |
| Inbox | `CONTACT_TO_EMAIL` (e.g. `sundayrollsdevops@gmail.com`) |

When you outgrow the free tier (unlikely for a contact form), upgrade Resend or switch providers — do **not** go back to Gmail SMTP unless the Railway project is on **Pro+**.

### Local

```bash
cd server
cp .env.example .env   # RESEND_API_KEY + DATABASE_URL (SMTP_* optional / unused on Hobby)
npm install
npm run dev
```

Dashboard at `http://localhost:3001/dashboard/`.

### First-time dashboard setup

```bash
# Create / reset a user password (bcrypt). No email forgot-password flow.
npm run user:set-password -- sam@example.com 'a-long-password' Sam

# Or bootstrap Sam/Alex/Derick on boot with a shared demo password:
# DASHBOARD_DEMO_PASSWORD=... ANALYTICS_SEED_DEMO_ON_BOOT=true

# Load mockup-shaped sample data
npm run analytics:seed-demo

# Import Derick's Sales Tracker workbook (orders, expenses, cash)
npm run analytics:import-sheet -- "/path/to/Sunday Rolls Sales Tracker.xlsx"
```

Access / integration checklist: [docs/DASHBOARD_ACCESS.md](../docs/DASHBOARD_ACCESS.md).

## Tests

```bash
cd server
npm test
```

## Railway

1. Service **Root Directory** = `server`
2. Env vars from `.env.example` — **`RESEND_API_KEY`** (required for inbox delivery on Hobby), `DATABASE_URL`, dashboard vars
3. Build: `npm run build` · Start: `npm start`
4. Public domain → site `VITE_CONTACT_API_URL`; dashboard at `https://<api-host>/dashboard/`
5. Production: `DASHBOARD_SECURE_COOKIES=true`, set passwords via `user:set-password` (Railway shell), do **not** leave `DASHBOARD_DEMO_PASSWORD` set

### Verifying a custom from-domain (optional)

`onboarding@resend.dev` works for the free plan with limits (often only to the Resend account owner). For production branding:

1. In Resend → Domains, add `sundayrollsgolf.com` (or your mail domain)
2. Add the DNS records Resend shows
3. Set `RESEND_FROM_EMAIL=Sunday Rolls Contact <hello@sundayrollsgolf.com>` on `contact-api`
4. Redeploy
