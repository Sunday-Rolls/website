# Ads, tracking and SEO configuration

What is configured outside this repo (Tag Manager, Google Ads, Merchant Center, Search Console), what changed after the 2026-11-01 cutover, and how to change or revert each piece. Event names and the GTM tag list are in [ANALYTICS.md](./ANALYTICS.md); the Shopify purchase pixel is in [SHOPIFY_WEB_PIXEL.md](./SHOPIFY_WEB_PIXEL.md).

## Where everything lives

| System | ID | Open it | Devops (`sundayrollsdevops@gmail.com`) access |
|--------|----|---------|------------------------------------------------|
| Google Tag Manager | `GTM-PPTR6V3B` (account `6333037927`, container `240141963`) | [tagmanager.google.com](https://tagmanager.google.com/#/container/accounts/6333037927/containers/240141963) | Publish (granted by Sam) |
| GA4 | `G-YKOBBOTPM4` (letter **O**); dashboard reads property `513898453` | [analytics.google.com](https://analytics.google.com) | None |
| Google Ads | `AW-17744695066` (URL `ocid=7809216417`) | [ads.google.com](https://ads.google.com/aw/overview?ocid=7809216417) | Can edit (made the changes below) |
| Merchant Center | `5685591896` "Sunday Rolls", linked to Ads since 2025-11-19 | [merchants.google.com](https://merchants.google.com/mc/overview?a=5685591896) | **None**: ask Sam to add devops as Admin |
| Search Console | Domain property `sundayrollsgolf.com` | [search.google.com/search-console](https://search.google.com/search-console?resource_id=sc-domain%3Asundayrollsgolf.com) | **None**: ask the owner to add devops as Owner or Full user |
| Meta Pixel | `1274109674861464` | Events Manager | Not checked |

## Change log: 2026-11-02

Each entry lists what it was before, so it can be put back.

### Site code (this repo)

All merged to `main` and deployed to Railway `website`. Revert any one with `git revert -m 1 <merge>` on a branch and a PR.

| PR | Merge | What it does |
|----|-------|--------------|
| [#74](https://github.com/Sunday-Rolls/website/pull/74) | `5af895d` | `pushEcommerce` in `src/lib/gtm.ts` pushes a bare `{ ecommerce: null }` before each event, so GTM triggers fire once per action instead of twice. |
| [#75](https://github.com/Sunday-Rolls/website/pull/75) | `f20c545` | `view_item` fires once with the loaded product; `view_cart` fires once per distinct cart. |
| [#76](https://github.com/Sunday-Rolls/website/pull/76) | `3f830ec` | Dashboard GA4 sync (`server/src/analytics/ga4.ts`) counts product views on `/products/<handle>` as well as the old `/shop/p/<slug>`. |
| [#77](https://github.com/Sunday-Rolls/website/pull/77) | `1da891d` | A tab left open across a deploy reloads once instead of showing the 404 page (`src/lib/preload-route.ts`). |
| [#78](https://github.com/Sunday-Rolls/website/pull/78) | `113830e` | 301s old Squarespace URLs to the new pages (`scripts/lib/legacy-redirects.mjs`, used by `scripts/serve-spa.mjs`). |
| [#79](https://github.com/Sunday-Rolls/website/pull/79) | `8785f03` | Towel and `/contact-us-1` redirects; analytics loads immediately on ad landings; canonical URLs, sitemap and robots.txt point at `www.sundayrollsgolf.com`. |

### Tag Manager: version 16

Published by devops. To revert, open **Versions**, pick the version published before 16, and **Publish** it.

- Reworked the old `Begin Checkout` tag into **GA4 - ecommerce funnel** on the new trigger `CE - GA4 ecommerce funnel`.
- Added **Ads - Add to cart (site event)** on `CE - add_to_cart` and **Ads - Begin checkout (site event)** on `CE - begin_checkout`, with the new variables `{{Value}}` (`ecommerce.value`) and `{{Currency}}` (`ecommerce.currency`).
- Deleted the `Checkout Page` trigger, which waited for clicks on a `/checkout` link that no longer exists.

The full tag table is in [ANALYTICS.md](./ANALYTICS.md#live-gtm-container-gtm-pptr6v3b). The site's code depends on v16: if you revert GTM, the funnel steps stop reaching GA4 and the two Ads actions stop recording.

### Google Ads conversion actions

**Goals → Conversions → Summary.** Added two secondary actions (count: Every, 90-day window). Secondary means they are reported but not used for bidding.

| Action | Label | Fired by |
|--------|-------|----------|
| Add to cart (site event) | `jF7_CK6g-LAdEJqeqo1C` | GTM `Ads - Add to cart (site event)` |
| Begin checkout (site event) | `oKa5CLGg-LAdEJqeqo1C` | GTM `Ads - Begin checkout (site event)` |

Left in place: the old URL-rule actions `Shopping Cart` and `Begin checkout (Page load …/checkout)`. They no longer match anything on the headless site, so remove them once the two new actions show **Recording conversions**. Purchase is unchanged (label `PznHCIOf2-EbEJqeqo1C`, from the Shopify pixel).

To revert, open the action → **Edit settings** → set it to remove, or delete its GTM tag.

### Google Ads sitelinks

**Campaigns → Assets → Associations → Sitelink.** Sitelinks are shared assets: one edit with **All associations of this asset** changes it at account level and in every campaign that uses it. Hover a sitelink's name to see its final URL; use the pencil to edit it.

| Sitelink | Before | After |
|----------|--------|-------|
| Oz and Mezz Putter Cover | `https://www.sundayrollsgolf.com/shop/oz-headcovers` | `https://www.sundayrollsgolf.com/shop/?category=oz-mezz` |
| Contact Us (account level) | `https://www.sundayrollsgolf.com/contact-us-1` | `https://www.sundayrollsgolf.com/contact/` |

Unchanged because they already work: Sunday Rolls Shop and Shop Products (`/shop`), Sunday Rolls and Sunday Rolls Home Page (`/`). The paused `Contact Us` copy in Search v1 still has `/contact-us-1`, which redirects.

`/shop/?category=<section>` scrolls to a shop section. Section ids come from `src/content/pages/shop.json`: `towels`, `center-shafted`, `mallet`, `oz-mezz`.

Product-level links in Shopping and Performance Max ads (towel listings, for example) come from Merchant Center, not sitelinks. See [Still to do](#still-to-do).

### Other changes outside the repo

- **Shopify theme:** Horizon `layout/theme.liquid` forwards the Shopify storefront to `www`. See [CUTOVER_DAY_CHECKLIST.md](./CUTOVER_DAY_CHECKLIST.md).
- **1Password:** the four dashboard logins now open `https://dashboard.sundayrollsgolf.com/dashboard`. The old URL was the Railway `*.up.railway.app/dashboard/` address.

## How the site handles old URLs and ad clicks

**Legacy redirects.** `scripts/serve-spa.mjs` calls `legacyRedirect()` before serving files and answers with a 301 (cached for a day). The query string is kept, so `gclid`, `srsltid` and `utm_*` survive.

- `/shop/p/<slug>`: exact handle → same words in a different order (ignoring "the"; striped/stripes = stripe) → `inferProductHandleFromListing` → `/shop/`.
- Other `/shop/...` paths go to `/shop/`.
- Fixed page aliases are in `PAGE_ALIASES` (`/about-us`, `/our-story`, `/contact-us`, `/contact-us-1` → `/contact/#returns`, `/home`).

To add one, edit `scripts/lib/legacy-redirects.mjs`, add a case to `scripts/lib/legacy-redirects.test.mjs`, and run `node --test scripts/lib/legacy-redirects.test.mjs`. Railway's `website` watch patterns don't include `scripts/lib/**`. A change only there won't redeploy on its own: redeploy `website` from Railway, or ship it with another file it watches.

**Ad click IDs.** `initGtm()` in `src/lib/gtm.ts` normally defers GTM and the Meta pixel until the first interaction or 15 s. If the landing URL has `gclid`, `gbraid`, `wbraid` or `fbclid`, it loads them immediately, so `_gcl_aw` / `_fbc` are set before the first in-app navigation drops the query. The list is `AD_CLICK_PARAMS`.

**Canonical URLs and sitemap.**
- `build:railway` in `package.json` sets `VITE_SITE_ORIGIN=https://www.sundayrollsgolf.com`.
- `scripts/emit-spa-shells.mjs` uses it to write each route's `<link rel="canonical">`, `dist/sitemap.xml` (home, shop, about, contact and every catalog product) and `dist/robots.txt`.
- `index.html` hard-codes the home canonical, `og:url` and JSON-LD URL.
- `public/sitemap.xml` and `public/robots.txt` are fallbacks for builds without an origin.
- Before #79, every page declared `https://sunday-rolls.github.io/website/` as canonical.

`serve-spa.mjs` sends `.html`, `.txt` and `.xml` with `Cache-Control: no-cache`, and hashed assets as immutable.

## Verify

```bash
curl -s https://www.sundayrollsgolf.com/robots.txt
```

```bash
curl -s https://www.sundayrollsgolf.com/sitemap.xml | grep -c '<loc>'
```

```bash
curl -s https://www.sundayrollsgolf.com/products/morning-dew/ | grep -o '<link rel="canonical"[^>]*>'
```

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' 'https://www.sundayrollsgolf.com/shop/p/golf-towel-striped-green?gclid=x'
```

Expected:
- robots.txt points at the www sitemap.
- The sitemap has 27 or more URLs.
- The product's canonical is its own www URL.
- The old towel URL returns `301 …/products/golf-towel-green-stripe/?gclid=x`.

For ad clicks, open `https://www.sundayrollsgolf.com/shop/?gclid=TEST`. Without clicking anything, `gtm.js` and `fbevents.js` should load and the `_gcl_aw` cookie should be set.

## Still to do

- **Merchant Center `5685591896`:** product links probably still use Squarespace `/shop/p/...` URLs. They redirect, but Google flags redirecting landing pages. Once devops has access, check the feed source. The lasting fix is a feed from Shopify's **Google & YouTube** app, which uses `/products/<handle>`.
- **Search Console:** submit `https://www.sundayrollsgolf.com/sitemap.xml` and request indexing for `/`, `/shop/` and the top products. This needs devops (or the owner) on the property; the property should be verified by DNS TXT.
- Remove the old `Shopping Cart` / `Begin checkout (Page load …/checkout)` Ads actions once the site-event actions record.
- Meta ROAS in the dashboard: there is no Meta spend sync yet. It needs a Marketing API token and the ad account id ([DASHBOARD_ACCESS.md](./DASHBOARD_ACCESS.md#5-meta-marketing-api-token--meta-business-admin)).
- Confirm GA4 property `513898453` is the `G-YKOBBOTPM4` stream (devops has no GA4 access).
