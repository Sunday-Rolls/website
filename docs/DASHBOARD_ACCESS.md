# Analytics dashboard — access checklist

What we already have, and what still needs a human. Checked against Drive, the live site, local `.env`, and Railway on **2026-10-15**.

**Code status:** Foundation is in `server/` — auth, Postgres schema, Overview / P&L / ROAS APIs, mockup UI at `/dashboard/`, Sales Tracker importer, demo seed. Tomorrow: wire Google / Shopify / Meta once the items below land, then validate with the real sheet + live pulls.

## Already obtained / verified

| Item | Status | Notes |
|------|--------|--------|
| Devops Drive access (`sundayrollsdevops@gmail.com`) | Done | Connected in the Google Drive MCP (`@piotr-agier/google-drive-mcp`) as account alias `sundayrolls`. |
| P&L / Sales Tracker sheet | Readable | [Sunday Rolls Sales Tracker](https://docs.google.com/spreadsheets/d/1v18ftrLt5jcyGJsKFq37CwIYYY04aKIDeeEp0F5_XMU/edit) — owned by **Derick** (`derickkuchera04@gmail.com`). Devops can **view/download** (not edit). Shortcut in shared folder: `1U1hXKGwaYT1epkaPbgkswFLajq0-svuC`. |
| Weekly Sales Dashboard folder | Writable by devops | Folder id `1DfwrYHjTfi55woSst1O9d9D9JvYm5o-Y`. Devops is already a **writer**. Also has writers: Alex (`funk20alex@gmail.com`), Ben (`Benjamin.Weir4@gmail.com`), Nick, Sam (`stwolfe10@gmail.com`). |
| Live Squarespace analytics IDs | Found | Site loads **GTM-PPTR6V3B** → GA4 **G-YKOBBOTPM4**, Google Ads **AW-17744695066**, Meta Pixel (`fbq`). |
| Demo / new-site analytics IDs | Documented | [ANALYTICS.md](./ANALYTICS.md): GTM-PQSG4NXT / G-ET6SXZWE8E. Local `.env` still points at the **demo** GTM — must switch at cutover. |
| Contact API on Railway | Healthy + linked | Workspace **sundayrolls's Projects** → project **sunday-rolls-contact** → service **contact-api** (online). Ethan (`ebettenga`) is a workspace member; CLI linked from `server/`. Postgres + reviews + **Resend free plan** (`RESEND_API_KEY`) for contact email (Hobby blocks SMTP). |
| Headcover Stock sheet | Readable + editable by devops | Drive id `1x1TRv9P6KQ6nCVr_JQPurihemNV9hJPQ` (Derick owns). Useful for inventory cover later. |
| Shopify store domain in `.env` | Present but broken token | Shop `chrgrk-ff.myshopify.com`. Admin token returns **401 Invalid API key or access token**. |

### Security note (Weekly Sales Dashboard)

That folder currently allows **anyone with the link to edit**. Tighten to named writers only before the Monday job writes reports there.

---

## Still needed from you / partners

Copy this section into Slack/email as a punch list. Check boxes as each lands.

### 1. Google Cloud project (devops account) — **Ethan / Ben**

Sign in to [Google Cloud Console](https://console.cloud.google.com/) as **`sundayrollsdevops@gmail.com`** (not personal Gmail).

1. Create project, e.g. `sunday-rolls-analytics`.
2. Enable APIs:
   - Google Analytics Data API
   - Google Analytics Admin API
   - Google Search Console API
   - Google Sheets API
   - Google Drive API
3. Create a **service account**, e.g. `analytics-sync@sunday-rolls-analytics.iam.gserviceaccount.com`.
4. Create a JSON key → store only as a Railway env var (never commit). Suggested name: `GOOGLE_SERVICE_ACCOUNT_JSON`.
5. Send Ethan: **project id** + **service account email** (not the key file over Slack if avoidable — use 1Password / Railway).

*We could not create this from here: no `gcloud` login, and the devops OAuth token has no Cloud Resource Manager scopes. Ethan’s existing `scenic-genre-445406-k4` project is unrelated and should not hold Sunday Rolls customer data.*

### 2. GA4 + Search Console access for that service account — **whoever owns the property**

Property to grant: **G-YKOBBOTPM4** (live Squarespace).

1. Open [Google Analytics](https://analytics.google.com/) → Admin → Property access management → add service account as **Viewer**.
2. Open [Search Console](https://search.google.com/search-console) for `sundayrollsgolf.com` (and `www` if separate) → add service account as **Full** or **Restricted** (read is enough).
3. Reply with **who owns** the GA4 property / GTM container `GTM-PPTR6V3B` (not in the Login Sheet).

*Login Sheet only lists Instagram / TikTok / Gmail / LegalZoom for `sundayrollsco@gmail.com` — no Analytics, Ads, or Meta Business logins.*

### 3. Derick: share Sales Tracker with the service account — **Derick**

After step 1 exists:

1. Open the [Sales Tracker](https://docs.google.com/spreadsheets/d/1v18ftrLt5jcyGJsKFq37CwIYYY04aKIDeeEp0F5_XMU/edit).
2. Share with the service account email as **Viewer** (Editor only if we later write back into the sheet; Viewer is enough to sync into Postgres).
3. Share **Weekly Sales Dashboard** folder with the service account as **Editor** (so the Monday job can create Doc + Sheet). Devops user already has writer; the **bot** still needs its own share.

### 4. Google Ads ↔ GA4 link — **Ads admin**

1. In GA4 Admin → Product links → Google Ads → link the account that owns **AW-17744695066**.
2. Confirm **cost data** is imported (Ads → GA4).
3. Send: Google Ads **customer id** (xxx-xxx-xxxx) and which login owns it.

*Linking Ads cost into GA4 avoids applying for a Google Ads developer token for v1 of the dashboard.*

### 5. Meta Marketing API token — **Meta Business admin**

Live site already fires the Meta Pixel. For spend + ROAS we need API access:

1. Meta Business Manager → System user (or long-lived user token) with `ads_read` on the Sunday Rolls ad account.
2. Ad account id (`act_…`).
3. Store token as Railway `META_ACCESS_TOKEN` (never commit).

### 6. Shopify Admin API — **Ethan / store owner**

Local Admin token is **invalid** (401). Need a working token for shop `chrgrk-ff` (or the production shop if the name changes):

1. Create/install custom app (or refresh Admin API token) with at least: `read_orders`, `read_products`, `read_customers`, `read_reports`, `read_checkouts` / abandoned checkouts, `read_analytics` if available on plan.
2. Put `SHOPIFY_ADMIN_ACCESS_TOKEN` (and shop domain) in Railway + local `.env`.
3. Confirm **Shopify plan** (affects which reports/APIs exist).

### 7. Railway deploy for dashboard — **Ethan** *(access done)*

Workspace access is done (`sundayrolls's Projects` / `sunday-rolls-contact`). Still to provision on Railway:

1. Add **Postgres** to the project (or a sibling service).
2. Deploy dashboard (extend `contact-api` or add a `dashboard` service from `server/`).
3. Set env vars: `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, sheet IDs, Shopify/Meta when ready.
4. Public URL for `/dashboard/` (+ keep contact form health).

### 8. Cutover date + GA continuity — **Sam / Alex / Derick**

Hard cutover (no parallel Squarespace + Shopify traffic). Need:

| Field | Value |
|-------|--------|
| Cutover date (and timezone) | _TBD_ |
| New site will send hits to | Prefer keep **GTM-PPTR6V3B** / **G-YKOBBOTPM4** (preserve history). Do **not** launch on demo GTM-PQSG4NXT / G-ET6SXZWE8E. |
| Squarespace export before cancel | Orders, customers, abandoned carts, analytics CSV (backup even though GA4 has traffic history) |
| Shopify purchase pixel | Custom pixel / customer events → GA4 `purchase` + Google Ads conversion **AW-17744695066** |

### 9. Dashboard logins (three users) — **Ethan after build**

Create accounts for Sam, Alex, Derick (emails to confirm):

| Person | Likely email | Confirm |
|--------|--------------|---------|
| Sam | `stwolfe10@gmail.com`? | |
| Alex | `funk20alex@gmail.com`? | |
| Derick | `derickkuchera04@gmail.com` | |

Password set/reset: server CLI only (`npm run user:set-password -- <email>`). No forgot-password email.

### 10. Optional but useful

| Item | Why |
|------|-----|
| Etsy API app (later) | Avoid weekly CSV upload; needs Etsy app approval |
| eBay developer / Marketplace Connect decision | Fees + whether eBay orders land in Shopify |
| Confirm Monday report recipients | Default: Sam, Alex, Derick (+ Ben?) |
| Tighten Weekly Sales Dashboard sharing | Remove “anyone with link → editor” |

---

## IDs quick reference

```
GA4 measurement ID (prod):     G-YKOBBOTPM4
GTM (prod / Squarespace):      GTM-PPTR6V3B
Google Ads:                    AW-17744695066
GA4 (demo / github.io):        G-ET6SXZWE8E
GTM (demo):                    GTM-PQSG4NXT
Sales Tracker sheet:           1v18ftrLt5jcyGJsKFq37CwIYYY04aKIDeeEp0F5_XMU
Weekly Sales Dashboard folder: 1DfwrYHjTfi55woSst1O9d9D9JvYm5o-Y
Headcover Stock:               1x1TRv9P6KQ6nCVr_JQPurihemNV9hJPQ
Shopify shop (local .env):     chrgrk-ff.myshopify.com
Contact API:                   https://contact-api-production-9af6.up.railway.app
Devops Google:                 sundayrollsdevops@gmail.com
Brand Gmail (login sheet):     sundayrollsco@gmail.com
```

## What blocked automation from this machine

- No `gcloud` credentials → cannot create the GCP project or service account.
- Devops OAuth scopes are Drive/Docs/Sheets/Calendar only → cannot list GA4 properties or Search Console sites.
- Sheets API is disabled on the OAuth client’s GCP project (`373561903499` / scenic-genre), so Drive MCP sheet tools fail until that API is enabled **or** we use the new Sunday Rolls project.
- Shopify Admin token 401.
- No Meta token anywhere on disk.
- Cutover date not set.
- Railway: no Postgres / dashboard service yet (project access OK).
