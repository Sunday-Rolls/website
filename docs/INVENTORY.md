# Inventory page

The dashboard's **Inventory** page shows how many of each product are on hand right now:

**On hand = starting count + shipments − units sold on every platform since the count.**

It isn't tied to the date range at the top of the dashboard. It always shows stock as of the last sync.

## Where the numbers come from

| What | Where it lives | How it gets to the dashboard |
|---|---|---|
| SKU list (product, style, category) | Sales Tracker → `SKUs` tab | Sales Tracker sync |
| Starting counts and shipments | Sales Tracker → `Inventory In` tab | Sales Tracker sync |
| Shopify sales | Shopify orders (each line has a SKU) | Shopify sync |
| Etsy sales | Etsy receipts (each line has a SKU) | Etsy sync |
| eBay sales | Sales Tracker → `eBay` tab, `SKU` column (S) | Sales Tracker sync |
| In-person / Instagram / FB sales | Sales Tracker → `Other` tab, `SKU` column (M) | Sales Tracker sync |
| Listed quantity on Shopify | Shopify product variants | Shopify sync |
| Listed quantity on Etsy | Etsy listing inventory (per variation SKU) | Etsy sync |

All three syncs run when the dashboard opens and on **Refresh**.

## Day-to-day

- **New shipment arrives:** add a row on `Inventory In` with the date, the SKU (dropdown), the quantity and Type `Shipment`.
- **Recount / correction:** add a row with Type `Adjustment` and a positive or negative quantity (for example −2 for damaged covers). Don't edit old rows.
- **eBay or in-person sale:** fill the `SKU` column on that row of the `eBay` or `Other` tab. Each row counts as one unit.
- **New product:** add it to the `SKUs` tab, give it the same SKU on Shopify, Etsy and eBay, and add a `Starting count` row on `Inventory In`.

### SKU format

`SR-<DESIGN>-<STYLE>[-<COLOR>]`. Style is `DF3` (L.A.B. DF3, keyhole back), `MAL` (heel-shaft mallet / Spider, U-slot back) or `OZ` (L.A.B. OZ1i and Mezz.1). Towels are `SR-TOWEL-<COLOR>`. The same SKU must be on the product in Shopify, the Etsy listing (or its variation) and the eBay listing's Custom label.

## How the math works

- **Count date** per SKU is the earliest `Starting count` row for it. Sales on or after that date are subtracted, so date the count as the day you counted, before any sales went out that day.
- **Received** is every `Inventory In` row for the SKU from the count date on.
- **Weeks left** = on hand ÷ (units sold in the last 28 days ÷ 4). It's blank when nothing sold in the last 4 weeks.
- **Low stock** is 10 or fewer on hand (`LOW_STOCK` in `server/src/analytics/inventory.ts`).
- **Listings to fix** counts SKUs where Shopify's or Etsy's listed quantity differs from on hand. eBay's listed quantity isn't connected yet.
- A SKU with no dated `Starting count` row shows **Not counted** and isn't in the totals.

## When something looks wrong

| You see | Likely cause | Fix |
|---|---|---|
| A sale under **Sales without a SKU** | The sale's line has no SKU, or one that isn't on the `SKUs` tab | Add the SKU to the product/listing (Shopify, Etsy) or the sheet row (eBay, Other). Shopify lines without a SKU are also matched by product title. |
| A yellow warning about rows with no date | An `Inventory In` row has a quantity but no date | Add the date. Undated rows are skipped. |
| A warning about a SKU not on the SKUs tab | Typo on `Inventory In` | Pick the SKU from the dropdown. |
| On hand is off by the sales of one day | Count date is the day after you counted | Change the count row's date. |
| Shopify listed column is all "—" | The Shopify sync couldn't read variants (the sync message in Tools → Connections says "stock skipped") | Check the Shopify app has product and inventory read access. |
| Etsy listed column is all "—" | Etsy listings couldn't be read (Tools → Connections lists "inventory" or "listings" as skipped) | See `docs/ETSY_SYNC.md` → Tokens. |

## Code

- `server/src/analytics/inventory.ts`: parsing the sheet tabs, merging Etsy receipts, and the on-hand math (`buildInventoryView`). Tests in `inventory.test.ts`.
- Sync hooks: `workbook.ts` + `sales-tracker-sync.ts` (sheet), `etsy-sync.ts` (Etsy sales and listing stock), `shopify-sync.ts` (Shopify stock).
- `GET /dashboard/api/inventory` in `server/src/dashboard/routes.ts`.
- Page: `server/src/dashboard/ui/pages/inventory.js`.
- Data is stored in `analytics_integration_state` under the keys `inventory-sheet`, `inventory-etsy` and `inventory-shopify` (no tables of its own). Etsy sales are kept by receipt there because the Sales Tracker's Etsy rows replace the live Etsy orders and don't carry SKUs.
- Demo mode loads example inventory from `inventory-demo.ts`.
