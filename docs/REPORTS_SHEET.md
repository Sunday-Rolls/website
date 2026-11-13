# Reports sheet (Google Sheets export)

The dashboard writes its combined data into a Google Sheet so anyone on the team can build reports
(pivot tables, charts, formulas) without touching the Sales Tracker or the database.

## What gets written

Railway owns only the tabs whose names start with **`Data · `** and rewrites them in full on every
run. Any other tab in the sheet is yours: build reports there with formulas that point at the Data
tabs (for example `=SUMIFS('Data · Orders'!H:H, 'Data · Orders'!C:C, "Etsy")`). Don't edit the
Data tabs by hand; changes are overwritten.

| Tab | One row per | Columns |
|-----|-------------|---------|
| `Data · About` | — | Last updated time and row counts |
| `Data · Orders` | order | Date, Month, Channel, Source, Order, Products, Units, Revenue, Fees, Shipping, Marketing, Net, Customer (New/Returning), State, Traffic source |
| `Data · Order lines` | product line | Date, Month, Channel, Order, Product, Category, SKU, Quantity, Unit price, Line revenue |
| `Data · Products by month` | month × product | Month, Product, Category, Units, Revenue, Orders |
| `Data · Ad spend` | day × platform × campaign | Date, Month, Platform (Google Ads / Meta Ads / Etsy Ads), Campaign, Spend, Platform-reported sales/orders, Sessions |
| `Data · Traffic` | day | GA4 visits, unique visitors, product views, add to carts, checkouts, purchases |
| `Data · Traffic sources` | day × source | Date, Month, Source / medium, Sessions |

Orders are deduped exactly like the dashboard (live Shopify and Squarespace CSV rows beat Sales
Tracker copies) and use the same product names, so "Website sale (design not recorded)" etc. appear
where the Sales Tracker only says "Headcover". Customer emails are not written.

## When it updates

- After every dashboard sync (it waits for the other sources, then exports; shown as "Reports
  sheet" in the sync list), at most every 10 minutes.
- On its own every `REPORTS_SHEET_INTERVAL_MINUTES` (default 360 = 6 hours): it syncs any stale
  source, then exports, so the sheet stays current even when nobody opens the dashboard. Set `0`
  to turn the timer off.

## Setup

1. Create a Google Sheet, e.g. **Sunday Rolls Reports**.
2. Share it as **Editor** with the service account's `client_email` (the same account that reads
   the Sales Tracker; it's in `GOOGLE_SERVICE_ACCOUNT_JSON`, ends in `.iam.gserviceaccount.com`).
   Untick "Notify people".
3. Railway → `contact-api` → Variables → `REPORTS_SHEET_ID` = the sheet's URL or id. Deploy.
4. Open the dashboard. The "Reports sheet" row should say e.g. `7 tabs · 1,234 rows`.

Errors show on that row. `Google Sheets 403 … share the reports sheet with …` means step 2 is
missing or the id is wrong.
