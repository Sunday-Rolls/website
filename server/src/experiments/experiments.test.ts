import { describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE, sessionExpiry } from '../analytics/auth.js'
import { createMemoryAnalyticsStore } from '../analytics/store.js'
import { createApp } from '../app.js'
import { createMemoryExperimentStore } from './store.js'
import { parseBeacon, parseExperimentsAttr, parseExperimentsField, planTransition } from './validation.js'

const SITE = 'https://sunday-rolls.github.io'
const VID_A = 'visitorAAAAAAAAAAAAAAA'
const VID_B = 'visitorBBBBBBBBBBBBBBB'
const ADMIN_ID = '00000000-0000-4000-8000-000000000001'
const GUEST_ID = '00000000-0000-4000-8000-000000000002'

async function setup(options: { withExperiments?: boolean } = {}) {
  const analytics = createMemoryAnalyticsStore()
  const experiments = createMemoryExperimentStore()
  // Sessions are created directly, so the password is never checked (and bcrypt is slow).
  const passwordHash = 'unused'
  await analytics.upsertUser({ id: ADMIN_ID, email: 'sam@example.com', name: 'Sam', passwordHash, isAdmin: true })
  await analytics.upsertUser({ id: GUEST_ID, email: 'guest@example.com', name: 'Guest', passwordHash, isAdmin: false })
  const app = createApp({
    config: { corsOrigins: [SITE], requireBrowserOrigin: true, contactApiKey: '', dashboardSecureCookies: false },
    sendContactEmail: async () => {},
    analytics,
    experiments: options.withExperiments === false ? undefined : experiments,
  })
  const session = async (userId: string) => {
    const id = `00000000-0000-4000-8000-0000000001${userId.slice(-2)}`
    await analytics.createSession({ id, userId, expiresAt: sessionExpiry().toISOString() })
    return `${SESSION_COOKIE}=${id}`
  }
  const cookie = await session(ADMIN_ID)
  const api = (path: string, init: { method?: string; body?: unknown; cookie?: string | null } = {}) =>
    app.request(`/dashboard/api/experiments${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        'Content-Type': 'application/json',
        ...(init.cookie === null ? {} : { Cookie: init.cookie ?? cookie }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  return { app, analytics, experiments, cookie, session, api }
}

const draft = {
  key: 'home-banner',
  name: 'Home banner',
  hypothesis: 'The banner lifts add-to-cart',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'b', weight: 50 },
  ],
}

async function createRunning(ctx: Awaited<ReturnType<typeof setup>>, body: Record<string, unknown> = draft) {
  expect((await ctx.api('', { body })).status).toBe(201)
  expect((await ctx.api(`/${body.key}/status`, { body: { action: 'start' } })).status).toBe(200)
}

function beacon(app: ReturnType<typeof createApp>, body: unknown, headers: Record<string, string> = {}) {
  return app.request('/experiments/events', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: SITE, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

let seq = 0
const id = () => `evt-${String(++seq).padStart(8, '0')}`
const exposure = (experiment: string, variant: string, extra: Record<string, unknown> = {}) => ({
  id: id(),
  type: 'exposure',
  experiment,
  variant,
  forced: false,
  path: '/',
  device: 'mobile',
  source: 'google / cpc',
  at: Date.now(),
  ...extra,
})

describe('validation', () => {
  it('parses _sr_exp strings', () => {
    expect(parseExperimentsAttr('home-banner:b|other:control')).toEqual({ 'home-banner': 'b', other: 'control' })
    expect(parseExperimentsAttr('home-banner:b|BAD:x|nocolon')).toEqual({ 'home-banner': 'b' })
    expect(parseExperimentsAttr('')).toBeNull()
    expect(parseExperimentsField('home-banner:b|BAD:x')).toEqual({ ok: false, error: 'Invalid experiments' })
    expect(parseExperimentsField(undefined)).toEqual({ ok: true, value: null })
  })

  it('validates the beacon envelope and drops bad events', () => {
    expect(parseBeacon({ vid: 'short', events: [] })).toEqual({ ok: false, error: 'Invalid vid' })
    expect(parseBeacon({ vid: VID_A, events: {} }).ok).toBe(false)
    const parsed = parseBeacon({
      vid: VID_A,
      events: [
        exposure('home-banner', 'b'),
        { id: id(), type: 'purchase', at: 1 },
        { id: 'x', type: 'add_to_cart' },
        { id: id(), type: 'add_to_cart', value: -1 },
        { id: id(), type: 'add_to_cart', value: 38 },
      ],
    })
    expect(parsed.ok && parsed.value.events.map((e) => e.type)).toEqual(['exposure', 'add_to_cart'])
    expect(parsed.ok && parsed.value.rejected).toBe(3)
  })

  it('allows only sensible status transitions', async () => {
    const store = createMemoryExperimentStore()
    const exp = await store.create({
      key: 'x-test',
      name: 'X',
      hypothesis: null,
      seed: 's',
      trafficPct: 100,
      primaryMetric: 'add_to_cart',
      createdBy: null,
      variants: [
        { key: 'control', name: 'control', weight: 50, isControl: true },
        { key: 'b', name: 'b', weight: 50, isControl: false },
      ],
    })
    const now = new Date('2026-11-03T12:00:00Z')
    const allowed = (status: typeof exp.status, action: Parameters<typeof planTransition>[1]) =>
      planTransition({ ...exp, status }, action, 'b', now).ok
    expect(allowed('draft', 'start')).toBe(true)
    expect(allowed('draft', 'pause')).toBe(false)
    expect(allowed('draft', 'stop')).toBe(false)
    expect(allowed('running', 'start')).toBe(false)
    expect(allowed('running', 'pause')).toBe(true)
    expect(allowed('paused', 'resume')).toBe(true)
    expect(allowed('running', 'resume')).toBe(false)
    expect(allowed('paused', 'stop')).toBe(true)
    expect(allowed('stopped', 'promote')).toBe(true)
    expect(allowed('running', 'archive')).toBe(false)
    expect(allowed('promoted', 'archive')).toBe(true)
    expect(allowed('archived', 'start')).toBe(false)
    expect(planTransition({ ...exp, status: 'running' }, 'promote', 'zzz', now)).toMatchObject({ ok: false, status: 400 })
  })
})

describe('GET /experiments/config', () => {
  it('lists running and promoted experiments only, cached 30 s', async () => {
    const ctx = await setup()
    // Different pages, so the overlap rule lets both run.
    await createRunning(ctx, { ...draft, paths: ['/'] })
    await ctx.api('', { body: { ...draft, key: 'still-draft' } })
    await createRunning(ctx, { ...draft, key: 'shipped', paths: ['/shop'] })
    await ctx.api('/shipped/status', { body: { action: 'promote', variant: 'b' } })

    const res = await ctx.app.request('/experiments/config')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=30')
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.updatedAt).toBe('string')
    expect(body.experiments.map((e: { key: string }) => e.key)).toEqual(['home-banner', 'shipped'])
    const [running, promoted] = body.experiments
    expect(running).toEqual({
      key: 'home-banner',
      seed: expect.any(String),
      status: 'running',
      trafficPct: 100,
      variants: [
        { key: 'control', weight: 50 },
        { key: 'b', weight: 50 },
      ],
      winner: null,
    })
    expect(promoted).toMatchObject({ status: 'promoted', winner: 'b' })
  })

  it('does not exist without an experiments store', async () => {
    const { app } = await setup({ withExperiments: false })
    expect((await app.request('/experiments/config')).status).toBe(404)
    expect((await beacon(app, { vid: VID_A, events: [] })).status).toBe(404)
  })
})

describe('POST /experiments/events', () => {
  it('accepts a text/plain beacon and stores exposures and funnel events', async () => {
    const ctx = await setup()
    await createRunning(ctx)
    const res = await beacon(ctx.app, {
      vid: VID_A,
      events: [exposure('home-banner', 'b'), { id: id(), type: 'add_to_cart', value: 38, at: Date.now() }],
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, accepted: 2 })
    expect(ctx.experiments._rows.exposures).toMatchObject([
      { visitorId: VID_A, variantKey: 'b', landingPath: '/', device: 'mobile', source: 'google / cpc', forced: false },
    ])
    expect(ctx.experiments._rows.events).toMatchObject([{ visitorId: VID_A, kind: 'add_to_cart', value: 38 }])
  })

  it('rejects a bad vid, too many events and invalid JSON', async () => {
    const ctx = await setup()
    expect((await beacon(ctx.app, { vid: 'no', events: [] })).status).toBe(400)
    const many = Array.from({ length: 21 }, () => ({ id: id(), type: 'add_to_cart', at: Date.now() }))
    expect((await beacon(ctx.app, { vid: VID_A, events: many })).status).toBe(400)
    expect((await beacon(ctx.app, '{nope')).status).toBe(400)
  })

  it('ignores exposures for experiments that are not running or arms that do not exist', async () => {
    const ctx = await setup()
    await ctx.api('', { body: draft })
    await createRunning(ctx, { ...draft, key: 'paused-one' })
    await ctx.api('/paused-one/status', { body: { action: 'pause' } })
    const res = await beacon(ctx.app, {
      vid: VID_A,
      events: [exposure('home-banner', 'b'), exposure('paused-one', 'b'), exposure('unknown-exp', 'b')],
    })
    expect(await res.json()).toEqual({ ok: true, accepted: 0 })

    await ctx.api('/home-banner/status', { body: { action: 'start' } })
    const wrongArm = await beacon(ctx.app, { vid: VID_A, events: [exposure('home-banner', 'c')] })
    expect(await wrongArm.json()).toEqual({ ok: true, accepted: 0 })
  })

  it('keeps the first exposure per visitor, but a real one replaces a forced one', async () => {
    const ctx = await setup()
    await createRunning(ctx)
    await beacon(ctx.app, { vid: VID_A, events: [exposure('home-banner', 'b')] })
    const second = await beacon(ctx.app, { vid: VID_A, events: [exposure('home-banner', 'control')] })
    expect(await second.json()).toEqual({ ok: true, accepted: 0 })

    await beacon(ctx.app, { vid: VID_B, events: [exposure('home-banner', 'b', { forced: true })] })
    const real = await beacon(ctx.app, { vid: VID_B, events: [exposure('home-banner', 'control')] })
    expect(await real.json()).toEqual({ ok: true, accepted: 1 })

    const rows = ctx.experiments._rows.exposures.map((x) => [x.visitorId, x.variantKey, x.forced])
    expect(rows).toEqual([
      [VID_A, 'b', false],
      [VID_B, 'control', false],
    ])
  })

  it('dedupes funnel events by id', async () => {
    const ctx = await setup()
    const event = { id: 'same-id-123', type: 'begin_checkout', at: Date.now() }
    expect(await (await beacon(ctx.app, { vid: VID_A, events: [event] })).json()).toEqual({ ok: true, accepted: 1 })
    expect(await (await beacon(ctx.app, { vid: VID_A, events: [event] })).json()).toEqual({ ok: true, accepted: 0 })
    expect(ctx.experiments._rows.events).toHaveLength(1)
  })

  it('clamps client timestamps to now and ignores stale ones', async () => {
    const ctx = await setup()
    const before = Date.now()
    await beacon(ctx.app, {
      vid: VID_A,
      events: [
        { id: id(), type: 'add_to_cart', at: before + 3_600_000 },
        { id: id(), type: 'add_to_cart', at: before - 7 * 24 * 3_600_000 },
      ],
    })
    for (const e of ctx.experiments._rows.events) {
      expect(Date.parse(e.occurredAt)).toBeGreaterThanOrEqual(before)
      expect(Date.parse(e.occurredAt)).toBeLessThanOrEqual(Date.now())
    }
  })

  it('checks the browser origin', async () => {
    const ctx = await setup()
    expect((await beacon(ctx.app, { vid: VID_A, events: [] }, { Origin: 'https://evil.example' })).status).toBe(403)
  })

  it('rate limits at 120 requests a minute per IP', async () => {
    const ctx = await setup()
    const headers = { 'X-Forwarded-For': '203.0.113.9' }
    for (let i = 0; i < 120; i += 1) {
      expect((await beacon(ctx.app, { vid: VID_A, events: [] }, headers)).status).toBe(200)
    }
    const limited = await beacon(ctx.app, { vid: VID_A, events: [] }, headers)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBeTruthy()
    expect((await beacon(ctx.app, { vid: VID_A, events: [] }, { 'X-Forwarded-For': '203.0.113.10' })).status).toBe(200)
  })
})

describe('dashboard /api/experiments', () => {
  it('needs a session, and any signed-in user (not only admins) may act', async () => {
    const ctx = await setup()
    expect((await ctx.api('', { cookie: null })).status).toBe(401)
    const guest = await ctx.session(GUEST_ID)
    expect((await ctx.app.request('/dashboard/api/overview', { headers: { Cookie: guest } })).status).toBe(403)
    const created = await ctx.api('', { body: draft, cookie: guest })
    expect(created.status).toBe(201)
    expect((await created.json()).experiment.createdBy).toBe('guest@example.com')
  })

  it('answers 503 when experiments are not configured', async () => {
    const ctx = await setup({ withExperiments: false })
    expect((await ctx.api('')).status).toBe(503)
    expect((await ctx.api('', { cookie: null })).status).toBe(401)
  })

  it('creates a draft with a random seed and validates the body', async () => {
    const ctx = await setup()
    const res = await ctx.api('', { body: { ...draft, trafficPct: 50 } })
    expect(res.status).toBe(201)
    const { experiment } = await res.json()
    expect(experiment).toMatchObject({
      key: 'home-banner',
      status: 'draft',
      trafficPct: 50,
      primaryMetric: 'add_to_cart',
      createdBy: 'sam@example.com',
      variants: [
        { key: 'control', name: 'control', weight: 50, isControl: true },
        { key: 'b', name: 'b', weight: 50, isControl: false },
      ],
    })
    expect(experiment.seed).toMatch(/^[A-Za-z0-9_-]{12}$/)

    expect((await ctx.api('', { body: draft })).status).toBe(409)
    const bad = async (body: unknown) => (await ctx.api('', { body })).status
    expect(await bad({ ...draft, key: 'Bad Key' })).toBe(400)
    expect(await bad({ ...draft, key: 'other', name: '' })).toBe(400)
    expect(await bad({ ...draft, key: 'other', variants: [{ key: 'control', weight: 60 }, { key: 'b', weight: 50 }] })).toBe(400)
    expect(await bad({ ...draft, key: 'other', variants: [{ key: 'a', weight: 50 }, { key: 'b', weight: 50 }] })).toBe(400)
    expect(await bad({ ...draft, key: 'other', variants: [{ key: 'control', weight: 100 }] })).toBe(400)
    expect(await bad({ ...draft, key: 'other', primaryMetric: 'vibes' })).toBe(400)
    expect(await bad({ ...draft, key: 'other', trafficPct: 101 })).toBe(400)
  })

  it('runs the lifecycle, sets timestamps and audits every action', async () => {
    const ctx = await setup()
    await ctx.api('', { body: draft })
    const status = async (body: unknown) => ctx.api('/home-banner/status', { body })

    expect((await status({ action: 'pause' })).status).toBe(409)
    const started = await (await status({ action: 'start' })).json()
    expect(started.experiment.status).toBe('running')
    expect(started.experiment.startedAt).toBeTruthy()
    expect((await (await status({ action: 'pause' })).json()).experiment.pausedAt).toBeTruthy()
    expect((await (await status({ action: 'resume' })).json()).experiment).toMatchObject({ status: 'running', pausedAt: null })

    expect((await ctx.api('/home-banner/traffic', { body: { trafficPct: 25 } })).status).toBe(200)
    expect((await ctx.api('/home-banner/traffic', { body: { trafficPct: 2.5 } })).status).toBe(400)

    expect((await status({ action: 'promote', variant: 'nope' })).status).toBe(400)
    expect((await status({ action: 'explode' })).status).toBe(400)
    const promoted = await (await status({ action: 'promote', variant: 'b' })).json()
    expect(promoted.experiment).toMatchObject({ status: 'promoted', winnerVariant: 'b', trafficPct: 25 })
    expect(promoted.experiment.endedAt).toBeTruthy()
    expect((await ctx.api('/home-banner/traffic', { body: { trafficPct: 50 } })).status).toBe(409)
    expect((await status({ action: 'archive' })).status).toBe(200)
    expect((await ctx.api('/missing/status', { body: { action: 'start' } })).status).toBe(404)

    const detail = await (await ctx.api('/home-banner')).json()
    expect(detail.audit.map((a: { action: string }) => a.action).reverse()).toEqual([
      'created',
      'started',
      'paused',
      'resumed',
      'traffic_changed',
      'promoted',
      'archived',
    ])
    expect(detail.audit.every((a: { actor: string }) => a.actor === 'sam@example.com')).toBe(true)
    expect(detail.audit.find((a: { action: string }) => a.action === 'traffic_changed').detail).toEqual({ from: 100, to: 25 })
  })

  it('lists experiments with exposure counts per arm', async () => {
    const ctx = await setup()
    await createRunning(ctx)
    await beacon(ctx.app, { vid: VID_A, events: [exposure('home-banner', 'b')] })
    await beacon(ctx.app, { vid: VID_B, events: [exposure('home-banner', 'control', { forced: true })] })
    const { experiments } = await (await ctx.api('')).json()
    expect(experiments[0].variants).toEqual([
      { key: 'control', name: 'control', weight: 50, isControl: true, visitors: 0, forcedVisitors: 1 },
      { key: 'b', name: 'b', weight: 50, isControl: false, visitors: 1, forcedVisitors: 0 },
    ])
  })

  it('counts results per arm after first exposure and before ended_at', async () => {
    const ctx = await setup()
    await createRunning(ctx)
    const exp = (await ctx.experiments.getByKey('home-banner'))!
    const t = (min: number) => new Date(Date.parse('2026-11-01T12:00:00Z') + min * 60_000).toISOString()
    const vids = ['vid-control-1', 'vid-control-2', 'vid-b-000001', 'vid-forced-1']
    await ctx.experiments.recordExposures([
      { experimentId: exp.id, visitorId: vids[0]!, variantKey: 'control', firstExposedAt: t(0), landingPath: '/', device: null, source: null, forced: false },
      { experimentId: exp.id, visitorId: vids[1]!, variantKey: 'control', firstExposedAt: t(0), landingPath: '/', device: null, source: null, forced: false },
      { experimentId: exp.id, visitorId: vids[2]!, variantKey: 'b', firstExposedAt: t(0), landingPath: '/', device: null, source: null, forced: false },
      { experimentId: exp.id, visitorId: vids[3]!, variantKey: 'b', firstExposedAt: t(0), landingPath: '/', device: null, source: null, forced: true },
    ])
    await ctx.experiments.recordEvents([
      { dedupeKey: 'e1-xxxxxx', visitorId: vids[0]!, kind: 'add_to_cart', value: 38, occurredAt: t(5) },
      { dedupeKey: 'e2-xxxxxx', visitorId: vids[0]!, kind: 'add_to_cart', value: 38, occurredAt: t(6) },
      { dedupeKey: 'e3-xxxxxx', visitorId: vids[1]!, kind: 'add_to_cart', value: 38, occurredAt: t(-5) },
      { dedupeKey: 'e4-xxxxxx', visitorId: vids[2]!, kind: 'add_to_cart', value: 38, occurredAt: t(1) },
      { dedupeKey: 'e5-xxxxxx', visitorId: vids[2]!, kind: 'begin_checkout', value: null, occurredAt: t(2) },
      { dedupeKey: 'e6-xxxxxx', visitorId: vids[3]!, kind: 'add_to_cart', value: 38, occurredAt: t(1) },
    ])
    const order = (externalId: string, visitorId: string | null, min: number, revenue: number, arm = 'b') => ({
      channel: 'shopify',
      externalId,
      orderedAt: t(min),
      revenue,
      visitorId,
      experiments: { 'home-banner': arm },
    })
    await ctx.experiments.upsertOrders([
      order('shopify:1', vids[2]!, 10, 87.27),
      order('shopify:2', vids[2]!, 20, 40),
      order('shopify:3', vids[0]!, -10, 50, 'control'),
      order('shopify:4', null, 15, 79, 'b'),
      order('shopify:5', vids[2]!, 60 * 24 * 30, 99),
    ])
    await ctx.experiments.update(exp.id, { startedAt: t(-60), endedAt: t(60) })

    const res = await ctx.api('/home-banner/results')
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.key).toBe('home-banner')
    const [control, b] = data.arms
    expect(control).toMatchObject({
      variant: 'control',
      visitors: 2,
      forcedVisitors: 0,
      events: { add_to_cart: 1, begin_checkout: 0, contact_submit: 0, newsletter_subscribe: 0 },
      orders: 0,
      purchasers: 0,
      revenue: 0,
      taggedOrders: 1,
      beaconMissingOrders: 0,
    })
    expect(b).toMatchObject({
      variant: 'b',
      visitors: 1,
      forcedVisitors: 1,
      events: { add_to_cart: 1, begin_checkout: 1, contact_submit: 0, newsletter_subscribe: 0 },
      orders: 2,
      purchasers: 1,
      revenue: 127.27,
      taggedOrders: 3,
      beaconMissingOrders: 1,
    })
  })
})

describe('error handling', () => {
  it('answers 502 when the store fails on the beacon', async () => {
    const ctx = await setup()
    vi.spyOn(ctx.experiments, 'recordEvents').mockRejectedValueOnce(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await beacon(ctx.app, { vid: VID_A, events: [{ id: id(), type: 'add_to_cart', at: Date.now() }] })
    expect(res.status).toBe(502)
  })
})
