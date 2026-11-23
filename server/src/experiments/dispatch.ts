import type { ExperimentStore } from './store.js'
import type { Experiment } from './types.js'

export type ConclusionOutcome = 'promoted' | 'stopped'

/** Fire-and-forget: resolves once the dispatch (or its failure audit) is done, never rejects. */
export type ConclusionDispatcher = (exp: Experiment, outcome: ConclusionOutcome) => Promise<void>

export const DEFAULT_GITHUB_REPOSITORY = 'Sunday-Rolls/website'
export const DISPATCH_EVENT_TYPE = 'experiment-concluded'
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export type DispatchOptions = {
  token: string
  repository?: string
  store: ExperimentStore
  fetch?: typeof fetch
  timeoutMs?: number
  log?: (message: string, error?: unknown) => void
}

/**
 * Sends `repository_dispatch` `experiment-concluded` to GitHub so the experiments workflow opens a
 * cleanup issue (docs/EXPERIMENTS_CONTRACT.md). Null when the token is unset or the repo is malformed.
 */
export function createConclusionDispatcher(options: DispatchOptions): ConclusionDispatcher | null {
  const token = options.token.trim()
  const repository = options.repository?.trim() || DEFAULT_GITHUB_REPOSITORY
  if (!token || !REPO_RE.test(repository)) return null
  const doFetch = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  const log = options.log ?? ((message, error) => console.error(message, error ?? ''))

  return async (exp, outcome) => {
    const winner = outcome === 'promoted' ? exp.winnerVariant : null
    try {
      const res = await doFetch(`https://api.github.com/repos/${repository}/dispatches`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'sunday-rolls-contact-api',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          event_type: DISPATCH_EVENT_TYPE,
          client_payload: { key: exp.key, outcome, winner, prNumber: exp.prNumber },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`Experiment ${exp.key}: conclusion dispatch failed`, error)
      try {
        await options.store.addAudit({
          experimentId: exp.id,
          actor: 'contact-api',
          action: 'dispatch_failed',
          detail: { outcome, winner, error: message.slice(0, 300) },
        })
      } catch (auditError) {
        log(`Experiment ${exp.key}: could not record dispatch_failed`, auditError)
      }
    }
  }
}
