# Google Merchant Center product sync

`server/src/scripts/sync-merchant.ts` pushes active Shopify products into Merchant Center (account **5685591896**) with links on **www.sundayrollsgolf.com**.

## Why not the Google & YouTube app?

The storefront is headless. Shopify's primary domain `shop.sundayrollsgolf.com` redirects to the React site, so the app can't verify or claim it, and its product links don't match the claimed website (`www.sundayrollsgolf.com`). This sync sends `https://www.sundayrollsgolf.com/products/{handle}/` links instead. Don't reconnect the app: it switches Merchant Center's website back to `shop.` and breaks the claim.

## What it sends

For each variant of every active product published to the **Headless** sales channel, it sends:

- Title, description, all images, price (and sale price when there's a compare-at price), availability (from `availableForSale`), brand (vendor), product type, and condition new.
- `identifier_exists = false` when there's no GTIN or SKU, because these are own-brand goods.
- Offer ID `shopify_{productId}_{variantId}`. Multi-variant products get an item group ID and a `?variant=` link.
- Exception: single-variant products listed in `server/src/data/merchant-legacy-offers.json` (keyed by Shopify handle) keep the item ID and title of their old Squarespace listing, so they keep their listing history and ad performance. New products don't need an entry.
- Shipping weight from the variant's Shopify weight. Merchant Center's shipping rates are weight-based, so items without it are disapproved.

`MERCHANT_SHOPIFY_CHANNEL` matches the sales channel by name (default `Headless`). In this store the channel is named `Sunday Rolls`.

After every product is accepted, it deletes items from its own data source that are no longer active in Shopify. It never deletes products from other sources, such as Squarespace.

Shipping and returns come from the Merchant Center account settings.

## One-time setup

1. **Service account.** The sync uses `merchant-sync@plasma-torus-513614-c7.iam.gserviceaccount.com`. It lives in Google Cloud project "My First Project" (`plasma-torus-513614-c7`), owned by stwolfe10@gmail.com, and the Merchant API is already enabled there.
   - In Merchant Center, go to **Settings → People and access**. Under **People** (not Email-only access), add that email with **Standard** access.
   - In Google Cloud, open **Service accounts → merchant-sync → Keys → Add key → JSON**. Paste the file's contents as a single line into `MERCHANT_SERVICE_ACCOUNT_JSON` on Railway `contact-api`. It's kept separate from `GOOGLE_SERVICE_ACCOUNT_JSON`, so the GA4 sync is unaffected.
2. **Shopify app scopes.** The Dev Dashboard app (`SHOPIFY_CLIENT_ID`/`SECRET`) needs `read_products` and `read_publications`.
3. **Env vars.** Set these on `contact-api` (see `server/.env.example`): `MERCHANT_CENTER_ID=5685591896`, plus the optional `MERCHANT_*` overrides.
4. **Register the GCP project** with Merchant Center. Run this once, with a real Google account email (not the service account):
   ```bash
   cd server && npm run merchant:sync -- --register sundayrollsdevops@gmail.com
   ```
5. **Create the data source.** Run this once, then set the printed `MERCHANT_DATA_SOURCE_ID`:
   ```bash
   npm run merchant:sync -- --create-data-source
   ```

## Running

Once steps 1–5 are done, `contact-api` keeps Merchant Center in line on its own. There's no cron service to set up.

- **On boot and every hour** (`MERCHANT_SYNC_INTERVAL_MINUTES`, default 60, minimum 5; `0` leaves webhooks only), it re-sends every active product with current price, sale price and stock, and removes products that are no longer active.
- **About a minute after a Shopify change** (`MERCHANT_SYNC_DEBOUNCE_SECONDS`, default 60), it runs again. `shopify.app.toml` subscribes `products/create`, `products/update`, `products/delete` and `inventory_levels/update` to `POST /webhooks/shopify`, which checks Shopify's HMAC signature against `SHOPIFY_CLIENT_SECRET`. A sell-out therefore reaches Google within minutes, not at the next daily feed fetch. Bulk edits send one webhook per product, and those collapse into a single run.
- Only one sync runs at a time. A change that arrives mid-run queues one more run.
- Each run shows as **merchant-center** in the dashboard's sync status, with any failed offer IDs in the Railway logs.
- The boot log says `Merchant Center sync: on (account 5685591896)`, or `off (missing …)` with the env var it still needs. Set `MERCHANT_SYNC_ENABLED=false` to turn it off without removing the config.

**Apply the webhook subscriptions** once (and again whenever `shopify.app.toml` changes) from the repo root, signed in to the Partner/Dev Dashboard account that owns the `sundayrolls` app:

```bash
shopify app deploy
```

Without that, the hourly sync still runs; stock changes just take up to an hour to show.

The CLI is still there for setup and one-offs:

```bash
npm run merchant:sync -- --dry-run   # print every offer; only needs Shopify creds
npm run merchant:sync                # push to Merchant Center now
npm run merchant:sync -- --no-prune  # push without removing anything
```

Exit code 1 means at least one product failed. A run with a failure, or one where Shopify returned no products, prunes nothing, so an outage can't empty the feed.

## Cutting over from Squarespace (done Nov 2026)

The **Squarespace** primary source was deleted and the sync immediately re-sent the same item IDs (see `merchant-legacy-offers.json`), so the listings carried over instead of starting fresh. While two primary sources send the same item ID, Merchant Center keeps serving the original source's copy, and a source can't be paused, only deleted. That's why the old source had to go first.

Squarespace's Google Shopping integration (**Products & Services → Selling Tools → Google Shopping**) was disconnected too, so it can't recreate its data source. Don't reconnect it.
