# Google Ads API sync (dashboard)

The dashboard reads Google Ads directly from the Google Ads API: clicks, impressions, cost, CPC,
Google Ads' own conversions per campaign per day, and the search terms that triggered ads. It shows
on **Marketing → Google Ads campaigns / Google Ads search terms**, and syncs with the other sources
when someone opens the dashboard (source `google-ads`, at most every 30 minutes).

It is free and replaces the Windsor.ai connector. Spend for MER/ROAS still comes from GA4
(`ga4.ts`, Ads ↔ GA4 link), so nothing double counts.

## Accounts

| What | Value |
|------|-------|
| Google Ads account | `299-697-4701` "Sunday Rolls Google Ads account" (`AW-17744695066`) |
| Google Cloud project | **Sunday Rolls Ads** (`sunday-rolls-ads`), owner `stwolfe10@gmail.com` |
| API access level | Explorer (approved 2026-11-11): 2,880 operations/day on live accounts. One sync uses 2. |
| OAuth app | Google Auth Platform, External. Desktop client **Sunday Rolls Ads MCP** |

Google retired developer tokens on 2026-09-09. Access is tied to the Cloud project, so no
developer token is needed (set `GOOGLE_ADS_DEVELOPER_TOKEN` only if Google asks for one again).
Manage access at Cloud Console → Google Ads API → Overview. Never apply through the Ads API Center.

## Railway variables (`contact-api`)

| Variable | Value |
|----------|-------|
| `GOOGLE_ADS_CLIENT_ID` | `client_id` from the credentials file below |
| `GOOGLE_ADS_CLIENT_SECRET` | `client_secret` from the same file |
| `GOOGLE_ADS_REFRESH_TOKEN` | `refresh_token` from the same file |
| `GOOGLE_ADS_CUSTOMER_ID` | `299-697-4701` (dashes are fine) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Optional: manager account id, only if access goes through one |
| `GOOGLE_ADS_SYNC_DAYS` | Optional, default `90` |
| `GOOGLE_ADS_API_VERSION` | Optional, default `v26`. Bump when Google sunsets it. |

### Getting the refresh token

On a computer with the Google Cloud CLI and the client's JSON (Cloud Console → Google Auth Platform
→ Clients → Sunday Rolls Ads MCP → Add secret → Download JSON):

```powershell
gcloud.cmd auth application-default login --scopes "https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/cloud-platform" --client-id-file "C:\path\to\client.json"
```

Sign in as a Google account with access to the Ads account (it must be listed under Audience →
Test users while the app is in Testing). The command prints where it saved the credentials
(Windows: `%APPDATA%\gcloud\application_default_credentials.json`). Copy `client_id`,
`client_secret` and `refresh_token` from that file into Railway yourself; don't paste them into chat
or commit them.

**Testing-mode tokens expire after 7 days.** For a token that keeps working, open Google Auth
Platform → Audience → **Publish app** (it stays unverified, which is fine for our own accounts),
then run the command above again and update `GOOGLE_ADS_REFRESH_TOKEN`.

## Checking it

- Dashboard → sync bar shows **Google Ads** with "N campaign-days · N search terms · $X cost".
- Health (`/dashboard/api/health`) lists `google-ads` and any missing variables.
- Errors show the Google Ads API message (e.g. `PERMISSION_DENIED` = the signed-in account can't
  see `299-697-4701`; `invalid_grant` = the refresh token expired or was revoked, so make a new one).

Code: `server/src/analytics/google-ads.ts` (API + parsing), `google-ads-sync.ts`,
`google-ads-view.ts`, tables `analytics_google_ads_daily` and `analytics_google_ads_search_terms`.
