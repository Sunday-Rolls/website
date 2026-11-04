/**
 * The syncs the dashboard runs when someone opens it or logs in, one call per source
 * (POST /dashboard/api/sync/auto/:source) so the UI can show each one's progress.
 *
 * Each source runs at most once at a time (simultaneous tabs share the run) and is
 * skipped while its last good sync is fresher than `freshMs` (unless forced). A source without
 * credentials answers `unconfigured` instead of failing.
 */
import { extractDriveFileId } from '../analytics/drive.js'
import { loadGa4CredentialsFromEnv, syncGa4ToStore } from '../analytics/ga4-sync.js'
import { loadGscCredentialsFromEnv } from '../analytics/gsc.js'
import { syncGscToStore } from '../analytics/gsc-sync.js'
import { syncSalesTrackerFromDrive } from '../analytics/sales-tracker-sync.js'
import { loadShopifyCredentialsFromEnv, syncShopifyToStore } from '../analytics/shopify-sync.js'
import type { AnalyticsStore } from '../analytics/store.js'

export const AUTO_SYNC_SOURCES = ['shopify', 'sales-tracker', 'ga4', 'search-console'] as const
export type AutoSyncSource = (typeof AUTO_SYNC_SOURCES)[number]

export type AutoSyncOutcome =
  | { status: 'synced'; summary: string }
  | { status: 'fresh'; lastSyncedAt: string | null }
  | { status: 'unconfigured'; reason: string }

export type AutoSyncSourceDef = {
  /** Skip when the last ok sync finished within this window. GSC data lags days; GA4 lags hours. */
  freshMs: number
  /** Why it's off, when it is. */
  missing: () => string | null
  run: (store: AnalyticsStore) => Promise<string>
}

const MIN = 60_000

export function defaultAutoSyncSources(env: NodeJS.ProcessEnv = process.env): Record<AutoSyncSource, AutoSyncSourceDef> {
  return {
    shopify: {
      freshMs: 5 * MIN,
      missing: () => (loadShopifyCredentialsFromEnv(env) ? null : 'SHOPIFY_CLIENT_ID/SECRET'),
      run: async (store) => {
        const r = await syncShopifyToStore(store, loadShopifyCredentialsFromEnv(env)!)
        return `${r.orders} orders`
      },
    },
    'sales-tracker': {
      freshMs: 30 * MIN,
      missing: () =>
        !env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
          ? 'GOOGLE_SERVICE_ACCOUNT_JSON'
          : !extractDriveFileId(env.SALES_TRACKER_DRIVE_FILE_ID?.trim() || '')
            ? 'SALES_TRACKER_DRIVE_FILE_ID'
            : null,
      run: async (store) => {
        const fileId = extractDriveFileId(env.SALES_TRACKER_DRIVE_FILE_ID!.trim())!
        // Same defaults as the Data page button: upsert, keep cash rows, leave Shopify to the live sync.
        const r = await syncSalesTrackerFromDrive(store, env.GOOGLE_SERVICE_ACCOUNT_JSON!.trim(), fileId, {
          skipShopifyChannel: true,
        })
        return `${r.orders} orders · ${r.expenses} expenses`
      },
    },
    ga4: {
      freshMs: 30 * MIN,
      missing: () => (loadGa4CredentialsFromEnv(env) ? null : 'GOOGLE_SERVICE_ACCOUNT_JSON / GA4_PROPERTY_RESOURCE'),
      run: async (store) => {
        const days = Math.max(1, Math.min(Number(env.GA4_SYNC_DAYS ?? 90) || 90, 365))
        const r = await syncGa4ToStore(store, loadGa4CredentialsFromEnv(env)!, { days })
        return `${r.trafficRows} days · ${r.productViewRows} product rows`
      },
    },
    'search-console': {
      freshMs: 6 * 60 * MIN,
      missing: () => (loadGscCredentialsFromEnv(env) ? null : 'GOOGLE_SERVICE_ACCOUNT_JSON / SEARCH_CONSOLE_SITE_URL'),
      run: async (store) => {
        const r = await syncGscToStore(store, loadGscCredentialsFromEnv(env)!, { days: 90 })
        return `${r.keywords} queries`
      },
    },
  }
}

export function isAutoSyncSource(value: string): value is AutoSyncSource {
  return (AUTO_SYNC_SOURCES as readonly string[]).includes(value)
}

export function createAutoSync(
  store: AnalyticsStore,
  sources: Record<AutoSyncSource, AutoSyncSourceDef> = defaultAutoSyncSources(),
  now: () => number = Date.now,
) {
  const inFlight = new Map<AutoSyncSource, Promise<AutoSyncOutcome>>()

  /** `force` skips the freshness check; a call made while a run is in flight still shares that run. */
  return function run(source: AutoSyncSource, options: { force?: boolean } = {}): Promise<AutoSyncOutcome> {
    const existing = inFlight.get(source)
    if (existing) return existing
    const def = sources[source]
    // Registered before any await so simultaneous tabs share one freshness check + run.
    const promise = (async (): Promise<AutoSyncOutcome> => {
      const missing = def.missing()
      if (missing) return { status: 'unconfigured', reason: `missing ${missing}` }
      const last = (await store.latestSyncs()).find((s) => s.source === source)
      const lastAt = last?.finishedAt ? Date.parse(last.finishedAt) : 0
      if (!options.force && last?.status === 'ok' && now() - lastAt < def.freshMs) {
        return { status: 'fresh', lastSyncedAt: last.finishedAt }
      }
      return { status: 'synced', summary: await def.run(store) }
    })().finally(() => inFlight.delete(source))
    inFlight.set(source, promise)
    return promise
  }
}
