---
name: admin-handoff
description: >-
  Guide Sunday Rolls admins and developers through site operations (Shopify
  orders, fulfillment, discounts, review QR codes, dashboard sync) and the
  developer toolchain / first-time setup / PR-preview-to-production workflow.
  Use when the user mentions handoff, administer the site, Shopify ops,
  fulfillment, discount codes, review QR, dashboard access, A/B tests or
  experiments (start, pause, stop, promote, results), first-time setup,
  guided setup, toolchain, Claude Code/GitHub setup, or how to ship a
  feature branch.
---

# Sunday Rolls admin handoff

## Source of truth

1. Read [`docs/admin-handoff.html`](../../../docs/admin-handoff.html) — the interactive handoff page with Operations and Workflow tracks and their checklists. If you change it, keep this skill in sync.
2. Deep docs (do not duplicate): `docs/DASHBOARD_ACCESS.md`, `docs/SHIPPO.md`, `docs/REVIEW_QR_CODES.md`, `docs/SHOPIFY_WEB_PIXEL.md`, `docs/CONTACT_EMAIL.md`, `docs/RAILWAY_CUTOVER.md`, `docs/ANALYTICS.md`, `docs/E2E_ORDER_ANALYTICS.md`, `docs/AB_TESTING_PLAN.md`, `docs/EXPERIMENTS_CONTRACT.md`, `server/README.md`.

## Start every session

Ask which track they need:

- **Operations** — day-to-day store admin (Shopify + Railway dashboard, including A/B tests)
- **Workflow** — install, toolchain, ship a change

If unclear, default to Operations for non-dev language (“orders”, “discounts”, “QR”) and Workflow for “setup”, “clone”, “PR”, “deploy”.

## Operations track

Explain the two hubs, then go deep only on what they asked:

| Hub | Job |
|-----|-----|
| Shopify Admin `https://admin.shopify.com/store/chrgrk-ff` | Orders, refunds, discounts, products, checkout shipping rates |
| Shippo ([app](https://apps.shopify.com/shippo)) | Buy/print labels; sync tracking + fulfilled back to Shopify |
| Dashboard `https://contact-api-production-9af6.up.railway.app/dashboard/` | Syncs on open (Refresh to force), Sales, Products, Marketing, Money (P&L), Tools: review QR PDF, manual entries, checks |

Key facts:

- This SPA does **not** buy labels or manage discount codes — Shippo + Shopify.
- Shipping setup runbook: `docs/SHIPPO.md`. As of 2026-10-27 Shippo was **not** installed on `chrgrk-ff`; location street address incomplete.
- Day-to-day: order in Shopify → label in Shippo → tracking syncs; refunds stay in Shopify.
- Website sales source of truth: Shopify → dashboard (syncs automatically on open; **Refresh** in the header forces it).
- Review QRs: Dashboard → Tools → Review QR codes → Download QR code PDF (preferred). CLI: `npm run reviews:qr:pages` / `reviews:qr:live`.
- Contact mail: Resend → `CONTACT_TO_EMAIL`; see `docs/CONTACT_EMAIL.md`.
- With the `shopify` MCP connected, you can look up orders, products and discounts directly. Confirm with the user before any write (discounts, refunds, fulfillments).
- Never invent or paste secrets. Point at Railway env, `.env.example`, or Shopify Admin.
- Installing Shippo requires a human Shopify staff login (browser OAuth) — guide them; you cannot finish authorize alone.
- Full order→dashboard E2E: `docs/E2E_ORDER_ANALYTICS.md`. Needs staff Admin login (2FA/storageState caveats), storefront password, and dashboard credentials. The test enables Bogus Gateway at start and deactivates it in `finally` — if teardown fails, deactivate Bogus manually in Settings → Payments.

### A/B tests (Dashboard → Experiments)

Tests arrive as **drafts** from PRs labelled `ab-test` and are merged **dark** (everyone sees `control`). Any dashboard user can act on them; each action asks for confirmation and is written to the audit log. Background: `docs/AB_TESTING_PLAN.md` §8–9. Building one is `/website-change` → "Run it as an A/B test".

| Action | When | Effect |
|--------|------|--------|
| **Start** | After the PR has merged and the site has redeployed | Draft → running. Refused while another running test targets the same page. |
| **Pause / Resume** | Something looks broken | Paused: everyone sees control, counting freezes. Resume keeps each visitor's arm. |
| **Stop** | Verdict is no difference or guardrail fail, or it has passed `maxDays` | Ends with no winner; everyone sees control; opens a GitHub cleanup issue. |
| **Promote `<arm>`** | Verdict is winner | Everyone sees that arm right away (no deploy); opens a cleanup issue. Archive it once the cleanup PR merges. |

Reading the verdict on the detail page:

- **Early**: the gate isn't met yet (at least `minDays`, default 14, and `minVisitorsPerArm`, default 1000, in every arm). Numbers are greyed; don't act on them.
- **Winner**: an arm has ≥ 95% chance to beat control on the primary metric and no guardrail is failing → Promote it.
- **No difference**: gate met, no clear winner → Stop (control stays), unless there's another reason to prefer the new arm.
- **Guardrail fail**: an arm is ≥ 80% likely to hurt purchase rate or revenue per visitor → Stop.
- **SRM fail**: the traffic split doesn't match the weights, which means a bug (bots, caching, assignment). Don't trust the results; Pause and tell a developer.

Run the `aa-check` A/A test first (two identical arms on `/`): expect **No difference** and no SRM warning. The GitHub side's one-time setup (label, `EXPERIMENTS_CI_TOKEN`, optional `EXPERIMENTS_API_URL`, `GITHUB_DISPATCH_TOKEN`) is in README → "A/B tests"; each item is a live change to confirm with the owner first.

## Workflow track (guided setup)

Walk **one step at a time**. After each step, wait for confirmation before the next. Suggest they tick the matching checklist row on the handoff page's Workflow tab.

1. Confirm Node 22+ (`node -v`).
2. Confirm repo open: `Sunday-Rolls/website` (local path may vary).
3. Root env: copy `.env.example` → `.env` if missing; fill Shopify/GTM/contact values from the team or Railway — do not invent tokens.
4. Server env: copy `server/.env.example` → `server/.env` if missing.
5. `npm install` at repo root, then `cd server && npm install`.
6. Start SPA: `npm run dev`. Start API: `cd server && npm run dev`.
7. Open the Vite URL and `http://localhost:3001/dashboard/`.
8. Connect Claude tools (README → *Claude tools (MCP)*): approve the project MCP servers and the Shopify plugin when prompted, run `/mcp` and authenticate `shopify` with their Shopify staff login, `railway login` for Railway. Google Drive is optional and needs a GCP OAuth client file. They complete each browser sign-in themselves.

### Ship walkthrough (when they have an idea)

Hand off to the `website-change` skill (`/website-change`), which runs these steps through `/start-feature`, `/open-preview` and `/merge-feature`. The outline:

1. Branch from `main`.
2. Implement; run `npm test` / `npm run lint` (and server tests if touching `server/`).
3. Open a PR → Actions deploys preview `https://sunday-rolls.github.io/website/previews/pr-N/`.
4. Review the preview URL together.
5. Merge to `main` → Pages site updates; `server/**` also autodeploys Railway `contact-api`.
6. To ship it as an A/B test instead, `/website-change` has a "Run it as an A/B test" path (registry file, `ab-test` label, merge dark, Start from the dashboard).
7. Mention Railway `website` + DNS cutover is the production-domain target — `docs/RAILWAY_CUTOVER.md`.

## Toolchain links

- Claude Code: https://docs.anthropic.com/en/docs/claude-code
- GitHub repo: https://github.com/Sunday-Rolls/website
- Live site: https://www.sundayrollsgolf.com
- Demo Pages: https://sunday-rolls.github.io/website/

## Style

- Concise; prefer handoff page + docs links over long pasted runbooks.
- Open files with the editor when pointing at a doc.
- No commits unless the user asks.
