# Sunday Rolls

Headless Shopify storefront for sundayrollsgolf.com: React 19 + Vite SPA at the repo root, Hono API + internal dashboard under `server/` (Railway `contact-api` + Postgres). Store `chrgrk-ff`; checkout runs through the Shopify Storefront API, not a Liquid theme.

## Start here
- New admin or developer, or anyone asking about handoff, setup, orders, fulfillment, discounts or review QRs: use the `admin-handoff` skill (`/admin-handoff`). Its source of truth is `docs/admin-handoff.html`. Keep the two in sync.
- Overview, commands and the toolchain are in `README.md`. Runbooks are in `docs/` (Shippo, review QRs, analytics, contact email, Railway cutover, dashboard access) and `server/README.md`.

## Tools
- `.mcp.json` provides `shopify` (store admin), `shopify-dev` (docs + GraphQL validation), `railway`, `chrome-devtools` and `google-drive`. `.claude/settings.json` enables Shopify's AI Toolkit plugin. If a server is missing or unauthenticated, point the user at README → "Claude tools (MCP)" rather than working around it.
- Shopify and Railway changes affect the live store. Read freely, but confirm with the user before any write (discounts, refunds, fulfillments, products, env vars, deploys).

## Commands
- SPA: `npm run dev`, `npm test`, `npm run lint`, `npm run build`
- API: `cd server && npm run dev` (dashboard at `http://localhost:3001/dashboard/`), `cd server && npm test`
- E2E: `npm run test:e2e`; the full order flow is `npm run test:e2e:order-analytics` (see `docs/E2E_ORDER_ANALYTICS.md` first: it toggles the Bogus Gateway on the real store)

## Workflow
- Branch from `main` and open a PR. Actions deploys a preview to `https://sunday-rolls.github.io/website/previews/pr-N/`. Merging to `main` updates the Pages site and Railway `website`, and changes under `server/**` autodeploy `contact-api`.
- Run tests and lint for the area you touched before opening a PR.

## Rules
- Never invent, paste or commit secrets. Values come from Railway env, Shopify Admin or the team; start from `.env.example` / `server/.env.example`.
- This SPA doesn't buy shipping labels or manage discount codes. Those live in Shippo and Shopify Admin.
- Staff sign-ins (Shopify, Shippo, Google) are browser OAuth the user completes themselves.
- Don't commit `test-results/`, `output/` or browser profiles.
