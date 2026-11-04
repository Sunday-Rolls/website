import { createHash, timingSafeEqual } from 'node:crypto'
import { ExperimentKeyTakenError, type ExperimentStore } from './store.js'
import type { Experiment, ExperimentPatch, ExperimentVariant } from './types.js'
import { newSeed, type CiRequest, type CreateExperimentInput } from './validation.js'

export const CI_ACTOR = 'github-actions'
export const STALE_AFTER_DAYS = 14

export type CiOutcome = 'created' | 'updated' | 'unchanged' | 'locked' | 'archived'
export type CiResult = { key: string; outcome: CiOutcome }

/** Constant-time bearer check (hashing first, so length differences don't leak either). */
export function bearerMatches(header: string | undefined, token: string): boolean {
  if (!header || !token) return false
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return false
  const a = createHash('sha256').update(match[1]!.trim()).digest()
  const b = createHash('sha256').update(token).digest()
  return timingSafeEqual(a, b)
}

/** `POST /experiments/ci` (docs/EXPERIMENTS_CONTRACT.md → GitHub integration). */
export async function applyCiRequest(store: ExperimentStore, req: CiRequest): Promise<CiResult[]> {
  switch (req.action) {
    case 'upsert': {
      const out: CiResult[] = []
      for (const input of req.experiments) out.push(await upsertOne(store, input, req.pr))
      return out
    }
    case 'merged':
      return markMerged(store, req)
    case 'closed':
      return archiveClosed(store, req)
  }
}

async function upsertOne(store: ExperimentStore, input: CreateExperimentInput, pr: CiRequest['pr']): Promise<CiResult> {
  const prFields = { prNumber: pr.number, prUrl: pr.url, branch: pr.branch }
  const existing = await store.getByKey(input.key)
  if (!existing) {
    try {
      const exp = await store.create({
        key: input.key,
        name: input.name,
        hypothesis: input.hypothesis,
        seed: newSeed(),
        trafficPct: input.trafficPct,
        primaryMetric: input.primaryMetric,
        variants: input.variants,
        createdBy: CI_ACTOR,
        paths: input.paths,
        minVisitorsPerArm: input.minVisitorsPerArm,
        minDays: input.minDays,
        maxDays: input.maxDays,
        ...prFields,
        mergeSha: null,
        source: 'github',
      })
      await store.addAudit({
        experimentId: exp.id,
        actor: CI_ACTOR,
        action: 'created',
        detail: { pr: pr.number, variants: exp.variants.map((v) => `${v.key}:${v.weight}`), paths: exp.paths },
      })
      return { key: input.key, outcome: 'created' }
    } catch (error) {
      // Created concurrently (two workflow runs): the other run wrote it.
      if (error instanceof ExperimentKeyTakenError) return { key: input.key, outcome: 'unchanged' }
      throw error
    }
  }

  const registryPatch = diffRegistry(existing, input)
  if (existing.status !== 'draft') {
    return { key: input.key, outcome: Object.keys(registryPatch).length ? 'locked' : 'unchanged' }
  }
  const patch: ExperimentPatch = { ...registryPatch }
  if (existing.prNumber !== prFields.prNumber) patch.prNumber = prFields.prNumber
  if (existing.prUrl !== prFields.prUrl) patch.prUrl = prFields.prUrl
  if (existing.branch !== prFields.branch) patch.branch = prFields.branch
  const changed = Object.keys(patch)
  if (!changed.length) return { key: input.key, outcome: 'unchanged' }
  await store.update(existing.id, patch)
  await store.addAudit({ experimentId: existing.id, actor: CI_ACTOR, action: 'updated', detail: { pr: pr.number, fields: changed } })
  return { key: input.key, outcome: 'updated' }
}

/** The registry-controlled fields that differ (name, hypothesis, primary metric, variants, paths, limits). */
function diffRegistry(exp: Experiment, input: CreateExperimentInput): ExperimentPatch {
  const patch: ExperimentPatch = {}
  if (exp.name !== input.name) patch.name = input.name
  if (exp.primaryMetric !== input.primaryMetric) patch.primaryMetric = input.primaryMetric
  if (exp.hypothesis !== input.hypothesis) patch.hypothesis = input.hypothesis
  if (!sameVariants(exp.variants, input.variants)) patch.variants = input.variants
  if (exp.paths.join('\n') !== input.paths.join('\n')) patch.paths = input.paths
  if (exp.minVisitorsPerArm !== input.minVisitorsPerArm) patch.minVisitorsPerArm = input.minVisitorsPerArm
  if (exp.minDays !== input.minDays) patch.minDays = input.minDays
  if (exp.maxDays !== input.maxDays) patch.maxDays = input.maxDays
  return patch
}

function sameVariants(a: ExperimentVariant[], b: ExperimentVariant[]): boolean {
  return a.length === b.length && a.every((v, i) => v.key === b[i]!.key && v.name === b[i]!.name && v.weight === b[i]!.weight)
}

/** Experiments named in the request plus every one linked to the PR. */
async function targets(store: ExperimentStore, req: CiRequest): Promise<Experiment[]> {
  const keys = new Set(req.experiments.map((e) => e.key))
  return (await store.list()).filter((e) => e.prNumber === req.pr.number || keys.has(e.key))
}

async function markMerged(store: ExperimentStore, req: CiRequest): Promise<CiResult[]> {
  const out: CiResult[] = []
  for (const exp of await targets(store, req)) {
    if (exp.mergeSha === req.pr.mergeSha) {
      out.push({ key: exp.key, outcome: 'unchanged' })
      continue
    }
    await store.update(exp.id, { mergeSha: req.pr.mergeSha })
    await store.addAudit({ experimentId: exp.id, actor: CI_ACTOR, action: 'merged', detail: { pr: req.pr.number, mergeSha: req.pr.mergeSha } })
    out.push({ key: exp.key, outcome: 'updated' })
  }
  return out
}

async function archiveClosed(store: ExperimentStore, req: CiRequest): Promise<CiResult[]> {
  const out: CiResult[] = []
  for (const exp of await targets(store, req)) {
    if (exp.prNumber !== req.pr.number) {
      // Named in the request but linked to another PR: leave it alone.
      out.push({ key: exp.key, outcome: 'unchanged' })
    } else if (exp.status === 'draft') {
      await store.update(exp.id, { status: 'archived' })
      await store.addAudit({
        experimentId: exp.id,
        actor: CI_ACTOR,
        action: 'archived',
        detail: { from: 'draft', to: 'archived', pr: req.pr.number, reason: 'pr_closed' },
      })
      out.push({ key: exp.key, outcome: 'archived' })
    } else {
      out.push({ key: exp.key, outcome: exp.status === 'archived' ? 'unchanged' : 'locked' })
    }
  }
  return out
}

/** Promoted or stopped experiments that ended more than 14 days ago (`GET /experiments/ci/stale`). */
export async function listStale(store: ExperimentStore, now: Date = new Date()) {
  const cutoff = now.getTime() - STALE_AFTER_DAYS * 86_400_000
  return (await store.list())
    .filter((e) => (e.status === 'promoted' || e.status === 'stopped') && e.endedAt && Date.parse(e.endedAt) < cutoff)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((e) => ({
      key: e.key,
      status: e.status,
      winner: e.status === 'promoted' ? e.winnerVariant : null,
      endedAt: e.endedAt,
      prNumber: e.prNumber,
    }))
}
