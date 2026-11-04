# Experiments: shared contract (Phase 1)

The browser (`src/`), the Railway SPA server (`scripts/serve-spa.mjs`) and `contact-api` (`server/`) must agree on everything below. Background and reasons: [AB_TESTING_PLAN.md](./AB_TESTING_PLAN.md).

## Visitor id

- Cookie `sr_vid`: 22 chars, base64url of 16 random bytes. `Path=/; Max-Age=15552000` (180 days); `SameSite=Lax`; plus `Secure` when the request is https (`x-forwarded-proto: https`). Not HttpOnly.
- Valid id regex (everywhere): `^[A-Za-z0-9_-]{8,64}$`. Anything else counts as missing.
- With no server (Pages, dev), the browser reuses the cookie, then `localStorage.sr_vid`, or else makes one. It writes both.

## Assignment (identical in JS/TS on both sides)

```
fnv1a32(str): h = 2166136261; for each UTF-8 byte b: h ^= b; h = Math.imul(h, 16777619); return h >>> 0
unit(str)   = fnv1a32(str) / 2**32                       // [0, 1)

assign(exp, vid):
  if exp.status === 'promoted': return exp.winner
  if unit(`${exp.seed}:traffic:${vid}`) * 100 >= exp.trafficPct: return null   // not in test → control, no exposure
  u = unit(`${exp.seed}:${vid}`); cum = 0
  for v of exp.variants (in order): cum += v.weight / 100; if u < cum: return v.key
  return exp.variants[exp.variants.length - 1].key
```

Test vectors for `fnv1a32` → `unit`:

| input | fnv1a32 | unit (6 dp) |
|-------|---------|-------------|
| `""` | 2166136261 | 0.504343 |
| `"a"` | 3826002220 | 0.890811 |
| `"aa-check:abc123"` | 4002643900 | 0.931938 |
| `"seed1:vid-0001"` | 638855030 | 0.148745 |
| `"seed1:traffic:vid-0001"` | 486515007 | 0.113276 |
| `"héllo"` | 1252296000 | 0.291573 |

If an experiment is missing from the config, or its assignment is `null`, code renders `control`.

## Config: `GET {contact-api}/experiments/config`

Public. `Cache-Control: public, max-age=30`. Lists only experiments with status `running` or `promoted`.

```json
{ "ok": true, "updatedAt": "2026-11-03T12:00:00.000Z",
  "experiments": [
    { "key": "home-banner", "seed": "k3j…", "status": "running", "trafficPct": 100,
      "variants": [{ "key": "control", "weight": 50 }, { "key": "b", "weight": 50 }],
      "winner": null }
  ] }
```

Keys: `^[a-z0-9][a-z0-9-]{1,47}$`. Variant keys: `^[a-z0-9][a-z0-9_-]{0,23}$`, and one of them is `control`. Weights are integers that sum to 100.

## Injected page state (Railway `serve-spa.mjs`)

For every HTML response, `serve-spa` adds this just before `</head>` (with `<` escaped as `<` inside the JSON):

```html
<script>window.__SR_EXP__={"vid":"…","assignments":{"home-banner":"b"},"tracked":["home-banner"],"bot":false}</script>
```

- `assignments`: key → arm, for every listed experiment where `assign` is not null.
- `tracked`: the keys whose status is `running`. These are the only ones that log exposures; `promoted` experiments are assigned but not tracked.
- Bots (UA regex `/bot|crawl|spider|slurp|lighthouse|headlesschrome|playwright|facebookexternalhit|bingpreview|embedly|pinterest|vkshare|w3c_validator|preview/i`): no cookie, `vid: null`, `assignments: {}`, `tracked: []`, `bot: true`.
- HTML gets `Vary: Cookie` and `Cache-Control: private, no-cache`.
- `serve-spa` fetches the config from `EXPERIMENTS_CONFIG_URL` every 30 s (timeout 2 s), keeping the last good copy for up to 10 min. When the env var is unset, it does nothing (no cookie, no script). The browser then uses its own fallback.

## Browser fallback (no `__SR_EXP__`)

Fetch the config from `VITE_EXPERIMENTS_CONFIG_URL`, or else `${contact API base}/experiments/config`. Until it arrives, every experiment renders `control` and logs nothing. Once it arrives, assign with the same function and re-render.

## QA override

`?sr_force=home-banner:b,other:control` is stored in `sessionStorage.sr_force` and overrides assignments for the tab. Exposures from forced arms are sent with `forced: true` and never go into cart attributes.

## Events beacon: `POST {contact-api}/experiments/events`

Sent with `navigator.sendBeacon` as `text/plain` (no CORS preflight), with a `fetch(keepalive)` fallback. The server parses the body as JSON whatever the content type, checks the browser origin against the allowlist (like `/contact`), and rate-limits per IP (120/min). It answers `{ ok: true, accepted: n }`.

```json
{ "vid": "…", "events": [
  { "id": "<uuid>", "type": "exposure", "experiment": "home-banner", "variant": "b",
    "forced": false, "path": "/", "device": "mobile", "source": "google / cpc", "at": 1730000000000 },
  { "id": "<uuid>", "type": "add_to_cart", "value": 38, "at": 1730000000500 }
] }
```

- `type`: `exposure` | `add_to_cart` | `begin_checkout` | `contact_submit` | `newsletter_subscribe`. At most 20 events per request. `id` is the dedupe key.
- An exposure is kept only if its experiment is `running` and the variant exists. It is stored once per (experiment, vid); the first one wins.
- The browser sends one exposure per experiment per visitor (`localStorage.sr_exp_seen` = `{ key: arm }` for non-forced exposures).

## Shopify cart attributes

These are added next to PR #100's `_sr_source` and the other attribution keys, always in the same `cartAttributesUpdate`, because it replaces the whole set:

- `_sr_vid`: the visitor id
- `_sr_exp`: `home-banner:b|other:control`, from `sr_exp_seen` (non-forced exposures only), keys sorted

The order sync reads both from `note_attributes`.

## GA4 / dataLayer

- Every event pushed by `src/lib/gtm.ts` gets `exp_variants: "<same string as _sr_exp>"` (omitted when empty).
- On first exposure: event `experiment_exposure` with `{ experiment_id, variant_id }`.

## Contact form

`POST /contact` accepts optional `visitorId` (vid regex) and `experiments` (`_sr_exp` format, max 500 chars). They're stored on `contact_messages` and never put in the email.

---

# Phase 2 and 3 additions

## Experiment fields (added to the store, API and `GET /dashboard/api/experiments[/:key]`)

`paths: string[]` (targeted paths such as `["/"]`; empty means site-wide), `minVisitorsPerArm` (default 1000), `minDays` (default 14), `maxDays` (default 42), `prNumber`, `prUrl`, `branch`, `mergeSha` (all nullable), `source: "dashboard" | "github"`.

**Overlap rule:** `start` and `resume` return 409 `{ error, conflicts: [key…] }` when another `running` experiment shares a path. A site-wide experiment conflicts with every other running one.

## `GET /dashboard/api/experiments/:key/results` (extends the Phase 1 shape)

```jsonc
{ "ok": true, "data": {
  "key": "home-banner", "status": "running", "startedAt": "…", "endedAt": null,
  "primaryMetric": "add_to_cart",
  "arms": [ /* Phase 1 ArmResults, plus: */ { "variant": "b", "revenuePerVisitor": 1.23, "aov": 41.0,
             "rates": { "add_to_cart": 0.061, "begin_checkout": 0.03, "contact_submit": 0.001,
                        "newsletter_subscribe": 0.004, "purchase": 0.014 } } ],
  "stats": {
    "comparisons": [ {
      "variant": "b", "metric": "add_to_cart",
      "controlRate": 0.058, "variantRate": 0.064, "lift": 0.103,          // relative
      "liftInterval": [-0.04, 0.26],                                    // 95% credible, relative
      "probBeatsControl": 0.91, "expectedLoss": 0.0004,                 // absolute rate
      "pValue": 0.18                                                    // two-proportion z-test
    } ],                                       // one per non-control arm × (primary + every rate metric)
    "rpv": [ { "variant": "b", "controlRpv": 0.9, "variantRpv": 1.2, "lift": 0.33,
               "liftInterval": [-0.2, 0.9], "probBeatsControl": 0.8 } ],   // bootstrap, revenue capped at p99
    "srm": { "pValue": 0.42, "ok": true },     // chi-square vs weights, ok = p >= 0.001
    "gate": { "days": 9, "minDays": 14, "minVisitorsPerArm": 1000, "smallestArm": 812,
              "ready": false, "overMaxDays": false },
    "verdict": "early" | "winner" | "no_difference" | "guardrail_fail" | "srm_fail",
    "winner": "b" | null
  },
  "daily": [ { "date": "2026-11-04", "arms": { "control": { "visitors": 120, "conversions": 7 },
                                               "b": { "visitors": 118, "conversions": 9 } } } ]
  // cumulative per day, primary metric
} }
```

**Verdict:** `srm_fail` if SRM is not ok. Otherwise `early` until the gate is ready. Then `guardrail_fail` if any arm has P(worse) ≥ 0.8 on purchase rate or revenue per visitor, `winner` when some arm has P(beats control) ≥ 0.95 on the primary metric, and `no_difference` otherwise. Monte Carlo uses 20,000 draws with a seeded PRNG, so results are deterministic per request.

## GitHub integration

### Registry: `src/experiments/<key>.json`

```json
{ "key": "home-banner", "name": "Retro Roller banner", "hypothesis": "…",
  "variants": [{ "key": "control", "name": "Current home", "weight": 50 }, { "key": "b", "name": "Splat banner", "weight": 50 }],
  "primaryMetric": "add_to_cart", "paths": ["/"], "minVisitorsPerArm": 1000, "minDays": 14 }
```

The schema is at `src/experiments/schema.json`. A vitest check, `src/experiments/registry.test.ts`, ensures every file matches the schema with a key equal to the filename, and that every `useVariant('k')`, `<Variant experiment="k">` and content-JSON `experiments.k` in `src/` has a registry file. Its `listRegistry()` helper is exported for the workflow script.

### CI endpoint: `POST {contact-api}/experiments/ci`

- Auth: `Authorization: Bearer $EXPERIMENTS_CI_TOKEN`, compared in constant time. Answers 503 when the server's env var is unset and 401 when the token is wrong.
- Body: `{ "action": "upsert" | "merged" | "closed", "pr": { "number", "url", "branch", "mergeSha"? }, "experiments": [registry objects] }`.
  - `upsert`: create missing ones as `draft` (source `github`). Update name, hypothesis, variants, paths and limits **only while draft**, and set the PR fields.
  - `merged`: set `mergeSha`.
  - `closed` (not merged): archive drafts still linked to that PR.
  - Every change writes an audit row with actor `github-actions`.
- Returns `{ ok, results: [{ key, outcome: "created" | "updated" | "unchanged" | "locked" | "archived" }] }`.

### Dashboard → GitHub: conclusion dispatch

When an experiment is promoted or stopped, and `GITHUB_DISPATCH_TOKEN` and `GITHUB_REPOSITORY` (default `Sunday-Rolls/website`) are set on contact-api, the server POSTs to `https://api.github.com/repos/{repo}/dispatches` with `{ event_type: "experiment-concluded", client_payload: { key, outcome: "promoted" | "stopped", winner, prNumber } }`. It's fire-and-forget: a failure is logged and recorded in the audit as `dispatch_failed` but never blocks the action. The `fetch` is injectable for tests.

### Workflows: `.github/workflows/experiments.yml`

| Trigger | Does |
|---------|------|
| `pull_request` [labeled, synchronize, opened, reopened] with label `ab-test` | `npm ci` → `npx vitest run src/experiments`. Finds the registry files the PR adds or changes (`git diff origin/main...HEAD -- src/experiments/*.json`). If there are none, it fails with a clear message. Comments one marker-tagged comment (updated in place) with preview links for each arm: `https://sunday-rolls.github.io/website/previews/pr-N/<first path>?sr_force=<key>:<arm>`. Calls the CI endpoint (`upsert`) when the `EXPERIMENTS_CI_TOKEN` secret exists, and otherwise notes in the comment that the dashboard sync is not set up. |
| `pull_request` [closed] with `ab-test` | `merged` or `closed` to the CI endpoint, plus a comment: "Merged dark. Start it from Dashboard → Experiments." |
| `repository_dispatch` [experiment-concluded] | Opens an issue "Clean up experiment `<key>`: keep `<winner \| control>`". The issue lists files referencing the key (`git grep`), links the PR, and gives the steps. |
| `schedule` weekly (Mon 14:00 UTC) + `workflow_dispatch` | Optional, only when the secret is set: GET `/experiments/ci/stale` (same bearer) lists promoted or stopped experiments ended more than 14 days ago. For each one still referenced in `src/`, it opens or updates an issue (deduped by title). |

`GET /experiments/ci/stale` returns `{ ok, experiments: [{ key, status, winner, endedAt, prNumber }] }`.

The workflow uses `actions/github-script@v7` and `actions/checkout@v4`, matching `deploy-staging.yml`, with `permissions: contents: read, pull-requests: write, issues: write`. The base URL comes from the `EXPERIMENTS_API_URL` repo variable, falling back to `https://contact-api-production-9af6.up.railway.app`.
