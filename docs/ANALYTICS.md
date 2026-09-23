# Analytics setup (GTM + GA4)

The site pushes events to `window.dataLayer` via [`src/lib/gtm.ts`](../src/lib/gtm.ts). Google Tag Manager (env `VITE_GTM_ID`) forwards them to GA4.

## Demo property (`sundayrollsdevops@gmail.com`)

1. Sign in to [Google Analytics](https://analytics.google.com/) as `sundayrollsdevops@gmail.com`.
2. Create an account/property (e.g. **Sunday Rolls**) and a **Web** data stream for your Pages URL.
3. Copy the Measurement ID (`G-XXXXXXXX`).
4. Sign in to [Google Tag Manager](https://tagmanager.google.com/) with the same account.
5. Create a container for the site → copy the Container ID (`GTM-XXXXXXX`) into `VITE_GTM_ID` (local `.env` + GitHub Actions / Pages secrets).
   Current demo container: **`GTM-PQSG4NXT`**.
6. In GTM:
   - **GA4 Configuration** tag → Measurement ID `G-XXXXXXXX`, trigger All Pages (or Custom Event `page_view` if you prefer SPA-only).
   - **GA4 Event** tags for custom events below (Event name = dataLayer `event`, trigger = Custom Event matching that name).
7. Publish the GTM container.
8. Verify with GTM Preview + GA4 **Realtime**.

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
| `newsletter_subscribe` | Newsletter success (after mailing-list PR) |
| `contact_submit` | Contact form success (after contact API PR) |

## Purchase

Checkout completes on **Shopify**, so this SPA cannot reliably fire `purchase`. For demos:

1. Keep `begin_checkout` from the cart (already implemented).
2. In Shopify Admin → Settings → Customer events (or a custom pixel), send `purchase` to the same GA4 Measurement ID / GTM.

## Local testing without GTM

Even with `VITE_GTM_ID` unset, `pushEvent` still writes to `dataLayer`. In DevTools:

```js
window.dataLayer
```
