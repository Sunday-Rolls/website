# Shopify web pixel → GA4 purchase

Checkout finishes on **Shopify**, so the GitHub Pages SPA cannot see `purchase` by itself. Install this **Customer events** custom pixel so paid checkouts hit the same GA4 property as the storefront.

`add_to_cart` / `begin_checkout` already fire from the React site (`src/lib/gtm.ts`) into GTM + optional direct GA4.

## Install (Shopify Admin)

1. **Settings → Customer events → Add custom pixel**
2. Name it `Sunday Rolls GA4`
3. Paste the script below
4. Permission: **Not required** (or per your privacy policy)
5. **Save → Connect**

## Pixel script

| Environment | Measurement ID |
|-------------|----------------|
| GitHub Pages demo | `G-ET6SXZWE8E` |
| Live cutover | `G-YK0BB0TPM4` |

```javascript
const GA4_MEASUREMENT_ID = 'G-ET6SXZWE8E'

const script = document.createElement('script')
script.async = true
script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`
document.head.appendChild(script)

window.dataLayer = window.dataLayer || []
function gtag() {
  dataLayer.push(arguments)
}
gtag('js', new Date())
gtag('config', GA4_MEASUREMENT_ID)

analytics.subscribe('checkout_completed', (event) => {
  const checkout = event.data?.checkout
  if (!checkout) return
  gtag('event', 'purchase', {
    transaction_id: String(checkout.order?.id || checkout.token || Date.now()),
    currency: checkout.currencyCode || 'USD',
    value: Number(checkout.totalPrice?.amount || 0),
    items: (checkout.lineItems || []).map((line) => ({
      item_id: String(line.variant?.product?.id || line.id || ''),
      item_name: line.title || 'Product',
      price: Number(line.variant?.price?.amount || 0),
      quantity: Number(line.quantity || 1),
    })),
  })
})
```

## Cutover

1. Change the pixel’s `GA4_MEASUREMENT_ID` to `G-YK0BB0TPM4`
2. Update hosting env (GitHub Actions secrets / Railway static host):
   - `VITE_GTM_ID` → live GTM (e.g. `GTM-PPTR6V3B`)
   - `VITE_GA4_MEASUREMENT_ID` → `G-YK0BB0TPM4`
   - `VITE_CONTACT_API_URL` → Railway API (already)
3. Rebuild/redeploy the site
4. Confirm GA4 Realtime: site events + pixel `purchase`

## Manual SPA validation

`https://sunday-rolls.github.io/website/order/thank-you?transaction_id=TEST-test-1&value=80`

Fires `purchase` (uses cart stashed at `begin_checkout` when available).
