/**
 * Google Ads tools for the Sunday Rolls connector (see routes.ts / docs/GOOGLE_ADS_CONNECTOR.md).
 *
 * Reads go straight to the Google Ads API. Changes are two-step: a call without `confirm_token`
 * asks Google to validate the change (validateOnly) and returns a preview plus a token; the same
 * call repeated with that token applies it. Every applied change is written to a change log.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  accessToken,
  googleAdsMutate,
  googleAdsQuery,
  type GoogleAdsCredentials,
  type MutateService,
} from '../analytics/google-ads.js'
import { formatUtcDate, addUtcDays, parseUtcDate, resolveAsOf } from '../analytics/period.js'
import type { AnalyticsStore } from '../analytics/store.js'

export type ToolContext = {
  creds: GoogleAdsCredentials
  store: AnalyticsStore
  /** Signs confirm tokens. */
  secret: string
  user: { id: string; email: string }
  fetchImpl?: typeof fetch
  getToken?: (creds: GoogleAdsCredentials) => Promise<string>
  now?: () => number
}

export type ToolDef = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean }
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

export class ToolInputError extends Error {}

const CHANGE_LOG_KEY = 'google-ads-change-log'
const CHANGE_LOG_MAX = 300
const CONFIRM_TTL_MS = 15 * 60_000
const MAX_DAILY_BUDGET = 500

const round2 = (x: number) => Math.round(x * 100) / 100
const n = (v: unknown) => Number(v ?? 0) || 0
const micros = (v: unknown) => round2(n(v) / 1_000_000)

// ---------- argument helpers ----------

function str(args: Record<string, unknown>, key: string, { required = true } = {}): string {
  const v = args[key]
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolInputError(`${key} is required`)
    return ''
  }
  return String(v).trim()
}

function campaignId(args: Record<string, unknown>): string {
  const id = str(args, 'campaign_id').replace(/\D/g, '')
  if (!id) throw new ToolInputError('campaign_id must be the numeric campaign id (see google_ads_campaigns)')
  return id
}

function days(args: Record<string, unknown>, fallback = 30): number {
  const d = args.days === undefined ? fallback : Number(args.days)
  if (!Number.isFinite(d) || d < 1 || d > 365) throw new ToolInputError('days must be 1–365')
  return Math.round(d)
}

function window(args: Record<string, unknown>, now: number) {
  const end = resolveAsOf(undefined, new Date(now))
  const start = formatUtcDate(addUtcDays(parseUtcDate(end), -(days(args) - 1)))
  return { start, end }
}

// ---------- confirm tokens ----------

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sign(secret: string, data: string) {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

export function confirmToken(secret: string, tool: string, args: Record<string, unknown>, expiresAt: number): string {
  const { confirm_token: _ignored, ...rest } = args
  return `${expiresAt}.${sign(secret, `${tool}|${expiresAt}|${canonical(rest)}`)}`
}

function confirmTokenValid(secret: string, tool: string, args: Record<string, unknown>, now: number): boolean {
  const token = String(args.confirm_token ?? '')
  const [exp] = token.split('.')
  const expiresAt = Number(exp)
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false
  const expected = Buffer.from(confirmToken(secret, tool, args, expiresAt))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

// ---------- change log ----------

export type ChangeLogEntry = {
  at: string
  user: string
  tool: string
  summary: string
  args: Record<string, unknown>
  resources: string[]
}

async function logChange(ctx: ToolContext, entry: Omit<ChangeLogEntry, 'at' | 'user'>) {
  const state = (await ctx.store.getIntegrationState(CHANGE_LOG_KEY)) ?? {}
  const entries = Array.isArray(state.entries) ? (state.entries as ChangeLogEntry[]) : []
  const at = new Date(ctx.now?.() ?? Date.now()).toISOString()
  await ctx.store.setIntegrationState(CHANGE_LOG_KEY, {
    entries: [{ at, user: ctx.user.email, ...entry }, ...entries].slice(0, CHANGE_LOG_MAX),
  })
}

// ---------- Google Ads calls ----------

async function token(ctx: ToolContext) {
  return (ctx.getToken ?? accessToken)(ctx.creds)
}

async function query(ctx: ToolContext, gaql: string) {
  return googleAdsQuery(ctx.creds, gaql, ctx.fetchImpl, await token(ctx))
}

const cid = (ctx: ToolContext) => ctx.creds.customerId

type Campaign = {
  id: string
  name: string
  status: string
  channel: string
  biddingStrategyType: string
  /** Portfolio strategy resource, when the campaign shares one. */
  portfolioStrategy: string | null
  targetRoas: number | null
  budget: { resourceName: string; dailyAmount: number; shared: boolean } | null
}

async function campaigns(ctx: ToolContext): Promise<Campaign[]> {
  const rows = await query(
    ctx,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
  campaign.bidding_strategy_type, campaign.bidding_strategy,
  campaign.maximize_conversion_value.target_roas, campaign.target_roas.target_roas,
  campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared
FROM campaign
WHERE campaign.status != 'REMOVED'
ORDER BY campaign.name`,
  )
  return rows.map((r) => {
    const c = r.campaign ?? {}
    const b = r.campaignBudget
    const mcv = (c.maximizeConversionValue ?? {}) as { targetRoas?: number }
    const troas = (c.targetRoas ?? {}) as { targetRoas?: number }
    const roas = mcv.targetRoas ?? troas.targetRoas
    return {
      id: String(c.id ?? ''),
      name: String(c.name ?? ''),
      status: String(c.status ?? ''),
      channel: String(c.advertisingChannelType ?? ''),
      biddingStrategyType: String(c.biddingStrategyType ?? ''),
      portfolioStrategy: c.biddingStrategy ? String(c.biddingStrategy) : null,
      targetRoas: roas === undefined ? null : Number(roas),
      budget: b?.resourceName
        ? { resourceName: String(b.resourceName), dailyAmount: micros(b.amountMicros), shared: Boolean(b.explicitlyShared) }
        : null,
    }
  })
}

async function findCampaign(ctx: ToolContext, id: string): Promise<Campaign> {
  const found = (await campaigns(ctx)).find((c) => c.id === id)
  if (!found) throw new ToolInputError(`No active campaign ${id} (see google_ads_campaigns)`)
  return found
}

/**
 * Preview (validateOnly) or apply one change. Without a valid confirm_token nothing is applied and
 * the answer carries the token to send back.
 */
async function change(
  ctx: ToolContext,
  tool: string,
  args: Record<string, unknown>,
  plan: { summary: string; before?: unknown; after?: unknown; service: MutateService; operations: Array<Record<string, unknown>> },
) {
  const now = ctx.now?.() ?? Date.now()
  const tok = await token(ctx)
  if (!args.confirm_token) {
    await googleAdsMutate(ctx.creds, plan.service, plan.operations, { validateOnly: true, fetchImpl: ctx.fetchImpl, token: tok })
    return {
      status: 'preview',
      applied: false,
      summary: plan.summary,
      before: plan.before,
      after: plan.after,
      google_validated: true,
      confirm_token: confirmToken(ctx.secret, tool, args, now + CONFIRM_TTL_MS),
      next_step:
        'Nothing has changed yet. Show this preview to the user and get an explicit yes, then call the same tool again with identical arguments plus this confirm_token (valid 15 minutes).',
    }
  }
  if (!confirmTokenValid(ctx.secret, tool, args, now)) {
    throw new ToolInputError('confirm_token is invalid or expired, or the arguments changed. Run the tool again without it for a new preview.')
  }
  const resources = await googleAdsMutate(ctx.creds, plan.service, plan.operations, { fetchImpl: ctx.fetchImpl, token: tok })
  const { confirm_token: _t, ...logged } = args
  await logChange(ctx, { tool, summary: plan.summary, args: logged, resources })
  return { status: 'applied', applied: true, summary: plan.summary, before: plan.before, after: plan.after, resources }
}

// ---------- tools ----------

const READ = { readOnlyHint: true, openWorldHint: true }
const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
const confirmProp = {
  confirm_token: {
    type: 'string',
    description: 'Leave out to preview. After the user approves the preview, send the token it returned to apply the change.',
  },
}
const daysProp = { days: { type: 'integer', minimum: 1, maximum: 365, description: 'Look-back window in days, ending today (default 30).' } }

export const GOOGLE_ADS_TOOLS: ToolDef[] = [
  {
    name: 'google_ads_campaigns',
    title: 'Campaigns and settings',
    description:
      'List Sunday Rolls Google Ads campaigns (not removed) with id, status, bidding strategy, target ROAS and daily budget. Use the ids with the other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
    run: async (_args, ctx) => ({ customer_id: cid(ctx), campaigns: await campaigns(ctx) }),
  },
  {
    name: 'google_ads_performance',
    title: 'Campaign performance',
    description:
      'Impressions, clicks, cost, conversions and conversion value per campaign for the last N days (live from Google Ads), with totals, CTR, CPC, cost per conversion and conversion value ÷ cost. Set by_day for a daily breakdown.',
    inputSchema: {
      type: 'object',
      properties: { ...daysProp, by_day: { type: 'boolean', description: 'Return one row per campaign per day.' } },
      additionalProperties: false,
    },
    annotations: READ,
    run: async (args, ctx) => {
      const { start, end } = window(args, ctx.now?.() ?? Date.now())
      const rows = await query(
        ctx,
        `SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros,
  metrics.conversions, metrics.conversions_value
FROM campaign
WHERE segments.date BETWEEN '${start}' AND '${end}' AND metrics.impressions > 0`,
      )
      const flat = rows.map((r) => ({
        date: String(r.segments?.date ?? ''),
        campaign_id: String(r.campaign?.id ?? ''),
        campaign: String(r.campaign?.name ?? ''),
        impressions: n(r.metrics?.impressions),
        clicks: n(r.metrics?.clicks),
        cost: micros(r.metrics?.costMicros),
        conversions: round2(n(r.metrics?.conversions)),
        conversion_value: round2(n(r.metrics?.conversionsValue)),
      }))
      const totalsOf = (list: typeof flat) => {
        const t = list.reduce(
          (a, r) => ({
            impressions: a.impressions + r.impressions,
            clicks: a.clicks + r.clicks,
            cost: a.cost + r.cost,
            conversions: a.conversions + r.conversions,
            conversion_value: a.conversion_value + r.conversion_value,
          }),
          { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 },
        )
        return {
          ...t,
          cost: round2(t.cost),
          conversions: round2(t.conversions),
          conversion_value: round2(t.conversion_value),
          ctr_pct: t.impressions ? round2((t.clicks / t.impressions) * 100) : null,
          cpc: t.clicks ? round2(t.cost / t.clicks) : null,
          cost_per_conversion: t.conversions ? round2(t.cost / t.conversions) : null,
          value_per_cost: t.cost ? round2(t.conversion_value / t.cost) : null,
        }
      }
      const byCampaign = new Map<string, typeof flat>()
      for (const r of flat) byCampaign.set(r.campaign_id, [...(byCampaign.get(r.campaign_id) ?? []), r])
      return {
        start,
        end,
        note: 'Conversions are Google Ads’ own count (Purchase v2 etc.); check them against real Shopify orders before acting.',
        totals: totalsOf(flat),
        campaigns: [...byCampaign.values()]
          .map((list) => ({ campaign_id: list[0].campaign_id, campaign: list[0].campaign, ...totalsOf(list) }))
          .sort((a, b) => b.cost - a.cost),
        ...(args.by_day ? { daily: flat.sort((a, b) => a.date.localeCompare(b.date)) } : {}),
      }
    },
  },
  {
    name: 'google_ads_search_terms',
    title: 'Search terms',
    description:
      'What people searched before clicking a Sunday Rolls ad, summed over the last N days, highest cost first. Use it to find wasted spend or blocked buyer searches.',
    inputSchema: {
      type: 'object',
      properties: { ...daysProp, limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Max terms (default 50).' } },
      additionalProperties: false,
    },
    annotations: READ,
    run: async (args, ctx) => {
      const { start, end } = window(args, ctx.now?.() ?? Date.now())
      const limit = Math.min(Math.max(Number(args.limit ?? 50) || 50, 1), 500)
      const rows = await query(
        ctx,
        `SELECT search_term_view.search_term, campaign.id, campaign.name, metrics.impressions, metrics.clicks,
  metrics.cost_micros, metrics.conversions
FROM search_term_view
WHERE segments.date BETWEEN '${start}' AND '${end}'`,
      )
      const map = new Map<string, { term: string; campaign_id: string; campaign: string; impressions: number; clicks: number; cost: number; conversions: number }>()
      for (const r of rows) {
        const term = String(r.searchTermView?.searchTerm ?? '').trim()
        if (!term) continue
        const key = `${term}|${r.campaign?.id}`
        const cur = map.get(key) ?? {
          term,
          campaign_id: String(r.campaign?.id ?? ''),
          campaign: String(r.campaign?.name ?? ''),
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
        }
        cur.impressions += n(r.metrics?.impressions)
        cur.clicks += n(r.metrics?.clicks)
        cur.cost += n(r.metrics?.costMicros) / 1_000_000
        cur.conversions += n(r.metrics?.conversions)
        map.set(key, cur)
      }
      const terms = [...map.values()]
        .map((t) => ({ ...t, cost: round2(t.cost), conversions: round2(t.conversions) }))
        .sort((a, b) => b.cost - a.cost || b.clicks - a.clicks)
      return { start, end, total_terms: terms.length, terms: terms.slice(0, limit) }
    },
  },
  {
    name: 'google_ads_negative_keywords',
    title: 'Negative keywords',
    description:
      'List negative keywords at campaign and ad group level and in shared negative lists, with the resource_name needed to remove one.',
    inputSchema: {
      type: 'object',
      properties: { campaign_id: { type: 'string', description: 'Only this campaign (optional).' } },
      additionalProperties: false,
    },
    annotations: READ,
    run: async (args, ctx) => {
      const only = args.campaign_id ? campaignId(args) : null
      const filter = only ? ` AND campaign.id = ${only}` : ''
      const [campaignRows, adGroupRows, sharedRows] = await Promise.all([
        query(
          ctx,
          `SELECT campaign.id, campaign.name, campaign_criterion.resource_name, campaign_criterion.keyword.text,
  campaign_criterion.keyword.match_type
FROM campaign_criterion
WHERE campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD' AND campaign.status != 'REMOVED'${filter}`,
        ),
        query(
          ctx,
          `SELECT campaign.id, campaign.name, ad_group.name, ad_group_criterion.resource_name, ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type
FROM ad_group_criterion
WHERE ad_group_criterion.negative = TRUE AND ad_group_criterion.type = 'KEYWORD' AND campaign.status != 'REMOVED'${filter}`,
        ),
        query(
          ctx,
          `SELECT shared_set.name, shared_set.id, shared_criterion.resource_name, shared_criterion.keyword.text,
  shared_criterion.keyword.match_type
FROM shared_criterion
WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'`,
        ),
      ])
      const kw = (k: unknown) => k as { text?: string; matchType?: string } | undefined
      return {
        campaign_level: campaignRows.map((r) => ({
          campaign_id: String(r.campaign?.id ?? ''),
          campaign: String(r.campaign?.name ?? ''),
          keyword: kw(r.campaignCriterion?.keyword)?.text ?? '',
          match_type: kw(r.campaignCriterion?.keyword)?.matchType ?? '',
          resource_name: String(r.campaignCriterion?.resourceName ?? ''),
        })),
        ad_group_level: adGroupRows.map((r) => ({
          campaign_id: String(r.campaign?.id ?? ''),
          campaign: String(r.campaign?.name ?? ''),
          ad_group: String(r.adGroup?.name ?? ''),
          keyword: kw(r.adGroupCriterion?.keyword)?.text ?? '',
          match_type: kw(r.adGroupCriterion?.keyword)?.matchType ?? '',
          resource_name: String(r.adGroupCriterion?.resourceName ?? ''),
        })),
        shared_lists: sharedRows.map((r) => ({
          list: String(r.sharedSet?.name ?? ''),
          keyword: kw(r.sharedCriterion?.keyword)?.text ?? '',
          match_type: kw(r.sharedCriterion?.keyword)?.matchType ?? '',
          resource_name: String(r.sharedCriterion?.resourceName ?? ''),
        })),
      }
    },
  },
  {
    name: 'google_ads_query',
    title: 'Custom report (GAQL)',
    description:
      'Run a read-only Google Ads Query Language report (SELECT … FROM … WHERE …) against the Sunday Rolls account for anything the other tools don’t cover. Returns up to 500 rows.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A GAQL SELECT statement.' } },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: READ,
    run: async (args, ctx) => {
      const gaql = str(args, 'query')
      if (!/^\s*select\s/i.test(gaql)) throw new ToolInputError('Only SELECT queries are allowed')
      const rows = await query(ctx, gaql)
      return { rows: rows.slice(0, 500), total_rows: rows.length, truncated: rows.length > 500 }
    },
  },
  {
    name: 'google_ads_change_log',
    title: 'Change log',
    description: 'Changes made through this connector (newest first): who, when, what. Google Ads’ own Change history has every change.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 300, description: 'Default 30.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, ctx) => {
      const state = (await ctx.store.getIntegrationState(CHANGE_LOG_KEY)) ?? {}
      const entries = Array.isArray(state.entries) ? (state.entries as ChangeLogEntry[]) : []
      return { entries: entries.slice(0, Math.min(Math.max(Number(args.limit ?? 30) || 30, 1), 300)) }
    },
  },
  {
    name: 'google_ads_add_negative_keywords',
    title: 'Add negative keywords',
    description:
      'Add negative keywords to one campaign. Two steps: call without confirm_token to get a Google-validated preview, show it to the user, then call again with the token once they approve.',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 },
        match_type: { type: 'string', enum: ['EXACT', 'PHRASE', 'BROAD'], description: 'Default PHRASE.' },
        ...confirmProp,
      },
      required: ['campaign_id', 'keywords'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const id = campaignId(args)
      const campaign = await findCampaign(ctx, id)
      const list = Array.isArray(args.keywords) ? args.keywords.map((k) => String(k).trim()).filter(Boolean) : []
      if (!list.length || list.length > 50) throw new ToolInputError('keywords must list 1–50 keywords')
      if (list.some((k) => k.length > 80)) throw new ToolInputError('Each keyword must be 80 characters or fewer')
      const matchType = String(args.match_type ?? 'PHRASE').toUpperCase()
      if (!['EXACT', 'PHRASE', 'BROAD'].includes(matchType)) throw new ToolInputError('match_type must be EXACT, PHRASE or BROAD')
      return change(ctx, 'google_ads_add_negative_keywords', args, {
        summary: `Add ${list.length} ${matchType.toLowerCase()} negative keyword${list.length === 1 ? '' : 's'} to "${campaign.name}": ${list.join(', ')}`,
        after: list.map((k) => ({ keyword: k, match_type: matchType })),
        service: 'campaignCriteria',
        operations: list.map((text) => ({
          create: {
            campaign: `customers/${cid(ctx)}/campaigns/${id}`,
            negative: true,
            keyword: { text, matchType },
          },
        })),
      })
    },
  },
  {
    name: 'google_ads_remove_negative_keywords',
    title: 'Remove negative keywords',
    description:
      'Remove negative keywords by resource_name (from google_ads_negative_keywords): campaign, ad group or shared-list entries. Two steps: preview without confirm_token, then apply with it after the user approves.',
    inputSchema: {
      type: 'object',
      properties: {
        resource_names: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 },
        ...confirmProp,
      },
      required: ['resource_names'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const names = Array.isArray(args.resource_names) ? args.resource_names.map((r) => String(r).trim()).filter(Boolean) : []
      if (!names.length || names.length > 50) throw new ToolInputError('resource_names must list 1–50 entries')
      const prefix = `customers/${cid(ctx)}/`
      const services = new Set<MutateService>()
      for (const name of names) {
        if (!name.startsWith(prefix)) throw new ToolInputError(`${name} isn’t in the Sunday Rolls account`)
        const kind = name.slice(prefix.length).split('/')[0]
        if (kind === 'campaignCriteria' || kind === 'adGroupCriteria' || kind === 'sharedCriteria') services.add(kind)
        else throw new ToolInputError(`${name} isn’t a negative keyword`)
      }
      if (services.size > 1) throw new ToolInputError('Remove one kind at a time (campaign, ad group or shared list)')
      const current = (await GOOGLE_ADS_TOOLS.find((t) => t.name === 'google_ads_negative_keywords')!.run({}, ctx)) as Record<
        string,
        Array<{ keyword: string; match_type: string; resource_name: string }>
      >
      const known = new Map(
        [...current.campaign_level, ...current.ad_group_level, ...current.shared_lists].map((k) => [k.resource_name, k]),
      )
      const missing = names.filter((name) => !known.has(name))
      if (missing.length) throw new ToolInputError(`Not current negative keywords: ${missing.join(', ')}`)
      const removed = names.map((name) => known.get(name)!)
      return change(ctx, 'google_ads_remove_negative_keywords', args, {
        summary: `Remove ${names.length} negative keyword${names.length === 1 ? '' : 's'}: ${removed.map((k) => `${k.keyword} (${k.match_type.toLowerCase()})`).join(', ')}`,
        before: removed,
        service: [...services][0],
        operations: names.map((remove) => ({ remove })),
      })
    },
  },
  {
    name: 'google_ads_set_target_roas',
    title: 'Set target ROAS',
    description:
      'Set a campaign’s target ROAS as a ratio (1.8 = 180%). Works for Maximize conversion value and Target ROAS bidding on the campaign itself, not portfolio strategies. Two steps: preview, then apply with confirm_token after the user approves.',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        target_roas: { type: 'number', minimum: 0.1, maximum: 20, description: 'Ratio, e.g. 1.8 for 180%.' },
        ...confirmProp,
      },
      required: ['campaign_id', 'target_roas'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const id = campaignId(args)
      const target = Number(args.target_roas)
      if (!Number.isFinite(target) || target < 0.1 || target > 20) throw new ToolInputError('target_roas must be a ratio between 0.1 and 20 (1.8 = 180%)')
      const campaign = await findCampaign(ctx, id)
      const field =
        campaign.biddingStrategyType === 'MAXIMIZE_CONVERSION_VALUE'
          ? { key: 'maximizeConversionValue', mask: 'maximize_conversion_value.target_roas' }
          : campaign.biddingStrategyType === 'TARGET_ROAS'
            ? { key: 'targetRoas', mask: 'target_roas.target_roas' }
            : null
      if (!field || campaign.portfolioStrategy) {
        throw new ToolInputError(
          `"${campaign.name}" uses ${campaign.portfolioStrategy ? 'a portfolio bidding strategy' : campaign.biddingStrategyType}, so target ROAS can’t be set here. Change it in Google Ads.`,
        )
      }
      return change(ctx, 'google_ads_set_target_roas', args, {
        summary: `Set target ROAS on "${campaign.name}" from ${campaign.targetRoas ?? 'none'} to ${target} (${Math.round(target * 100)}%)`,
        before: { target_roas: campaign.targetRoas },
        after: { target_roas: target },
        service: 'campaigns',
        operations: [
          {
            update: { resourceName: `customers/${cid(ctx)}/campaigns/${id}`, [field.key]: { targetRoas: target } },
            updateMask: field.mask,
          },
        ],
      })
    },
  },
  {
    name: 'google_ads_set_daily_budget',
    title: 'Set daily budget',
    description: `Set a campaign’s average daily budget in dollars (max $${MAX_DAILY_BUDGET}). Refuses shared budgets. Two steps: preview, then apply with confirm_token after the user approves.`,
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        daily_budget: { type: 'number', minimum: 1, maximum: MAX_DAILY_BUDGET, description: 'Dollars per day.' },
        ...confirmProp,
      },
      required: ['campaign_id', 'daily_budget'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const id = campaignId(args)
      const amount = round2(Number(args.daily_budget))
      if (!Number.isFinite(amount) || amount < 1 || amount > MAX_DAILY_BUDGET) {
        throw new ToolInputError(`daily_budget must be between $1 and $${MAX_DAILY_BUDGET}`)
      }
      const campaign = await findCampaign(ctx, id)
      if (!campaign.budget) throw new ToolInputError(`"${campaign.name}" has no budget to change`)
      if (campaign.budget.shared) throw new ToolInputError(`"${campaign.name}" uses a shared budget. Change it in Google Ads so every campaign on it is considered.`)
      return change(ctx, 'google_ads_set_daily_budget', args, {
        summary: `Set "${campaign.name}" daily budget from $${campaign.budget.dailyAmount.toFixed(2)} to $${amount.toFixed(2)}`,
        before: { daily_budget: campaign.budget.dailyAmount },
        after: { daily_budget: amount },
        service: 'campaignBudgets',
        operations: [
          {
            update: { resourceName: campaign.budget.resourceName, amountMicros: String(Math.round(amount * 1_000_000)) },
            updateMask: 'amount_micros',
          },
        ],
      })
    },
  },
  {
    name: 'google_ads_set_campaign_status',
    title: 'Pause or enable a campaign',
    description: 'Pause or enable one campaign. Two steps: preview, then apply with confirm_token after the user approves.',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        status: { type: 'string', enum: ['ENABLED', 'PAUSED'] },
        ...confirmProp,
      },
      required: ['campaign_id', 'status'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const id = campaignId(args)
      const status = String(args.status ?? '').toUpperCase()
      if (status !== 'ENABLED' && status !== 'PAUSED') throw new ToolInputError('status must be ENABLED or PAUSED')
      const campaign = await findCampaign(ctx, id)
      return change(ctx, 'google_ads_set_campaign_status', args, {
        summary: `${status === 'PAUSED' ? 'Pause' : 'Enable'} "${campaign.name}" (now ${campaign.status})`,
        before: { status: campaign.status },
        after: { status },
        service: 'campaigns',
        operations: [{ update: { resourceName: `customers/${cid(ctx)}/campaigns/${id}`, status }, updateMask: 'status' }],
      })
    },
  },
]
