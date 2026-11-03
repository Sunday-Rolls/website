/**
 * Keeps dashboard orders current without anyone pressing "Sync Shopify":
 *
 * - on boot, then every SHOPIFY_ORDER_SYNC_INTERVAL_MINUTES (default 15);
 * - SHOPIFY_ORDER_SYNC_DEBOUNCE_SECONDS (default 10) after an orders/* webhook,
 *   so a new order shows up within seconds.
 *
 * Each run is the same full sync the dashboard button does (orders upsert by
 * Shopify id, so re-running never duplicates). The timer is the safety net when
 * a webhook is missed or the subscription isn't registered.
 */
import { createSyncRunner, loadSyncScheduleFromEnv, type SyncRunner, type SyncSchedule } from '../sync-runner.js'
import { syncShopifyToStore } from './shopify-sync.js'
import type { ShopifyCredentials } from './shopify.js'
import type { AnalyticsStore } from './store.js'

/** Order webhook topics that should refresh dashboard orders. Declared in shopify.app.toml. */
export const ORDER_WEBHOOK_TOPICS = new Set(['orders/create', 'orders/updated', 'orders/cancelled'])

export function loadOrderSyncScheduleFromEnv(env: NodeJS.ProcessEnv = process.env): SyncSchedule {
  return loadSyncScheduleFromEnv(env, 'SHOPIFY_ORDER_SYNC', { intervalMinutes: 15, debounceSeconds: 10 })
}

export function createShopifyOrderSyncRunnerFromEnv(deps: {
  shopify: ShopifyCredentials | null
  analytics?: AnalyticsStore
  env?: NodeJS.ProcessEnv
  log?: (msg: string) => void
  /** Injected in tests. */
  sync?: typeof syncShopifyToStore
}): { runner: SyncRunner } | { runner: null; reason: string } {
  const env = deps.env ?? process.env
  const log = deps.log ?? console.log
  const sync = deps.sync ?? syncShopifyToStore
  if ((env.SHOPIFY_ORDER_SYNC_ENABLED ?? 'true').trim() === 'false') {
    return { runner: null, reason: 'SHOPIFY_ORDER_SYNC_ENABLED=false' }
  }
  if (!deps.analytics) return { runner: null, reason: 'no dashboard store (DATABASE_URL)' }
  if (!deps.shopify) return { runner: null, reason: 'missing SHOPIFY_CLIENT_ID/SECRET' }
  const { analytics, shopify } = deps

  const runner = createSyncRunner({
    label: 'Shopify order sync',
    schedule: loadOrderSyncScheduleFromEnv(env),
    log,
    run: async (reason) => {
      const result = await sync(analytics, shopify)
      // The 15-minute ticks would repeat the same line all day; their result is in analytics_sync_runs.
      if (reason !== 'schedule') {
        log(`Shopify order sync (${reason}): ${result.orders} orders, ${result.abandoned} abandoned`)
      }
    },
  })
  return { runner }
}
