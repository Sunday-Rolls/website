# Shopify web pixel → GA4, Google Ads, Meta purchase

Checkout finishes on **Shopify** (`shop.sundayrollsgolf.com`), where GTM doesn't run, so the SPA never sees `purchase`. This **Customer events** custom pixel sends each paid checkout to all three platforms.

The SPA (`src/lib/gtm.ts`) covers everything before checkout: GTM (GA4 + Google Ads remarketing / conversion linker) and the Meta Pixel (`PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Lead`, `Contact`).

| Platform | ID |
|----------|----|
| GA4 | `G-YKOBBOTPM4` (letter **O**, not zero) |
| Google Ads | `AW-17744695066`, purchase label `PznHCIOf2-EbEJqeqo1C` |
| Meta Pixel | `1274109674861464` |

## Install (Shopify Admin)

1. **Settings → Customer events.** If an older `Sunday Rolls GA4` pixel exists, **Disconnect** it so purchases aren't counted twice.
2. **Add custom pixel** → name it `Sunday Rolls purchase`.
3. Paste the script below.
4. Permission: **Not required** (or per your privacy policy). Data sale: **Data collected does not qualify as data sale**.
5. **Save → Connect**.

## Pixel script

```javascript
const GA4_MEASUREMENT_ID = 'G-YKOBBOTPM4'
const ADS_ID = 'AW-17744695066'
const ADS_PURCHASE_LABEL = 'PznHCIOf2-EbEJqeqo1C'
const META_PIXEL_ID = '1274109674861464'

// Google (GA4 + Ads)
const gtagScript = document.createElement('script')
gtagScript.async = true
gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`
document.head.appendChild(gtagScript)
window.dataLayer = window.dataLayer || []
function gtag() {
  dataLayer.push(arguments)
}
gtag('js', new Date())
gtag('config', GA4_MEASUREMENT_ID, { send_page_view: false })
gtag('config', ADS_ID, { allow_enhanced_conversions: true })

// Meta base code
!(function (f, b, e, v, n, t, s) {
  if (f.fbq) return
  n = f.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
  }
  if (!f._fbq) f._fbq = n
  n.push = n
  n.loaded = true
  n.version = '2.0'
  n.queue = []
  t = b.createElement(e)
  t.async = true
  t.src = v
  s = b.getElementsByTagName(e)[0]
  s.parentNode.insertBefore(t, s)
})(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')

analytics.subscribe('checkout_completed', (event) => {
  const checkout = event.data?.checkout
  if (!checkout) return

  const orderId = String(checkout.order?.id || checkout.token || Date.now())
  const value = Number(checkout.totalPrice?.amount || 0)
  const currency = checkout.currencyCode || 'USD'
  const lines = checkout.lineItems || []
  const items = lines.map((line) => ({
    item_id: String(line.variant?.product?.id || line.id || ''),
    item_name: line.title || 'Product',
    price: Number(line.variant?.price?.amount || 0),
    quantity: Number(line.quantity || 1),
  }))

  // Customer details power Google enhanced conversions and Meta advanced matching.
  // Checkout runs in a sandbox that can't read the site's ad-click cookies,
  // so this is what lets both platforms tie the sale back to the ad.
  const address = checkout.billingAddress || checkout.shippingAddress || {}
  const email = (checkout.email || '').trim().toLowerCase() || undefined
  const phone = (checkout.phone || address.phone || '').replace(/[^\d+]/g, '') || undefined

  gtag('set', 'user_data', {
    email,
    phone_number: phone,
    address: {
      first_name: address.firstName,
      last_name: address.lastName,
      street: address.address1,
      city: address.city,
      region: address.provinceCode,
      postal_code: address.zip,
      country: address.countryCode,
    },
  })
  gtag('event', 'purchase', {
    send_to: GA4_MEASUREMENT_ID,
    transaction_id: orderId,
    value,
    currency,
    items,
  })
  gtag('event', 'conversion', {
    send_to: `${ADS_ID}/${ADS_PURCHASE_LABEL}`,
    transaction_id: orderId,
    value,
    currency,
  })

  fbq('init', META_PIXEL_ID, {
    em: email,
    ph: phone?.replace(/\D/g, ''),
    fn: address.firstName?.toLowerCase(),
    ln: address.lastName?.toLowerCase(),
    ct: address.city?.toLowerCase().replace(/\s/g, ''),
    st: address.provinceCode?.toLowerCase(),
    zp: address.zip,
    country: address.countryCode?.toLowerCase(),
  })
  // Same eventID as the SPA thank-you page, so Meta dedupes if both fire.
  fbq(
    'track',
    'Purchase',
    {
      value,
      currency,
      content_type: 'product',
      content_ids: items.map((item) => item.item_id),
      contents: items.map((item) => ({ id: item.item_id, quantity: item.quantity })),
      num_items: items.reduce((sum, item) => sum + item.quantity, 0),
    },
    { eventID: orderId },
  )
})
```

## Verify after a real order

1. **Meta Events Manager → Pixel `1274109674861464` → Test events** (or Overview): `Purchase` with value, plus `PageView` / `AddToCart` / `InitiateCheckout` from www.
2. **Google Ads → Goals → Conversions → Summary**: the purchase action moves to **Recording conversions** within a few hours; **Diagnostics** shows enhanced-conversion coverage.
3. **GA4 → Realtime**: `purchase` with the order value.

## Limits

- Checkout can't see the site's `_gcl_aw` / `_fbc` click cookies, so attribution leans on enhanced conversions / advanced matching (email, phone, address). Google's **Google & YouTube** and Meta's **Facebook & Instagram** Shopify apps add server-side matching (Conversions API) if match rates come back low.
- GA4 funnel steps (`view_item`, `add_to_cart`, `begin_checkout`) reach GTM's dataLayer but the `GTM-PPTR6V3B` container has no GA4 event tags for them yet; add a GA4 Event tag on those custom events in GTM.

## Manual SPA validation

`https://www.sundayrollsgolf.com/order/thank-you?transaction_id=TEST-test-1&value=80`

Fires `purchase` in GTM (GA4 + the Google Ads conversion tag) and Meta `Purchase`, using the cart stashed at `begin_checkout` when available. It's a real conversion, so only use it with Meta's Test events open and expect one extra Ads conversion.
