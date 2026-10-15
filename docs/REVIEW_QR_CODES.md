# Product review QR codes

Generate printable QR codes that open a product page with the leave-a-review form (`?review=1`).

## Quick start

```bash
# GitHub Pages (current default)
npm run reviews:qr:pages

# Live domain — use after www.sundayrollsgolf.com is serving the SPA
npm run reviews:qr:live
```

Output lands in `output/product-review-qrs/` (gitignored):

| File | Purpose |
|------|---------|
| `*.png` | Individual QR images |
| `print-sheet.html` | Browser sheet with **Export PDF** button |
| `sunday-rolls-review-qrs.pdf` | All codes in one letter-size PDF |
| `manifest.json` | Handles, titles, and landing URLs |

## Export PDF (dashboard — preferred)

1. Open the analytics dashboard → **Data**.
2. Under **Review QR codes**, pick **GitHub Pages** or **Live site**.
3. Click **Export PDF**.

Requires a logged-in dashboard session. Endpoint: `GET /dashboard/api/review-qrs.pdf?target=pages|live`.

## Export PDF (local CLI)

1. Run `npm run reviews:qr:pages` (or `:live`) from the repo root.
2. Open `output/product-review-qrs/print-sheet.html` and click **Export PDF**, or use `sunday-rolls-review-qrs.pdf` directly.

## Targets

| `SITE_TARGET` | Landing base |
|---------------|--------------|
| `pages` (default) | `https://sunday-rolls.github.io/website/products/{handle}?review=1` |
| `live` | `https://www.sundayrollsgolf.com/products/{handle}?review=1` |

Override with `SITE_URL` + `SITE_BASE_PATH` if needed. See `.env.example`.

## Notes

- Includes **all active products** (headcovers, towels, etc.). Dashboard pulls from live Shopify when configured; CLI/catalog include the full catalog.
- CLI: set `HEADCOVERS_ONLY=1` to limit to headcovers.
- Codes hit the product review form on the site; submitted reviews go to Railway Postgres + Resend email ([CONTACT_EMAIL.md](./CONTACT_EMAIL.md)).
