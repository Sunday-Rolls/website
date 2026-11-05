# Etsy order sync

The dashboard pulls Etsy orders straight from the Etsy Open API v3, so new Etsy sales show up without waiting for the Sales Tracker sheet to be updated.

## How it fits with the Sales Tracker

- The **Sales Tracker** is still the record for Etsy. Its rows carry Etsy's real fees, label cost and offsite-ads charges.
- Both the sheet and the live sync key an order as `etsy:<receipt id>` (the Etsy order number in the sheet's Order Numbers column). The live sync adds only receipts the sheet doesn't have yet. These rows have `source = etsy`.
- When the next Sales Tracker sync brings the same order in, its row replaces the live one. Nothing is counted twice, and the Etsy sync never overwrites a sheet row.
- Etsy's receipts API doesn't report fees. Until the sheet catches up, live rows carry estimates learned from the sheet's own Etsy history: fees as the same share of revenue, and the average shipping cost per order. Marketing (offsite ads) is left at 0.
- Revenue matches the sheet's Price column: what the buyer paid (items + shipping + tax), less any refunds. Cancelled and fully refunded receipts are skipped. A live row is removed if its receipt is cancelled later.

It runs with the other sources when the dashboard opens (`POST /dashboard/api/sync/auto/etsy`, skipped while the last good run is under 15 minutes old) and on **Refresh**. Tools → Connections shows its status.

## Ad spend

Each run also reads Etsy's payment-account ledger and writes daily Etsy ad spend to `analytics_daily_ad_spend` under platform **Etsy Ads**:

- campaign **Etsy Ads**: on-site promoted listings (ledger type `prolist`), the daily ad budget.
- campaign **Offsite Ads**: the per-order fee Etsy charges when one of its offsite ads made the sale (`offsite_ads_fee`). These rows also report the sales those ads made, so the Marketing page shows a ROAS for them.

That gives the Marketing page, MER and ROAS the Etsy spend next to Google and Meta, and clears the "Etsy Ads isn't connected" card. The P&L is unchanged: it takes marketing from each order (the Sales Tracker's Marketing column), so nothing is counted twice. Live Etsy orders not yet in the sheet carry their own Offsite Ads fee as marketing cost.

The first run backfills the same window as orders (`ETSY_SYNC_DAYS`). After that each run re-reads the last 45 days, so late refunds of ad fees get picked up. If the ledger can't be read, orders still sync and Tools → Connections says "Ad spend skipped" with the reason. Ad-looking ledger types the sync doesn't recognise are listed in the sync message, so a new Etsy fee type gets noticed.

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

The app asks for `transactions_r listings_r shops_r`, which is read-only. The ledger is covered by `transactions_r`. Buyer emails need `email_r`, so live Etsy rows have no customer email, the same as sheet rows.
