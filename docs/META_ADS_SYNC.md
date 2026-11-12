# Meta Ads spend sync (dashboard)

The dashboard pulls Meta (Facebook + Instagram) ad spend per campaign per day from the Marketing API
insights endpoint into `analytics_daily_ad_spend` (platform **Meta Ads**). It feeds Marketing (ad
spend, MER, the Meta campaigns table) and runs with the other syncs when the dashboard opens
(source `meta-ads`, at most every 30 minutes). Purchases/value are Meta's own count.

## Railway variables (`contact-api`)

| Variable | Value |
|----------|-------|
| `META_AD_ACCOUNT_ID` | `2001554000739418` ("Sunday Rolls Ad account", business `sundayrolls_co`) |
| `META_ACCESS_TOKEN` | System-user token with `ads_read` (below) |
| `META_SYNC_DAYS` | Optional, default `90` |
| `META_GRAPH_VERSION` | Optional, default `v24.0` |

### Getting a token that doesn't expire

1. [business.facebook.com/settings](https://business.facebook.com/settings) → business **sundayrolls_co**.
2. Users → **System users** → Add → name "Sunday Rolls Dashboard", role **Employee**.
3. On that system user: **Assign assets** → Ad accounts → *Sunday Rolls Ad account* → **View performance** only.
4. **Generate new token** → pick (or create) an app → permission **ads_read** → expiration **Never** → Generate.
5. Paste it into Railway as `META_ACCESS_TOKEN` (no quotes) and deploy. Don't paste it in chat.

If step 4 asks for an app, create one at developers.facebook.com (type *Business*, linked to
sundayrolls_co); it needs no review for reading your own ad account.

Errors show on the dashboard sync bar, e.g. `Invalid OAuth access token` (token wrong/revoked) or
`(#200) … ads_read` (token missing the permission or the ad account isn't assigned to the system user).
