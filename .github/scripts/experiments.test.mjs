// node --test .github/scripts
// Fakes stand in for GitHub, contact-api and git: nothing here touches the network.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_API_URL,
  MARKER,
  apiBase,
  buildCiPayload,
  buildCleanupIssueBody,
  buildPrComment,
  callCi,
  cleanupIssueTitle,
  filesReferencing,
  keepArm,
  pickRegistryFiles,
  previewLinks,
  runDispatch,
  runPullRequest,
  runStale,
} from './experiments.mjs'

const TOKEN = 'test-token-value'

const entry = {
  $schema: './schema.json',
  key: 'home-banner',
  name: 'Retro Roller banner',
  hypothesis: 'Lifts add to cart',
  variants: [
    { key: 'control', name: 'Current home', weight: 50 },
    { key: 'b', name: 'Splat banner', weight: 50 },
  ],
  primaryMetric: 'add_to_cart',
  paths: ['/shop'],
}

function fakeCore() {
  const log = { info: [], notice: [], warning: [], failed: [] }
  return {
    log,
    info: (m) => log.info.push(m),
    notice: (m) => log.notice.push(m),
    warning: (m) => log.warning.push(m),
    setFailed: (m) => log.failed.push(m),
  }
}

function fakeGithub({ files = [], comments = [], issues = [] } = {}) {
  const calls = []
  const rest = {
    pulls: { listFiles: async () => ({ data: files }) },
    issues: {
      listComments: async () => ({ data: comments }),
      listForRepo: async () => ({ data: issues }),
      createComment: async (p) => (calls.push(['createComment', p]), { data: { id: 99 } }),
      updateComment: async (p) => (calls.push(['updateComment', p]), { data: {} }),
      create: async (p) => (calls.push(['createIssue', p]), { data: { number: 7 } }),
      update: async (p) => (calls.push(['updateIssue', p]), { data: {} }),
    },
  }
  return { calls, rest, paginate: async (method, params) => (await method(params)).data }
}

function fakeFetch(status, json) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return { status, ok: status >= 200 && status < 300, json: async () => json }
  }
  return { calls, impl }
}

function prContext(action, pr = {}) {
  return {
    repo: { owner: 'Sunday-Rolls', repo: 'website' },
    payload: {
      action,
      pull_request: {
        number: 42,
        html_url: 'https://github.com/Sunday-Rolls/website/pull/42',
        head: { ref: 'feature/banner' },
        merged: false,
        merge_commit_sha: 'abc123',
        ...pr,
      },
    },
  }
}

const readFile = () => JSON.stringify(entry)
const changed = [
  { filename: 'src/experiments/home-banner.json', status: 'added' },
  { filename: 'src/pages/Home.tsx', status: 'modified' },
]

describe('pure helpers', () => {
  it('falls back to the production API and trims slashes', () => {
    assert.equal(apiBase(''), DEFAULT_API_URL)
    assert.equal(apiBase(undefined), DEFAULT_API_URL)
    assert.equal(apiBase(' https://x.test/ '), 'https://x.test')
  })

  it('picks added or changed registry files only', () => {
    assert.deepEqual(
      pickRegistryFiles([
        { filename: 'src/experiments/b.json', status: 'modified' },
        { filename: 'src/experiments/a.json', status: 'added' },
        { filename: 'src/experiments/gone.json', status: 'removed' },
        { filename: 'src/experiments/schema.json', status: 'modified' },
        { filename: 'src/experiments/registry.ts', status: 'modified' },
        { filename: 'src/experiments/nested/x.json', status: 'added' },
        { filename: 'src/content/pages/home.json', status: 'modified' },
      ]),
      ['src/experiments/a.json', 'src/experiments/b.json'],
    )
  })

  it('builds one preview link per arm on the first path', () => {
    assert.deepEqual(previewLinks(entry, 42), [
      { arm: 'control', name: 'Current home', url: 'https://sunday-rolls.github.io/website/previews/pr-42/shop?sr_force=home-banner:control' },
      { arm: 'b', name: 'Splat banner', url: 'https://sunday-rolls.github.io/website/previews/pr-42/shop?sr_force=home-banner:b' },
    ])
    assert.equal(
      previewLinks({ ...entry, paths: [] }, 3)[0].url,
      'https://sunday-rolls.github.io/website/previews/pr-3/?sr_force=home-banner:control',
    )
  })

  it('builds CI payloads without $schema, with mergeSha only when merged', () => {
    const pr = { number: 42, url: 'u', branch: 'b' }
    const upsert = buildCiPayload('upsert', pr, [entry])
    assert.deepEqual(upsert.pr, { number: 42, url: 'u', branch: 'b' })
    assert.equal('$schema' in upsert.experiments[0], false)
    assert.equal(upsert.experiments[0].key, 'home-banner')
    assert.equal(buildCiPayload('merged', { ...pr, mergeSha: 's' }, [entry]).pr.mergeSha, 's')
  })

  it('writes a marker comment with links and the sync state', () => {
    const body = buildPrComment({
      prNumber: 42,
      experiments: [entry],
      sync: { status: 'ok', results: [{ key: 'home-banner', outcome: 'locked' }] },
      dashboardUrl: 'https://api.test/dashboard/',
    })
    assert.ok(body.startsWith(MARKER))
    assert.match(body, /pr-42\/shop\?sr_force=home-banner:b/)
    assert.match(body, /`home-banner`: locked/)
    assert.match(body, /\[Dashboard → Experiments\]\(https:\/\/api\.test\/dashboard\/\)/)
    const unsynced = buildPrComment({ prNumber: 1, experiments: [entry], sync: { status: 'not_configured' }, dashboardUrl: 'd' })
    assert.match(unsynced, /Dashboard sync is not set up/)
  })

  it('keeps the winner only when promoted with a valid arm', () => {
    assert.equal(keepArm('promoted', 'b'), 'b')
    assert.equal(keepArm('promoted', null), 'control')
    assert.equal(keepArm('promoted', 'Bad Arm!'), 'control')
    assert.equal(keepArm('stopped', 'b'), 'control')
    assert.equal(cleanupIssueTitle('home-banner', 'b'), 'Clean up experiment `home-banner`: keep `b`')
  })

  it('lists files and steps in the cleanup issue', () => {
    const body = buildCleanupIssueBody({
      key: 'home-banner',
      outcome: 'promoted',
      winner: 'b',
      prNumber: 89,
      repoUrl: 'https://github.com/Sunday-Rolls/website',
      files: ['src/pages/Home.tsx'],
    })
    assert.match(body, /pull\/89/)
    assert.match(body, /\[`src\/pages\/Home.tsx`\]\(https:\/\/github.com\/Sunday-Rolls\/website\/blob\/main\/src\/pages\/Home.tsx\)/)
    assert.match(body, /Delete `src\/experiments\/home-banner.json`/)
  })
})

describe('filesReferencing', () => {
  it('runs git grep without a shell and treats exit 1 as no match', () => {
    const seen = []
    const exec = (cmd, args) => {
      seen.push([cmd, ...args])
      if (args[0] === 'grep') {
        const error = new Error('no match')
        error.status = 1
        throw error
      }
      return ''
    }
    assert.deepEqual(filesReferencing('home-banner', exec), [])
    assert.deepEqual(seen[0], ['git', 'grep', '-l', '-F', '-e', "'home-banner'", '-e', '"home-banner"', '--', 'src'])
  })

  it('adds the registry file and rejects unsafe keys', () => {
    const exec = (_cmd, args) => (args[0] === 'grep' ? 'src/pages/Home.tsx\n' : 'src/experiments/home-banner.json\n')
    assert.deepEqual(filesReferencing('home-banner', exec), ['src/experiments/home-banner.json', 'src/pages/Home.tsx'])
    assert.throws(() => filesReferencing('$(rm -rf /)', exec), /invalid experiment key/)
  })
})

describe('callCi', () => {
  it('reports not_configured without a token and makes no request', async () => {
    const f = fakeFetch(200, { ok: true })
    assert.deepEqual(await callCi({ baseUrl: 'https://api.test', token: '', body: {}, fetchImpl: f.impl }), { status: 'not_configured' })
    assert.equal(f.calls.length, 0)
  })

  it('sends the bearer token and maps 401 / 503 / network errors without echoing it', async () => {
    const ok = fakeFetch(200, { ok: true, results: [{ key: 'k', outcome: 'created' }] })
    const res = await callCi({ baseUrl: 'https://api.test', token: TOKEN, body: { a: 1 }, fetchImpl: ok.impl })
    assert.equal(res.status, 'ok')
    assert.equal(ok.calls[0].url, 'https://api.test/experiments/ci')
    assert.equal(ok.calls[0].init.headers.authorization, `Bearer ${TOKEN}`)

    for (const status of [401, 503, 500]) {
      const r = await callCi({ baseUrl: 'https://api.test', token: TOKEN, body: {}, fetchImpl: fakeFetch(status, { ok: false }).impl })
      assert.equal(r.status, 'error')
      assert.ok(!r.message.includes(TOKEN))
    }
    const down = await callCi({
      baseUrl: 'https://api.test',
      token: TOKEN,
      body: {},
      fetchImpl: async () => {
        throw new TypeError(`fetch failed ${TOKEN}`)
      },
    })
    assert.equal(down.status, 'error')
    assert.ok(!down.message.includes(TOKEN))
  })
})

describe('runPullRequest', () => {
  it('upserts the draft and creates the marker comment', async () => {
    const github = fakeGithub({ files: changed })
    const core = fakeCore()
    const f = fakeFetch(200, { ok: true, results: [{ key: 'home-banner', outcome: 'created' }] })
    await runPullRequest({
      github,
      context: prContext('synchronize'),
      core,
      env: { EXPERIMENTS_CI_TOKEN: TOKEN, EXPERIMENTS_API_URL: 'https://api.test' },
      fetchImpl: f.impl,
      readFile,
    })
    const sent = JSON.parse(f.calls[0].init.body)
    assert.equal(sent.action, 'upsert')
    assert.deepEqual(sent.pr, { number: 42, url: 'https://github.com/Sunday-Rolls/website/pull/42', branch: 'feature/banner' })
    const [kind, params] = github.calls[0]
    assert.equal(kind, 'createComment')
    assert.match(params.body, /draft created/)
    assert.equal(core.log.failed.length, 0)
    assert.ok(![...core.log.info, ...core.log.notice, ...core.log.warning].some((m) => m.includes(TOKEN)))
  })

  it('updates the existing marker comment and notes a missing secret', async () => {
    const github = fakeGithub({
      files: changed,
      comments: [
        { id: 1, body: '## Preview\n\nhttps://sunday-rolls.github.io/website/previews/pr-42/' },
        { id: 2, body: `${MARKER}\nold` },
      ],
    })
    const core = fakeCore()
    const f = fakeFetch(200, {})
    await runPullRequest({ github, context: prContext('labeled'), core, env: {}, fetchImpl: f.impl, readFile })
    assert.equal(f.calls.length, 0)
    assert.equal(github.calls[0][0], 'updateComment')
    assert.equal(github.calls[0][1].comment_id, 2)
    assert.match(github.calls[0][1].body, /Dashboard sync is not set up/)
    assert.equal(core.log.notice.length, 1)
  })

  it('fails clearly when the label is set but no registry file changed', async () => {
    const github = fakeGithub({ files: [{ filename: 'src/pages/Home.tsx', status: 'modified' }] })
    const core = fakeCore()
    await runPullRequest({ github, context: prContext('opened'), core, env: {}, readFile })
    assert.match(core.log.failed[0], /no src\/experiments\/<key>\.json/)
    assert.match(github.calls[0][1].body, /adds or changes no/)
  })

  it('sends merged with the merge sha and comments "Merged dark"', async () => {
    const github = fakeGithub({ files: changed })
    const f = fakeFetch(200, { ok: true, results: [{ key: 'home-banner', outcome: 'updated' }] })
    await runPullRequest({
      github,
      context: prContext('closed', { merged: true }),
      core: fakeCore(),
      env: { EXPERIMENTS_CI_TOKEN: TOKEN },
      fetchImpl: f.impl,
      readFile,
    })
    assert.equal(f.calls[0].url, `${DEFAULT_API_URL}/experiments/ci`)
    const sent = JSON.parse(f.calls[0].init.body)
    assert.equal(sent.action, 'merged')
    assert.equal(sent.pr.mergeSha, 'abc123')
    assert.match(github.calls[0][1].body, /^Merged dark\. Start it from \[Dashboard → Experiments\]/)
  })

  it('sends closed for an unmerged PR', async () => {
    const github = fakeGithub({ files: changed })
    const f = fakeFetch(200, { ok: true, results: [{ key: 'home-banner', outcome: 'archived' }] })
    await runPullRequest({ github, context: prContext('closed'), core: fakeCore(), env: { EXPERIMENTS_CI_TOKEN: TOKEN }, fetchImpl: f.impl, readFile })
    const sent = JSON.parse(f.calls[0].init.body)
    assert.equal(sent.action, 'closed')
    assert.equal('mergeSha' in sent.pr, false)
    assert.match(github.calls[0][1].body, /archived/)
  })
})

describe('runDispatch', () => {
  const exec = (_cmd, args) => (args[0] === 'grep' ? 'src/pages/Home.tsx\n' : '')
  const context = (client_payload) => ({ repo: { owner: 'Sunday-Rolls', repo: 'website' }, payload: { client_payload } })

  it('opens a cleanup issue keeping the winner', async () => {
    const github = fakeGithub()
    await runDispatch({ github, context: context({ key: 'home-banner', outcome: 'promoted', winner: 'b', prNumber: 89 }), core: fakeCore(), exec })
    const [kind, params] = github.calls[0]
    assert.equal(kind, 'createIssue')
    assert.equal(params.title, 'Clean up experiment `home-banner`: keep `b`')
    assert.match(params.body, /src\/pages\/Home.tsx/)
  })

  it('updates an open issue with the same title instead of duplicating', async () => {
    const github = fakeGithub({ issues: [{ number: 5, title: 'Clean up experiment `home-banner`: keep `control`' }] })
    await runDispatch({ github, context: context({ key: 'home-banner', outcome: 'stopped', winner: null }), core: fakeCore(), exec })
    assert.equal(github.calls[0][0], 'updateIssue')
    assert.equal(github.calls[0][1].issue_number, 5)
  })

  it('rejects a bad payload', async () => {
    const core = fakeCore()
    const github = fakeGithub()
    await runDispatch({ github, context: context({ key: '../x', outcome: 'promoted' }), core, exec })
    assert.equal(github.calls.length, 0)
    assert.equal(core.log.failed.length, 1)
  })
})

describe('runStale', () => {
  const context = { repo: { owner: 'Sunday-Rolls', repo: 'website' }, payload: {} }

  it('skips quietly without the secret', async () => {
    const core = fakeCore()
    const f = fakeFetch(200, {})
    assert.deepEqual(await runStale({ github: fakeGithub(), context, core, env: {}, fetchImpl: f.impl }), [])
    assert.equal(f.calls.length, 0)
    assert.equal(core.log.notice.length, 1)
  })

  it('opens issues only for experiments still referenced in src/', async () => {
    const github = fakeGithub()
    const f = fakeFetch(200, {
      ok: true,
      experiments: [
        { key: 'home-banner', status: 'promoted', winner: 'b', endedAt: '2026-10-01T00:00:00Z', prNumber: 89 },
        { key: 'old-test', status: 'stopped', winner: null, endedAt: '2026-09-01T00:00:00Z', prNumber: null },
      ],
    })
    const exec = (_cmd, args) => (args.includes("'home-banner'") ? 'src/pages/Home.tsx\n' : '')
    const opened = await runStale({ github, context, core: fakeCore(), env: { EXPERIMENTS_CI_TOKEN: TOKEN }, fetchImpl: f.impl, exec })
    assert.equal(f.calls[0].url, `${DEFAULT_API_URL}/experiments/ci/stale`)
    assert.equal(f.calls[0].init.method, 'GET')
    assert.deepEqual(opened.map((o) => o.key), ['home-banner'])
    assert.match(github.calls[0][1].body, /ended 2026-10-01/)
  })
})
