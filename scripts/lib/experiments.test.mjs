import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assign,
  buildState,
  createConfigPoller,
  fnv1a32,
  injectState,
  isBot,
  newVisitorId,
  parseCookies,
  unit,
  validateConfig,
} from './experiments.mjs'
import { createSpaHandler } from '../serve-spa.mjs'

const here = dirname(fileURLToPath(import.meta.url))

const running = {
  key: 'home-banner',
  seed: 'seed1',
  status: 'running',
  trafficPct: 100,
  variants: [
    { key: 'control', weight: 50 },
    { key: 'b', weight: 50 },
  ],
  winner: null,
}

describe('hash test vectors (contract)', () => {
  const vectors = [
    ['', 2166136261, 0.504343],
    ['a', 3826002220, 0.890811],
    ['aa-check:abc123', 4002643900, 0.931938],
    ['seed1:vid-0001', 638855030, 0.148745],
    ['seed1:traffic:vid-0001', 486515007, 0.113276],
    ['héllo', 1252296000, 0.291573],
  ]
  for (const [input, hash, u] of vectors) {
    test(JSON.stringify(input), () => {
      assert.equal(fnv1a32(input), hash)
      assert.equal(Number(unit(input).toFixed(6)), u)
    })
  }
})

describe('assign', () => {
  test('uses cumulative weights in order', () => {
    // unit('seed1:vid-0001') = 0.148745, traffic unit 0.113276
    assert.equal(assign(running, 'vid-0001'), 'control')
    assert.equal(assign({ ...running, variants: [{ key: 'control', weight: 10 }, { key: 'b', weight: 90 }] }, 'vid-0001'), 'b')
    assert.equal(assign({ ...running, variants: [{ key: 'control', weight: 15 }, { key: 'b', weight: 85 }] }, 'vid-0001'), 'control')
  })

  test('excludes visitors outside trafficPct', () => {
    assert.equal(assign({ ...running, trafficPct: 11 }, 'vid-0001'), null)
    assert.equal(assign({ ...running, trafficPct: 12 }, 'vid-0001'), 'control')
    assert.equal(assign({ ...running, trafficPct: 0 }, 'vid-0001'), null)
  })

  test('promoted returns the winner regardless of traffic', () => {
    assert.equal(assign({ ...running, status: 'promoted', winner: 'b', trafficPct: 0 }, 'vid-0001'), 'b')
  })

  test('falls back to last variant when weights fall short', () => {
    assert.equal(assign({ ...running, variants: [{ key: 'control', weight: 0 }, { key: 'b', weight: 0 }] }, 'vid-0001'), 'b')
  })

  test('splits roughly by weight and is sticky', () => {
    const exp = { ...running, variants: [{ key: 'control', weight: 20 }, { key: 'b', weight: 80 }] }
    let b = 0
    for (let i = 0; i < 5000; i++) if (assign(exp, `v${i}-xxxxxxxx`) === 'b') b++
    assert.ok(b > 3800 && b < 4200, `b=${b}`)
    assert.equal(assign(exp, 'stable-visitor'), assign(exp, 'stable-visitor'))
  })
})

describe('validateConfig', () => {
  test('skips bad entries and keeps good ones', () => {
    const list = validateConfig({
      experiments: [
        running,
        { ...running, key: 'Bad Key' },
        { ...running, key: 'no-control', variants: [{ key: 'a', weight: 50 }, { key: 'b', weight: 50 }] },
        { ...running, key: 'bad-sum', variants: [{ key: 'control', weight: 50 }, { key: 'b', weight: 40 }] },
        { ...running, key: 'frac', variants: [{ key: 'control', weight: 50.5 }, { key: 'b', weight: 49.5 }] },
        { ...running, key: 'draft', status: 'draft' },
        { ...running, key: 'no-winner', status: 'promoted', winner: 'zzz' },
        { ...running, key: 'traffic', trafficPct: 150 },
        { ...running, key: 'no-seed', seed: '' },
        { ...running, key: 'home-banner' }, // duplicate
        null,
        'x',
        { ...running, key: 'won', status: 'promoted', winner: 'b' },
      ],
    })
    assert.deepEqual(list.map((e) => e.key), ['home-banner', 'won'])
  })

  test('tolerates garbage payloads', () => {
    assert.deepEqual(validateConfig(null), [])
    assert.deepEqual(validateConfig({ experiments: 'nope' }), [])
    assert.deepEqual(validateConfig('str'), [])
  })
})

describe('bots, cookies, ids', () => {
  test('isBot matches the contract regex', () => {
    assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true)
    assert.equal(isBot('Mozilla/5.0 Chrome-Lighthouse'), true)
    assert.equal(isBot('Mozilla/5.0 HeadlessChrome/120'), true)
    assert.equal(isBot('facebookexternalhit/1.1'), true)
    assert.equal(isBot('Mozilla/5.0 (iPhone) Safari/604.1'), false)
    assert.equal(isBot(undefined), false)
  })

  test('allowAutomation lets Playwright through but not crawlers', () => {
    assert.equal(isBot('Mozilla/5.0 HeadlessChrome/120 Playwright', { allowAutomation: true }), false)
    assert.equal(isBot('Googlebot', { allowAutomation: true }), true)
  })

  test('parseCookies', () => {
    assert.deepEqual(parseCookies('a=1; sr_vid=abc_DEF-123456; b="q%20r"'), { a: '1', sr_vid: 'abc_DEF-123456', b: 'q r' })
    assert.deepEqual(parseCookies(''), {})
    assert.deepEqual(parseCookies('junk; x=%E0%A4%A'), { x: '%E0%A4%A' })
  })

  test('newVisitorId is 22-char base64url', () => {
    const id = newVisitorId()
    assert.match(id, /^[A-Za-z0-9_-]{22}$/)
    assert.notEqual(id, newVisitorId())
  })
})

describe('buildState / injectState', () => {
  const config = validateConfig({
    experiments: [
      running,
      { ...running, key: 'small', trafficPct: 0 },
      { ...running, key: 'won', status: 'promoted', winner: 'b' },
    ],
  })

  test('assigns running + promoted, tracks only running in-test', () => {
    assert.deepEqual(buildState({ config, vid: 'vid-0001', bot: false }), {
      vid: 'vid-0001',
      assignments: { 'home-banner': 'control', won: 'b' },
      tracked: ['home-banner'],
      bot: false,
    })
  })

  test('bots get nothing', () => {
    assert.deepEqual(buildState({ config, vid: 'vid-0001', bot: true }), { vid: null, assignments: {}, tracked: [], bot: true })
  })

  test('accepts a raw payload too', () => {
    assert.deepEqual(buildState({ config: { experiments: [running] }, vid: 'vid-0001', bot: false }).assignments, {
      'home-banner': 'control',
    })
  })

  test('injects before </head> and escapes <', () => {
    const state = { vid: 'v</script><b>', assignments: {}, tracked: [], bot: false }
    const out = injectState('<html><head><title>x</title></HEAD><body></body></html>', state)
    assert.equal(
      out,
      '<html><head><title>x</title><script>window.__SR_EXP__={"vid":"v\\u003c/script>\\u003cb>","assignments":{},"tracked":[],"bot":false}</script></HEAD><body></body></html>',
    )
    assert.equal(out.match(/<\/script>/g).length, 1)
  })

  test('$ patterns in state are not interpreted', () => {
    const out = injectState('<head></head>', { vid: "$&$'", assignments: {}, tracked: [], bot: false })
    assert.ok(out.includes('"vid":"$&$\'"'))
  })

  test('no </head> → prepended', () => {
    assert.ok(injectState('<p>x</p>', buildState({ config: [], vid: null, bot: true })).startsWith('<script>window.__SR_EXP__='))
  })
})

describe('createConfigPoller', () => {
  const okResponse = (body) => ({ ok: true, status: 200, json: async () => body })

  test('keeps last good config through failures, then goes stale', async () => {
    let t = 1000
    let mode = 'ok'
    const poller = createConfigPoller({
      url: 'http://stub/experiments/config',
      now: () => t,
      maxStaleMs: 600000,
      fetch: async () => {
        if (mode === 'ok') return okResponse({ ok: true, experiments: [running, { key: 'bad' }] })
        if (mode === '500') return { ok: false, status: 500, json: async () => ({}) }
        if (mode === 'garbage') return okResponse({ nope: true })
        throw new Error('network down')
      },
    })
    assert.deepEqual(poller.current(), [])
    assert.equal(await poller.refresh(), true)
    assert.deepEqual(poller.current().map((e) => e.key), ['home-banner'])

    for (mode of ['500', 'throw', 'garbage']) {
      t += 60000
      assert.equal(await poller.refresh(), false)
      assert.deepEqual(poller.current().map((e) => e.key), ['home-banner'])
    }
    t = 1000 + 600001
    assert.deepEqual(poller.current(), [])

    mode = 'ok'
    assert.equal(await poller.refresh(), true)
    assert.equal(poller.current().length, 1)
  })

  test('times out a hung fetch', async () => {
    const poller = createConfigPoller({
      url: 'http://stub',
      timeoutMs: 30,
      fetch: (url, { signal }) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    })
    const started = Date.now()
    assert.equal(await poller.refresh(), false)
    assert.ok(Date.now() - started < 1000)
    assert.deepEqual(poller.current(), [])
  })

  test('start/stop polls on an interval', async () => {
    let calls = 0
    const poller = createConfigPoller({
      url: 'http://stub',
      intervalMs: 10,
      fetch: async () => {
        calls++
        return okResponse({ experiments: [] })
      },
    })
    poller.start()
    await new Promise((r) => setTimeout(r, 60))
    poller.stop()
    const n = calls
    assert.ok(n >= 2, `calls=${n}`)
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(calls, n)
  })
})

// ---- integration: the real request handler over HTTP ----

const INDEX = '<!doctype html><html><head><title>Home</title></head><body><div id="root"></div></body></html>'
const SHOP = '<!doctype html><html><head><title>Shop</title></head><body>shop</body></html>'

async function makeDist() {
  const root = await mkdtemp(join(tmpdir(), 'sr-spa-'))
  const dist = join(root, 'dist')
  await mkdir(join(dist, 'shop'), { recursive: true })
  await mkdir(join(dist, 'assets'), { recursive: true })
  await writeFile(join(dist, 'index.html'), INDEX)
  await writeFile(join(dist, 'shop', 'index.html'), SHOP)
  await writeFile(join(dist, 'shop.html'), SHOP)
  await writeFile(join(dist, 'assets', 'app-abc.js'), 'console.log(1)')
  return { root, dist }
}

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }))
  })
}

function stateOf(html) {
  const m = html.match(/<script>window\.__SR_EXP__=(.*?)<\/script><\/head>/)
  return m ? JSON.parse(m[1]) : null
}

const BROWSER = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36'

describe('serve-spa handler', () => {
  let tmp
  let withExp
  let without
  let throwing
  const experiments = validateConfig({ experiments: [running, { ...running, key: 'won', status: 'promoted', winner: 'b' }] })

  before(async () => {
    tmp = await makeDist()
    withExp = await listen(createSpaHandler({ dist: tmp.dist, getExperiments: () => experiments }))
    without = await listen(createSpaHandler({ dist: tmp.dist }))
    throwing = await listen(
      createSpaHandler({
        dist: tmp.dist,
        getExperiments: () => {
          throw new Error('boom')
        },
      }),
    )
  })

  after(async () => {
    for (const s of [withExp, without, throwing]) s.server.close()
    await rm(tmp.root, { recursive: true, force: true })
  })

  test('new visitor gets a cookie, injected state and private caching', async () => {
    const res = await fetch(`${withExp.base}/`, { headers: { 'user-agent': BROWSER } })
    const body = await res.text()
    const cookie = res.headers.get('set-cookie')
    assert.match(cookie, /^sr_vid=[A-Za-z0-9_-]{22}; Path=\/; Max-Age=15552000; SameSite=Lax$/)
    assert.equal(res.headers.get('vary'), 'Cookie')
    assert.equal(res.headers.get('cache-control'), 'private, no-cache')
    assert.equal(Number(res.headers.get('content-length')), Buffer.byteLength(body))
    const state = stateOf(body)
    assert.equal(state.vid, cookie.split(';')[0].split('=')[1])
    assert.equal(state.assignments.won, 'b')
    assert.deepEqual(state.tracked, ['home-banner'])
    assert.equal(state.bot, false)
  })

  test('existing cookie is reused, Secure behind https proxy only when setting', async () => {
    const res = await fetch(`${withExp.base}/shop/`, { headers: { 'user-agent': BROWSER, cookie: 'sr_vid=vid-0001' } })
    assert.equal(res.headers.get('set-cookie'), null)
    assert.deepEqual(stateOf(await res.text()), {
      vid: 'vid-0001',
      assignments: { 'home-banner': 'control', won: 'b' },
      tracked: ['home-banner'],
      bot: false,
    })

    const https = await fetch(`${withExp.base}/shop.html`, {
      headers: { 'user-agent': BROWSER, cookie: 'sr_vid=bad!', 'x-forwarded-proto': 'https' },
    })
    assert.match(https.headers.get('set-cookie'), /; SameSite=Lax; Secure$/)
    assert.ok(stateOf(await https.text()).vid)
  })

  test('route shells and SPA fallback are injected', async () => {
    for (const path of ['/shop/', '/shop', '/shop.html', '/products/anything/', '/index.html']) {
      const res = await fetch(`${withExp.base}${path}`, { headers: { 'user-agent': BROWSER } })
      assert.equal(res.status, 200, path)
      assert.ok(stateOf(await res.text()), path)
    }
  })

  test('bots get no cookie and empty state', async () => {
    const res = await fetch(`${withExp.base}/`, { headers: { 'user-agent': 'Googlebot/2.1' } })
    assert.equal(res.headers.get('set-cookie'), null)
    assert.equal(res.headers.get('vary'), 'Cookie')
    assert.deepEqual(stateOf(await res.text()), { vid: null, assignments: {}, tracked: [], bot: true })
  })

  test('non-HTML responses are unchanged', async () => {
    const res = await fetch(`${withExp.base}/assets/app-abc.js`, { headers: { 'user-agent': BROWSER } })
    assert.equal(await res.text(), 'console.log(1)')
    assert.equal(res.headers.get('set-cookie'), null)
    assert.equal(res.headers.get('vary'), null)
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.equal((await fetch(`${withExp.base}/assets/missing.js`)).status, 404)
  })

  test('a throwing config source still serves the page with empty assignments', async () => {
    const res = await fetch(`${throwing.base}/`, { headers: { 'user-agent': BROWSER } })
    assert.equal(res.status, 200)
    const state = stateOf(await res.text())
    assert.deepEqual(state.assignments, {})
    assert.ok(state.vid)
  })

  test('without experiments the response is byte-for-byte the file', async () => {
    for (const [path, file] of [
      ['/', INDEX],
      ['/shop/', SHOP],
      ['/shop.html', SHOP],
      ['/nowhere', INDEX],
    ]) {
      const res = await fetch(`${without.base}${path}`, { headers: { 'user-agent': BROWSER } })
      assert.equal(await res.text(), file)
      assert.equal(res.headers.get('set-cookie'), null)
      assert.equal(res.headers.get('vary'), null)
      assert.equal(res.headers.get('cache-control'), 'no-cache')
      assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8')
      assert.equal(Number(res.headers.get('content-length')), Buffer.byteLength(file))
    }
    const health = await fetch(`${without.base}/health`)
    assert.equal(await health.text(), 'ok')
  })
})

// ---- end to end: spawn serve-spa.mjs with EXPERIMENTS_CONFIG_URL pointing at a stub ----

async function freePort() {
  const { server } = await listen(() => {})
  const { port } = server.address()
  await new Promise((r) => server.close(r))
  return port
}

function startSpa(cwd, env) {
  const child = spawn(process.execPath, [join(here, '..', 'serve-spa.mjs')], {
    cwd,
    env: { ...process.env, HOST: '127.0.0.1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => String(d).includes('listening') && resolve())
    child.on('exit', (code) => reject(new Error(`serve-spa exited ${code}`)))
  })
  return { child, ready }
}

describe('serve-spa process', () => {
  let tmp
  let stub
  before(async () => {
    tmp = await makeDist()
    stub = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, experiments: [{ ...running, key: 'won', status: 'promoted', winner: 'b' }] }))
    })
  })
  after(async () => {
    stub.server.close()
    await rm(tmp.root, { recursive: true, force: true })
  })

  test('EXPERIMENTS_CONFIG_URL set → state injected from polled config', async () => {
    const port = await freePort()
    const { child, ready } = startSpa(tmp.root, { PORT: String(port), EXPERIMENTS_CONFIG_URL: `${stub.base}/experiments/config` })
    try {
      await ready
      let state = null
      for (let i = 0; i < 50 && !state?.assignments?.won; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/`, { headers: { 'user-agent': BROWSER, cookie: 'sr_vid=vid-0001' } })
        state = stateOf(await res.text())
        if (!state?.assignments?.won) await new Promise((r) => setTimeout(r, 50))
      }
      assert.deepEqual(state, { vid: 'vid-0001', assignments: { won: 'b' }, tracked: [], bot: false })
    } finally {
      child.kill()
    }
  })

  test('EXPERIMENTS_CONFIG_URL unset → plain file', async () => {
    const port = await freePort()
    const { child, ready } = startSpa(tmp.root, { PORT: String(port), EXPERIMENTS_CONFIG_URL: '' })
    try {
      await ready
      const res = await fetch(`http://127.0.0.1:${port}/shop/`, { headers: { 'user-agent': BROWSER } })
      assert.equal(await res.text(), SHOP)
      assert.equal(res.headers.get('set-cookie'), null)
      assert.equal(res.headers.get('cache-control'), 'no-cache')
    } finally {
      child.kill()
    }
  })
})
