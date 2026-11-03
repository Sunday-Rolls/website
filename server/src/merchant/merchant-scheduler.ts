/**
 * Runs the Merchant Center sync inside contact-api so the feed stays current
 * without a separate cron service:
 *
 * - on boot, then every MERCHANT_SYNC_INTERVAL_MINUTES (default 60);
 * - shortly after Shopify sends a product or inventory webhook, so a sell-out
 *   reaches Google in about a minute instead of waiting for the next tick.
 *
 * Scheduling (one run at a time, debounced webhook bursts) lives in ../sync-runner.ts.
 *
 * Runbook: docs/GOOGLE_MERCHANT_SYNC.md
 */
import type { ShopifyCredentials } from '../analytics/shopify.js'
import type { AnalyticsStore } from '../analytics/store.js'
import { createSyncRunner, loadSyncScheduleFromEnv, type SyncRunner, type SyncSchedule } from '../sync-runner.js'
import { loadMerchantConfigFromEnv, syncMerchant, type MerchantSyncConfig, type SyncResult } from './merchant-sync.js'

export type MerchantSchedule = SyncSchedule
export type MerchantSyncRunner = SyncRunner

export function loadMerchantScheduleFromEnv(env: NodeJS.ProcessEnv = process.env): MerchantSchedule {
  return loadSyncScheduleFromEnv(env, 'MERCHANT_SYNC', { intervalMinutes: 60, debounceSeconds: 60 })
}

export function createMerchantSyncRunner(options: {
  run: (reason: string) => Promise<void>
  schedule: MerchantSchedule
  log?: (msg: string) => void
}): MerchantSyncRunner {
  return createSyncRunner({ ...options, label: 'Merchant sync' })
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
