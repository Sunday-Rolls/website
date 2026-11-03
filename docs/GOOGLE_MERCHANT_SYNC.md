# Google Merchant Center product sync

`server/src/scripts/sync-merchant.ts` pushes active Shopify products into Merchant Center (account **5685591896**) with links on **www.sundayrollsgolf.com**.

## Why not the Google & YouTube app?

The storefront is headless. Shopify's primary domain `shop.sundayrollsgolf.com` redirects to the React site, so the app can't verify or claim it, and its product links don't match the claimed website (`www.sundayrollsgolf.com`). This sync sends `https://www.sundayrollsgolf.com/products/{handle}/` links instead. Don't reconnect the app: it switches Merchant Center's website back to `shop.` and breaks the claim.

## What it sends

For each variant of every active product published to the **Headless** sales channel, it sends:

- Title, description, all images, price (and sale price when there's a compare-at price), availability (from `availableForSale`), brand (vendor), product type, and condition new.
- `identifier_exists = false` when there's no GTIN or SKU, because these are own-brand goods.
- Offer ID `shopify_{productId}_{variantId}`. Multi-variant products get an item group ID and a `?variant=` link.

After every product is accepted, it deletes items from its own data source that are no longer active in Shopify. It never deletes products from other sources, such as Squarespace.

Shipping and returns come from the Merchant Center account settings.

## One-time setup

1. **Service account.** Use the one already in Railway's `GOOGLE_SERVICE_ACCOUNT_JSON`.
   - In Google Cloud, enable the **Merchant API** for that service account's project.
   - In Merchant Center, go to **Settings → People and access → Add person**. Add the service account's `client_email` with **Standard** (or Admin) access.
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

```bash
npm run merchant:sync -- --dry-run   # print every offer; only needs Shopify creds
npm run merchant:sync                # push to Merchant Center
npm run merchant:sync -- --no-prune  # push without removing anything
```

Exit code 1 means at least one product failed. In that case nothing is pruned.

Schedule it as a Railway cron service on the `server/` image. Use the command `npm run merchant:sync` and a schedule of `0 9 * * *` (daily). Run it right after bulk product edits too.

## Cutting over from Squarespace

1. Run the sync. In **Merchant Center → Data sources**, wait until **Shopify (website sync)** shows all products approved. That usually takes a few hours and can take up to 3 business days.
2. Then delete or pause the **Squarespace** primary source, along with the **SUPPLEMENTAL SOURCE 1** Google Sheet attached to it. Don't do this sooner, because the Squarespace source keeps the current approved listings live until then.
3. Remove the empty legacy **Content API** source.
4. Check that Google Ads Shopping or Performance Max campaigns aren't filtered on the old Squarespace item IDs.
