# Analytics setup (GTM + GA4)

The site pushes events to `window.dataLayer` via [`src/lib/gtm.ts`](../src/lib/gtm.ts). Google Tag Manager (`VITE_GTM_ID`) loads on boot and should forward events to GA4.

## Demo property (`sundayrollsdevops@gmail.com`)

| Piece | Value |
|-------|-------|
| GTM container | `GTM-PQSG4NXT` |
| GA4 stream | **test environment** |
| Stream URL | `https://sunday-rolls.github.io/website/` |
| Stream ID | `15833170805` |
| Measurement ID | `G-ET6SXZWE8E` |

### Site install (already in the app)

1. `VITE_GTM_ID=GTM-PQSG4NXT` in local `.env` and GitHub Actions secrets
2. JS bootstrap via `initGtm()` in [`src/main.tsx`](../src/main.tsx)
3. Noscript iframe in [`index.html`](../index.html)

### GTM → GA4 wiring (do this in Tag Manager UI)

Without these tags, the site can load GTM while **GA4 Realtime stays empty**.

1. Open [tagmanager.google.com](https://tagmanager.google.com/) → container **GTM-PQSG4NXT**
2. **Tags → New → Google Analytics: GA4 Configuration**
   - Measurement ID: `G-ET6SXZWE8E`
   - Trigger: **Initialization - All Pages** (or All Pages)
3. For each custom event below, add a **GA4 Event** tag:
   - Event name = the `event` string from `dataLayer`
   - Trigger = Custom Event with that same name
   - Optional: map ecommerce / params as needed
4. **Submit → Publish** the container
5. Verify:
   - GTM **Preview** connected to `https://sunday-rolls.github.io/website/`
   - GA4 **Reports → Realtime** while you click around

## Events the app fires

| Event | When |
|-------|------|
| `page_view` | Client route changes |
| `cta_click` | Home hero CTA |
| `view_item_list` | Shop grid with products |
| `select_item` | Product card click |
| `view_item` | Product page |
| `add_to_cart` | Add to cart |
| `view_cart` | Cart page with lines |
| `begin_checkout` | Checkout button (before Shopify redirect) |
| `newsletter_subscribe` | Newsletter success |
| `contact_submit` | Contact form success |

## Purchase

Checkout completes on **Shopify**, so this SPA cannot reliably fire `purchase`. For demos:

1. Keep `begin_checkout` from the cart (already implemented).
2. In Shopify Admin → Settings → Customer events (or a custom pixel), send `purchase` to `G-ET6SXZWE8E` / GTM.

## Local testing

In DevTools on the live site:

```js
window.dataLayer
// expect gtm.js / page_view entries after load + navigation
```

Network tab: request to `googletagmanager.com/gtm.js?id=GTM-PQSG4NXT` should be **200**.
