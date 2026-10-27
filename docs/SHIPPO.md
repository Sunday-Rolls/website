# Shippo shipping (Shopify)

Sunday Rolls fulfills website orders with **[Shippo](https://apps.shopify.com/shippo)** — buy labels in Shippo, sync tracking back to Shopify. This SPA does not buy labels or talk to carriers.

**Official guide:** [Use Shopify with Shippo](https://support.goshippo.com/hc/en-us/articles/360029218511-Use-Shopify-with-Shippo)

## Current store status (`chrgrk-ff`, checked 2026-10-27)

| Item | Status |
|------|--------|
| Shippo app installed | **No** — not in app installations |
| Fulfillment service | Manual only |
| Carrier services (live checkout rates) | None |
| Checkout shipping | Flat rates on Domestic zone: Standard **$8**, Standard **$0**, Express **$15** |
| Fulfillment location | `Shop location` — Minnesota `55419`, **street address missing** (fix before Shippo sync) |

## Setup checklist (one-time)

Needs a **Shopify store owner / staff** who can install apps, plus a Shippo account (existing Sunday Rolls account preferred).

### 1. Fix the Shopify location address

Shippo can only push fulfillment/tracking when the label sender is an **imported Shopify location** with inventory.

1. Shopify Admin → **Settings → Locations** → `Shop location`
2. Set a full street address (and confirm city / ZIP `55419`)
3. Confirm **Fulfill online orders** is on

### 2. Install and connect Shippo

1. Open the [Shippo Shopify app](https://apps.shopify.com/shippo) while logged into `chrgrk-ff`
2. **Add app** → authorize
3. Or from Shippo: **Settings → Stores → Shopify** → enter `chrgrk-ff.myshopify.com` → Continue
4. Confirm recent orders appear on Shippo’s **Orders** page

### 3. Enable Shopify sync in Shippo

Shippo → **Settings → Stores → Manage**:

- [x] **Sync tracking numbers on Shopify** (marks order fulfilled + writes tracking)
- [x] **Send Shopify notification to the customer** (unless you prefer Shippo’s email)
- [ ] **Include POS orders** — leave off unless needed

Save.

### 4. Product fulfillment mode

Every line item that Shippo should fulfill must use **manual fulfillment** in Shopify (default for this store’s Manual service). If any item is set to automatic fulfillment, Shippo cannot update the whole order.

### 5. Package presets (recommended)

In Shippo, save weight/dimension presets for headcovers / towels so label buys are one click. Client supplies typical box sizes if not already known.

### 6. Smoke test

1. Place a small paid or $0 test order on the storefront
2. Confirm it imports into Shippo
3. Buy a cheap label (or void after test if supported)
4. In Shopify Orders, confirm **Fulfilled** + tracking
5. Confirm the customer shipping email fired (if enabled)

## Day-to-day ops

1. New paid orders appear in [Shopify Orders](https://admin.shopify.com/store/chrgrk-ff/orders) and import into Shippo
2. In **Shippo**, open the order → package weight/dims → pick rate → **Buy label** → print
3. Tracking + fulfilled status sync back to Shopify; customer gets the notification
4. Refunds / cancellations still happen in **Shopify** on the order page

Checkout **rates customers pay** are still configured in Shopify (**Settings → Shipping and delivery**) unless you later add Shippo (or another carrier) as a live rate provider. Flat rates above are independent of what you pay for a Shippo label — watch margin.

## Ownership

| Piece | Owner |
|-------|--------|
| Shippo account + payment method for labels | Sunday Rolls |
| Install app / connect store | Us with store staff login, or client |
| Location address + shipping zones / flat rates | Client rates; we help configure |
| Daily label buy / pack / drop-off | Client (store ops) |
| This website codebase | No Shippo API — labels stay in Shippo |

## Troubleshooting (Shippo → Shopify not updating)

From Shippo’s docs, check in order:

1. All items on the order use **manual** fulfillment
2. Label **sender** is the imported Shopify location (not a manually typed Shippo address)
3. Inventory is assigned to that location for every item on the label
4. Order isn’t split with a third-party / dropship fulfiller for other lines

Re-sync: Shippo Orders → **Sync Orders** (also refreshes locations within ~5 minutes of Shopify address edits).
