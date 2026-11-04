import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import {
  createMerchantSyncRunner,
  createMerchantSyncRunnerFromEnv,
  loadMerchantScheduleFromEnv,
} from './merchant-scheduler.js'
import { verifyShopifyWebhook } from './shopify-webhook.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('createMerchantSyncRunner', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs on start and then on the interval', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const runner = createMerchantSyncRunner({ run, schedule: { intervalMs: 60_000, debounceMs: 0 } })
    runner.start()
    expect(run).toHaveBeenCalledWith('boot')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(run).toHaveBeenLastCalledWith('schedule')
    expect(run).toHaveBeenCalledTimes(2)
    runner.stop()
  })

  it('collapses a burst of webhooks into one run', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const runner = createMerchantSyncRunner({ run, schedule: { intervalMs: 0, debounceMs: 30_000 } })
    for (let i = 0; i < 20; i++) runner.trigger('products/update')
    await vi.advanceTimersByTimeAsync(29_000)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('products/update')
  })

  it('never overlaps runs, and queues one follow-up for changes made mid-run', async () => {
    const first = deferred()
    const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const runner = createMerchantSyncRunner({ run, schedule: { intervalMs: 0, debounceMs: 0 } })
    const a = runner.runNow('boot')
    const b = runner.runNow('inventory_levels/update')
    const c = runner.runNow('products/update')
    expect(run).toHaveBeenCalledTimes(1)
    first.resolve()
    await Promise.all([a, b, c])
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenLastCalledWith('inventory_levels/update')
  })

  it('keeps going after a failed run', async () => {
    const log = vi.fn()
    const run = vi.fn().mockRejectedValueOnce(new Error('Merchant API 503')).mockResolvedValue(undefined)
    const runner = createMerchantSyncRunner({ run, log, schedule: { intervalMs: 0, debounceMs: 0 } })
    await runner.runNow('boot')
    expect(log).toHaveBeenCalledWith('Merchant sync (boot) failed: Merchant API 503')
    await runner.runNow('schedule')
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe('loadMerchantScheduleFromEnv', () => {
  it('defaults to hourly with a 60s webhook debounce', () => {
    expect(loadMerchantScheduleFromEnv({})).toEqual({ intervalMs: 3_600_000, debounceMs: 60_000 })
  })

  it('treats 0 as webhook-only and clamps tiny intervals to 5 minutes', () => {
    expect(loadMerchantScheduleFromEnv({ MERCHANT_SYNC_INTERVAL_MINUTES: '0' }).intervalMs).toBe(0)
    expect(loadMerchantScheduleFromEnv({ MERCHANT_SYNC_INTERVAL_MINUTES: '1' }).intervalMs).toBe(300_000)
  })
})

describe('createMerchantSyncRunnerFromEnv', () => {
  const shopify = { shop: 'chrgrk-ff', clientId: 'id', clientSecret: 'secret' }
  const env = {
    MERCHANT_CENTER_ID: '5685591896',
    MERCHANT_DATA_SOURCE_ID: '123',
    MERCHANT_SERVICE_ACCOUNT_JSON: '{}',
  }

  it('stays off and says why when config is incomplete', () => {
    const result = createMerchantSyncRunnerFromEnv({ shopify, env: { MERCHANT_CENTER_ID: '5685591896' } })
    expect(result.runner).toBeNull()
    expect('reason' in result && result.reason).toBe('missing MERCHANT_DATA_SOURCE_ID, MERCHANT_SERVICE_ACCOUNT_JSON')
  })

  it('can be switched off explicitly', () => {
    const result = createMerchantSyncRunnerFromEnv({ shopify, env: { ...env, MERCHANT_SYNC_ENABLED: 'false' } })
    expect(result.runner).toBeNull()
  })

  it('builds a runner when everything is set', () => {
    expect(createMerchantSyncRunnerFromEnv({ shopify, env }).runner).not.toBeNull()
  })
})

describe('POST /webhooks/shopify', () => {
  const secret = 'shpss_test'
  const body = JSON.stringify({ inventory_item_id: 1, available: 0 })
  const sign = (raw: string) => createHmac('sha256', secret).update(raw).digest('base64')

  function setup() {
    const onProductChange = vi.fn()
    const app = createApp({
      config: { corsOrigins: [], requireBrowserOrigin: true, contactApiKey: '' },
      sendContactEmail: vi.fn(),
      shopifyWebhooks: { secret, onProductChange },
    })
    const post = (headers: Record<string, string>, raw = body) =>
      app.request('/webhooks/shopify', { method: 'POST', body: raw, headers })
    return { post, onProductChange }
  }

  it('triggers a sync for a signed inventory update', async () => {
    const { post, onProductChange } = setup()
    const res = await post({ 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Topic': 'inventory_levels/update' })
    expect(res.status).toBe(200)
    expect(onProductChange).toHaveBeenCalledWith('inventory_levels/update')
  })

  it('rejects a bad signature', async () => {
    const { post, onProductChange } = setup()
    const res = await post({ 'X-Shopify-Hmac-Sha256': sign('{}'), 'X-Shopify-Topic': 'products/update' })
    expect(res.status).toBe(401)
    expect(onProductChange).not.toHaveBeenCalled()
  })

  it('acknowledges unrelated topics without syncing', async () => {
    const { post, onProductChange } = setup()
    const res = await post({ 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Topic': 'orders/create' })
    expect(res.status).toBe(200)
    expect(onProductChange).not.toHaveBeenCalled()
  })

  it('answers 503 when the sync is not configured', async () => {
    const app = createApp({
      config: { corsOrigins: [], requireBrowserOrigin: true, contactApiKey: '' },
      sendContactEmail: vi.fn(),
    })
    const res = await app.request('/webhooks/shopify', { method: 'POST', body })
    expect(res.status).toBe(503)
  })
})

describe('verifyShopifyWebhook', () => {
  it('rejects a missing header or secret', () => {
    expect(verifyShopifyWebhook('{}', undefined, 'x')).toBe(false)
    expect(verifyShopifyWebhook('{}', 'abc', '')).toBe(false)
  })
})
