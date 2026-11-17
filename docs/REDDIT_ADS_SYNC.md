# Reddit Ads spend sync (dashboard)

The dashboard pulls Reddit ad spend per campaign per day from the Reddit Ads API v3 reports
endpoint into `analytics_daily_ad_spend` (platform **Reddit Ads**). It feeds Marketing (ad spend,
MER, the Reddit campaigns table) and runs with the other syncs when the dashboard opens (source
`reddit-ads`, at most every 30 minutes). Purchases/value are Reddit's own count (pixel / Conversions
API, click + view-through). Days are UTC days.

Code: `server/src/analytics/reddit-ads.ts`. Read-only: the token only has the `adsread` scope.

## Railway variables (`contact-api`)

| Variable | Value |
|----------|-------|
| `REDDIT_ADS_CLIENT_ID` | App ID of the Reddit developer app (below) |
| `REDDIT_ADS_CLIENT_SECRET` | That app's secret |
| `REDDIT_ADS_REFRESH_TOKEN` | From the dashboard's Reddit sign-in page (below) |
| `REDDIT_ADS_ACCOUNT_ID` | The ad account id, e.g. `a2_xxxxxx` (the sign-in page lists them) |
| `REDDIT_SYNC_DAYS` | Optional, default `90` |
| `REDDIT_ADS_REDIRECT_URI` | Optional. Only if the dashboard is reached at another address |

## Setup (once)

1. **Create the app.** Reddit Ads Manager (ads.reddit.com) → your business → **Developer
   Applications** → *Add Apps* / *Create an app*. Only a business admin with a verified Reddit account
   can do this. Use the redirect URI
   `https://contact-api-production-9af6.up.railway.app/dashboard/api/reddit/callback` exactly.
   Reddit shows the **app ID** (client id) and **secret** after you create it.
2. **Railway:** paste them as `REDDIT_ADS_CLIENT_ID` and `REDDIT_ADS_CLIENT_SECRET` and let it deploy.
   Don't paste them into chat.
3. **Sign in.** Log in to the dashboard as an admin, then open
   `https://contact-api-production-9af6.up.railway.app/dashboard/api/reddit/connect`. Approve on
   Reddit. The page you land on shows the refresh token once (it is not stored) and lists the ad
   accounts that login can see.
4. **Railway:** add `REDDIT_ADS_REFRESH_TOKEN` and `REDDIT_ADS_ACCOUNT_ID`, let it deploy, reopen the
   dashboard. **Reddit Ads** appears in the sync bar with "N campaign-days · $X spend".

The token is permanent until revoked (reddit.com → User settings → Safety → apps, or deleting the
app). Repeat step 3 if it stops working.

## Linking website sales to Reddit ads

Marketing credits a website order to Reddit only when it is tagged as a Reddit click: Reddit's click
ID (`rdt_cid`) or UTMs on the landing URL, e.g.
`?utm_source=reddit&utm_medium=paid&utm_campaign=<campaign name>`. Set the UTMs on each ad's
destination URL in Reddit Ads Manager; if `utm_campaign` matches the Reddit campaign name the sale
lands on that campaign's row. Untagged orders are not guessed for Reddit (GA4 doesn't give per-campaign
Reddit visits), so they show under "No website orders tagged" until tagged clicks come in.

## Errors (dashboard sync bar)

- `Reddit sign-in failed (400): invalid_grant`: the refresh token was revoked; redo step 3.
- `Reddit sign-in failed (401)`: client id / secret wrong.
- `Reddit Ads API 403`: the signed-in Reddit login can't see `REDDIT_ADS_ACCOUNT_ID`, or Reddit
  hasn't enabled Ads API access for the business yet (ask Reddit Ads support to enable API access).
- `Reddit Ads API 404`: the account id is wrong (use the id from the sign-in page).
