/**
 * Runs the Merchant Center sync inside contact-api so the feed stays current
 * without a separate cron service:
 *
 * - on boot, then every MERCHANT_SYNC_INTERVAL_MINUTES (default 60);
 * - shortly after Shopify sends a product or inventory webhook, so a sell-out
 *   reaches Google in about a minute instead of waiting for the next tick.
 *
 * Only one sync runs at a time. A trigger that lands mid-run queues exactly one
 * follow-up run, and bursts of webhooks (a bulk edit sends one per product)
 * collapse into a single run.
 *
 * Runbook: docs/GOOGLE_MERCHANT_SYNC.md
 */
import type { ShopifyCredentials } from '../analytics/shopify.js'
import type { AnalyticsStore } from '../analytics/store.js'
import { loadMerchantConfigFromEnv, syncMerchant, type MerchantSyncConfig, type SyncResult } from './merchant-sync.js'

export type MerchantSchedule = {
  /** 0 disables the timer (webhooks still trigger runs). */
  intervalMs: number
  /** Wait this long after a webhook before syncing, to batch bursts. */
  debounceMs: number
}

export function loadMerchantScheduleFromEnv(env: NodeJS.ProcessEnv = process.env): MerchantSchedule {
  const minutes = Number(env.MERCHANT_SYNC_INTERVAL_MINUTES ?? '60')
  const seconds = Number(env.MERCHANT_SYNC_DEBOUNCE_SECONDS ?? '60')
  return {
    intervalMs: Number.isFinite(minutes) && minutes > 0 ? Math.max(5, minutes) * 60_000 : 0,
    debounceMs: (Number.isFinite(seconds) && seconds >= 0 ? seconds : 60) * 1000,
  }
}

export type MerchantSyncRunner = {
  start(): void
  stop(): void
  /** Schedule a debounced run (webhooks). */
  trigger(reason: string): void
  /** Run now, or after the current run finishes. Resolves when that run is done. */
  runNow(reason: string): Promise<void>
}

export function createMerchantSyncRunner(options: {
  run: (reason: string) => Promise<void>
  schedule: MerchantSchedule
  log?: (msg: string) => void
}): MerchantSyncRunner {
  const { run, schedule, log = console.log } = options
  let interval: ReturnType<typeof setInterval> | null = null
  let debounce: ReturnType<typeof setTimeout> | null = null
  let current: Promise<void> | null = null
  let queued: { reason: string; done: Promise<void> } | null = null

  async function execute(reason: string) {
    try {
      await run(reason)
    } catch (error) {
      log(`Merchant sync (${reason}) failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  function runNow(reason: string): Promise<void> {
    if (!current) {
      current = execute(reason).finally(() => {
        current = null
      })
      return current
    }
    // A run is in progress: data may have changed after it read Shopify, so queue one more.
    if (!queued) {
      const done = current.then(() => {
        const next = queued!
        queued = null
        return runNow(next.reason)
      })
      queued = { reason, done }
    }
    return queued.done
  }

  return {
    start() {
      void runNow('boot')
      if (schedule.intervalMs > 0) {
        interval = setInterval(() => void runNow('schedule'), schedule.intervalMs)
        interval.unref?.()
      }
    },
    stop() {
      if (interval) clearInterval(interval)
      if (debounce) clearTimeout(debounce)
      interval = null
      debounce = null
    },
    trigger(reason) {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void runNow(reason)
      }, schedule.debounceMs)
      debounce.unref?.()
    },
    runNow,
  }
}

/**
 * Build the runner from env, or return null with the reason when the sync isn't
 * fully configured (so contact-api still boots without it).
 */
export function createMerchantSyncRunnerFromEnv(deps: {
  shopify: ShopifyCredentials | null
  analytics?: AnalyticsStore
  env?: NodeJS.ProcessEnv
  log?: (msg: string) => void
}): { runner: MerchantSyncRunner; config: MerchantSyncConfig } | { runner: null; reason: string } {
  const env = deps.env ?? process.env
  const log = deps.log ?? console.log
  if ((env.MERCHANT_SYNC_ENABLED ?? 'true').trim() === 'false') {
    return { runner: null, reason: 'MERCHANT_SYNC_ENABLED=false' }
  }
  const config = loadMerchantConfigFromEnv(env)
  const serviceAccountJson =
    env.MERCHANT_SERVICE_ACCOUNT_JSON?.trim() || env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || ''
  const missing = [
    !config.merchantId && 'MERCHANT_CENTER_ID',
    !config.dataSourceId && 'MERCHANT_DATA_SOURCE_ID',
    !serviceAccountJson && 'MERCHANT_SERVICE_ACCOUNT_JSON',
    !deps.shopify && 'SHOPIFY_CLIENT_ID/SECRET',
  ].filter(Boolean)
  if (missing.length || !deps.shopify) return { runner: null, reason: `missing ${missing.join(', ')}` }
  const shopify = deps.shopify

  const runner = createMerchantSyncRunner({
    schedule: loadMerchantScheduleFromEnv(env),
    log,
    run: async (reason) => {
      const sync = await deps.analytics?.startSync('merchant-center')
      let result: SyncResult
      try {
        // Per-product lines would flood the logs every hour; the summary below is enough.
        result = await syncMerchant({ shopify, serviceAccountJson, config, log: () => {} })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Merchant sync failed'
        if (sync) await deps.analytics!.finishSync(sync.id, 'error', message, 0)
        throw error
      }
      const message = summarizeSync(result, reason)
      log(message)
      for (const f of result.failed) log(`  ✗ ${f.offerId}: ${f.error}`)
      if (sync) {
        await deps.analytics!.finishSync(
          sync.id,
          result.failed.length ? 'error' : 'ok',
          message,
          result.inserted + result.pruned.length,
        )
      }
    },
  })
  return { runner, config }
}

export function summarizeSync(result: SyncResult, reason: string): string {
  const parts = [`Merchant sync (${reason}): ${result.inserted}/${result.offers} offers sent`]
  if (result.failed.length) parts.push(`${result.failed.length} failed, nothing pruned`)
  if (result.pruned.length) parts.push(`removed ${result.pruned.join(', ')}`)
  return parts.join('; ')
}
