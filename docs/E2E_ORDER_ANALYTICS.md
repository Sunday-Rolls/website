# E2E: order → dashboard analytics

Optional Playwright path that places a real Shopify checkout (Bogus Gateway) and asserts the product appears in dashboard Overview after **Sync Shopify**.

Gated behind `E2E_ORDER_ANALYTICS=1` so default `npm run test:e2e` stays green.

## Run

```bash
# One-time: fill env (see below). Prefer headed for first Admin login.
E2E_ORDER_ANALYTICS=1 npx playwright test e2e/order-analytics.spec.ts --headed

# Or:
npm run test:e2e:order-analytics
```

## Required env

| Variable | Purpose |
|----------|---------|
| `E2E_ORDER_ANALYTICS` | Must be `1` to run this spec |
| `SHOPIFY_SHOP` | Admin store handle (e.g. `chrgrk-ff`) |
| `SHOPIFY_ADMIN_EMAIL` | Staff account for Admin Payments UI |
| `SHOPIFY_ADMIN_PASSWORD` | Staff password (skip if using storage state) |
| `SHOPIFY_ADMIN_STORAGE_STATE` | Optional path to Playwright storage JSON after a manual 2FA login |
| `SHOPIFY_STOREFRONT_PASSWORD` | Online Store password (“Opening soon”) |
| `E2E_DASHBOARD_EMAIL` | Dashboard login email |
| `E2E_DASHBOARD_PASSWORD` | Dashboard login password |
| `E2E_DASHBOARD_URL` | Default `http://127.0.0.1:3001/dashboard/` — use Railway URL if local Postgres is unset |
| `VITE_SHOPIFY_STORE_DOMAIN` / `VITE_SHOPIFY_STOREFRONT_TOKEN` | Cart + checkout (already in root `.env`) |

Root `.env` is loaded automatically by the Playwright config. Do not commit secrets.

## What the test does

1. Opens Shopify Admin → **Settings → Payments** and activates **(for testing) Bogus Gateway**.
2. Homepage → Shop → The Birdie Machine → Add to Cart → Checkout.
3. Unlocks the storefront password gate if shown.
4. Completes hosted checkout with Bogus card values (`1` / future expiry / any CVV).
5. Logs into the dashboard → **Data → Sync Shopify** → **Overview** and asserts the product table.
6. **`finally`**: opens Payments again and deactivates Bogus (best-effort).

## 2FA / first run

If the staff account has 2FA, log in once with `--headed`, complete 2FA, then save storage:

```bash
# After a successful headed Admin login in a throwaway script, or copy from Playwright inspector:
# Set SHOPIFY_ADMIN_STORAGE_STATE=e2e/.auth/shopify-admin.json
```

Prefer a staff account without 2FA for unattended runs. If teardown cannot reach Payments, **manually deactivate Bogus** so live card payments are not left disabled.

## Notes

- The order must **not** be tagged `analytics-test` (dashboard sync drops those).
- Asserts Shopify-synced product units, not GA4 funnel mid-steps.
- Admin Payments DOM changes; helpers use text/role locators and may need updates.
