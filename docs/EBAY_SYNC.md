# eBay order sync

contact-api reads Sunday Rolls' eBay orders straight from eBay's Sell APIs and writes them to the reports sheet as **`Data · eBay orders`** and **`Data · eBay items`** (see [REPORTS_SHEET.md](REPORTS_SHEET.md)).

The dashboard is unchanged: its eBay numbers still come from the Sales Tracker. eBay orders are stored separately in `analytics_ebay_orders`, and the sync never writes to `analytics_orders`.

## What it reads

- **Orders** (Fulfillment API `getOrders`, read-only): the order total, item subtotal, shipping charged, discounts, tax, refunds, status, the ship-to state (US only), and each line's title, SKU, item id, quantity and price. Buyer usernames aren't stored.
- **Costs** (Finances API `getTransactions`):
  - Sale fees (final value fee and the rest) from `SALE` transactions.
  - Shipping labels bought on eBay, net of label refunds, from `SHIPPING_LABEL`.
  - Promoted Listings fees (`NON_SALE_CHARGE` with an `AD_FEE*` fee type).
  - Each is matched to its order. Without Finances, the fee falls back to the order's `totalMarketplaceFee`.
- **Revenue in the sheet**: items − discounts + shipping charged − refunds. Tax is left out, because eBay collects and remits it. Cancelled and fully refunded orders show with Counted = No and revenue 0.

It runs with the other sources (`POST /dashboard/api/sync/auto/ebay`; skipped while the last good run is under 30 minutes old) and with the reports-sheet refresh every 6 hours. Each run reads the last `EBAY_SYNC_DAYS` (default 365, at most 730). If Finances can't be read, orders still sync and the costs saved by earlier runs are kept. In that case Tools → Connections says "skipped finances" and gives the reason.

## Setup (one time)

You need a free eBay developer account and the Sunday Rolls seller sign-in.

1. **Keys.** At [developer.ebay.com](https://developer.ebay.com/my/keys), create an application keyset under **Production**. Copy the **App ID (Client ID)** and **Cert ID (Client Secret)**.
   - eBay asks how you'll handle *marketplace account deletion notifications* before it turns the keyset on. This sync stores your own orders but no buyer usernames. Choose the option that fits how you want to handle it; eBay's page explains both.
2. **Redirect (RuName).** Open **User Tokens** for the production keyset, then **Get a Token from eBay via Your Application** → **Add eBay Redirect URL**.
   - Fill in the privacy policy URL and the accept and decline URLs. The site's pages are fine, for example `https://sundayrollsgolf.com`.
   - Save it, then copy the **RuName** (it looks like `Sunday_Rolls-SundayRo-xxxx-yyyy`).
3. **Refresh token.** From `server/`, with the values from steps 1 and 2:

   ```bash
   EBAY_CLIENT_ID=… EBAY_RUNAME=… npm run ebay:auth
   ```

   Open the link it prints, sign in as the Sunday Rolls eBay seller and agree. eBay then sends you to the accept page. Copy that page's full address within 5 minutes and run:

   ```bash
   EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… EBAY_RUNAME=… npm run ebay:auth -- '<that address>'
   ```

   It prints a refresh token that's good for about 18 months. Nothing is saved to disk.
4. **Railway.** In contact-api → Variables, set `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` and `EBAY_REFRESH_TOKEN`, then redeploy.
   - Optional: `EBAY_SYNC_DAYS` (default 365).
   - Optional: `EBAY_SCOPES`, if the token was granted something other than `sell.fulfillment.readonly` and `sell.finances`.
5. Open the dashboard. Under Tools → Connections, **eBay** should show a sync. The next reports-sheet export adds the two eBay tabs.

When the refresh token expires, or after a password change, the eBay sync fails with an `invalid_grant` message. Repeat step 3 and replace `EBAY_REFRESH_TOKEN`.

## Code

- `server/src/analytics/ebay.ts`: OAuth, the API calls and mapping.
- `server/src/analytics/ebay-sync.ts`: the sync.
- `server/src/scripts/ebay-auth.ts`: the one-time sign-in.
- Tests: `ebay.test.ts`.
