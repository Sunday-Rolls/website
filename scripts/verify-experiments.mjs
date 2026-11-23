#!/usr/bin/env node
/**
 * Post-deploy check for A/B testing on the live site (no browser needed).
 *
 *   npm run experiments:verify                       # www.sundayrollsgolf.com + production contact-api
 *   npm run experiments:verify -- --expect home-banner
 *   SITE_URL=https://… API_URL=https://… npm run experiments:verify
 *
 * Read-only: it makes plain GET requests and never posts events, so it adds no visitors to
 * any test. Exits 1 if a check fails. The browser half (banner shows per arm, exposure beacon
 * fires) is `npm run experiments:verify:browser`. Runbook: docs/AB_TESTING_VERIFY.md.
 */
import { VID_COOKIE, assign, isValidVid, validateConfig } from './lib/experiments.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const SITE = (flag('--site') || process.env.SITE_URL || 'https://www.sundayrollsgolf.com').replace(/\/$/, '')
const API = (flag('--api') || process.env.API_URL || 'https://contact-api-production-9af6.up.railway.app').replace(/\/$/, '')
const EXPECT = flag('--expect') || process.env.EXPECT_EXPERIMENT || ''
const SAMPLE = Number(flag('--sample') || 30)

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

let failed = 0
const pass = (msg) => console.log(`  ✓ ${msg}`)
const fail = (msg) => {
  failed++
  console.log(`  ✗ ${msg}`)
}
const info = (msg) => console.log(`    ${msg}`)
const check = (ok, good, bad = good) => (ok ? pass(good) : fail(bad))

async function getHome({ ua = BROWSER_UA, cookie } = {}) {
  const headers = { 'User-Agent': ua, Accept: 'text/html' }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${SITE}/`, { headers, redirect: 'follow' })
  const html = await res.text()
  const match = /<script>window\.__SR_EXP__=(\{.*?\})<\/script>/s.exec(html)
  let state = null
  if (match) {
    try {
      state = JSON.parse(match[1])
    } catch {
      state = null
    }
  }
  const setCookie = res.headers.getSetCookie?.() ?? []
  const vidCookie = setCookie.find((c) => c.startsWith(`${VID_COOKIE}=`)) ?? null
  return { res, state, vidCookie, vid: vidCookie ? vidCookie.split(';')[0].split('=')[1] : null }
}

function expectedAssignments(experiments, vid) {
  const out = {}
  for (const exp of experiments) {
    const arm = assign(exp, vid)
    if (arm != null) out[exp.key] = arm
  }
  return out
}

const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

console.log(`A/B testing check\n  site ${SITE}\n  api  ${API}\n`)

// 1. Config endpoint (what the site server polls every 30 s).
console.log('1. Experiments config (contact-api)')
let experiments = []
try {
  const res = await fetch(`${API}/experiments/config`)
  const body = await res.json().catch(() => null)
  check(res.ok && body?.ok === true, `GET /experiments/config → ${res.status}`, `GET /experiments/config → ${res.status} ${JSON.stringify(body)?.slice(0, 200)}`)
  experiments = validateConfig(body)
  if (!experiments.length) info('No running or promoted experiments. Start one in the dashboard → Experiments.')
  for (const e of experiments) {
    info(`${e.key}: ${e.status}, traffic ${e.trafficPct}%, arms ${e.variants.map((v) => `${v.key} ${v.weight}%`).join(' / ')}`)
  }
  if (EXPECT) {
    const hit = experiments.find((e) => e.key === EXPECT)
    check(hit?.status === 'running', `${EXPECT} is running`, `${EXPECT} is not running (${hit ? hit.status : 'not in config'})`)
  }
} catch (error) {
  fail(`config fetch failed: ${error.message}`)
}

// 2. First visit: cookie, headers, injected state.
console.log('\n2. First visit (normal browser)')
const first = await getHome()
check(first.res.ok, `GET / → ${first.res.status}`)
check(Boolean(first.vidCookie), `sets ${VID_COOKIE} cookie`, `no ${VID_COOKIE} cookie: EXPERIMENTS_CONFIG_URL is probably not set on Railway "website"`)
if (first.vidCookie) {
  check(/Max-Age=15552000/i.test(first.vidCookie), 'cookie lasts 180 days', `cookie attributes: ${first.vidCookie}`)
  if (SITE.startsWith('https:')) {
    check(/;\s*Secure/i.test(first.vidCookie), 'cookie is Secure', 'cookie is not Secure (x-forwarded-proto not https?)')
  }
}
check(/cookie/i.test(first.res.headers.get('vary') || ''), 'Vary: Cookie', `Vary is "${first.res.headers.get('vary')}"`)
check(/private/.test(first.res.headers.get('cache-control') || ''), 'Cache-Control: private', `Cache-Control is "${first.res.headers.get('cache-control')}"`)
check(Boolean(first.state), 'page carries window.__SR_EXP__', 'no window.__SR_EXP__ in the HTML')
if (first.state && first.vid) {
  check(first.state.vid === first.vid, 'injected vid matches the cookie')
  const expected = expectedAssignments(experiments, first.vid)
  check(
    same(first.state.assignments, expected),
    `assignments ${JSON.stringify(first.state.assignments)} match the coin flip`,
    `assignments ${JSON.stringify(first.state.assignments)} ≠ expected ${JSON.stringify(expected)} (site server config may be up to 30 s stale; rerun)`,
  )
}

// 3. Return visit keeps the same version.
console.log('\n3. Return visit (same cookie)')
if (first.vid) {
  const again = await getHome({ cookie: `${VID_COOKIE}=${first.vid}` })
  check(!again.vidCookie, 'no new cookie issued', 'a new cookie was issued on the return visit')
  check(again.state?.vid === first.vid, 'same visitor id')
  check(
    same(again.state?.assignments ?? {}, first.state?.assignments ?? {}),
    'same version as the first visit',
    `version changed: ${JSON.stringify(first.state?.assignments)} → ${JSON.stringify(again.state?.assignments)}`,
  )
} else {
  info('skipped (no cookie from step 2)')
}

// 4. Bots always see the current site and are never counted.
console.log('\n4. Googlebot')
const bot = await getHome({ ua: GOOGLEBOT_UA })
check(!bot.vidCookie, 'no cookie for Googlebot', 'Googlebot was given a cookie')
check(bot.state?.bot === true && Object.keys(bot.state?.assignments ?? {}).length === 0, 'Googlebot gets no test versions', `Googlebot state: ${JSON.stringify(bot.state)}`)

// 5. Split across fresh visitors (rough: small sample).
const running = experiments.filter((e) => e.status === 'running')
if (SAMPLE > 0 && running.length && first.vidCookie) {
  console.log(`\n5. Split across ${SAMPLE} fresh visitors (rough check)`)
  const counts = Object.fromEntries(running.map((e) => [e.key, {}]))
  let mismatches = 0
  for (let i = 0; i < SAMPLE; i++) {
    const v = await getHome()
    if (!v.state || !isValidVid(v.vid)) continue
    if (!same(v.state.assignments, expectedAssignments(experiments, v.vid))) mismatches++
    for (const e of running) {
      const arm = v.state.assignments[e.key] ?? '(outside traffic)'
      counts[e.key][arm] = (counts[e.key][arm] ?? 0) + 1
    }
  }
  for (const [key, c] of Object.entries(counts)) info(`${key}: ${JSON.stringify(c)}`)
  check(mismatches === 0, 'every visitor got the version the coin flip predicts', `${mismatches} visitors got an unexpected version`)
  for (const e of running) {
    const seenArms = Object.keys(counts[e.key]).filter((a) => a !== '(outside traffic)')
    if (e.trafficPct >= 50 && SAMPLE >= 20) {
      check(seenArms.length === e.variants.length, `${e.key}: every arm showed up`, `${e.key}: only saw ${seenArms.join(', ') || 'none'}`)
    }
  }
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
