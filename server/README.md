# Sunday Rolls API

Hono service on Railway: contact form email, product reviews, and the internal analytics dashboard.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /contact` JSON `{ name, email, subject, message }` → `{ ok: true }`
- `GET|POST /reviews` — product reviews (requires `DATABASE_URL`)
- `GET /dashboard/` — analytics UI (requires `DATABASE_URL`)
- `POST /dashboard/api/login|logout`, `GET /dashboard/api/overview|pnl|roas|sync-status`

## Local

```bash
cd server
cp .env.example .env   # SMTP_* + DATABASE_URL
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
2. Env vars from `.env.example` (`SMTP_*`, `DATABASE_URL`, dashboard vars)
3. Build: `npm run build` · Start: `npm start`
4. Public domain → site `VITE_CONTACT_API_URL`; dashboard at `https://<api-host>/dashboard/`
5. Production: `DASHBOARD_SECURE_COOKIES=true`, set passwords via `user:set-password` (Railway shell), do **not** leave `DASHBOARD_DEMO_PASSWORD` set

**Important:** Railway **Hobby / Trial / Free** blocks outbound SMTP (ports 465/587). Gmail SMTP only works on **Pro+**, or switch to an HTTPS email API.

## Gmail App Password

1. Sign in as `sundayrollsdevops@gmail.com`
2. Enable 2FA → create an [App Password](https://support.google.com/accounts/answer/185833)
3. Use that value as `SMTP_PASS`
