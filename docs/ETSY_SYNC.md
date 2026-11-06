# Etsy order sync

The dashboard pulls Etsy orders straight from the Etsy Open API v3, so new Etsy sales show up without waiting for the Sales Tracker sheet to be updated.

## How it fits with the Sales Tracker

- The **Sales Tracker** is still the record for Etsy. Its rows carry Etsy's real fees, label cost and offsite-ads charges.
- Both the sheet and the live sync key an order as `etsy:<receipt id>` (the Etsy order number in the sheet's Order Numbers column). The live sync adds only receipts the sheet doesn't have yet. These rows have `source = etsy`.
- When the next Sales Tracker sync brings the same order in, its row replaces the live one. Nothing is counted twice, and the Etsy sync never overwrites a sheet row.
- Until the sheet catches up, live rows carry Etsy's real fees and label cost when the sync can read them (see [Fees and receipt detail](#fees-and-receipt-detail)). Otherwise they fall back to estimates learned from the sheet's own Etsy history: fees as the same share of revenue, and the average shipping cost per order. Marketing is the receipt's Offsite Ads fee, else 0.
- Revenue matches the sheet's Price column: what the buyer paid (items + shipping + tax), less any refunds. Cancelled and fully refunded receipts are skipped. A live row is removed if its receipt is cancelled later.

It runs with the other sources when the dashboard opens (`POST /dashboard/api/sync/auto/etsy`, skipped while the last good run is under 15 minutes old) and on **Refresh**. Tools → Connections shows its status.

## Ad spend

Each run also reads Etsy's payment-account ledger and writes daily Etsy ad spend to `analytics_daily_ad_spend` under platform **Etsy Ads**:

- campaign **Etsy Ads**: on-site promoted listings (ledger type `prolist`), the daily ad budget.
- campaign **Offsite Ads**: the per-order fee Etsy charges when one of its offsite ads made the sale (`offsite_ads_fee`). These rows also report the sales those ads made, so the Marketing page shows a ROAS for them.

That gives the Marketing page, MER and ROAS the Etsy spend next to Google and Meta, and clears the "Etsy Ads isn't connected" card. The P&L is unchanged: it takes marketing from each order (the Sales Tracker's Marketing column), so nothing is counted twice. Live Etsy orders not yet in the sheet carry their own Offsite Ads fee as marketing cost.

**ROAS.** Etsy's ads only show on Etsy, so the Marketing page credits them with Etsy sales: the platform ROAS is all Etsy sales in the range ÷ all Etsy ad spend. Per campaign, Offsite Ads gets the sales of the orders Etsy charged an Offsite Ads fee on, and Etsy Ads gets the rest of Etsy's sales, so the two add up to the platform total. This is generous to the ads (Etsy's own search and repeat buyers would sell some of that anyway), so treat it as an upper bound.

The first run backfills the same window as orders (`ETSY_SYNC_DAYS`). After that each run re-reads the last 45 days, so late refunds of ad fees get picked up. If the ledger can't be read, orders still sync and Tools → Connections says "Ad spend skipped" with the reason. Ad-looking ledger types the sync doesn't recognise are listed in the sync message, so a new Etsy fee type gets noticed.

## Fees and receipt detail

The same ledger read also feeds:

- **Fees by type**, per store day, in `analytics_etsy_fees_daily`: transaction, payment processing, listing and renewal, shipping labels, Etsy Ads, Offsite Ads, regulatory, currency conversion, subscription, VAT and sales tax. The classifier is in `server/src/analytics/etsy-fees.ts`; unknown types land in `other`.
- **Per-receipt costs.** Ledger entries are matched to their receipt, and each receipt's Etsy Payments record gives the card processing fee and net. These land in `analytics_etsy_receipts` with the receipt's buyer id, coupon discounts, units and ship time. A live order uses those real fees and label cost; a receipt whose fees aren't known yet keeps the estimate.

Each run also pulls:

- **Buyer ids.** Every counted receipt writes a customer-history row keyed `etsy-buyer:<buyer id>`, so new and returning Etsy buyers can be told apart without emails.
- **Listings** (`analytics_etsy_listings`, replaced each run): title, state, price, stock, favorites, views and tags.
- **Reviews** (`analytics_etsy_reviews`): rating, text and listing. After the first run it re-reads from 30 days before the newest stored review.
- **A daily shop snapshot** (`analytics_etsy_shop_daily`, last write of the day wins): favorites, review count and average, total sold and active listings.

A section that fails (missing scope, Etsy error) is skipped and named in the sync message; orders still sync.

### API calls

Payments cost one call per receipt. The first backfill reads every receipt in the window (about one call per receipt, at most four at a time). After that a run reads only receipts it hasn't seen plus those from the last 45 days, since refunds adjust fees. Receipts, the ledger, listings and reviews are paged list calls; the shop is one call.

## Etsy page

The dashboard's **Etsy** page (`GET /dashboard/api/etsy?<range>`, built by `server/src/analytics/etsy-view.ts`) shows, for the selected range: Etsy revenue, orders and average order (from the orders table), new vs returning buyers, fees by type with their share of revenue (taxes are listed but left out of the total), days to ship, discounted orders, reviews and a listings table with units sold and revenue per listing (matched by title). Shop favorites, review average, total sold and active listings come from the latest snapshot. The page shows "not connected" until the `ETSY_*` variables are set.

## What Etsy's API can't give

- Etsy Ads impressions, clicks and per-listing ad stats (only the spend, from the ledger).
- Shop visits, listing views over time, conversion rate and search terms (Shop Stats isn't in the API).
- Coupon codes. Receipts only say how much a shop coupon or an Etsy-funded discount took off, so the page groups discounts by who paid for them.
- Buyer emails. They need the `email_r` scope and a fresh sign-in; until then buyers are matched by Etsy buyer id only.

## Setup

1. **Etsy app.** Use the seller app **shop-data-export** at <https://www.etsy.com/developers/your-apps> (owner: the Sunday Rolls Etsy account). It has the callback URL `https://localhost:3003/callback` registered.
2. **One-time sign-in.** Run `etsy_pull.py` on a computer: `python etsy_pull.py` (Windows: double-click `Run_Etsy_Export.bat`). It asks for the keystring, shared secret and callback URL, opens Etsy's approval page, then saves `etsy_tokens.json` next to the script.
3. **Railway `contact-api` variables** (set them in Railway; never commit them):

   | Variable | Value |
   |---|---|
   | `ETSY_KEYSTRING` | Keystring from Your Apps |
   | `ETSY_SHARED_SECRET` | Shared secret from Your Apps (Etsy rejects requests without it since Feb 2026) |
   | `ETSY_REFRESH_TOKEN` | `refresh_token` from `etsy_tokens.json` |
   | `ETSY_SHOP_ID` | Optional; looked up from the token when blank |
   | `ETSY_SYNC_DAYS` | Optional; how far back each run looks (default 365) |

4. Open the dashboard. Etsy appears in the sync bar and under Tools → Connections.

## Tokens

Etsy access tokens last an hour, and refresh tokens last 90 days. Every refresh returns a new refresh token, which the server saves in Postgres (`analytics_integration_state`, key `etsy`). `ETSY_REFRESH_TOKEN` is only the starting point. Because the dashboard refreshes far more often than every 90 days, the chain keeps itself alive.

If the sync reports `Etsy token refresh failed`, sign in again: run `python etsy_pull.py --reauth`, then paste the new `refresh_token` into `ETSY_REFRESH_TOKEN` on Railway. A changed value restarts the chain automatically.

The local script and the server each keep their own token chain. If the script later says its token is invalid, run it with `--reauth`.

## Scopes

The app asks for `transactions_r listings_r shops_r`, which is read-only. The ledger and payments are covered by `transactions_r`, so the new detail data needs no re-auth. Buyer emails need `email_r`, so live Etsy rows have no customer email, the same as sheet rows.
