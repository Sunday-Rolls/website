# Sunday Rolls

Headless Shopify storefront for [sundayrollsgolf.com](https://www.sundayrollsgolf.com) — React + Vite on Railway, with a Hono API for contact, reviews, and the internal analytics dashboard.

<p align="left">
  <a href="https://github.com/Sunday-Rolls/website/actions/workflows/deploy-staging.yml"><img src="https://github.com/Sunday-Rolls/website/actions/workflows/deploy-staging.yml/badge.svg" alt="Deploy GitHub Pages" /></a>
  <a href="https://github.com/Sunday-Rolls/website/actions/workflows/server-tests.yml"><img src="https://github.com/Sunday-Rolls/website/actions/workflows/server-tests.yml/badge.svg" alt="Server tests" /></a>
  <img src="https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white" alt="Node 22" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Shopify-Storefront_API-96BF48?logo=shopify&logoColor=white" alt="Shopify" />
  <img src="https://img.shields.io/badge/Railway-website_+_API-0B0D0E?logo=railway&logoColor=white" alt="Railway" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

| | |
|---|---|
| **Live site** | [www.sundayrollsgolf.com](https://www.sundayrollsgolf.com) |
| **Railway SPA** | [website-production-6c04.up.railway.app](https://website-production-6c04.up.railway.app) |
| **Demo / Pages** | [sunday-rolls.github.io/website](https://sunday-rolls.github.io/website/) |
| **Dashboard** | [Railway `/dashboard/`](https://contact-api-production-9af6.up.railway.app/dashboard/) |
| **Shopify Admin** | [chrgrk-ff](https://admin.shopify.com/store/chrgrk-ff) |
| **Repo** | [Sunday-Rolls/website](https://github.com/Sunday-Rolls/website) |

> **Admin handoff** — open [`docs/admin-handoff.html`](docs/admin-handoff.html) in a browser (Operations + Workflow tracks), or ask Claude Code for a *guided setup* / *admin handoff* (skill: `.claude/skills/admin-handoff/`, or `/admin-handoff`).

---

## What this is

| Layer | Role |
|-------|------|
| **Storefront** | React 19 + TypeScript + Vite + Tailwind + React Router |
| **Commerce** | Shopify Storefront API (headless checkout — not a Liquid theme) |
| **Production SPA** | Railway `website` → rebuilds on merge to `main` |
| **API + dashboard** | Hono on Railway `contact-api` + Postgres |
| **PR previews** | GitHub Pages under `/website/previews/pr-N/` |
| **Demo site** | GitHub Pages `/website/` (updates on merge) |

Day-to-day commerce (orders, refunds, discounts, catalog) lives in **Shopify Admin**. Labels are bought in **Shippo** and sync tracking back to Shopify. Analytics sync, P&L, and review QR PDFs live on the **Railway dashboard**. This SPA does not buy labels or manage discount codes.

---

## Architecture

```text
  Browser ──► Railway website (SPA) ──► Shopify Storefront API (checkout)
                 │
                 └──► Railway contact-api ──► Postgres
                          │                   Resend (contact mail)
                          └── /dashboard/     GA4 / Shopify sync
```

DNS cutover for `www` + `dashboard.` subdomain: [`docs/RAILWAY_CUTOVER.md`](docs/RAILWAY_CUTOVER.md).

---

## Getting started

**Requires:** Node **22+**, npm, and env values from the team / Railway / Shopify Admin. Never invent or commit secrets.

### 1. Clone and env

```bash
git clone https://github.com/Sunday-Rolls/website.git
cd website

cp .env.example .env                 # storefront (Shopify, GTM, contact API)
cp server/.env.example server/.env   # API + dashboard
```

Fill `.env` and `server/.env` from Railway variables or a teammate — leave placeholders blank rather than guessing tokens.

### 2. Install

```bash
npm install
cd server && npm install && cd ..
```

### 3. Run locally

```bash
# Terminal A — storefront (Vite prints the local URL)
npm run dev

# Terminal B — API + dashboard
cd server && npm run dev
# → http://localhost:3001/dashboard/
# → http://localhost:3001/health
```

### Setup checklist

- [ ] Node 22+ (`node -v`)
- [ ] Repo open in Claude Code / your editor
- [ ] Root `.env` from `.env.example`
- [ ] `server/.env` from `server/.env.example`
- [ ] `npm install` at root and in `server/`
- [ ] SPA + API both running
- [ ] Storefront loads; dashboard opens at `/dashboard/`
- [ ] Claude tools connected (see [Claude tools](#claude-tools-mcp))

Prefer a guided walkthrough? Ask Claude Code to run the **admin-handoff** skill (`/admin-handoff`).

---

## Workflows

### Idea → preview → production

```text
feature branch  →  PR  →  Pages preview  →  merge main
                              │                  │
                              ▼                  ├── Pages demo updates
                     /website/previews/pr-N/     ├── Railway website rebuilds
                                                 └── server/** → contact-api redeploy
```

1. **Branch** from `main` — `git checkout -b feature/your-idea`
2. **Build locally** — both servers; `npm test` / `npm run lint` (and `cd server && npm test` if you touched the API)
3. **Open a PR** — Actions deploys a public preview and comments the URL on the PR
4. **Review** — `https://sunday-rolls.github.io/website/previews/pr-N/` (private repo; preview links are public — safe to send clients)
5. **Merge** — Pages demo updates; Railway `website` rebuilds the production SPA; `server/**` changes autodeploy `contact-api`

In Claude Code, `/website-change <what you want>` walks this whole loop. The steps are also separate skills in `.claude/skills/`:

| Skill | Does |
|-------|------|
| `/start-feature` | Fresh branch off the latest `main` |
| `/open-preview` | Checks, commit, push, open or update the PR, wait for the build, return the preview link |
| `/merge-feature` | After you confirm approval: merge to `main`, watch the deploy, clean up the branch |

Custom domain cutover (`www.sundayrollsgolf.com` → Railway, `dashboard.sundayrollsgolf.com` → API): [`docs/RAILWAY_CUTOVER.md`](docs/RAILWAY_CUTOVER.md).

### A/B tests

A change can ship **dark** behind an experiment flag and be started, paused, stopped or promoted from Dashboard → Experiments without a deploy. Plan and reasons: [`docs/AB_TESTING_PLAN.md`](docs/AB_TESTING_PLAN.md); exact formats shared by the SPA, `serve-spa` and `contact-api`: [`docs/EXPERIMENTS_CONTRACT.md`](docs/EXPERIMENTS_CONTRACT.md).

- **Developer:** add `src/experiments/<key>.json` (schema `src/experiments/schema.json`, example `aa-check.json`), gate the change with `<Variant>` / `useVariant` from `@/components/experiments` or a content-JSON `experiments` block, and label the PR `ab-test`. `/website-change` walks it ("Run it as an A/B test"). `npm test` fails if a key used in `src/` has no valid registry file.
- **CI:** [`.github/workflows/experiments.yml`](.github/workflows/experiments.yml) (logic in `.github/scripts/experiments.mjs`, tests: `node --test .github/scripts/*.test.mjs`) checks the registry, comments one `?sr_force=<key>:<arm>` preview link per arm, creates a draft in the dashboard, marks it merged or archives it when the PR closes, and opens a cleanup issue when a test is promoted or stopped (plus a weekly check for concluded tests still in code). PRs without the label are skipped.
- **Operators:** `/admin-handoff` → Operations → "A/B tests".

**One-time setup (each is a live change: confirm with the owner before applying it).** Until 1–2 are done, the workflow still validates and comments previews, and says the dashboard sync is not set up.

1. GitHub label `ab-test` on `Sunday-Rolls/website` (Issues → Labels → New label).
2. GitHub Actions secret `EXPERIMENTS_CI_TOKEN`: a long random value, identical to the `EXPERIMENTS_CI_TOKEN` variable on Railway `contact-api` (set both together; generate it, don't reuse another secret).
3. Optional GitHub Actions variable `EXPERIMENTS_API_URL` (no trailing slash) when `contact-api` moves off `https://contact-api-production-9af6.up.railway.app`, e.g. after the dashboard subdomain cutover.
4. Railway `contact-api` variable `GITHUB_DISPATCH_TOKEN`: a fine-grained personal access token scoped to only `Sunday-Rolls/website` with **Contents: Read and write** (the permission `POST /repos/{repo}/dispatches` requires; Metadata: Read is added automatically). It needs nothing else: the cleanup issue is opened by the workflow's own token. Set an expiry and a reminder to rotate it. Optional `GITHUB_REPOSITORY` (default `Sunday-Rolls/website`). Without the token, Promote / Stop still work but no cleanup issue is opened, so the weekly job (which needs step 2) is the fallback.

`repository_dispatch` and `schedule` only run once `experiments.yml` is on `main`.

### Operations (day-to-day)

| Job | Where |
|-----|--------|
| Orders, refunds, discounts, products | [Shopify Admin](https://admin.shopify.com/store/chrgrk-ff) |
| Buy / print shipping labels | [Shippo](https://apps.shopify.com/shippo) (syncs tracking to Shopify) |
| Sync sales / GA4, P&L, review QR PDF, Tests | [Dashboard](https://contact-api-production-9af6.up.railway.app/dashboard/) |
| Contact inbox | Resend → `CONTACT_TO_EMAIL` ([docs/CONTACT_EMAIL.md](docs/CONTACT_EMAIL.md)) |

Weekly operator loop: Shopify Orders → Shippo label → dashboard sync if numbers look stale → print review QRs when packaging. Details: handoff page **Operations** tab + [`docs/SHIPPO.md`](docs/SHIPPO.md).

---

## Scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | Vite storefront |
| `npm run build` / `build:railway` / `build:pages` | Production builds (Railway / Pages bases) |
| `npm run start:spa` | Static SPA server used on Railway (`/health` + HTML fallback) |
| `npm test` | Vitest unit tests |
| `npm run lint` | Oxlint |
| `npm run test:e2e` | Playwright |
| `npm run test:e2e:order-analytics` | Full order → dashboard E2E ([docs/E2E_ORDER_ANALYTICS.md](docs/E2E_ORDER_ANALYTICS.md)) |
| `npm run reviews:qr:pages` / `reviews:qr:live` | Review QR print assets |
| `cd server && npm run dev` | API + dashboard locally |

---

## Toolchain

| Tool | Role |
|------|------|
| [Node 22 + npm](https://nodejs.org/) | Runtime |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Coding agent for this repo (desktop app or CLI) |
| [GitHub](https://github.com/Sunday-Rolls/website) | Source, PRs, Pages previews |
| [Shopify](https://admin.shopify.com/store/chrgrk-ff) | Checkout + Admin |
| [Railway](https://railway.com/) | `website`, `contact-api`, Postgres |

### Claude tools (MCP)

The repo ships its Claude Code tooling, so a fresh clone works the same way for everyone:

- [`.mcp.json`](.mcp.json) — project MCP servers. Claude Code asks you to approve them the first time you open the repo.
- [`.claude/settings.json`](.claude/settings.json) — installs Shopify's [AI Toolkit](https://github.com/Shopify/Shopify-AI-Toolkit) plugin (Shopify docs, GraphQL/Liquid validation skills). Accept the plugin prompt on first open.
- [`.claude/skills/admin-handoff/`](.claude/skills/admin-handoff/) — the guided handoff (`/admin-handoff`).

| Server | What Claude uses it for | One-time setup |
|--------|-------------------------|----------------|
| `shopify` | Store admin: orders, products, discounts, analytics on `chrgrk-ff` | Run `/mcp` → `shopify` → Authenticate, sign in with your Shopify staff account |
| `shopify-dev` | Shopify docs search + GraphQL schema validation | None (Node 22) |
| `railway` | Logs, deploys, variables for `contact-api` / `website` | `brew install railway` then `railway login` |
| `chrome-devtools` | Headless Chrome for checking pages, console and network | None (Chrome installed) |
| `google-drive` | Devops Drive/Sheets (stock sheet, docs) | Put a GCP OAuth client at `~/.config/google-drive-mcp/gcp-oauth.keys.json`, then authenticate on first use — see [`docs/DASHBOARD_ACCESS.md`](docs/DASHBOARD_ACCESS.md) |

Check status any time with `/mcp`. Servers you don't need can stay disabled. The Shopify plugin's skill scripts send usage telemetry to shopify.dev; set `OPT_OUT_INSTRUMENTATION=true` to turn that off.

---

## Docs

| Doc | Covers |
|-----|--------|
| [`docs/admin-handoff.html`](docs/admin-handoff.html) | Interactive ops + workflow handoff |
| [`docs/RAILWAY_CUTOVER.md`](docs/RAILWAY_CUTOVER.md) | SPA + dashboard subdomain DNS cutover |
| [`docs/CUTOVER_DAY_CHECKLIST.md`](docs/CUTOVER_DAY_CHECKLIST.md) | Day-of cutover order, rollback records, E2E purchase test |
| [`docs/DASHBOARD_ACCESS.md`](docs/DASHBOARD_ACCESS.md) | Access checklist, IDs, punch list |
| [`docs/ANALYTICS.md`](docs/ANALYTICS.md) | GTM / GA4 demo vs live |
| [`docs/ADS_AND_SEO_CONFIG.md`](docs/ADS_AND_SEO_CONFIG.md) | GTM, Google Ads, Merchant Center, Search Console: IDs, change log, how to revert; old-URL redirects and sitemap |
| [`docs/SHIPPO.md`](docs/SHIPPO.md) | Shippo ↔ Shopify labels |
| [`docs/REVIEW_QR_CODES.md`](docs/REVIEW_QR_CODES.md) | QR generation and print |
| [`docs/SHOPIFY_WEB_PIXEL.md`](docs/SHOPIFY_WEB_PIXEL.md) | Purchase pixel |
| [`docs/CONTACT_EMAIL.md`](docs/CONTACT_EMAIL.md) | Resend contact path |
| [`docs/E2E_ORDER_ANALYTICS.md`](docs/E2E_ORDER_ANALYTICS.md) | Order → analytics E2E |
| [`docs/AB_TESTING_PLAN.md`](docs/AB_TESTING_PLAN.md) | A/B testing plan: architecture, stats, PR → test lifecycle |
| [`docs/EXPERIMENTS_CONTRACT.md`](docs/EXPERIMENTS_CONTRACT.md) | Experiments contract: assignment, config, events, registry, CI endpoints |
| [`server/README.md`](server/README.md) | API endpoints, dashboard, Railway |

---

## Bookmarks

| Place | URL |
|-------|-----|
| Live site | https://www.sundayrollsgolf.com |
| Railway SPA | https://website-production-6c04.up.railway.app |
| Demo (GitHub Pages) | https://sunday-rolls.github.io/website/ |
| Analytics dashboard | https://contact-api-production-9af6.up.railway.app/dashboard/ |
| Shopify Admin | https://admin.shopify.com/store/chrgrk-ff |
| Orders | https://admin.shopify.com/store/chrgrk-ff/orders |
| Discounts | https://admin.shopify.com/store/chrgrk-ff/discounts |
| Shippo | https://apps.shopify.com/shippo |
| GitHub | https://github.com/Sunday-Rolls/website |

---

## License

Private repository — Sunday Rolls. All rights reserved.
