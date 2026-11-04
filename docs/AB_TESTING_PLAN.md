# A/B testing plan

Status: **approved direction, nothing built yet.** Owner decisions are in §12. Written 2026-11-03 against `main` at `6c0381a` (after PR #100, ad attribution).

Goal: a developer can open a PR, mark it as an A/B test, and have the site serve it to a share of visitors. Every metric (GA4 events, Shopify orders, contact messages) then carries the experiment and variant, and admins read the results and pause, stop, promote or remove tests from the existing `server/` dashboard.

---

## 1. Recommendation in one paragraph

Ship variants **as code flags inside the one SPA bundle**. Assign visitors **on the Railway `website` server** (`scripts/serve-spa.mjs`). It sets a first-party visitor cookie and writes the assignment into the HTML before React boots, so there is no flicker. Experiment state (running, paused, traffic %, winner) lives in **Postgres behind `contact-api`**, so the dashboard can pause, stop or promote a test without a deploy. Variant IDs reach analytics three ways: a dataLayer/GA4 parameter on every event, a hidden `_sr_exp` / `_sr_vid` Shopify cart attribute that ends up on the order (the same route PR #100 uses for `_sr_source`), and new fields on the contact payload. A PR label `ab-test` makes CI check the experiment and comment preview links for each arm. Merging ships the code **dark**: everyone sees control until an admin presses Start. Results use a Bayesian "chance to beat control" read, with a sample-size gate and a sample-ratio check. At Sunday Rolls' traffic, tests should target funnel steps (add to cart, begin checkout) and treat purchases and revenue as secondary.

---

## 2. What exists today (and what the plan reuses)

| Piece | Where | Why it matters |
|-------|-------|----------------|
| Production SPA host | Railway `website` running `scripts/serve-spa.mjs` (plain Node `http`), serving `dist/` | A real server sits in front of every production HTML request, so assignment can happen server side. HTML is already `Cache-Control: no-cache`; hashed assets are `immutable`. |
| Demo + PR previews | GitHub Pages, `deploy-staging.yml`, `/website/previews/pr-N/` | A static CDN that can't vary by cookie. Fine for previews if assignment falls back to the client. |
| Static route shells | `scripts/emit-spa-shells.mjs` | Per-route `index.html` copies with meta and preloads. Server-side injection has to work on every shell, not only the root one. |
| Analytics client | `src/lib/gtm.ts` (GTM `GTM-PPTR6V3B` → GA4 `G-YK0BB0TPM4`, Meta Pixel; deferred boot) | One place to stamp every event with experiment params. |
| Ad attribution (PR #100) | `src/lib/attribution.ts`, `src/lib/cart.tsx`, `createCart(lines, attributes)`, `updateCartAttributes` | Hidden `_sr_*` cart attributes already flow to orders. Experiments add more keys on the same path. |
| Order sync | `server/src/analytics/shopify-sync.ts` reads `note_attributes` (`_sr_source` and the rest) | The same parser picks up `_sr_exp` and `_sr_vid`. |
| Purchase pixel | Shopify Customer events pixel (`docs/SHOPIFY_WEB_PIXEL.md`) | It can read `checkout.attributes` and add the variant to the GA4 `purchase` event. Changing it is a Shopify Admin write. |
| Contact form | `src/lib/contact-api.ts` → `POST /contact` → `contact_messages` | Add `visitorId` and `experiments` fields. |
| Dashboard | Hono `/dashboard`, hash router, page modules in `ui/pages/<name>.js`, `requireAdmin`, `is_admin` flag | A new `pages/experiments.js` plugs into the router; actions need a signed-in session, not `requireAdmin`. |
| Rate limit + CORS | `server/src/app.ts`, `rate-limit.ts` | Reused for the public exposure beacon. |

---

## 3. Approaches compared

### 3a. Buy vs build

| Option | Pros | Cons |
|--------|------|------|
| **Hosted tool** (GrowthBook Cloud, Statsig, PostHog, VWO) | Stats engine and UI exist; SDKs handle hashing. GrowthBook and PostHog have free tiers and can read GA4/BigQuery. | Another vendor, login and script. Revenue truth lives in Shopify orders, which these tools don't see unless we pipe orders to them. The PR → test link and the dashboard controls would live in a second UI, not the existing dashboard. Client-side SDKs flicker unless we still do server-side assignment. |
| **Build on what's here** | Orders, GA4 sync, Postgres and an admin dashboard already exist. Attribution plumbing (PR #100) already carries hidden cart attributes to orders. One UI, one source of revenue truth. | We own the stats code and the edge cases (bots, SRM, carts that predate assignment). |

**Pick: build**, keeping the assignment hash and event shape close to GrowthBook's (`hash(seed + visitorId) → [0,1)`). That way we can move to self-hosted GrowthBook later if the in-house stats outgrow us.

### 3b. How variants are delivered

| Option | How it works | Verdict |
|--------|-------------|---------|
| **A. Flags in the SPA bundle** (recommended) | Both arms ship in one build: `useVariant('home-banner')` or `<Variant experiment="home-banner" is="b">`. Assignment decides which arm renders. | One build and one set of hashed assets, so caching stays simple. Many tests can run at once. Pause, stop and promote are instant config changes. Cost: the PR is written behind a flag, then a cleanup PR removes the losing arm. |
| **B. Separate build per variant (branch builds)** | CI builds the PR branch as a second `dist`; `serve-spa.mjs` routes cookie-B visitors to it (or proxies a built copy from gh-pages). | Closest to "the PR *is* the variant", with no flag code. But the variant goes stale as `main` moves (every main merge needs a rebuild of every live variant, or the comparison is unfair). Two concurrent tests need 4 builds. GTM, the service worker and cart state can diverge between bundles. Rollback means redeploying `website`. Railway would need build artifacts it doesn't produce today. Keep it as a Phase 4 option for whole-site redesigns only. |
| **C. Pages-level split** (separate URLs, `/b/…`) | Variant served at a different path; visitors redirected. | Redirects cost LCP and look like duplicate content to Google. Rejected. |

### 3c. Where variant content lives

Most tests here will be copy, images or layout on content-driven pages (`src/content/pages/*.json`). Support both:

- **Content variants**: a page JSON gains an optional `experiments` block that deep-merges over the base content for an arm:
  ```json
  "experiments": {
    "home-banner": { "b": { "hero": { "headline": "Built for the walk" } } }
  }
  ```
  `src/lib/content.ts` applies the override for the visitor's arm. No component change is needed for copy tests.
- **Code variants**: `useVariant(key)` / `<Variant>` for layout or behaviour (e.g. the Retro Roller splat banner in PR #89 vs the current hero).

Both read the same assignment, so the analytics are identical.

---

## 4. Architecture

```text
                         ┌──────────────── contact-api (Railway, Hono) ─────────────────┐
                         │ GET  /experiments/config   (public, cached 30 s)             │
                         │ POST /experiments/events   (beacon: exposure + funnel steps) │
                         │ /dashboard/api/experiments/*   (signed in: start/pause/…)    │
                         │ /dashboard/api/experiments/ci  (CI token: upsert drafts)     │
                         │            │                                                 │
                         │        Postgres: experiments, variants, exposures, events,   │
                         │                  order attributions, audit log               │
                         └────────────▲──────────────────────────────▲──────────────────┘
                     poll config 30 s │                              │ Shopify order sync reads
                                      │                              │ _sr_exp / _sr_vid note_attributes
Browser ──► Railway website (serve-spa.mjs)                         │
             1. read/set sr_vid cookie (random id, 1st party)        │
             2. bot? → control, no assignment                        │
             3. hash(vid, exp.seed) → arm, per running experiment    │
             4. inject <script>window.__SR_EXP__={...}</script>      │
                into the route's index.html; Vary: Cookie            │
        │                                                            │
        ▼                                                            │
      SPA boot (main.tsx): read __SR_EXP__ synchronously, before render
        ├─ <Variant>/useVariant + content overrides render the arm
        ├─ gtm.ts: every dataLayer push gets exp_variants="home-banner:b"
        ├─ first render of a gated element → exposure beacon + GA4 experiment_exposure
        ├─ cart.tsx: _sr_exp / _sr_vid cart attributes (create + update) ──► Shopify order
        └─ contact form: visitorId + experiments in payload ──► contact_messages
```

**Assignment rules**

- `sr_vid`: random 128-bit id, `SameSite=Lax; Secure; Max-Age=180 days`, not HttpOnly (the SPA reads it). Not personal data on its own; it's never joined to email in the UI.
- Arm = `fnv1a32(experiment.seed + ':' + vid) / 2^32` compared against cumulative weights, after an inclusion check against `traffic_pct`. The arm is deterministic, so no assignment write is needed at request time and the server and client always agree.
- **Sticky by construction**: the same vid and seed always give the same arm. Changing `traffic_pct` only adds or removes people at the margin. Changing weights mid-test is blocked in the UI because it breaks stickiness.
- **Forced arms** for QA: `?sr_force=home-banner:b` sets a session override, never counted in results (exposures flagged `forced`).
- **Bots** (Googlebot, Bingbot, Lighthouse, `HeadlessChrome`, `Playwright` unless `E2E_EXPERIMENTS=1`): always control, no exposure logged.
- **Pages / previews / local dev**: no server, so `src/lib/experiments.ts` runs the same hash in the browser from `GET /experiments/config` (or from a config baked in at build time for previews). Flicker is acceptable there; previews mostly use `sr_force`.
- **Config failure**: if `serve-spa` can't reach `contact-api`, it keeps the last good config for up to 10 minutes, then serves everyone control. The site never blocks on experiments.

**Exposure vs assignment.** A visitor counts in a test only once they render a gated element (exposure), not when they're merely assigned. This keeps a cart-page test from being diluted by home-page bouncers. The SPA sends one exposure per experiment per visitor (deduped in `localStorage` and with a unique key in Postgres).

**Conversions.** Funnel steps (`add_to_cart`, `begin_checkout`, `contact_submit`, `newsletter_subscribe`) go to the same beacon. **Purchases and revenue come from Shopify orders** via the existing sync, not from the browser, so refunds and pixel gaps don't skew results.

---

## 5. Data model (Postgres, added to `ANALYTICS_SCHEMA_SQL` style migrations)

```sql
CREATE TABLE IF NOT EXISTS experiments (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,                 -- 'home-banner', used in code and attributes
  name text NOT NULL,
  hypothesis text,
  status text NOT NULL DEFAULT 'draft'      -- draft|running|paused|stopped|promoted|archived
    CHECK (status IN ('draft','running','paused','stopped','promoted','archived')),
  seed text NOT NULL,                       -- hash seed; new seed = fresh randomisation
  traffic_pct smallint NOT NULL DEFAULT 100 CHECK (traffic_pct BETWEEN 0 AND 100),
  targeting jsonb NOT NULL DEFAULT '{}',    -- {"paths":["/","/shop"],"device":"mobile"}
  primary_metric text NOT NULL DEFAULT 'add_to_cart',
  guardrail_metrics text[] NOT NULL DEFAULT '{purchase,revenue_per_visitor}',
  min_visitors_per_arm integer NOT NULL DEFAULT 1000,
  min_days smallint NOT NULL DEFAULT 14,
  winner_variant text,                      -- set on promote
  pr_number integer, pr_url text, branch text, merge_sha text,
  started_at timestamptz, paused_at timestamptz, ended_at timestamptz,
  created_by uuid REFERENCES dashboard_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiment_variants (
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  key text NOT NULL,                        -- 'control', 'b', 'c'
  name text NOT NULL,
  weight smallint NOT NULL,                 -- weights sum to 100
  is_control boolean NOT NULL DEFAULT false,
  PRIMARY KEY (experiment_id, key)
);

-- One row per visitor per experiment, at first exposure.
CREATE TABLE IF NOT EXISTS experiment_exposures (
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  variant_key text NOT NULL,
  first_exposed_at timestamptz NOT NULL,
  landing_path text, device text,           -- 'mobile'|'desktop'
  source text,                              -- from the attribution touch (google/cpc, direct, …)
  forced boolean NOT NULL DEFAULT false,
  PRIMARY KEY (experiment_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS experiment_exposures_variant_idx
  ON experiment_exposures (experiment_id, variant_key, first_exposed_at);

-- Browser-reported funnel steps, keyed by visitor (not experiment: one event counts for every
-- experiment the visitor was exposed to before it happened).
CREATE TABLE IF NOT EXISTS experiment_events (
  id bigserial PRIMARY KEY,
  visitor_id text NOT NULL,
  kind text NOT NULL,                       -- add_to_cart|begin_checkout|contact_submit|newsletter_subscribe
  value numeric(12,2),
  occurred_at timestamptz NOT NULL,
  dedupe_key text UNIQUE                    -- client-generated, makes beacons idempotent
);
CREATE INDEX IF NOT EXISTS experiment_events_visitor_idx ON experiment_events (visitor_id, occurred_at);

-- Orders link to visitors through the _sr_vid / _sr_exp cart attributes.
ALTER TABLE analytics_orders ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE analytics_orders ADD COLUMN IF NOT EXISTS experiments jsonb;   -- {"home-banner":"b"}
CREATE INDEX IF NOT EXISTS analytics_orders_visitor_idx ON analytics_orders (visitor_id);

ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS experiments jsonb;

CREATE TABLE IF NOT EXISTS experiment_audit (
  id bigserial PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  actor text NOT NULL,                      -- dashboard user email or 'github-actions'
  action text NOT NULL,                     -- created|started|paused|resumed|stopped|promoted|archived|traffic_changed
  detail jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
```

**Results query (per arm):** visitors = exposures (not forced). A conversion = an `experiment_events` row or an `analytics_orders` row for the same `visitor_id` **after** `first_exposed_at` and before `ended_at`. Revenue = order revenue net of refunds from the sync. Orders tagged `_sr_exp` but without a matching exposure row (e.g. beacon blocked) are attributed by the attribute value and counted in a "beacon-missing" note, so we can see how lossy the browser side is.

Volume: tens of thousands of exposure rows a year at most. No rollup tables are needed at first; add a materialised daily view if the results page gets slow.

---

## 6. Variant IDs in analytics

### GA4 / GTM

- On boot, `gtm.ts` pushes `{ sr_experiments: 'home-banner:b|cart-upsell:control', sr_vid: '<id>' }` to `dataLayer`. Every later `pushEvent` merges `exp_variants` into its params, and the direct-gtag path sets them via `gtag('set', …)`.
- On first exposure, a GA4 event `experiment_exposure` with `experiment_id` and `variant_id`.
- **GTM (live container, publish = live change, confirm first):** a Data Layer Variable `DLV - sr_experiments`, added as event parameter `exp_variants` on the GA4 config/event tags, plus a GA4 tag for `experiment_exposure`. Note `ADS_AND_SEO_CONFIG.md`: the site depends on GTM version 16, so record the new version and its revert there.
- **GA4 Admin:** event-scoped custom dimensions `exp_variants`, `experiment_id`, `variant_id`. This lets GA4 Explorations cross-check our numbers and lets `ga4-sync.ts` later pull per-variant sessions if we want them.
- **Purchase pixel (Shopify Admin write, confirm first):** in `checkout_completed`, read `checkout.attributes` for `_sr_exp` and add `exp_variants` to the GA4 `purchase` event.

### Shopify cart → order

- Extend `cartAttributes()` in `src/lib/attribution.ts` (or a sibling `experimentAttributes()`) with:
  - `_sr_vid`: the visitor id
  - `_sr_exp`: `home-banner:b|cart-upsell:control` (only experiments this visitor has been **exposed** to)
- Underscore-prefixed attributes are hidden at checkout, the same as PR #100's `_sr_source`.
- Stamp on `cartCreate`, and call `updateCartAttributes` when the exposure set changes (a new exposure after the cart already exists). This reuses the `cartNeedsAttributes` / `markCartAttributed` pattern with a hash of the exposure string. `cartAttributesUpdate` replaces the whole set, so always send the attribution keys and the experiment keys together.
- `shopify-sync.ts` already maps `note_attributes`. Add `_sr_vid` → `analytics_orders.visitor_id` and parse `_sr_exp` → `analytics_orders.experiments`.
- Not using order notes: the note is visible to staff and editable, and attributes already flow.

### Contact form and newsletter

- `submitContactForm` sends `visitorId` and `experiments`; `POST /contact` stores them (validated: short strings, known keys only). They are not included in the email to the inbox.
- Newsletter subscribe goes to Shopify directly. Count it from the beacon (`newsletter_subscribe`) rather than tagging the Shopify customer.

### Meta Pixel

Out of scope for v1. Optionally pass `exp_variants` as a custom parameter later.

---

## 7. PR → test lifecycle (GitHub Actions)

**Developer steps**

1. Branch from `main` (`/start-feature`). Build the change behind a flag and add `src/experiments/<key>.json`:
   ```json
   { "key": "home-banner", "name": "Retro Roller splat banner vs photo hero",
     "hypothesis": "A rotating 3D roller lifts add-to-cart from the home page",
     "variants": [{ "key": "control", "weight": 50 }, { "key": "b", "name": "Splat banner", "weight": 50 }],
     "primaryMetric": "add_to_cart", "targeting": { "paths": ["/"] } }
   ```
2. Open the PR and add the label **`ab-test`**. (A PR-body line `AB-Test: home-banner` also works, but labels are easier for Actions to filter and for humans to see.)

**New workflow `.github/workflows/experiments.yml`**

| Trigger | Job |
|---------|-----|
| `pull_request` `labeled` / `synchronize` with `ab-test` | Validate: the registry file exists and matches a JSON schema; the key is unique; weights sum to 100; every `useVariant('<key>')` / content `experiments.<key>` in `src/` points at a registry entry (a vitest check, so it also runs in `npm test`). Comment on the PR with one preview link per arm (`…/previews/pr-N/?sr_force=home-banner:control` and `:b`). Upsert a **draft** experiment in `contact-api` with PR number, URL and branch (`POST /dashboard/api/experiments/ci`, bearer `EXPERIMENTS_CI_TOKEN`). |
| `pull_request` `closed` and merged, with `ab-test` | Set `merge_sha`. The experiment stays **draft**: the code is live but dark (everyone gets control). Comment: "Merged dark. Start it from Dashboard → Experiments." |
| `pull_request` `closed`, not merged | Archive the draft. |
| `repository_dispatch` `experiment-concluded` (sent by the dashboard on Promote/Stop) | Open a GitHub issue (or a draft PR, later) titled "Clean up experiment `home-banner`: keep `b`", listing the files that reference the key. |
| Weekly `schedule` | Comment on, or open an issue for, experiments promoted or stopped more than 14 days ago whose flag code is still in `src/`. |

So "instead of a normal merge" means **merge dark**: the PR still merges to `main` (the only way code reaches Railway `website`), but its effect is gated until an admin starts the test. That keeps one production build and one deploy pipeline.

**Secrets / env (writes, need sign-off):** GitHub secret `EXPERIMENTS_CI_TOKEN`, the same value as a new `contact-api` Railway variable. `contact-api` needs a GitHub token (fine-grained, `issues:write` + `contents:read` on this repo) to send `repository_dispatch`. `website` needs `EXPERIMENTS_CONFIG_URL`. Railway's `website` watch patterns skip `scripts/lib/**` (see `ADS_AND_SEO_CONFIG.md`), so put the serve-spa assignment code where a change triggers a redeploy, or update the watch patterns.

---

## 8. Dashboard UI (`server/src/dashboard/ui/pages/experiments.js`)

New sidebar entry **Experiments** (flask icon), following the page-module contract in `ui/lib/ui.js`.

**List view**

| Column | Notes |
|--------|-------|
| Experiment | Name, key, link to PR |
| Status | Pill: Draft / Running / Paused / Stopped / Promoted / Archived |
| Running for | Days, with a "min 14 d" tick |
| Visitors | Per arm, e.g. `1,204 / 1,187` |
| Primary metric | Control rate → best arm rate, relative lift |
| Chance to beat control | e.g. `91%`, coloured only once the sample gate is met |
| Health | SRM warning, "beacon loss" warning, "flag still in code" after conclusion |

**Detail view**

- Header: hypothesis, PR link, preview link per arm (`sr_force`), targeting, traffic %, audit log (who started/paused, when).
- KPI tiles per arm: visitors, add-to-cart rate, checkout rate, orders, conversion rate, revenue, revenue per visitor, AOV, contact submissions.
- Cumulative chart (existing `lib/charts.js`): primary-metric rate per arm over time, with a shaded credible interval.
- Stats card: lift with 95% interval, chance to beat control, expected loss, sample progress bar toward `min_visitors_per_arm` and `min_days`, SRM p-value.
- Breakdown toggles: device, landing source (from PR #100's touch), new vs returning.
- **Actions (any dashboard user, confirm dialog, written to `experiment_audit`):**
  - **Start**: draft → running; sets `started_at`.
  - **Pause / Resume**: paused serves everyone control and freezes counting. Resuming keeps the seed, so assignments come back unchanged.
  - **Stop**: ends the test with no winner; everyone gets control; sends the cleanup dispatch.
  - **Promote `<arm>`**: everyone gets that arm right away through config; sends the cleanup dispatch. Once the cleanup PR has merged, archive the experiment.
  - **Traffic %**: allowed while running; weight changes are not.
  - **Archive / Remove**: hides the experiment from the list and keeps its data. Hard delete only from draft, and only if no exposures exist.
- Every signed-in dashboard user can see results and use these actions (owner decision, §12). They still go through the confirm dialog and the audit log.

---

## 9. Stats method

**Traffic reality check.** Sunday Rolls is a small store, so purchase-level tests need a lot of visitors. Visitors per arm for 80% power, two-sided α = 0.05:

| Metric | Baseline (assumed) | Lift to detect | Visitors per arm |
|--------|--------------------|----------------|------------------|
| Add to cart | 6% | +20% relative | ~6,100 |
| Begin checkout | 3% | +20% | ~12,700 |
| Purchase | 1.5% | +20% | ~25,700 |
| Purchase | 1.5% | +50% | ~4,100 |

Replace the baselines with real numbers from the dashboard funnel in Phase 0. The dashboard shows the expected run time when the experiment is created, from current daily traffic on the targeted paths.

**Method**

- **Binary metrics** (add-to-cart, checkout, purchase, contact): Beta-Binomial with a Beta(1,1) prior per arm. Show the posterior lift with a 95% credible interval, **P(arm beats control)** and **expected loss** (how much conversion we give up if we pick this arm and it's actually worse). Use 20k Monte Carlo draws server side; this is cheap.
- **Revenue per visitor**: non-converters count as 0, revenue is capped at the 99th percentile, and the interval comes from a bootstrap (2k resamples). It's reported but never the primary metric at this traffic level.
- **Decision rule (shown on the page, not automated):** call a winner only when (a) `min_days` ≥ 14 (two full weekly cycles) **and** `min_visitors_per_arm` are both met, (b) P(beat control) ≥ 95% on the primary metric, and (c) no guardrail (purchase rate, RPV) has P(worse) ≥ 80%. Before the gate is met the numbers are greyed and labelled "early, don't act", which takes the sting out of peeking.
- **SRM check**: chi-square on exposure counts vs weights. If p < 0.001, show a red banner and don't trust the results; it usually means a bot, caching or assignment bug.
- **Frequentist cross-check**: a two-proportion z-test p-value shown in a details row, for anyone who wants it.
- **Concurrency** (owner decision: overlap allowed from day one): tests on different pages run at the same time, and randomisation stays independent because each test has its own seed. A visitor can be in several tests; each test's result counts only that visitor's conversions after their exposure to it. Two tests on the **same** page stay blocked: Start refuses while another running test shares a targeted path. Mutually exclusive layers that would allow same-page overlap are Phase 4.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| **SEO / cloaking** | Same URLs, no redirects; bots always get control, which Google accepts as long as tests are time-boxed and users and bots see substantially the same content. Never test `<title>`, meta description, canonical or structured data in v1 (the route shells in `emit-spa-shells.mjs` are static). |
| **Merchant Center / Ads policy** | Never test **prices, availability or shipping promises**: landing pages must match the Merchant feed (`GOOGLE_MERCHANT_SYNC.md`). Validation in CI rejects experiments that touch price fields in content JSON. |
| **Caching** | HTML from `serve-spa` is already `no-cache`. Add `Vary: Cookie` and `Cache-Control: private, no-cache` on injected HTML so any future CDN (e.g. Cloudflare in front of `www`) can't cache one arm for everyone. Hashed JS and CSS stay `immutable`, which is safe because both arms are in the same bundle. GitHub Pages can't vary, so it only uses client-side assignment, which is fine since Pages is demo and previews. |
| **Flicker** | Production: the assignment is in the HTML before `main.tsx` runs, and `<Variant>` reads it synchronously. The **hero LCP preload** (`hero-lcp.ts`, `emit-spa-shells.mjs`) is variant-sensitive: if the arm changes the hero, `serve-spa` must swap or strip the preload for that arm, or the LCP image is wasted. Pages/dev may flicker, which is acceptable. |
| **Bundle weight** | Variant code ships to everyone. Lazy-load heavy arms (`React.lazy`, as the splat viewer should be anyway). |
| **Carts created before exposure** | Carts persist in `localStorage`; re-stamp attributes when exposures change (§6). Orders count only if placed after the visitor's first exposure. |
| **Cross-device / cleared cookies** | The visitor is re-randomised and could see both arms. This is accepted noise at this scale and reduces effect sizes slightly. |
| **Ad blockers / consent** | GA4 numbers undercount, but the beacon goes to our own `contact-api` domain and orders come from Shopify, so results don't depend on GA4. No consent banner is planned (§12), so `sr_vid` and the beacon run for everyone. If a banner is added later, gate both on it. |
| **Privacy policy** | `sr_vid` is a new first-party identifier. Update the privacy page to mention testing. No email or PII goes into exposure tables; the dashboard never shows visitor ids alongside customer emails. |
| **Low traffic → inconclusive tests** | Funnel-step primary metrics, the sample-size estimate at creation time, bold changes (not button colours), and a max duration (e.g. 6 weeks) after which the UI suggests Stop. |
| **Stale flags** | The weekly cleanup job and the "flag still in code" health badge. |
| **Contact-api outage** | `serve-spa` falls back to the last good config, then to control; the beacon is fire-and-forget (`navigator.sendBeacon`). |
| **E2E and order-analytics tests** | Playwright gets control by default (bot rule). `E2E_EXPERIMENTS=1` plus `sr_force` lets tests exercise each arm. `npm run test:e2e:order-analytics` should assert `_sr_exp` reaches the order. |

---

## 11. Phased rollout

**Phase 0: decide and baseline** (½ day, no code)
- Answer the open questions below.
- Pull 90-day baselines per page from the dashboard funnel (sessions, add-to-cart, checkout, orders) to size tests.
- Draft the privacy-policy line.

**Phase 1: assignment and tagging foundation** (~3–4 days)
- `src/lib/experiments.ts`: hash, arm selection, `__SR_EXP__` reader, client fallback, `sr_force`, exposure dedupe, `<Variant>` / `useVariant`, content override merge in `content.ts`, plus unit tests.
- `serve-spa.mjs`: `sr_vid` cookie, bot check, config poll, HTML injection, `Vary: Cookie`, plus tests in `scripts/lib`.
- `contact-api`: tables, `GET /experiments/config`, `POST /experiments/events` (CORS allowlist, rate limit, payload validation), order-sync parsing of `_sr_vid` / `_sr_exp`, contact fields.
- `gtm.ts` params, cart attributes, contact payload.
- **Run an A/A test** (`aa-check`, two identical arms on `/`) for 1–2 weeks. Expect no lift and no SRM, with orders carrying `_sr_exp`. This proves the pipeline before any real decision rides on it.
- Live-config writes in this phase: Railway env vars, GTM publish, GA4 custom dimensions, Shopify pixel update. The owner approved these in principle (§12); still confirm each one at the moment it's applied, per the repo rules.

**Phase 2: dashboard** (~3 days)
- `pages/experiments.js` list and detail views, the stats module (`server/src/experiments/stats.ts`, with tests against known Beta-Binomial results), admin actions and the audit log.

**Phase 3: GitHub lifecycle** (~2 days)
- `experiments.yml`, registry schema and vitest consistency check, PR preview-link comment, CI upsert, cleanup dispatch and weekly stale-flag job.
- Update `website-change` / `start-feature` skills and `admin-handoff` (skill and `docs/admin-handoff.html`) with an "Run it as an A/B test" path.

**First real test:** PR #89's Retro Roller splat banner vs the current home hero (`home-banner`, primary metric home → add-to-cart rate, guardrail LCP via a `web-vitals` beacon field). It's a bold visual change on the highest-traffic page, which suits the traffic level.

**Phase 4: later, only if needed**
- Mutually exclusive layers, multi-arm tests, per-segment targeting UI.
- Content-variant editing from the dashboard, with no PR, for copy-only tests.
- Branch-build variants for full redesigns (§3b option B).
- Pulling per-variant GA4 sessions into the dashboard via the `exp_variants` dimension.

---

## 12. Owner decisions (2026-11-03)

| # | Question | Decision |
|---|----------|----------|
| 1 | Run tests without merging, or merge first? | **Merge it, then turn it on and off** from the dashboard (merge dark, §7). Branch-build variants stay a Phase 4 option. |
| 2 | Who can start/stop tests? | **Everyone** with a dashboard login, not only `is_admin`. Every action is still confirmed and audited. |
| 3 | Target funnel-step metrics given the traffic? | **Yes.** Default primary metric is add-to-cart (or begin-checkout); purchase and revenue per visitor are guardrails. |
| 4 | Consent banner planned? | **No, not at the moment.** `sr_vid` and the beacon are not gated; the privacy page still gets a line about testing. |
| 5 | Live-config changes (GTM, GA4 dimensions, Shopify pixel, Railway vars, GitHub token)? | **Okay** in principle. Each is still confirmed when it's actually applied. |
| 6 | One test at a time, or overlap? | **Let tests on different pages overlap** from day one. Same-page tests stay mutually blocked (§9). |
| 7 | First real test? | **Yes: the Retro Roller banner** (PR #89, `home-banner`), after the A/A check. |

Remaining unknowns to settle in Phase 0: real 90-day baselines per page (they set `min_visitors_per_arm`), and whether PR #89 merges dark under this system or waits until Phase 1 lands.
