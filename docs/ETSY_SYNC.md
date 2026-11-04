# Etsy order sync

The dashboard pulls Etsy orders straight from the Etsy Open API v3, so new Etsy sales show up without waiting for the Sales Tracker sheet to be updated.

## How it fits with the Sales Tracker

- The **Sales Tracker** is still the record for Etsy. Its rows carry Etsy's real fees, label cost and offsite-ads charges.
- Both the sheet and the live sync key an order as `etsy:<receipt id>` (the Etsy order number in the sheet's Order Numbers column). The live sync adds only receipts the sheet doesn't have yet. These rows have `source = etsy`.
- When the next Sales Tracker sync brings the same order in, its row replaces the live one. Nothing is counted twice, and the Etsy sync never overwrites a sheet row.
- Etsy's receipts API doesn't report fees. Until the sheet catches up, live rows carry estimates learned from the sheet's own Etsy history: fees as the same share of revenue, and the average shipping cost per order. Marketing (offsite ads) is left at 0.
- Revenue matches the sheet's Price column: what the buyer paid (items + shipping + tax), less any refunds. Cancelled and fully refunded receipts are skipped. A live row is removed if its receipt is cancelled later.

It runs with the other sources when the dashboard opens (`POST /dashboard/api/sync/auto/etsy`, skipped while the last good run is under 15 minutes old) and on **Refresh**. Tools → Connections shows its status.

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

The app asks for `transactions_r listings_r shops_r`, which is read-only. Buyer emails need `email_r`, so live Etsy rows have no customer email, the same as sheet rows.
