# Cutover day checklist

Day-of runbook for moving `sundayrollsgolf.com` off Squarespace. The why and the env details are in [RAILWAY_CUTOVER.md](./RAILWAY_CUTOVER.md); this is the order to do it in.

**DNS lives in Cloudflare** (registrar and nameservers `alan` / `nola.ns.cloudflare.com`). Squarespace only hosts the old site. Every record change below is in the Cloudflare dashboard.

| Host | Goes to |
|------|---------|
| `sundayrollsgolf.com` + `www` | Railway **`website`** |
| `shop.sundayrollsgolf.com` | **Shopify** (checkout, Primary domain) |
| `dashboard.sundayrollsgolf.com` | Railway **`contact-api`** (`/dashboard/`) |
| `api.sundayrollsgolf.com` (optional) | Railway **`contact-api`** |

## Rollback records (as of 2026-11-01)

| Record | Value |
|--------|-------|
| `@` A | `198.49.23.144`, `198.49.23.145`, `198.185.159.144`, `198.185.159.145` |
| `www` CNAME | `ext-cust.squarespace.com` |
| `shop`, `checkout`, `dashboard`, `api` | not set |
| MX / TXT / CAA | none (no email on the domain) |

Rollback = restore the apex A records and the `www` CNAME. With low TTLs it reverts in minutes.

## Before (night before)

- [ ] Export the Cloudflare zone (DNS → Records → Export) as the rollback copy.
- [ ] Drop TTL on `@` and `www` to the minimum.
- [ ] Search Console: add a **Domain property** verified by DNS TXT. There is no TXT today, so the current verification is probably a Squarespace meta tag that disappears at cutover.
- [ ] Squarespace exports: orders, customers, abandoned carts, analytics CSV.
- [ ] List old Squarespace URLs → new routes (e.g. `/shop/p/<slug>`) for Cloudflare redirect rules.
- [ ] Railway `website` serves correctly on its `*.up.railway.app` URL with live `VITE_*` (GTM `GTM-PPTR6V3B`, production GA4, Storefront token, API URL).
- [ ] Shopify customer-events pixel points at the same GA4 ID as the site.

## Cutover

Leave every new record **DNS only (grey cloud)** until its certificate is Active. Railway and Shopify both issue certs over HTTP and won't behind the proxy.

### 1. Storefront → Railway `website`

- [ ] Railway → `website` → Networking: add `www.sundayrollsgolf.com` and `sundayrollsgolf.com`. Copy the CNAME target and any `_railway-verify` TXT.
- [ ] Cloudflare: `www` CNAME → Railway target. Delete the four apex A records and add `@` CNAME → Railway target (Cloudflare flattens it). Add the verify TXT.
- [ ] Railway cert Active on both hosts.
- [ ] Smoke: `/`, `/shop`, a product deep link (hard refresh), `/health`, contact form.

### 2. Checkout → Shopify on `shop.`

- [ ] Shopify Admin → Settings → Domains → connect `shop.sundayrollsgolf.com`.
- [ ] Cloudflare: `shop` CNAME → `shops.myshopify.com`, grey cloud (keep it grey permanently).
- [ ] Target **Online Store**, set as **Primary**. Don't make `www` the Shopify primary.
- [x] Remove the storefront password ("Opening soon"). Done 2026-11-02.
- [x] Horizon theme `layout/theme.liquid` forwards storefront pages to `www` (products → `/products/<handle>`, collections/search → `/shop`, cart → `/cart`, everything else → `/`). Checkout, accounts and policies stay on Shopify. Done 2026-11-02.
- [ ] Add to cart → Checkout: the address bar is `shop.sundayrollsgolf.com/checkouts/…`, **not** `chrgrk-ff.myshopify.com`.

### 3. Dashboard → Railway `contact-api`

- [ ] Railway → **`contact-api`** → Networking: add `dashboard.sundayrollsgolf.com`. Its target differs from `website`'s.
- [ ] Cloudflare: `dashboard` CNAME → that target, plus any verify TXT.
- [ ] Cert Active, then `DASHBOARD_SECURE_COOKIES=true` and redeploy `contact-api`.
- [ ] Smoke: `/health`, `/dashboard/` login, refresh keeps the session, logout.

### 4. API env

- [ ] `CORS_ORIGINS` adds `https://www.sundayrollsgolf.com,https://sundayrollsgolf.com`.
- [ ] `WEBSITE_CUTOVER_AT` = cutover date, `SEARCH_CONSOLE_SITE_URL=https://www.sundayrollsgolf.com/`.
- [ ] Redeploy `contact-api`.

## End-to-end purchase test

Run right after step 4, before announcing the new site.

- [ ] Real order on `https://www.sundayrollsgolf.com`: product → cart → checkout on `shop.` → pay → thank-you page. Either a real card refunded afterwards, or the Bogus Gateway via [E2E_ORDER_ANALYTICS.md](./E2E_ORDER_ANALYTICS.md) (`npm run test:e2e:order-analytics`). Bogus disables real payments while it's on, so confirm it's switched off after.
- [ ] Order appears in Shopify Admin and isn't tagged `analytics-test`.
- [ ] GA4 Realtime shows `purchase`; Google Ads conversion `AW-17744695066` fires.
- [ ] Dashboard → Data → Sync Shopify → the order shows on Overview.
- [ ] Refund or cancel the test order.

## After

- [ ] Cloudflare redirect rules for old Squarespace URLs.
- [ ] Submit the sitemap in Search Console (blocked on access; see [ADS_AND_SEO_CONFIG.md](./ADS_AND_SEO_CONFIG.md#still-to-do)).
- [ ] Disconnect the domain in Squarespace; cancel only after exports are confirmed.
- [ ] Raise TTLs back to Auto. Optional: proxy `@` / `www` (orange cloud) with SSL/TLS **Full (strict)**, never Flexible.
- [ ] Update `SITE_URL` for review QR scripts if used, and team bookmarks to `https://dashboard.sundayrollsgolf.com/dashboard/`.
- [ ] Later: verify the domain in Resend for a branded contact from-address.
