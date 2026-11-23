// Logic for .github/workflows/experiments.yml (docs/EXPERIMENTS_CONTRACT.md, "GitHub integration").
// Loaded from actions/github-script with `await import(...)`. Everything that talks to GitHub,
// contact-api, git or the file system is passed in, so experiments.test.mjs runs it with fakes.
//
// Never log the CI token: it only ever goes into the Authorization header.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const MARKER = '<!-- sr-experiments -->'
export const DEFAULT_API_URL = 'https://contact-api-production-9af6.up.railway.app'
export const PREVIEW_ORIGIN = 'https://sunday-rolls.github.io/website/previews'
export const LABEL = 'ab-test'
export const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/
const ARM_PATTERN = /^[a-z0-9][a-z0-9_-]{0,23}$/
const REGISTRY_FILE = /^src\/experiments\/([^/]+)\.json$/

// ---------------------------------------------------------------------------------------------
// Pure helpers

/** contact-api base URL: the `EXPERIMENTS_API_URL` repo variable, else production. */
export function apiBase(value) {
  const base = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_API_URL
  return base.replace(/\/+$/, '')
}

/** Registry files among a PR's changed files (`pulls.listFiles` entries); removed files skipped. */
export function pickRegistryFiles(files) {
  return files
    .filter((f) => f.status !== 'removed')
    .map((f) => f.filename)
    .filter((name) => REGISTRY_FILE.test(name) && !name.endsWith('/schema.json'))
    .sort()
}

/** One preview link per arm: `…/previews/pr-N/<first path>?sr_force=<key>:<arm>`. */
export function previewLinks(entry, prNumber) {
  const first = Array.isArray(entry.paths) && entry.paths.length ? entry.paths[0] : '/'
  const path = first.replace(/^\/+/, '')
  return entry.variants.map((v) => ({
    arm: v.key,
    name: v.name ?? v.key,
    url: `${PREVIEW_ORIGIN}/pr-${prNumber}/${path}?sr_force=${entry.key}:${v.key}`,
  }))
}

/** Registry object as sent to `POST /experiments/ci` (the editor-only `$schema` is dropped). */
export function toCiExperiment(entry) {
  const { $schema: _schema, ...rest } = entry
  void _schema
  return rest
}

export function buildCiPayload(action, pr, experiments) {
  const prField = { number: pr.number, url: pr.url, branch: pr.branch }
  if (pr.mergeSha) prField.mergeSha = pr.mergeSha
  return { action, pr: prField, experiments: experiments.map(toCiExperiment) }
}

const OUTCOME_TEXT = {
  created: 'draft created',
  updated: 'draft updated',
  unchanged: 'unchanged',
  locked: 'locked: it has left draft, so registry edits are not applied',
  archived: 'archived',
}

/** Markdown lines describing a CI sync result (see `postCi`). */
export function describeSync(sync) {
  if (sync.status === 'not_configured') {
    return [
      '**Dashboard sync is not set up**: the repo has no `EXPERIMENTS_CI_TOKEN` secret, so no draft was',
      'created in Dashboard → Experiments. See README → "A/B tests" for the one-time setup.',
    ]
  }
  if (sync.status === 'error') {
    return [`**Dashboard sync failed**: ${sync.message}. The PR is not blocked; re-run the workflow once it is fixed.`]
  }
  const lines = ['**Dashboard sync**:']
  for (const r of sync.results ?? []) lines.push(`- \`${r.key}\`: ${OUTCOME_TEXT[r.outcome] ?? r.outcome}`)
  if (lines.length === 1) lines.push('- no changes reported')
  return lines
}

/** The single marker-tagged PR comment (updated in place on every run). */
export function buildPrComment({ prNumber, experiments, sync, dashboardUrl }) {
  const lines = [MARKER, '## A/B test previews', '']
  for (const exp of experiments) {
    const paths = exp.paths?.length ? exp.paths.map((p) => `\`${p}\``).join(', ') : 'site-wide'
    lines.push(`### ${exp.name} (\`${exp.key}\`)`)
    lines.push('')
    lines.push(`Primary metric \`${exp.primaryMetric}\` · paths ${paths}`)
    lines.push('')
    lines.push('| Arm | Weight | Preview |')
    lines.push('|-----|--------|---------|')
    for (const link of previewLinks(exp, prNumber)) {
      const weight = exp.variants.find((v) => v.key === link.arm)?.weight
      lines.push(`| ${link.name} (\`${link.arm}\`) | ${weight}% | ${link.url} |`)
    }
    lines.push('')
  }
  lines.push(
    'Each link forces that arm for the browser tab (`?sr_force=`); add `?sr_force=clear` to reset.',
    'The links work once the "Deploy GitHub Pages" check has finished for the latest push.',
    '',
    ...describeSync(sync),
    '',
    `Merging ships it **dark**: everyone sees \`control\` until someone presses Start in [Dashboard → Experiments](${dashboardUrl}).`,
  )
  return lines.join('\n')
}

export function buildNoRegistryComment() {
  return [
    MARKER,
    '## A/B test previews',
    '',
    `This PR has the \`${LABEL}\` label but adds or changes no \`src/experiments/<key>.json\` registry file.`,
    'Add one (see `src/experiments/aa-check.json` and the website-change skill), or remove the label.',
  ].join('\n')
}

export function buildClosedComment({ merged, experiments, sync, dashboardUrl }) {
  const keys = experiments.map((e) => `\`${e.key}\``).join(', ')
  const lines = merged
    ? [`Merged dark. Start it from [Dashboard → Experiments](${dashboardUrl}).`, '', `Experiments: ${keys}. Everyone sees \`control\` until it is started.`]
    : [`Closed without merging. Drafts still linked to this PR (${keys}) are archived in the dashboard.`]
  lines.push('', ...describeSync(sync))
  return lines.join('\n')
}

/** Which arm the cleanup keeps (`control` unless promoted with a valid winner). */
export function keepArm(outcome, winner) {
  return outcome === 'promoted' && typeof winner === 'string' && ARM_PATTERN.test(winner) ? winner : 'control'
}

export function cleanupIssueTitle(key, keep) {
  return `Clean up experiment \`${key}\`: keep \`${keep}\``
}

export function buildCleanupIssueBody({ key, outcome, winner, prNumber, repoUrl, files, endedAt }) {
  const keep = keepArm(outcome, winner)
  const what =
    outcome === 'promoted'
      ? `was promoted: everyone is already served \`${keep}\` through the dashboard config`
      : 'was stopped with no winner: everyone is already served `control`'
  const lines = [
    `Experiment \`${key}\` ${what}${endedAt ? ` (ended ${endedAt.slice(0, 10)})` : ''}. The flag code can now go.`,
    '',
  ]
  if (prNumber) lines.push(`Original PR: ${repoUrl}/pull/${prNumber}`, '')
  lines.push('**Files that still reference it** (`git grep` on `main`):', '')
  if (files.length) for (const f of files) lines.push(`- [\`${f}\`](${repoUrl}/blob/main/${f})`)
  else lines.push('- none found: the code may already be cleaned up')
  lines.push(
    '',
    '**Steps**',
    '',
    '1. Start a branch from `main` (`/start-feature`).',
    `2. Keep only the \`${keep}\` arm: unwrap \`<Variant experiment="${key}" is="${keep}">\` to its children and delete the other arms and their \`fallback\`; replace \`useVariant('${key}')\` checks with the \`${keep}\` branch.`,
    `3. In page content JSON, merge \`experiments["${key}"]["${keep}"]\` into the base content (nothing to merge for \`control\`) and delete the \`"${key}"\` entry, and the \`experiments\` block if it is now empty.`,
    `4. Delete \`src/experiments/${key}.json\`.`,
    '5. Run `npm test` and `npm run lint`, open the PR (`/open-preview`), and merge it once approved. Do not add the `ab-test` label.',
    '6. After it merges, archive the experiment in Dashboard → Experiments, then close this issue.',
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------
// I/O helpers (all injectable)

export function readRegistryEntries(files, readFile = (f) => readFileSync(f, 'utf8')) {
  return files.map((file) => JSON.parse(readFile(file)))
}

/** Files under src/ that mention `'key'` or `"key"`, plus the registry file if it is still there. */
export function filesReferencing(key, exec = defaultExec) {
  if (!KEY_PATTERN.test(key)) throw new Error(`invalid experiment key: ${JSON.stringify(key)}`)
  let out = ''
  try {
    out = exec('git', ['grep', '-l', '-F', '-e', `'${key}'`, '-e', `"${key}"`, '--', 'src'])
  } catch (error) {
    if (error?.status !== 1) throw error // 1 = no match
  }
  const files = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))
  try {
    if (exec('git', ['ls-files', '--', `src/experiments/${key}.json`]).trim()) files.add(`src/experiments/${key}.json`)
  } catch {
    // ignore
  }
  return [...files].sort()
}

function defaultExec(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/**
 * Calls contact-api's CI endpoint. Returns `{ status: 'ok', results }`, `{ status: 'not_configured' }`
 * when no token is available, or `{ status: 'error', message }`. Never throws, never logs the token.
 */
export async function callCi({ baseUrl, token, method = 'POST', path = '/experiments/ci', body, fetchImpl = fetch }) {
  if (!token) return { status: 'not_configured' }
  let res
  try {
    res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
        accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    return { status: 'error', message: `could not reach ${baseUrl} (${error?.name ?? 'error'})` }
  }
  if (res.status === 401) return { status: 'error', message: 'contact-api rejected the token (401): the GitHub secret and the Railway `EXPERIMENTS_CI_TOKEN` differ' }
  if (res.status === 503) return { status: 'error', message: 'contact-api has no `EXPERIMENTS_CI_TOKEN` set (503)' }
  let json = null
  try {
    json = await res.json()
  } catch {
    // fall through
  }
  if (!res.ok || !json?.ok) {
    const detail = typeof json?.error === 'string' ? `: ${json.error.slice(0, 200)}` : ''
    return { status: 'error', message: `contact-api answered HTTP ${res.status}${detail}` }
  }
  return { status: 'ok', results: json.results ?? [], data: json }
}

async function listAll(github, method, params) {
  return github.paginate(method, { ...params, per_page: 100 })
}

/** Creates or updates the PR comment that carries `MARKER`. */
export async function upsertMarkerComment(github, { owner, repo, issue_number }, body) {
  const comments = await listAll(github, github.rest.issues.listComments, { owner, repo, issue_number })
  const existing = comments.find((c) => c.body?.includes(MARKER))
  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body })
    return { id: existing.id, created: false }
  }
  const { data } = await github.rest.issues.createComment({ owner, repo, issue_number, body })
  return { id: data.id, created: true }
}

/** Opens an issue, or updates the open one with exactly this title. */
export async function upsertIssue(github, { owner, repo }, title, body) {
  const issues = await listAll(github, github.rest.issues.listForRepo, { owner, repo, state: 'open' })
  const existing = issues.find((i) => !i.pull_request && i.title === title)
  if (existing) {
    await github.rest.issues.update({ owner, repo, issue_number: existing.number, body })
    return { number: existing.number, created: false }
  }
  const { data } = await github.rest.issues.create({ owner, repo, title, body })
  return { number: data.number, created: true }
}

// ---------------------------------------------------------------------------------------------
// Entry points (one per trigger)

function deps(options) {
  return {
    env: options.env ?? process.env,
    fetchImpl: options.fetchImpl ?? fetch,
    readFile: options.readFile,
    exec: options.exec ?? defaultExec,
  }
}

/** pull_request opened / reopened / synchronize / labeled / closed, with the `ab-test` label. */
export async function runPullRequest({ github, context, core, ...options }) {
  const { env, fetchImpl, readFile } = deps(options)
  const pr = context.payload.pull_request
  const { owner, repo } = context.repo
  const baseUrl = apiBase(env.EXPERIMENTS_API_URL)
  const dashboardUrl = `${baseUrl}/dashboard/`

  const changed = await listAll(github, github.rest.pulls.listFiles, { owner, repo, pull_number: pr.number })
  const files = pickRegistryFiles(changed)
  const closed = context.payload.action === 'closed'

  if (!files.length) {
    if (closed) {
      core.info('No registry files in this PR; nothing to sync.')
      return { files }
    }
    await upsertMarkerComment(github, { owner, repo, issue_number: pr.number }, buildNoRegistryComment())
    core.setFailed(`The "${LABEL}" label is set but the PR adds or changes no src/experiments/<key>.json file.`)
    return { files }
  }

  const experiments = readRegistryEntries(files, readFile)
  core.info(`Registry files: ${files.join(', ')}`)
  const prInfo = { number: pr.number, url: pr.html_url, branch: pr.head.ref }

  if (closed) {
    const merged = Boolean(pr.merged)
    if (merged) prInfo.mergeSha = pr.merge_commit_sha
    const body = buildCiPayload(merged ? 'merged' : 'closed', prInfo, experiments)
    const sync = await callCi({ baseUrl, token: env.EXPERIMENTS_CI_TOKEN, body, fetchImpl })
    reportSync(core, sync)
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: pr.number,
      body: buildClosedComment({ merged, experiments, sync, dashboardUrl }),
    })
    return { files, sync }
  }

  const body = buildCiPayload('upsert', prInfo, experiments)
  const sync = await callCi({ baseUrl, token: env.EXPERIMENTS_CI_TOKEN, body, fetchImpl })
  reportSync(core, sync)
  await upsertMarkerComment(
    github,
    { owner, repo, issue_number: pr.number },
    buildPrComment({ prNumber: pr.number, experiments, sync, dashboardUrl }),
  )
  return { files, sync }
}

function reportSync(core, sync) {
  if (sync.status === 'not_configured') core.notice('EXPERIMENTS_CI_TOKEN secret is not set; skipped the dashboard sync.')
  else if (sync.status === 'error') core.warning(`Dashboard sync failed: ${sync.message}`)
  else core.info(`Dashboard sync: ${JSON.stringify(sync.results)}`)
}

/** repository_dispatch experiment-concluded → cleanup issue. */
export async function runDispatch({ github, context, core, ...options }) {
  const { exec } = deps(options)
  const payload = context.payload.client_payload ?? {}
  const { key, outcome, winner, prNumber } = payload
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    core.setFailed(`client_payload.key is missing or invalid: ${JSON.stringify(key)}`)
    return null
  }
  if (outcome !== 'promoted' && outcome !== 'stopped') {
    core.setFailed(`client_payload.outcome must be "promoted" or "stopped", got ${JSON.stringify(outcome)}`)
    return null
  }
  const safeWinner = typeof winner === 'string' && ARM_PATTERN.test(winner) ? winner : null
  const { owner, repo } = context.repo
  const repoUrl = `https://github.com/${owner}/${repo}`
  const files = filesReferencing(key, exec)
  const keep = keepArm(outcome, safeWinner)
  const pr = Number.isInteger(prNumber) && prNumber > 0 ? prNumber : null
  const issue = await upsertIssue(
    github,
    { owner, repo },
    cleanupIssueTitle(key, keep),
    buildCleanupIssueBody({ key, outcome, winner: safeWinner, prNumber: pr, repoUrl, files }),
  )
  core.info(`${issue.created ? 'Opened' : 'Updated'} cleanup issue #${issue.number}`)
  return issue
}

/** Weekly schedule / workflow_dispatch → issues for concluded experiments still in src/. */
export async function runStale({ github, context, core, ...options }) {
  const { env, fetchImpl, exec } = deps(options)
  if (!env.EXPERIMENTS_CI_TOKEN) {
    core.notice('EXPERIMENTS_CI_TOKEN secret is not set; skipping the stale-experiment check.')
    return []
  }
  const baseUrl = apiBase(env.EXPERIMENTS_API_URL)
  const res = await callCi({ baseUrl, token: env.EXPERIMENTS_CI_TOKEN, method: 'GET', path: '/experiments/ci/stale', fetchImpl })
  if (res.status !== 'ok') {
    core.warning(`Stale check failed: ${res.message}`)
    return []
  }
  const { owner, repo } = context.repo
  const repoUrl = `https://github.com/${owner}/${repo}`
  const opened = []
  for (const exp of res.data.experiments ?? []) {
    if (typeof exp.key !== 'string' || !KEY_PATTERN.test(exp.key)) continue
    const files = filesReferencing(exp.key, exec)
    if (!files.length) continue
    const outcome = exp.status === 'promoted' ? 'promoted' : 'stopped'
    const keep = keepArm(outcome, exp.winner)
    const issue = await upsertIssue(
      github,
      { owner, repo },
      cleanupIssueTitle(exp.key, keep),
      buildCleanupIssueBody({
        key: exp.key,
        outcome,
        winner: keep === 'control' ? null : keep,
        prNumber: Number.isInteger(exp.prNumber) && exp.prNumber > 0 ? exp.prNumber : null,
        repoUrl,
        files,
        endedAt: typeof exp.endedAt === 'string' ? exp.endedAt : undefined,
      }),
    )
    core.info(`${exp.key}: ${issue.created ? 'opened' : 'updated'} issue #${issue.number}`)
    opened.push({ key: exp.key, ...issue })
  }
  return opened
}
