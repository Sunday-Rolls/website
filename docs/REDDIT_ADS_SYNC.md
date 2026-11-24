# Reddit Ads spend sync (dashboard)

The dashboard pulls Reddit ad spend per campaign per day from the Reddit Ads API v3 reports
endpoint into `analytics_daily_ad_spend` (platform **Reddit Ads**). It feeds Marketing (ad spend,
MER, the Reddit campaigns table) and runs with the other syncs when the dashboard opens (source
`reddit-ads`, at most every 30 minutes). Purchases/value are Reddit's own count (pixel / Conversions
API, click + view-through). Days are UTC days.

Code: `server/src/analytics/reddit-ads.ts`. The sync only reads. The sign-in asks for `adsread` and
`adsedit`; `adsedit` is used only by the Claude connector's Reddit change tools (below), each of which
needs a previewed change and an explicit yes. Tokens made before 2026-11-24 are read-only: redo the
sign-in (step 3) to get edit access.

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

## Claude connector tools

The Sunday Rolls connector (`https://dashboard.sundayrollsgolf.com/mcp`,
[GOOGLE_ADS_CONNECTOR.md](GOOGLE_ADS_CONNECTOR.md)) includes these Reddit tools. Code:
`server/src/mcp/reddit-ads-tools.ts` and `reddit-ads-manage-tools.ts`.

| Tool | What it does |
|------|--------------|
| `reddit_ads_performance` | Spend and Reddit-reported purchases per campaign per day (stored sync data) |
| `reddit_ads_structure` | Live campaigns → ad groups (status, budget, bid, keywords, communities) → ads (status, URL) |
| `reddit_ads_set_ad_url` | Change an ad's destination URL or add UTMs (must stay on sundayrollsgolf.com) |
| `reddit_ads_update_targeting` | Add/remove keywords, excluded keywords, communities, excluded communities |
| `reddit_ads_set_status` | Pause or turn on a campaign, ad group or ad |
| `reddit_ads_set_daily_budget` | Daily budget $5–$500 on the ad group, or its campaign under campaign budget optimization |
| `reddit_ads_create_ad_group` | Copy an ad group (bidding, pixel, targeting) with a new name and keywords; created **paused** with paused copies of its ads |
| `reddit_ads_change_log` | Changes made through the connector |

Changes are two-step, like the Google tools: without `confirm_token` the tool reads the live values
and returns a before/after preview and a token (15 minutes, tied to the exact arguments); repeating the
call with the token applies it and logs it (`analytics_integration_state` key `reddit-ads-change-log`,
last 300). Reddit has no validate-only mode, so Reddit's own checks run only when a change is applied.

API notes: single entities use bare paths with `PATCH {"data": {...}}` (`/ads/{id}`,
`/ad_groups/{id}`, `/campaigns/{id}`); lists and creates use `/ad_accounts/{id}/…`; money is
microcurrency. Ad copy (headline, body) can't be edited through the API; new ads with new creative are
made in Reddit Ads Manager. A 403 on a change usually means the token lacks `adsedit`: redo step 3.

## Errors (dashboard sync bar)

- `Reddit sign-in failed (400): invalid_grant`: the refresh token was revoked; redo step 3.
- `Reddit sign-in failed (401)`: client id / secret wrong.
- `Reddit Ads API 403`: the signed-in Reddit login can't see `REDDIT_ADS_ACCOUNT_ID`, or Reddit
  hasn't enabled Ads API access for the business yet (ask Reddit Ads support to enable API access).
- `Reddit Ads API 404`: the account id is wrong (use the id from the sign-in page).
