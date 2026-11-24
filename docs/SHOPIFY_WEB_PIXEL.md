# Shopify web pixel → GA4, Google Ads and Reddit purchase

Checkout finishes on **Shopify** (`shop.sundayrollsgolf.com`), where GTM doesn't run, so the SPA never sees `purchase`. This **Customer events** custom pixel sends each paid checkout to GA4, Google Ads and the Reddit Pixel.

**Meta `Purchase` comes only from Shopify's Facebook & Instagram app** (browser + Conversions API). This pixel and the SPA thank-you page used to send it too, each with a different event ID than the app, so Meta couldn't match them and counted sales about twice (135 Purchase events for ~50 orders, Nov 2–17, 2026). Don't add Meta back here.

The SPA (`src/lib/gtm.ts`) covers everything before checkout: GTM (GA4 + Google Ads remarketing / conversion linker) the Meta Pixel (`PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Lead`, `Contact`) and the Reddit Pixel (`PageVisit`, `ViewContent`, `AddToCart`, `SignUp` for newsletter, `Lead` for the contact form).

**Reddit `Purchase` comes only from this pixel.** The SPA never sends it, and Reddit's Shopify apps can't be used: they install through a Shopify theme, which the headless site doesn't run.

| Platform | ID |
|----------|----|
| GA4 | `G-YK0BB0TPM4` (zeros, not the letter O; confirmed in GA4 Admin → Data streams, 2026-11-03) |
| Google Ads | `AW-17744695066`, purchase label `PznHCIOf2-EbEJqeqo1C` |
| Meta Pixel | `1274109674861464` (Purchase via the Facebook & Instagram app only) |
| Reddit Pixel | `REDDIT_PIXEL_ID` below (Reddit Ads → Events Manager); the site reads the same ID from `VITE_REDDIT_PIXEL_ID` |

## Install (Shopify Admin)

1. **Settings → Customer events.** If an older `Sunday Rolls GA4` pixel exists, **Disconnect** it so purchases aren't counted twice.
2. **Add custom pixel** → name it `Sunday Rolls purchase`.
3. Paste the script below.
4. Permission: **Not required** (or per your privacy policy). Data sale: **Data collected does not qualify as data sale**.
5. **Save → Connect**.

## Pixel script

```javascript
const GA4_MEASUREMENT_ID = 'G-YK0BB0TPM4'
const ADS_ID = 'AW-17744695066'
const ADS_PURCHASE_LABEL = 'PznHCIOf2-EbEJqeqo1C'
const REDDIT_PIXEL_ID = 'PASTE_REDDIT_PIXEL_ID'

// Reddit base code (queues calls until pixel.js loads)
!(function (w, d) {
  if (!w.rdt) {
    const p = (w.rdt = function () {
      p.sendEvent ? p.sendEvent.apply(p, arguments) : p.callQueue.push(arguments)
    })
    p.callQueue = []
    const t = d.createElement('script')
    t.src = 'https://www.redditstatic.com/ads/pixel.js'
    t.async = true
    d.head.appendChild(t)
  }
})(window, document)

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

  // Customer details power Google enhanced conversions. Checkout runs in a sandbox that
  // can't read the site's ad-click cookies, so this is what ties the sale back to the ad.
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
  // The site copies GA4's visitor and session IDs onto the cart at the checkout click
  // (`_sr_ga_cid` / `_sr_ga_sid`, src/lib/ga-ids.ts). Sending the purchase under them ties
  // it to the visit and its traffic source (Organic Search, Paid, Social...) instead of a
  // new visitor with no source.
  const attrs = {}
  for (const a of checkout.attributes || []) attrs[a.key] = a.value
  if (attrs._sr_ga_cid) {
    const ids = { send_page_view: false, client_id: attrs._sr_ga_cid }
    if (attrs._sr_ga_sid) ids.session_id = attrs._sr_ga_sid
    gtag('config', GA4_MEASUREMENT_ID, ids)
  }
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

  // Reddit: checkout can't see the site's Reddit cookie, so email and phone tie the sale to
  // the ad click. conversionId = order ID, so a retried event isn't counted twice.
  rdt('init', REDDIT_PIXEL_ID, {
    optOut: false,
    useDecimalCurrencyValues: true,
    email,
    phoneNumber: phone,
  })
  rdt('track', 'Purchase', {
    conversionId: orderId,
    value,
    currency,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    products: items.map((item) => ({ id: item.item_id, name: item.item_name })),
  })
})
```

## Verify after a real order

1. **Meta Events Manager → Pixel `1274109674861464` → Overview → Purchase**: one event per order, from the Facebook & Instagram app (Browser + Server), with no deduplication warning. `PageView` / `ViewContent` / `AddToCart` / `InitiateCheckout` still come from www.
2. **Google Ads → Goals → Conversions → Summary**: the purchase action moves to **Recording conversions** within a few hours; **Diagnostics** shows enhanced-conversion coverage.
3. **Reddit Ads → Events Manager → your pixel**: one `Purchase` per order with its value. `PageVisit` / `ViewContent` / `AddToCart` come from www.
4. **GA4 → Realtime**: `purchase` with the order value.
5. **Purchase source (GA4 visitor IDs):** the order in Shopify Admin shows `_sr_ga_cid` / `_sr_ga_sid` under **Additional details** (hidden from the buyer). A day later, **GA4 → Reports → Acquisition → Traffic acquisition** shows the purchase under the visit's channel (e.g. Organic Search) instead of Direct / "(not set)".

## Limits

- Purchases only keep their GA4 traffic source when the visitor came through the site's cart (the checkout button stamps `_sr_ga_cid` / `_sr_ga_sid`). Buy-now links straight to Shopify, or visitors who block GA cookies, still show as Direct.

- Checkout can't see the site's `_gcl_aw` / `_fbc` / Reddit click cookies, so Reddit matches purchases by email and phone (advanced matching), and so Google attribution leans on enhanced conversions (email, phone, address). Meta's Facebook & Instagram app handles its own matching through the Conversions API.
- GA4 funnel steps (`view_item`, `add_to_cart`, `begin_checkout`, …) are sent by GTM before checkout; see [ANALYTICS.md](./ANALYTICS.md#live-gtm-container-gtm-pptr6v3b).

## Manual SPA validation

`https://www.sundayrollsgolf.com/order/thank-you?transaction_id=TEST-test-1&value=80`

Fires `purchase` in GTM (GA4 + the Google Ads conversion tag), not Meta, using the cart stashed at `begin_checkout` when available. It's a real conversion, so expect one extra Ads conversion.
