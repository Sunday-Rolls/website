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
