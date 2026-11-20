# eBay order sync

contact-api reads Sunday Rolls' eBay orders straight from eBay's Sell APIs and writes them to the reports sheet as **`Data · eBay orders`** and **`Data · eBay items`** (see [REPORTS_SHEET.md](REPORTS_SHEET.md)).

The dashboard uses these orders too. They are stored in `analytics_ebay_orders`, and the dashboard and reports export add the counted ones to the orders list (`listDashboardOrders`, source `ebay`). From the day of the first eBay API order, Sales Tracker eBay rows are dropped (`preferLiveOrders`), so a sale is never counted twice. Older tracker rows, from before the API window, stay. The sync itself still never writes to `analytics_orders`, so tracker re-imports and workbook uploads can't remove them.

The Inventory page still counts eBay units sold from the Sales Tracker's eBay tab (SKU column).

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
   - Privacy policy URL and auth declined URL: `https://www.sundayrollsgolf.com`.
   - **Auth accepted URL:** `https://contact-api-production-9af6.up.railway.app/dashboard/api/ebay/callback`.
   - Turn on **OAuth Enabled**, save, and copy the **RuName** (it looks like `Sunday_Rolls-SundayRo-xxxx-yyyy`).
3. **Railway.** In contact-api → Variables, set `EBAY_CLIENT_ID` (App ID), `EBAY_CLIENT_SECRET` (Cert ID) and `EBAY_RUNAME`, then let it redeploy.
4. **Refresh token.** Sign in to the dashboard, then open `/dashboard/api/ebay/connect`. Sign in to eBay **as the Sunday Rolls seller** and agree.
   - The page that comes back names the eBay account it linked and shows the refresh token once (good for about 18 months).
   - Add it in Railway as `EBAY_REFRESH_TOKEN` and redeploy.
   - Optional: `EBAY_SYNC_DAYS` (default 365), and `EBAY_SCOPES` if the token was granted a different set.
   - Without the dashboard, `npm run ebay:auth` (see `server/src/scripts/ebay-auth.ts`) does the same from a terminal; it needs the RuName's accepted URL to be a page whose address you can copy.
5. Open the dashboard. Under Tools → Connections, **eBay** should show a sync. The next reports-sheet export adds the two eBay tabs.

When the refresh token expires, or after a password change, the eBay sync fails with an `invalid_grant` message. Repeat step 4 and replace `EBAY_REFRESH_TOKEN`.

## Code

- `server/src/analytics/ebay.ts`: OAuth, the API calls and mapping.
- `server/src/analytics/ebay-sync.ts`: the sync.
- `server/src/dashboard/routes.ts` (`/api/ebay/connect`, `/api/ebay/callback`): the one-time sign-in.
- `server/src/scripts/ebay-auth.ts`: the same sign-in from a terminal.
- Tests: `ebay.test.ts`.
