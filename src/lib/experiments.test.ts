import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetExperimentsForTests,
  bootExperiments,
  experimentString,
  flushExperimentEvents,
  getExperimentsSnapshot,
  getVariant,
  recordExposure,
  trackExperimentEvent,
  visitorId,
} from './experiments'
import { allCartAttributes, cartNeedsStamp, markCartStamped } from './cart-attributes'
import { captureAttribution } from './attribution'
import { assign } from './experiments-core'

const API = 'https://api.test'
const VID = 'AbCdEfGhIjKlMnOpQrStUv'

type Sent = { url: string; body: { vid: string; events: Array<Record<string, unknown>> } }

let sent: Sent[] = []

function stubBeacon() {
  sent = []
  const pending: Promise<void>[] = []
  const beacon = vi.fn((url: string, data: Blob) => {
    pending.push(data.text().then((text) => void sent.push({ url, body: JSON.parse(text) })))
    return true
  })
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
  return { beacon, settle: () => Promise.all(pending) }
}

function inject(state: Partial<NonNullable<Window['__SR_EXP__']>> = {}) {
  window.__SR_EXP__ = {
    vid: VID,
    assignments: { 'home-banner': 'b' },
    tracked: ['home-banner'],
    bot: false,
    ...state,
  }
}

function clearCookie() {
  document.cookie = 'sr_vid=; Path=/; Max-Age=0'
}

beforeEach(() => {
  __resetExperimentsForTests()
  vi.stubEnv('VITE_CONTACT_API_URL', API)
  localStorage.clear()
  sessionStorage.clear()
  clearCookie()
  delete window.__SR_EXP__
  window.dataLayer = []
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('boot from injected state', () => {
  it('is ready synchronously and renders the assigned arm', () => {
    inject()
    bootExperiments({ search: '' })
    expect(getVariant('home-banner')).toBe('b')
    expect(getVariant('missing')).toBe('control')
    expect(visitorId()).toBe(VID)
    expect(getExperimentsSnapshot().ready).toBe(true)
  })

  it('treats bots as control with no logging', async () => {
    inject({ vid: null, assignments: {}, tracked: [], bot: true })
    const { beacon } = stubBeacon()
    bootExperiments({ search: '' })
    recordExposure('home-banner')
    trackExperimentEvent('add_to_cart', 10)
    flushExperimentEvents()
    expect(getVariant('home-banner')).toBe('control')
    expect(beacon).not.toHaveBeenCalled()
    expect(experimentString()).toBe('')
  })
})

describe('browser fallback', () => {
  it('creates and stores a visitor id, then assigns from the fetched config', async () => {
    let resolve!: (r: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)))
    vi.stubGlobal('fetch', fetchMock)
    bootExperiments({ search: '' })

    const vid = visitorId()!
    expect(vid).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(localStorage.getItem('sr_vid')).toBe(vid)
    expect(document.cookie).toContain(`sr_vid=${vid}`)
    expect(fetchMock).toHaveBeenCalledWith(`${API}/experiments/config`, expect.anything())

    // Until the config arrives: control, nothing logged.
    expect(getVariant('home-banner')).toBe('control')
    expect(getExperimentsSnapshot().ready).toBe(false)

    const config = {
      key: 'home-banner',
      seed: 's1',
      status: 'running' as const,
      trafficPct: 100,
      variants: [
        { key: 'control', weight: 50 },
        { key: 'b', weight: 50 },
      ],
      winner: null,
    }
    resolve(new Response(JSON.stringify({ ok: true, experiments: [config] })))
    await vi.waitFor(() => expect(getExperimentsSnapshot().ready).toBe(true))
    expect(getVariant('home-banner')).toBe(assign(config, vid))
    expect(getExperimentsSnapshot().tracked).toEqual(['home-banner'])
  })

  it('reuses the cookie id over localStorage, and uses VITE_EXPERIMENTS_CONFIG_URL', () => {
    vi.stubEnv('VITE_EXPERIMENTS_CONFIG_URL', 'https://cfg.test/experiments/config')
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    document.cookie = `sr_vid=${VID}; Path=/`
    localStorage.setItem('sr_vid', 'other-id-123')
    bootExperiments({ search: '' })
    expect(visitorId()).toBe(VID)
    expect(localStorage.getItem('sr_vid')).toBe(VID)
    expect(fetchMock).toHaveBeenCalledWith('https://cfg.test/experiments/config', expect.anything())
  })

  it('stays control when the config fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    bootExperiments({ search: '' })
    await Promise.resolve()
    expect(getVariant('home-banner')).toBe('control')
  })
})

describe('sr_force', () => {
  it('overrides assignment for the tab and is sent as forced, outside sr_exp_seen', async () => {
    inject({ assignments: { 'home-banner': 'control' } })
    const { settle } = stubBeacon()
    bootExperiments({ search: '?sr_force=home-banner:b,other:control' })
    expect(sessionStorage.getItem('sr_force')).toBe('home-banner:b,other:control')
    expect(getVariant('home-banner')).toBe('b')
    expect(getVariant('other')).toBe('control')

    recordExposure('home-banner')
    recordExposure('home-banner')
    flushExperimentEvents()
    await settle()
    expect(sent).toHaveLength(1)
    expect(sent[0].body.events).toEqual([
      expect.objectContaining({ type: 'exposure', experiment: 'home-banner', variant: 'b', forced: true }),
    ])
    expect(localStorage.getItem('sr_exp_seen')).toBeNull()
    expect(experimentString()).toBe('')
    expect(window.dataLayer.some((e) => e.event === 'experiment_exposure')).toBe(false)
  })

  it('persists across navigations in the tab', () => {
    sessionStorage.setItem('sr_force', 'home-banner:c')
    inject()
    bootExperiments({ search: '' })
    expect(getVariant('home-banner')).toBe('c')
  })
})

describe('exposure + beacon', () => {
  it('logs once per visitor with the contract payload, and pushes GA4 experiment_exposure', async () => {
    inject()
    captureAttribution({ search: '?utm_source=google&utm_medium=cpc' }, '', localStorage, Date.now())
    const { beacon, settle } = stubBeacon()
    bootExperiments({ search: '' })

    recordExposure('home-banner')
    recordExposure('home-banner')
    trackExperimentEvent('add_to_cart', 38)
    flushExperimentEvents()
    await settle()

    expect(beacon).toHaveBeenCalledTimes(1)
    const [url, blob] = beacon.mock.calls[0]
    expect(url).toBe(`${API}/experiments/events`)
    expect(blob.type).toBe('text/plain')
    expect(sent[0].body.vid).toBe(VID)
    const [exposure, cart] = sent[0].body.events
    expect(exposure).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: 'exposure',
      experiment: 'home-banner',
      variant: 'b',
      forced: false,
      path: window.location.pathname,
      device: expect.stringMatching(/^(mobile|tablet|desktop)$/),
      source: 'google / cpc',
      at: expect.any(Number),
    })
    expect(cart).toEqual({ id: expect.any(String), type: 'add_to_cart', value: 38, at: expect.any(Number) })
    expect(JSON.parse(localStorage.getItem('sr_exp_seen')!)).toEqual({ 'home-banner': 'b' })
    expect(experimentString()).toBe('home-banner:b')
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'experiment_exposure', experiment_id: 'home-banner', variant_id: 'b' }),
    )
  })

  it('does not re-log an experiment already in sr_exp_seen from an earlier visit', () => {
    localStorage.setItem('sr_exp_seen', JSON.stringify({ 'home-banner': 'b' }))
    inject()
    const { beacon } = stubBeacon()
    bootExperiments({ search: '' })
    recordExposure('home-banner')
    flushExperimentEvents()
    expect(beacon).not.toHaveBeenCalled()
    expect(experimentString()).toBe('home-banner:b')
  })

  it('ignores untracked (promoted) and unassigned experiments', () => {
    inject({ assignments: { 'home-banner': 'b', done: 'b' }, tracked: ['home-banner'] })
    const { beacon } = stubBeacon()
    bootExperiments({ search: '' })
    recordExposure('done')
    recordExposure('nobody')
    flushExperimentEvents()
    expect(beacon).not.toHaveBeenCalled()
    expect(getVariant('done')).toBe('b')
  })

  it('falls back to fetch keepalive without sendBeacon, and never throws', () => {
    inject()
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
    const fetchMock = vi.fn(() => Promise.reject(new Error('blocked')))
    vi.stubGlobal('fetch', fetchMock)
    bootExperiments({ search: '' })
    trackExperimentEvent('newsletter_subscribe')
    expect(() => flushExperimentEvents()).not.toThrow()
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/experiments/events`,
      expect.objectContaining({ method: 'POST', keepalive: true }),
    )
  })

  it('splits more than 20 events across requests', async () => {
    inject()
    const { beacon } = stubBeacon()
    bootExperiments({ search: '' })
    for (let i = 0; i < 25; i++) trackExperimentEvent('add_to_cart', i)
    flushExperimentEvents()
    expect(beacon).toHaveBeenCalledTimes(2)
  })
})

describe('gtm exp_variants', () => {
  it('adds exp_variants to every push once exposed, and sends funnel steps to the beacon', async () => {
    inject()
    const { settle } = stubBeacon()
    bootExperiments({ search: '' })
    const gtm = await import('./gtm')

    gtm.pushEvent('cta_click', { cta_name: 'x' })
    expect(window.dataLayer.at(-1)).not.toHaveProperty('exp_variants')

    recordExposure('home-banner')
    gtm.trackAddToCart({ id: 'p1', title: 'Retro Roller', price: '80.00' }, 2)
    gtm.trackContactSubmit()
    expect(window.dataLayer.filter((e) => e.event === 'add_to_cart')[0]).toMatchObject({
      exp_variants: 'home-banner:b',
    })
    expect(window.dataLayer.at(-1)).toMatchObject({ event: 'contact_submit', exp_variants: 'home-banner:b' })

    flushExperimentEvents()
    await settle()
    const types = sent.flatMap((s) => s.body.events.map((e) => [e.type, e.value]))
    expect(types).toEqual([
      ['exposure', undefined],
      ['add_to_cart', 160],
      ['contact_submit', undefined],
    ])
  })
})

describe('cart attributes', () => {
  it('sends attribution and experiment keys together, and re-stamps when exposures change', () => {
    captureAttribution({ search: '?gclid=abc' }, '', localStorage, Date.now())
    inject()
    bootExperiments({ search: '' })

    expect(allCartAttributes()).toEqual([
      { key: '_sr_source', value: 'google' },
      { key: '_sr_medium', value: 'cpc' },
      { key: '_sr_click', value: 'gclid' },
      { key: '_sr_vid', value: VID },
    ])
    markCartStamped('cart-1')
    expect(cartNeedsStamp('cart-1')).toBe(false)

    recordExposure('home-banner')
    expect(cartNeedsStamp('cart-1')).toBe(true)
    expect(allCartAttributes()).toContainEqual({ key: '_sr_exp', value: 'home-banner:b' })
    expect(allCartAttributes()).toContainEqual({ key: '_sr_source', value: 'google' })
    markCartStamped('cart-1')
    expect(cartNeedsStamp('cart-1')).toBe(false)
    expect(cartNeedsStamp('cart-2')).toBe(true)
  })
})
