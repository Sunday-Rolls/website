import { describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE, sessionExpiry } from '../analytics/auth.js'
import { createMemoryAnalyticsStore } from '../analytics/store.js'
import { createApp } from '../app.js'
import { bearerMatches } from './ci.js'
import { createMemoryExperimentStore } from './store.js'
import { findPathConflicts, parseCreateExperiment } from './validation.js'
import type { Experiment } from './types.js'

const SITE = 'https://sunday-rolls.github.io'
const ADMIN_ID = '00000000-0000-4000-8000-000000000001'
const CI_TOKEN = 'ci-token-for-tests-0123456789'

type SetupOptions = { ciToken?: string; dispatchToken?: string; fetch?: typeof fetch }

async function setup(options: SetupOptions = {}) {
  const analytics = createMemoryAnalyticsStore()
  const experiments = createMemoryExperimentStore()
  await analytics.upsertUser({ id: ADMIN_ID, email: 'sam@example.com', name: 'Sam', passwordHash: 'unused', isAdmin: true })
  const app = createApp({
    config: {
      corsOrigins: [SITE],
      requireBrowserOrigin: true,
      contactApiKey: '',
      dashboardSecureCookies: false,
      experimentsCiToken: options.ciToken ?? CI_TOKEN,
      githubDispatchToken: options.dispatchToken ?? '',
      githubRepository: 'Sunday-Rolls/website',
    },
    sendContactEmail: async () => {},
    analytics,
    experiments,
    githubFetch: options.fetch,
  })
  const sessionId = '00000000-0000-4000-8000-000000000101'
  await analytics.createSession({ id: sessionId, userId: ADMIN_ID, expiresAt: sessionExpiry().toISOString() })
  const cookie = `${SESSION_COOKIE}=${sessionId}`
  const api = (path: string, body?: unknown) =>
    app.request(`/dashboard/api/experiments${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const ci = (body: unknown, token: string | null = CI_TOKEN, ip = '198.51.100.1') =>
    app.request('/experiments/ci', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': ip,
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  const stale = (token: string | null = CI_TOKEN) =>
    app.request('/experiments/ci/stale', { headers: token === null ? {} : { Authorization: `Bearer ${token}` } })
  return { app, experiments, api, ci, stale }
}

const variants = [
  { key: 'control', weight: 50 },
  { key: 'b', weight: 50 },
]
const draft = (key: string, extra: Record<string, unknown> = {}) => ({ key, name: key, variants, ...extra })

describe('experiment fields', () => {
  it('stores paths, limits and PR fields on create, with defaults', async () => {
    const ctx = await setup()
    const res = await ctx.api('', draft('home-banner', { paths: ['/', '/shop/'], minDays: 7, prNumber: 89, prUrl: 'https://github.com/Sunday-Rolls/website/pull/89', branch: 'feature/x' }))
    expect(res.status).toBe(201)
    const { experiment } = await res.json()
    expect(experiment).toMatchObject({
      paths: ['/', '/shop'],
      minVisitorsPerArm: 1000,
      minDays: 7,
      maxDays: 42,
      prNumber: 89,
      prUrl: 'https://github.com/Sunday-Rolls/website/pull/89',
      branch: 'feature/x',
      mergeSha: null,
      source: 'dashboard',
    })
    const detail = await (await ctx.api('/home-banner')).json()
    expect(detail.experiment.paths).toEqual(['/', '/shop'])
    const list = await (await ctx.api('')).json()
    expect(list.experiments[0]).toMatchObject({ paths: ['/', '/shop'], source: 'dashboard', maxDays: 42 })

    const plain = await (await ctx.api('', draft('site-wide'))).json()
    expect(plain.experiment).toMatchObject({ paths: [], minVisitorsPerArm: 1000, minDays: 14, maxDays: 42, prNumber: null })
  })

  it('validates paths and limits', () => {
    const bad = (extra: Record<string, unknown>) => parseCreateExperiment(draft('x-test', extra)).ok
    expect(bad({ paths: ['shop'] })).toBe(false)
    expect(bad({ paths: ['/a?b=1'] })).toBe(false)
    expect(bad({ paths: Array.from({ length: 11 }, (_, i) => `/p${i}`) })).toBe(false)
    expect(bad({ paths: Array.from({ length: 10 }, (_, i) => `/p${i}`) })).toBe(true)
    expect(bad({ paths: '/' })).toBe(false)
    expect(bad({ minVisitorsPerArm: 0 })).toBe(false)
    expect(bad({ minDays: 20, maxDays: 10 })).toBe(false)
    expect(bad({ minDays: 60 })).toBe(true) // maxDays defaults up to minDays
    expect(bad({ prNumber: -1 })).toBe(false)
    expect(bad({ prUrl: 'http://insecure' })).toBe(false)
    expect(bad({ mergeSha: 'not-a-sha' })).toBe(false)
  })
})

describe('overlap rule', () => {
  const exp = (key: string, paths: string[], status: Experiment['status'] = 'running') =>
    ({ id: key, key, paths, status }) as Experiment
  it('finds conflicts by shared path, site-wide conflicting with all', () => {
    const others = [exp('a', ['/']), exp('b', ['/shop']), exp('c', []), exp('d', ['/'], 'paused')]
    expect(findPathConflicts(exp('x', ['/']), others)).toEqual(['a', 'c'])
    expect(findPathConflicts(exp('x', ['/about']), others)).toEqual(['c'])
    expect(findPathConflicts(exp('x', []), others)).toEqual(['a', 'b', 'c'])
    expect(findPathConflicts(exp('a', ['/']), [exp('a', ['/'])])).toEqual([])
  })

  it('blocks start and resume with 409 and the conflicting keys', async () => {
    const ctx = await setup()
    await ctx.api('', draft('home-a', { paths: ['/'] }))
    await ctx.api('', draft('home-b', { paths: ['/', '/shop'] }))
    await ctx.api('', draft('about-c', { paths: ['/about'] }))
    expect((await ctx.api('/home-a/status', { action: 'start' })).status).toBe(200)
    const blocked = await ctx.api('/home-b/status', { action: 'start' })
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toMatchObject({ ok: false, conflicts: ['home-a'] })
    expect((await ctx.api('/about-c/status', { action: 'start' })).status).toBe(200)

    await ctx.api('/home-a/status', { action: 'pause' })
    expect((await ctx.api('/home-b/status', { action: 'start' })).status).toBe(200)
    const resume = await ctx.api('/home-a/status', { action: 'resume' })
    expect(resume.status).toBe(409)
    expect((await resume.json()).conflicts).toEqual(['home-b'])

    await ctx.api('', draft('everything'))
    expect((await (await ctx.api('/everything/status', { action: 'start' })).json()).conflicts).toEqual(['about-c', 'home-b'])
  })
})

describe('GET /:key/results (Phase 2 shape)', () => {
  it('adds rates, RPV, AOV, stats and a cumulative daily series', async () => {
    const ctx = await setup()
    await ctx.api('', draft('home-banner', { paths: ['/'], minDays: 1, minVisitorsPerArm: 2 }))
    await ctx.api('/home-banner/status', { action: 'start' })
    const exp = (await ctx.experiments.getByKey('home-banner'))!
    const day = (d: number, h = 12) => new Date(Date.UTC(2026, 10, d, h)).toISOString()
    await ctx.experiments.update(exp.id, { startedAt: day(1, 8) })
    const expose = (vid: string, variantKey: string, d: number) => ({
      experimentId: exp.id, visitorId: vid, variantKey, firstExposedAt: day(d), landingPath: '/', device: null, source: null, forced: false,
    })
    await ctx.experiments.recordExposures([
      expose('vid-c-000001', 'control', 1),
      expose('vid-c-000002', 'control', 2),
      expose('vid-b-000001', 'b', 1),
      expose('vid-b-000002', 'b', 3),
    ])
    await ctx.experiments.recordEvents([
      { dedupeKey: 'ev-0000001', visitorId: 'vid-b-000001', kind: 'add_to_cart', value: 38, occurredAt: day(1, 13) },
      { dedupeKey: 'ev-0000002', visitorId: 'vid-b-000001', kind: 'add_to_cart', value: 38, occurredAt: day(2, 13) },
      { dedupeKey: 'ev-0000003', visitorId: 'vid-b-000002', kind: 'add_to_cart', value: 38, occurredAt: day(3, 13) },
      { dedupeKey: 'ev-0000004', visitorId: 'vid-c-000002', kind: 'add_to_cart', value: 38, occurredAt: day(2, 13) },
    ])
    await ctx.experiments.upsertOrders([
      { channel: 'shopify', externalId: 'o1', orderedAt: day(1, 14), revenue: 40, visitorId: 'vid-b-000001', experiments: { 'home-banner': 'b' } },
      { channel: 'shopify', externalId: 'o2', orderedAt: day(2, 14), revenue: 60, visitorId: 'vid-b-000001', experiments: { 'home-banner': 'b' } },
    ])

    const { data } = await (await ctx.api('/home-banner/results')).json()

    expect(data).toMatchObject({ key: 'home-banner', status: 'running', primaryMetric: 'add_to_cart', endedAt: null })
    const [control, b] = data.arms
    expect(control).toMatchObject({ variant: 'control', visitors: 2, revenuePerVisitor: 0, aov: 0 })
    expect(control.rates).toEqual({ add_to_cart: 0.5, begin_checkout: 0, contact_submit: 0, newsletter_subscribe: 0, purchase: 0 })
    expect(b).toMatchObject({ variant: 'b', visitors: 2, orders: 2, purchasers: 1, revenue: 100, revenuePerVisitor: 50, aov: 50 })
    expect(b.rates).toEqual({ add_to_cart: 1, begin_checkout: 0, contact_submit: 0, newsletter_subscribe: 0, purchase: 0.5 })

    const { stats } = data
    expect(stats.comparisons).toHaveLength(5)
    expect(stats.comparisons[0]).toMatchObject({ variant: 'b', metric: 'add_to_cart', controlRate: 0.5, variantRate: 1, lift: 1 })
    for (const key of ['liftInterval', 'probBeatsControl', 'expectedLoss', 'pValue']) expect(stats.comparisons[0]).toHaveProperty(key)
    expect(stats.rpv).toEqual([
      expect.objectContaining({ variant: 'b', controlRpv: 0, variantRpv: 50, lift: null, probBeatsControl: expect.any(Number) }),
    ])
    expect(stats.srm).toEqual({ pValue: 1, ok: true })
    expect(stats.gate).toMatchObject({ minDays: 1, minVisitorsPerArm: 2, smallestArm: 2, ready: true })
    expect(['winner', 'no_difference', 'guardrail_fail']).toContain(stats.verdict)

    // Cumulative, gaps filled from the start day.
    expect(data.daily.slice(0, 3)).toEqual([
      { date: '2026-11-01', arms: { control: { visitors: 1, conversions: 0 }, b: { visitors: 1, conversions: 1 } } },
      { date: '2026-11-02', arms: { control: { visitors: 2, conversions: 1 }, b: { visitors: 1, conversions: 1 } } },
      { date: '2026-11-03', arms: { control: { visitors: 2, conversions: 1 }, b: { visitors: 2, conversions: 2 } } },
    ])

    // Deterministic per request.
    const again = await (await ctx.api('/home-banner/results')).json()
    expect(again.data.stats).toEqual(stats)
  })

  it('returns an early verdict and empty daily series for a fresh draft', async () => {
    const ctx = await setup()
    await ctx.api('', draft('fresh-one'))
    const { data } = await (await ctx.api('/fresh-one/results')).json()
    expect(data.daily).toEqual([])
    expect(data.stats).toMatchObject({ verdict: 'early', winner: null, gate: { days: 0, smallestArm: 0, ready: false } })
  })
})

const registry = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  name: 'Retro Roller banner',
  hypothesis: 'The banner lifts add-to-cart',
  variants: [
    { key: 'control', name: 'Current home', weight: 50 },
    { key: 'b', name: 'Splat banner', weight: 50 },
  ],
  primaryMetric: 'add_to_cart',
  paths: ['/'],
  minVisitorsPerArm: 1000,
  minDays: 14,
  ...extra,
})
const pr = { number: 89, url: 'https://github.com/Sunday-Rolls/website/pull/89', branch: 'feature/retro-roller' }

describe('POST /experiments/ci', () => {
  it('answers 503 without a server token and 401 with a wrong one', async () => {
    const off = await setup({ ciToken: '' })
    expect((await off.ci({ action: 'upsert', pr, experiments: [registry('home-banner')] })).status).toBe(503)
    expect((await off.stale()).status).toBe(503)
    const ctx = await setup()
    expect((await ctx.ci({}, null)).status).toBe(401)
    expect((await ctx.ci({}, 'wrong')).status).toBe(401)
    expect((await ctx.stale('wrong')).status).toBe(401)
    expect(bearerMatches(`Bearer ${CI_TOKEN}`, CI_TOKEN)).toBe(true)
    expect(bearerMatches(CI_TOKEN, CI_TOKEN)).toBe(false)
    expect(bearerMatches(`Bearer ${CI_TOKEN}x`, CI_TOKEN)).toBe(false)
  })

  it('validates the body with the create rules', async () => {
    const ctx = await setup()
    const status = async (body: unknown) => (await ctx.ci(body)).status
    expect(await status('{nope')).toBe(400)
    expect(await status({ action: 'deploy', pr, experiments: [] })).toBe(400)
    expect(await status({ action: 'upsert', pr: { url: pr.url }, experiments: [registry('home-banner')] })).toBe(400)
    expect(await status({ action: 'upsert', pr, experiments: [] })).toBe(400)
    expect(await status({ action: 'upsert', pr, experiments: [registry('home-banner', { paths: ['nope'] })] })).toBe(400)
    expect(await status({ action: 'upsert', pr, experiments: [registry('home-banner'), registry('home-banner')] })).toBe(400)
    expect(await status({ action: 'merged', pr, experiments: [] })).toBe(400) // needs mergeSha
    const res = await ctx.ci({ action: 'upsert', pr, experiments: [registry('home-banner', { variants: [{ key: 'b', weight: 100 }] })] })
    expect((await res.json()).error).toMatch(/experiments\[0\] \(home-banner\)/)
  })

  it('upserts drafts, locks non-drafts, then merges and lists stale ones', async () => {
    const ctx = await setup()
    const upsert = async (experiments: unknown[], prOverride = pr) =>
      (await (await ctx.ci({ action: 'upsert', pr: prOverride, experiments })).json()).results

    expect(await upsert([registry('home-banner'), registry('shop-grid', { paths: ['/shop'] })])).toEqual([
      { key: 'home-banner', outcome: 'created' },
      { key: 'shop-grid', outcome: 'created' },
    ])
    const created = (await ctx.experiments.getByKey('home-banner'))!
    expect(created).toMatchObject({
      status: 'draft',
      source: 'github',
      createdBy: 'github-actions',
      prNumber: 89,
      prUrl: pr.url,
      branch: pr.branch,
      paths: ['/'],
      trafficPct: 100,
      variants: [
        { key: 'control', name: 'Current home', weight: 50, isControl: true },
        { key: 'b', name: 'Splat banner', weight: 50, isControl: false },
      ],
    })

    expect(await upsert([registry('home-banner')])).toEqual([{ key: 'home-banner', outcome: 'unchanged' }])
    const threeArms = [
      { key: 'control', name: 'Current home', weight: 34 },
      { key: 'b', name: 'Splat banner', weight: 33 },
      { key: 'c', name: 'Still banner', weight: 33 },
    ]
    expect(await upsert([registry('home-banner', { variants: threeArms, minDays: 21, name: 'Renamed' })])).toEqual([
      { key: 'home-banner', outcome: 'updated' },
    ])
    const updated = (await ctx.experiments.getByKey('home-banner'))!
    expect(updated).toMatchObject({ name: 'Renamed', minDays: 21, seed: created.seed })
    expect(updated.variants.map((v) => `${v.key}:${v.weight}`)).toEqual(['control:34', 'b:33', 'c:33'])

    // Running: registry changes are refused.
    await ctx.api('/home-banner/status', { action: 'start' })
    expect(await upsert([registry('home-banner', { name: 'Again' })])).toEqual([{ key: 'home-banner', outcome: 'locked' }])
    expect((await ctx.experiments.getByKey('home-banner'))!.name).toBe('Renamed')

    const merged = await ctx.ci({ action: 'merged', pr: { ...pr, mergeSha: 'abc1234def' }, experiments: [] })
    const mergedResults = (await merged.json()).results
    expect(mergedResults).toHaveLength(2)
    expect(mergedResults).toEqual(
      expect.arrayContaining([
        { key: 'shop-grid', outcome: 'updated' },
        { key: 'home-banner', outcome: 'updated' },
      ]),
    )
    const again = await ctx.ci({ action: 'merged', pr: { ...pr, mergeSha: 'abc1234def' }, experiments: [] })
    expect((await again.json()).results.every((r: { outcome: string }) => r.outcome === 'unchanged')).toBe(true)
    expect((await ctx.experiments.getByKey('home-banner'))!.mergeSha).toBe('abc1234def')

    const audit = await ctx.experiments.listAudit(created.id)
    expect(audit.filter((a) => a.actor === 'github-actions').map((a) => a.action).reverse()).toEqual(['created', 'updated', 'merged'])

    // Stale: promoted/stopped and ended more than 14 days ago.
    await ctx.api('/home-banner/status', { action: 'promote', variant: 'b' })
    expect((await (await ctx.stale()).json()).experiments).toEqual([])
    const old = new Date(Date.now() - 15 * 86_400_000).toISOString()
    await ctx.experiments.update(created.id, { endedAt: old })
    expect(await (await ctx.stale()).json()).toEqual({
      ok: true,
      experiments: [{ key: 'home-banner', status: 'promoted', winner: 'b', endedAt: old, prNumber: 89 }],
    })
  })

  it('archives drafts still linked to a closed PR', async () => {
    const ctx = await setup()
    await ctx.ci({ action: 'upsert', pr, experiments: [registry('home-banner'), registry('shop-grid', { paths: ['/shop'] })] })
    await ctx.ci({ action: 'upsert', pr: { ...pr, number: 90 }, experiments: [registry('other-pr', { paths: ['/about'] })] })
    await ctx.api('/shop-grid/status', { action: 'start' })
    const res = await ctx.ci({ action: 'closed', pr, experiments: [] })
    expect((await res.json()).results).toEqual(
      expect.arrayContaining([
        { key: 'home-banner', outcome: 'archived' },
        { key: 'shop-grid', outcome: 'locked' },
      ]),
    )
    expect((await ctx.experiments.getByKey('home-banner'))!.status).toBe('archived')
    expect((await ctx.experiments.getByKey('other-pr'))!.status).toBe('draft')
    const audit = await ctx.experiments.listAudit((await ctx.experiments.getByKey('home-banner'))!.id)
    expect(audit[0]).toMatchObject({ actor: 'github-actions', action: 'archived' })
  })

  it('rate limits per IP', async () => {
    const ctx = await setup()
    for (let i = 0; i < 30; i++) expect((await ctx.ci({}, 'wrong', '203.0.113.50')).status).toBe(401)
    expect((await ctx.ci({}, CI_TOKEN, '203.0.113.50')).status).toBe(429)
    expect((await ctx.ci({}, CI_TOKEN, '203.0.113.51')).status).toBe(400)
  })
})

describe('conclusion dispatch', () => {
  async function runningExperiment(options: SetupOptions) {
    const ctx = await setup(options)
    await ctx.ci({ action: 'upsert', pr, experiments: [registry('home-banner')] })
    await ctx.api('/home-banner/status', { action: 'start' })
    return ctx
  }

  it('POSTs repository_dispatch on promote and stop', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    const ctx = await runningExperiment({ dispatchToken: 'gh-token', fetch: fetchMock as unknown as typeof fetch })
    expect((await ctx.api('/home-banner/status', { action: 'stop' })).status).toBe(200)
    expect((await ctx.api('/home-banner/status', { action: 'promote', variant: 'b' })).status).toBe(200)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    const [url, init] = calls[0]!
    expect(url).toBe('https://api.github.com/repos/Sunday-Rolls/website/dispatches')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gh-token')
    expect(JSON.parse(String(init.body))).toEqual({
      event_type: 'experiment-concluded',
      client_payload: { key: 'home-banner', outcome: 'stopped', winner: null, prNumber: 89 },
    })
    expect(JSON.parse(String(calls[1]![1].body)).client_payload).toEqual({ key: 'home-banner', outcome: 'promoted', winner: 'b', prNumber: 89 })
  })

  it('never blocks the action and audits dispatch_failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))
    const ctx = await runningExperiment({ dispatchToken: 'gh-token', fetch: fetchMock as unknown as typeof fetch })
    const res = await ctx.api('/home-banner/status', { action: 'promote', variant: 'b' })
    expect(res.status).toBe(200)
    expect((await res.json()).experiment.status).toBe('promoted')
    const id = (await ctx.experiments.getByKey('home-banner'))!.id
    await vi.waitFor(async () => {
      const audit = await ctx.experiments.listAudit(id)
      expect(audit[0]).toMatchObject({ action: 'dispatch_failed', detail: { outcome: 'promoted', winner: 'b' } })
    })

    const throwing = vi.fn(async () => {
      throw new Error('network down')
    })
    const ctx2 = await runningExperiment({ dispatchToken: 'gh-token', fetch: throwing as unknown as typeof fetch })
    expect((await ctx2.api('/home-banner/status', { action: 'stop' })).status).toBe(200)
    const id2 = (await ctx2.experiments.getByKey('home-banner'))!.id
    await vi.waitFor(async () => {
      expect((await ctx2.experiments.listAudit(id2))[0]).toMatchObject({ action: 'dispatch_failed', detail: { error: 'network down' } })
    })
  })

  it('does nothing without a dispatch token', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    const ctx = await runningExperiment({ fetch: fetchMock as unknown as typeof fetch })
    await ctx.api('/home-banner/status', { action: 'stop' })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
