#!/usr/bin/env node
/**
 * Seed a LOCAL Postgres with demo A/B tests so the Experiments dashboard has something to show.
 *
 *   DATABASE_URL=postgres://postgres@localhost:54330/abdemo npm run experiments:seed-demo
 *
 * Creates (replacing earlier demo rows; real data is never touched):
 * - `home-banner`: the Retro Roller banner (PR #89) vs the current home page, running for 18 days,
 *   ~2,400 visitors per arm, with the banner arm converting a little better.
 * - `aa-pilot`: an earlier dummy A/A run, stopped after 14 days with no difference.
 * - `aa-check`: the A/A test the home page is wired to (`useVariant('aa-check')`), as a draft.
 *   Pause `home-banner` and start this one to watch your own visits land in the dashboard.
 * - `cart-upsell`: a draft on /cart, never started.
 *
 * Demo rows are recognisable: visitor ids start with `demo-`, order ids with `demo:`, and
 * contact messages use @example.test addresses. Refuses to run against anything but localhost
 * unless you pass --allow-remote (don't, unless you really mean it).
 */
import pg from 'pg'
import { createPgContactStore } from '../contact-store.js'
import { createPgExperimentStore } from '../experiments/store.js'
import type { Experiment, ExposureRow, FunnelEventRow } from '../experiments/types.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('Set DATABASE_URL to a local Postgres, e.g. postgres://postgres@localhost:54330/abdemo')
  process.exit(1)
}
const host = new URL(databaseUrl).hostname
if (!['localhost', '127.0.0.1', '::1'].includes(host) && !process.argv.includes('--allow-remote')) {
  console.error(`Refusing to seed demo data into ${host}: this script is for a local database only.`)
  process.exit(1)
}

const DAY = 86_400_000
const now = Date.now()
const DEMO_KEYS = ['home-banner', 'aa-pilot', 'aa-check', 'cart-upsell']

// Deterministic randomness, so every run produces the same demo numbers.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261103)
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
const iso = (ms: number) => new Date(ms).toISOString()

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
const store = createPgExperimentStore(pool)
const contacts = createPgContactStore(pool)
await store.migrate()
await contacts.migrate()

// Clear earlier demo rows only.
await pool.query(`DELETE FROM experiments WHERE key = ANY($1)`, [DEMO_KEYS])
await pool.query(`DELETE FROM experiment_events WHERE visitor_id LIKE 'demo-%'`)
await pool.query(`DELETE FROM experiment_orders WHERE external_id LIKE 'demo:%'`)
await pool.query(`DELETE FROM contact_messages WHERE email LIKE '%@example.test'`)

const actor = 'demo-seed@example.test'
const seedStr = () => Math.floor(rand() * 2 ** 48).toString(36).padStart(10, '0').slice(0, 12)

type ArmPlan = { key: string; name: string; weight: number; atc: number; checkout: number; purchase: number; contact: number }

async function seedExperiment(opts: {
  key: string
  name: string
  hypothesis: string
  paths: string[]
  arms: ArmPlan[]
  prNumber: number | null
  startedDaysAgo: number
  endedDaysAgo: number | null
  visitorsPerDay: number
  status: 'running' | 'stopped'
}): Promise<Experiment> {
  let exp = await store.create({
    key: opts.key,
    name: opts.name,
    hypothesis: opts.hypothesis,
    seed: seedStr(),
    trafficPct: 100,
    primaryMetric: 'add_to_cart',
    createdBy: actor,
    variants: opts.arms.map((a) => ({ key: a.key, name: a.name, weight: a.weight, isControl: a.key === 'control' })),
    paths: opts.paths,
    minVisitorsPerArm: 1000,
    minDays: 14,
    maxDays: 42,
    prNumber: opts.prNumber,
    prUrl: opts.prNumber ? `https://github.com/Sunday-Rolls/website/pull/${opts.prNumber}` : null,
    branch: opts.prNumber ? 'feature/retro-roller-splat-banner' : null,
    mergeSha: null,
    source: opts.prNumber ? 'github' : 'dashboard',
  } as Parameters<typeof store.create>[0])
  const start = now - opts.startedDaysAgo * DAY
  const end = opts.endedDaysAgo === null ? now : now - opts.endedDaysAgo * DAY
  exp = await store.update(exp.id, { status: 'running', startedAt: iso(start) })
  await store.addAudit({ experimentId: exp.id, actor, action: 'started', detail: { from: 'draft' } })

  const exposures: ExposureRow[] = []
  const events: FunnelEventRow[] = []
  const orders: Parameters<typeof store.upsertOrders>[0] = []
  const days = Math.max(1, Math.round((end - start) / DAY))
  let n = 0
  for (let d = 0; d < days; d++) {
    // Weekends a bit busier, like a golf shop.
    const dow = new Date(start + d * DAY).getUTCDay()
    const count = Math.round(opts.visitorsPerDay * (dow === 0 || dow === 6 ? 1.3 : 0.9) * (0.85 + rand() * 0.3))
    for (let i = 0; i < count; i++) {
      const at = start + d * DAY + Math.floor(rand() * DAY)
      if (at > end) continue
      const u = rand()
      let cum = 0
      const arm = opts.arms.find((a) => (cum += a.weight / 100) > u) ?? opts.arms[opts.arms.length - 1]
      const vid = `demo-${opts.key}-${(n++).toString(36).padStart(5, '0')}`
      exposures.push({
        experimentId: exp.id,
        visitorId: vid,
        variantKey: arm.key,
        firstExposedAt: iso(at),
        landingPath: pick(opts.paths),
        device: rand() < 0.68 ? 'mobile' : 'desktop',
        source: pick(['google / cpc', 'google / organic', 'instagram / referral', 'direct', 'direct', 'facebook / paid']),
        forced: false,
      })
      const later = (min: number) => iso(Math.min(end, at + min * 60_000 + Math.floor(rand() * 20 * 60_000)))
      if (rand() < arm.atc) {
        events.push({ dedupeKey: `${vid}:atc`, visitorId: vid, kind: 'add_to_cart', value: pick([38, 42, 45, 26]), occurredAt: later(2) })
        if (rand() < arm.checkout / arm.atc) {
          events.push({ dedupeKey: `${vid}:co`, visitorId: vid, kind: 'begin_checkout', value: pick([38, 42, 64, 80]), occurredAt: later(6) })
          if (rand() < arm.purchase / arm.checkout) {
            orders.push({
              channel: 'shopify',
              externalId: `demo:${vid}`,
              orderedAt: later(12),
              revenue: Math.round((30 + rand() * 70) * 100) / 100,
              visitorId: vid,
              experiments: { [opts.key]: arm.key },
            })
          }
        }
      }
      if (rand() < arm.contact) {
        events.push({ dedupeKey: `${vid}:contact`, visitorId: vid, kind: 'contact_submit', value: null, occurredAt: later(4) })
        await contacts.create(
          { name: 'Demo Visitor', email: `${vid}@example.test`, subject: 'Demo question', message: 'Seeded by seed-ab-demo.ts' },
          false,
          { visitorId: vid, experiments: { [opts.key]: arm.key } },
        )
      }
      if (rand() < 0.012) {
        events.push({ dedupeKey: `${vid}:nl`, visitorId: vid, kind: 'newsletter_subscribe', value: null, occurredAt: later(3) })
      }
    }
  }
  for (let i = 0; i < exposures.length; i += 500) await store.recordExposures(exposures.slice(i, i + 500))
  for (let i = 0; i < events.length; i += 500) await store.recordEvents(events.slice(i, i + 500))
  for (let i = 0; i < orders.length; i += 500) await store.upsertOrders(orders.slice(i, i + 500))

  if (opts.status === 'stopped') {
    exp = await store.update(exp.id, { status: 'stopped', endedAt: iso(end) })
    await store.addAudit({ experimentId: exp.id, actor, action: 'stopped', detail: { from: 'running' } })
  }
  console.log(
    `${opts.key}: ${exposures.length} visitors, ${events.length} events, ${orders.length} orders (${exp.status})`,
  )
  return exp
}

await seedExperiment({
  key: 'aa-pilot',
  name: 'A/A pilot (identical arms)',
  hypothesis: 'Both arms are the same page, so there should be no difference. Proves the tracking pipeline.',
  paths: ['/'],
  prNumber: null,
  startedDaysAgo: 34,
  endedDaysAgo: 20,
  visitorsPerDay: 260,
  status: 'stopped',
  arms: [
    { key: 'control', name: 'Current home', weight: 50, atc: 0.06, checkout: 0.03, purchase: 0.014, contact: 0.003 },
    { key: 'b', name: 'Same page', weight: 50, atc: 0.06, checkout: 0.03, purchase: 0.014, contact: 0.003 },
  ],
})

await seedExperiment({
  key: 'home-banner',
  name: 'Retro Roller splat banner',
  hypothesis: 'A rotating 3D Retro Roller under the value strip lifts add-to-cart from the home page.',
  paths: ['/'],
  prNumber: 89,
  startedDaysAgo: 18,
  endedDaysAgo: null,
  visitorsPerDay: 270,
  status: 'running',
  arms: [
    { key: 'control', name: 'Current home', weight: 50, atc: 0.058, checkout: 0.029, purchase: 0.014, contact: 0.003 },
    { key: 'b', name: 'Splat banner', weight: 50, atc: 0.072, checkout: 0.035, purchase: 0.017, contact: 0.003 },
  ],
})

async function createDraft(input: Omit<Parameters<typeof store.create>[0], 'seed' | 'createdBy' | 'trafficPct'>) {
  const exp = await store.create({ ...input, seed: seedStr(), trafficPct: 100, createdBy: actor } as Parameters<typeof store.create>[0])
  await store.addAudit({ experimentId: exp.id, actor, action: 'created', detail: null })
  console.log(`${exp.key}: draft`)
}

await createDraft({
  key: 'aa-check',
  name: 'A/A check (identical arms)',
  hypothesis: 'Both arms are the same page. Start it (after pausing home-banner) to test the pipeline with real visits.',
  primaryMetric: 'add_to_cart',
  variants: [
    { key: 'control', name: 'Current home', weight: 50, isControl: true },
    { key: 'b', name: 'Same page', weight: 50, isControl: false },
  ],
  paths: ['/'],
  minVisitorsPerArm: 1000,
  minDays: 14,
  maxDays: 42,
  prNumber: null,
  prUrl: null,
  branch: null,
  mergeSha: null,
  source: 'github',
} as Parameters<typeof createDraft>[0])

await createDraft({
  key: 'cart-upsell',
  name: 'Towel upsell above the cart total',
  hypothesis: 'Moving the towel upsell above the total raises attach rate.',
  primaryMetric: 'add_to_cart',
  variants: [
    { key: 'control', name: 'Upsell below total', weight: 50, isControl: true },
    { key: 'b', name: 'Upsell above total', weight: 50, isControl: false },
  ],
  paths: ['/cart'],
  minVisitorsPerArm: 1000,
  minDays: 14,
  maxDays: 42,
  prNumber: null,
  prUrl: null,
  branch: null,
  mergeSha: null,
  source: 'dashboard',
} as Parameters<typeof createDraft>[0])

await pool.end()
console.log('Done. Open the dashboard → Experiments.')
