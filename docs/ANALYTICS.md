# Analytics setup (GTM + GA4)

The site pushes events via [`src/lib/gtm.ts`](../src/lib/gtm.ts):

1. **GTM** (`VITE_GTM_ID`) — container tags / triggers  
2. **Direct GA4** (`VITE_GA4_MEASUREMENT_ID` + `VITE_GA4_SEND_DIRECT`) — ecommerce events also go straight to GA4 so Realtime works even before GTM event tags are perfect

Purchase on Shopify checkout is covered by the [Customer events pixel](./SHOPIFY_WEB_PIXEL.md).

## Environments

| | GitHub Pages (now) | Live cutover (Railway) |
|--|--------------------|----------------------|
| Site | `https://sunday-rolls.github.io/website/` | Railway `website` + DNS → `www.sundayrollsgolf.com` ([RAILWAY_CUTOVER.md](./RAILWAY_CUTOVER.md)) |
| Contact API | Railway `contact-api` (Resend free plan for email) | same |
| `VITE_GTM_ID` | `GTM-PQSG4NXT` | `GTM-PPTR6V3B` (live) |
| `VITE_GA4_MEASUREMENT_ID` | `G-ET6SXZWE8E` | `G-YK0BB0TPM4` (confirm in GA4 Admin) |
| `VITE_BASE_PATH` | `/website/` | `/` |
| GA4 property | Demo / devops | `properties/513898453` |
| Shopify pixel ID | `G-ET6SXZWE8E` | same as live measurement ID |
| Dashboard sync | Railway Postgres ← GA4 property `513898453` | same (live property) |

> Dashboard Overview funnel reads **production** GA4 (`513898453`). Demo site events land in `G-ET6SXZWE8E`. To validate funnel metrics on the dashboard before cutover, either point the site at the live measurement ID in a preview, or confirm events in the demo GA4 Realtime first.

### Cutover env (GitHub Actions secrets / host)

```bash
VITE_GTM_ID=GTM-PPTR6V3B
VITE_GA4_MEASUREMENT_ID=G-YK0BB0TPM4
VITE_GA4_SEND_DIRECT=true
VITE_CONTACT_API_URL=https://contact-api-production-9af6.up.railway.app
```

Keep Shopify storefront tokens pointed at the production shop.

Contact form email is **not** a Vite env: `contact-api` sends via **Resend free plan** (`RESEND_API_KEY` on Railway — 3k/mo, 100/day). See [server/README.md](../server/README.md).

## Demo property (`sundayrollsdevops@gmail.com`)

| Piece | Value |
|-------|-------|
| GTM container | `GTM-PQSG4NXT` |
| GA4 stream | test / GitHub Pages |
| Stream URL | `https://sunday-rolls.github.io/website/` |
| Measurement ID | `G-ET6SXZWE8E` |

## Events the app fires

| Event | When |
|-------|------|
| `page_view` | Client route changes |
| `cta_click` | Home hero CTA |
| `view_item_list` | Shop grid |
| `select_item` | Product card click |
| `view_item` | Product page |
| `add_to_cart` | Add to cart |
| `view_cart` | Cart page |
| `begin_checkout` | Checkout click (before Shopify redirect); stashes cart for thank-you |
| `purchase` | Thank-you page and/or Shopify web pixel |
| `newsletter_subscribe` | Newsletter success |
| `contact_submit` | Contact form success |

Each ecommerce event is one dataLayer push, preceded by a bare `{ ecommerce: null }` clear (no `event` key, so GTM triggers fire once).

## Live GTM container (`GTM-PPTR6V3B`)

| Tag | Trigger | Sends |
|-----|---------|-------|
| GA4 - ecommerce funnel | `CE - GA4 ecommerce funnel` (regex: the six events from `view_item_list` to `begin_checkout`) | `{{Event}}` + dataLayer ecommerce → `G-YK0BB0TPM4` |
| Ads - Add to cart (site event) | `CE - add_to_cart` | Google Ads `AW-17744695066/jF7_CK6g-LAdEJqeqo1C`, secondary |
| Ads - Begin checkout (site event) | `CE - begin_checkout` | Google Ads `AW-17744695066/oKa5CLGg-LAdEJqeqo1C`, secondary |
| Purchase v2 / Google Analytics Purchases | `Trigger Purchase` | SPA thank-you page only; real checkouts report through the Shopify pixel |

Change history, revert steps, Ads sitelinks and Merchant Center / Search Console: [ADS_AND_SEO_CONFIG.md](./ADS_AND_SEO_CONFIG.md).

Google Ads page views come from the GA4 import (`Sunday Rolls (web) page_view`). The old URL-rule actions (`Shopping Cart`, `Begin checkout (Page load …/checkout)`) predate the headless site and can be removed once the site-event actions record.

## Purchase

1. **Preferred:** [Shopify Customer events pixel](./SHOPIFY_WEB_PIXEL.md) on `checkout_completed`
2. **SPA helper:** `/order/thank-you?transaction_id=…&value=…` for manual validation

## Local / Pages testing

1. Set in `.env`:

```bash
VITE_GTM_ID=GTM-PQSG4NXT
VITE_GA4_MEASUREMENT_ID=G-ET6SXZWE8E
VITE_GA4_SEND_DIRECT=true
```

2. DevTools → Network: `gtag/js?id=G-ET6SXZWE8E` and `collect`/`g/collect` on add-to-cart  
3. GA4 Admin for that property → **Realtime** while you shop on the demo site  
4. Dashboard **Data → Sync GA4** after events age into the API (often near-realtime for today)
