# Sunday Rolls API

Hono service on Railway: contact form email, product reviews, and the internal analytics dashboard.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /contact` JSON `{ name, email, subject, message }` → `{ ok: true, emailed?: boolean }`
- `GET|POST /reviews` — product reviews (requires `DATABASE_URL`)
- `GET /dashboard/` — analytics UI (requires `DATABASE_URL`)
- `POST /dashboard/api/login|logout`, `GET /dashboard/api/overview|pnl|roas|sync-status`
- `GET /dashboard/api/review-qrs.pdf?target=pages|live` — printable review QR PDF (Data page → Export PDF)
- `POST /webhooks/shopify` — Shopify webhooks (HMAC-signed): product/inventory topics re-sync Google Merchant Center ([docs/GOOGLE_MERCHANT_SYNC.md](../docs/GOOGLE_MERCHANT_SYNC.md)); order topics re-sync dashboard orders (below)

## Shopify order sync

Dashboard orders come from the Shopify Admin API. contact-api syncs them by itself (no button needed):

- on boot, then every `SHOPIFY_ORDER_SYNC_INTERVAL_MINUTES` (default 15);
- about 10 seconds after an `orders/create`, `orders/updated` or `orders/cancelled` webhook (subscriptions live in `shopify.app.toml`; apply with `shopify app deploy`).

Each run is the same full sync as **Data → Sync Shopify**: orders upsert by Shopify id, cancelled/voided/`analytics-test` orders are removed, and abandoned-cart totals refresh. Runs appear under the dashboard's sync status as `shopify`. Turn it off with `SHOPIFY_ORDER_SYNC_ENABLED=false`. The 15-minute timer is the fallback if webhooks aren't registered or a delivery is missed.

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
