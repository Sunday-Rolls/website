import { describe, expect, it, vi } from 'vitest'
import { createMemoryAnalyticsStore } from '../analytics/store.js'
import { createAutoSync, defaultAutoSyncSources, type AutoSyncSource, type AutoSyncSourceDef } from './auto-sync.js'

function fakeSources(overrides: Partial<Record<AutoSyncSource, Partial<AutoSyncSourceDef>>> = {}) {
  const base = (source: AutoSyncSource): AutoSyncSourceDef => ({
    freshMs: 60_000,
    missing: () => null,
    run: vi.fn(async (store) => {
      // Record the run like the real syncs do, so freshness can see it.
      const sync = await store.startSync(source)
      await store.finishSync(sync.id, 'ok', `${source} ok`, 1)
      return `${source} ok`
    }),
    ...overrides[source],
  })
  return {
    shopify: base('shopify'),
    'sales-tracker': base('sales-tracker'),
    ga4: base('ga4'),
    'search-console': base('search-console'),
  }
}

describe('createAutoSync', () => {
  it('runs a stale source, then reports it fresh inside its window', async () => {
    const sources = fakeSources()
    const run = createAutoSync(createMemoryAnalyticsStore(), sources)
    expect(await run('ga4')).toEqual({ status: 'synced', summary: 'ga4 ok' })
    expect((await run('ga4')).status).toBe('fresh')
    expect(sources.ga4.run).toHaveBeenCalledTimes(1)
  })

  it('syncs again once the window has passed', async () => {
    let now = Date.now()
    const sources = fakeSources()
    const run = createAutoSync(createMemoryAnalyticsStore(), sources, () => now)
    await run('shopify')
    now += 61_000
    expect((await run('shopify')).status).toBe('synced')
    expect(sources.shopify.run).toHaveBeenCalledTimes(2)
  })

  it('does not count a failed sync as fresh', async () => {
    const store = createMemoryAnalyticsStore()
    const failed = await store.startSync('sales-tracker')
    await store.finishSync(failed.id, 'error', 'Drive 403', 0)
    const sources = fakeSources()
    expect((await createAutoSync(store, sources)('sales-tracker')).status).toBe('synced')
  })

  it('reports an unconfigured source without running it', async () => {
    const sources = fakeSources({ 'search-console': { missing: () => 'SEARCH_CONSOLE_SITE_URL' } })
    const outcome = await createAutoSync(createMemoryAnalyticsStore(), sources)('search-console')
    expect(outcome).toEqual({ status: 'unconfigured', reason: 'missing SEARCH_CONSOLE_SITE_URL' })
    expect(sources['search-console'].run).not.toHaveBeenCalled()
  })

  it('shares one run between simultaneous callers, per source', async () => {
    const sources = fakeSources()
    const run = createAutoSync(createMemoryAnalyticsStore(), sources)
    const [a, b, c] = await Promise.all([run('ga4'), run('ga4'), run('shopify')])
    expect(a).toBe(b)
    expect(c.status).toBe('synced')
    expect(sources.ga4.run).toHaveBeenCalledTimes(1)
    expect(sources.shopify.run).toHaveBeenCalledTimes(1)
  })

  it('surfaces a sync error to the caller and lets the next call retry', async () => {
    let fail = true
    const sources = fakeSources({
      ga4: {
        run: async () => {
          if (fail) throw new Error('GA4 quota')
          return 'ok'
        },
      },
    })
    const run = createAutoSync(createMemoryAnalyticsStore(), sources)
    await expect(run('ga4')).rejects.toThrow('GA4 quota')
    fail = false
    expect(await run('ga4')).toEqual({ status: 'synced', summary: 'ok' })
  })
})

describe('defaultAutoSyncSources', () => {
  it('names what each source is missing', () => {
    const sources = defaultAutoSyncSources({})
    expect(sources.shopify.missing()).toBe('SHOPIFY_CLIENT_ID/SECRET')
    expect(sources['sales-tracker'].missing()).toBe('GOOGLE_SERVICE_ACCOUNT_JSON')
    expect(defaultAutoSyncSources({ GOOGLE_SERVICE_ACCOUNT_JSON: '{}' })['sales-tracker'].missing()).toBe(
      'SALES_TRACKER_DRIVE_FILE_ID',
    )
    expect(sources.ga4.missing()).toContain('GA4_PROPERTY_RESOURCE')
    expect(sources['search-console'].missing()).toContain('SEARCH_CONSOLE_SITE_URL')
  })
})
