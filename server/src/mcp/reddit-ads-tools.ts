/**
 * Reddit Ads tool for the Sunday Rolls connector (see routes.ts / docs/REDDIT_ADS_SYNC.md).
 *
 * Read-only. Reads the Reddit campaign-days the server already keeps in analytics_daily_ad_spend
 * (platform "Reddit Ads", filled by reddit-ads.ts). If the last Reddit sync is over 30 minutes old
 * and the Reddit variables are set, it syncs from the Reddit Ads API first, the same rule the
 * Railway dashboard uses when it opens.
 */
import { addUtcDays, formatUtcDate, parseUtcDate, resolveAsOf } from '../analytics/period.js'
import {
  loadRedditAdsCredentialsFromEnv,
  REDDIT_ADS_PLATFORM,
  redditAdsMissingEnv,
  syncRedditAdsToStore,
} from '../analytics/reddit-ads.js'
import type { AnalyticsStore } from '../analytics/store.js'
import { ToolInputError, type ToolDef } from './google-ads-tools.js'

const FRESH_MS = 30 * 60_000
const round2 = (x: number) => Math.round(x * 100) / 100

export type RedditToolDeps = {
  store: AnalyticsStore
  env: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  now?: () => number
}

type Daily = { date: string; campaign: string; spend: number; purchases: number; purchase_value: number }

export async function redditAdsPerformance(args: Record<string, unknown>, deps: RedditToolDeps) {
  const raw = args.days === undefined ? 30 : Number(args.days)
  if (!Number.isInteger(raw) || raw < 1 || raw > 365) throw new ToolInputError('days must be a whole number from 1 to 365')
  const now = deps.now?.() ?? Date.now()
  const end = resolveAsOf(undefined, new Date(now))
  const start = formatUtcDate(addUtcDays(parseUtcDate(end), -(raw - 1)))

  const missing = redditAdsMissingEnv(deps.env)
  let syncNote: string | null = null
  const last = (await deps.store.latestSyncs()).find((s) => s.source === 'reddit-ads')
  const lastAt = last?.finishedAt ?? last?.startedAt ?? null
  if (missing) {
    syncNote = `Reddit Ads isn’t connected on the server (missing ${missing}); see docs/REDDIT_ADS_SYNC.md.`
  } else if (!lastAt || last?.status !== 'ok' || now - Date.parse(lastAt) > FRESH_MS) {
    try {
      const days = Math.max(raw, Math.min(Number(deps.env.REDDIT_SYNC_DAYS ?? 90) || 90, 365))
      await syncRedditAdsToStore(deps.store, loadRedditAdsCredentialsFromEnv(deps.env)!, {
        days,
        fetchImpl: deps.fetchImpl,
      })
    } catch (error) {
      syncNote = `Refreshing from Reddit failed, showing the last stored data: ${error instanceof Error ? error.message : 'unknown error'}`
    }
  }
  const latest = (await deps.store.latestSyncs()).find((s) => s.source === 'reddit-ads')

  const daily: Daily[] = (await deps.store.listAdSpend())
    .filter((r) => r.platform === REDDIT_ADS_PLATFORM && r.date >= start && r.date <= end)
    .map((r) => ({
      date: r.date,
      campaign: r.campaign || 'Unassigned',
      spend: round2(r.spend),
      purchases: r.platformReportedOrders,
      purchase_value: round2(r.platformReportedSales),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign))

  const sum = (list: Daily[]) => {
    const spend = round2(list.reduce((a, r) => a + r.spend, 0))
    const purchases = list.reduce((a, r) => a + r.purchases, 0)
    const purchase_value = round2(list.reduce((a, r) => a + r.purchase_value, 0))
    return {
      spend,
      purchases,
      purchase_value,
      roas: spend ? round2(purchase_value / spend) : null,
      cost_per_purchase: purchases ? round2(spend / purchases) : null,
    }
  }
  const byCampaign = new Map<string, Daily[]>()
  for (const r of daily) byCampaign.set(r.campaign, [...(byCampaign.get(r.campaign) ?? []), r])

  return {
    start,
    end,
    connected: !missing,
    last_synced_at: latest?.status === 'ok' ? (latest.finishedAt ?? null) : (lastAt ?? null),
    ...(syncNote ? { sync_note: syncNote } : {}),
    note: 'Purchases and purchase value are Reddit’s own count (pixel / Conversions API, click + view-through), not Shopify orders. Days are UTC. Reddit clicks and impressions are not stored.',
    totals: sum(daily),
    campaigns: [...byCampaign.entries()].map(([campaign, list]) => ({ campaign, ...sum(list) })).sort((a, b) => b.spend - a.spend),
    daily,
  }
}

export function redditAdsTools(deps: Omit<RedditToolDeps, 'now'> & { now?: () => number }): ToolDef[] {
  return [
    {
      name: 'reddit_ads_performance',
      title: 'Reddit Ads performance',
      description:
        'Sunday Rolls Reddit Ads spend, purchases and purchase value (Reddit’s own conversion count) per campaign per day for the last N days, with totals and ROAS per campaign. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 365, description: 'Look-back window in days, ending today (default 30).' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      run: (args) => redditAdsPerformance(args, deps),
    },
  ]
}
