# Google Ads connector for Claude

`contact-api` hosts a remote MCP server so Claude (phone, web, desktop, Claude Code) can read the
Sunday Rolls Google Ads account and make a few kinds of changes, each previewed and approved first.

- URL: **`https://dashboard.sundayrollsgolf.com/mcp`**
- Sign-in: your Sunday Rolls **dashboard** email and password (admins only)
- Google access: the same `GOOGLE_ADS_*` Railway variables as the dashboard sync ([`GOOGLE_ADS_API.md`](GOOGLE_ADS_API.md))

## Add it to Claude

claude.ai → Settings → Connectors → **Add custom connector** → name "Sunday Rolls Google Ads",
URL above → Add → Connect. A Sunday Rolls page opens; sign in with your dashboard login and you're
sent back to Claude. Each partner who's a dashboard admin can add it the same way. On Team/Enterprise
plans an owner adds it once under Organization connectors.

## Tools

| Tool | What it does |
|------|--------------|
| `google_ads_campaigns` | Campaigns with id, status, bidding strategy, target ROAS, daily budget |
| `google_ads_performance` | Impressions, clicks, cost, conversions, value per campaign (optional by day) |
| `google_ads_search_terms` | Search terms, highest cost first |
| `google_ads_negative_keywords` | Negatives at campaign, ad group and shared-list level |
| `google_ads_query` | Any read-only GAQL `SELECT` |
| `google_ads_change_log` | Changes made through the connector |
| `google_ads_add_negative_keywords` | Add negatives to one campaign |
| `google_ads_remove_negative_keywords` | Remove negatives by resource name |
| `google_ads_set_target_roas` | Target ROAS (ratio, 1.8 = 180%) on Max conversion value / tROAS campaigns |
| `google_ads_set_daily_budget` | Daily budget, $1–$500, not shared budgets |
| `google_ads_set_campaign_status` | Pause or enable |

Changes are two-step. The first call asks Google to validate the change (`validateOnly`) and
returns a preview plus a `confirm_token`. Nothing is applied until the same call is repeated with
that token (valid 15 minutes, tied to the exact arguments). Applied changes are logged in
`analytics_integration_state` (`google-ads-change-log`, last 300) and show in Google Ads → Change history.

## Security

- OAuth 2.1 with PKCE; codes only go to Claude's callbacks (`claude.ai` / `claude.com`) or loopback.
- Access tokens last 1 hour, refresh tokens 30 days. Removing someone's dashboard admin flag cuts them off.
- Tokens are signed with `MCP_OAUTH_SECRET`, or a secret generated once and stored in Postgres.
  To sign everyone out, set a new `MCP_OAUTH_SECRET` (or delete the `mcp-oauth-secret` state row).
- Optional `MCP_PUBLIC_URL` overrides the base URL in the OAuth metadata (default: request host).

Code: `server/src/mcp/` (`routes.ts` endpoints, `oauth.ts`, `google-ads-tools.ts`), tests in `mcp.test.ts`.
