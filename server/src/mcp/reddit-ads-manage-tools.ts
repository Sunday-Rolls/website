/**
 * Reddit Ads change tools for the Sunday Rolls connector (see routes.ts / docs/REDDIT_ADS_SYNC.md).
 *
 * Reads go straight to the Reddit Ads API v3. Changes are two-step like the Google Ads tools: a
 * call without `confirm_token` reads the live entity and returns a before/after preview plus a
 * token; the same call repeated with that token applies it. Reddit has no validate-only mode, so the
 * preview is built from the live values, and Reddit's own checks run when the change is applied.
 * Every applied change is written to a change log (`reddit-ads-change-log`).
 *
 * API rules (verified by other v3 clients): single entities live on bare paths (`/ad_groups/{id}`)
 * and update with PATCH `{ data: {...} }`; lists and creates are account-scoped
 * (`/ad_accounts/{id}/ad_groups`); money is microcurrency. Ad copy can't be edited through the API.
 * Needs a refresh token with the `adsedit` scope for changes.
 */
import {
  collect,
  loadRedditAdsCredentialsFromEnv,
  REDDIT_ADS_API,
  redditAccessToken,
  redditAdsMissingEnv,
  redditApi,
  type RedditAdsCredentials,
} from '../analytics/reddit-ads.js'
import type { AnalyticsStore } from '../analytics/store.js'
import { confirmToken, confirmTokenValid, ToolInputError, type ToolDef } from './google-ads-tools.js'

export type RedditManageContext = {
  store: AnalyticsStore
  env: NodeJS.ProcessEnv
  /** Signs confirm tokens. */
  secret: string
  user: { id: string; email: string }
  fetchImpl?: typeof fetch
  now?: () => number
}

const CHANGE_LOG_KEY = 'reddit-ads-change-log'
const CHANGE_LOG_MAX = 300
const CONFIRM_TTL_MS = 15 * 60_000
const MIN_DAILY_BUDGET = 5
const MAX_DAILY_BUDGET = 500
const MAX_LIST = 1000

const round2 = (x: number) => Math.round(x * 100) / 100
const usd = (micro: unknown) => (micro === null || micro === undefined || micro === '' ? null : round2(Number(micro) / 1_000_000))
const micro = (dollars: number) => Math.round(dollars * 1_000_000)

/** Keys Reddit accepts in an ad group's `targeting` on PATCH/create (the schema rejects others). */
const TARGETING_KEYS = [
  'carriers',
  'communities',
  'custom_audience_ids',
  'devices',
  'excluded_communities',
  'excluded_custom_audience_ids',
  'excluded_geolocations',
  'excluded_interests',
  'excluded_keywords',
  'expand_targeting',
  'gender',
  'geolocations',
  'interests',
  'keywords',
  'languages',
  'locations',
  'platforms',
  'suppression_event_types',
  'view_modes',
] as const

type Targeting = Record<string, unknown>
type Entity = Record<string, unknown> & { id?: string; name?: string }

// ---------- helpers ----------

function creds(ctx: RedditManageContext): RedditAdsCredentials {
  const missing = redditAdsMissingEnv(ctx.env)
  if (missing) throw new ToolInputError(`Reddit Ads isn’t connected on the server (missing ${missing}); see docs/REDDIT_ADS_SYNC.md.`)
  return loadRedditAdsCredentialsFromEnv(ctx.env)!
}

async function session(ctx: RedditManageContext) {
  const c = creds(ctx)
  const fetchImpl = ctx.fetchImpl ?? fetch
  const token = await redditAccessToken(c, fetchImpl)
  return { c, token, fetchImpl }
}
type Session = Awaited<ReturnType<typeof session>>

function str(args: Record<string, unknown>, key: string, required = true): string {
  const v = args[key]
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw new ToolInputError(`${key} is required`)
    return ''
  }
  return String(v).trim()
}

function id(args: Record<string, unknown>, key: string): string {
  const v = str(args, key)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw new ToolInputError(`${key} must be a Reddit id (see reddit_ads_structure)`)
  return v
}

function stringList(args: Record<string, unknown>, key: string): string[] {
  const v = args[key]
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new ToolInputError(`${key} must be a list of strings`)
  return [...new Set(v.map((x) => String(x).trim()).filter(Boolean))]
}

async function getOne(s: Session, path: string): Promise<Entity> {
  const page = await redditApi<Entity>(s.token, 'GET', `${REDDIT_ADS_API}${path}`, undefined, s.fetchImpl)
  const data = page.data
  if (!data || typeof data !== 'object') throw new Error(`Reddit returned nothing for ${path}`)
  return data
}

/** Refuse entities from another ad account, if Reddit says which account they belong to. */
function sameAccount(s: Session, entity: Entity, label: string) {
  const owner = entity.ad_account_id
  if (owner && String(owner) !== s.c.adAccountId) {
    throw new ToolInputError(`${label} belongs to another ad account (${String(owner)}), not ${s.c.adAccountId}`)
  }
}

async function list(s: Session, kind: 'campaigns' | 'ad_groups' | 'ads'): Promise<Entity[]> {
  const url = `${REDDIT_ADS_API}/ad_accounts/${encodeURIComponent(s.c.adAccountId)}/${kind}?page.size=${MAX_LIST}`
  return collect<Entity>(s.token, 'GET', url, undefined, (p) => (Array.isArray(p.data) ? (p.data as Entity[]) : undefined), s.fetchImpl)
}

export function cleanTargeting(t: unknown): Targeting {
  const src = (t && typeof t === 'object' ? t : {}) as Targeting
  const out: Targeting = {}
  for (const key of TARGETING_KEYS) {
    const v = src[key]
    if (v !== undefined && v !== null) out[key] = v
  }
  return out
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

/** Add then remove (case-insensitive) on one targeting list. */
function edit(current: unknown, add: string[], remove: string[]): string[] {
  const out = asList(current)
  const has = (x: string) => out.some((y) => y.toLowerCase() === x.toLowerCase())
  for (const a of add) if (!has(a)) out.push(a)
  const drop = new Set(remove.map((r) => r.toLowerCase()))
  return out.filter((x) => !drop.has(x.toLowerCase()))
}

function summarizeTargeting(t: Targeting) {
  return {
    keywords: asList(t.keywords),
    excluded_keywords: asList(t.excluded_keywords),
    communities: asList(t.communities),
    excluded_communities: asList(t.excluded_communities),
    interests: asList(t.interests),
    geolocations: asList(t.geolocations),
    ...(t.expand_targeting !== undefined ? { expand_targeting: t.expand_targeting } : {}),
  }
}

async function logChange(ctx: RedditManageContext, entry: { tool: string; summary: string; args: Record<string, unknown>; ids: string[] }) {
  const state = (await ctx.store.getIntegrationState(CHANGE_LOG_KEY)) ?? {}
  const entries = Array.isArray(state.entries) ? (state.entries as unknown[]) : []
  const at = new Date(ctx.now?.() ?? Date.now()).toISOString()
  await ctx.store.setIntegrationState(CHANGE_LOG_KEY, {
    entries: [{ at, user: ctx.user.email, ...entry }, ...entries].slice(0, CHANGE_LOG_MAX),
  })
}

/**
 * Preview or apply. Without a valid confirm_token nothing is sent to Reddit; the answer carries the
 * token. With it, `apply` runs and the change is logged.
 */
async function change(
  ctx: RedditManageContext,
  tool: string,
  args: Record<string, unknown>,
  plan: { summary: string; before?: unknown; after?: unknown; warnings?: string[]; apply: () => Promise<unknown>; ids: string[] },
) {
  const now = ctx.now?.() ?? Date.now()
  if (!args.confirm_token) {
    return {
      status: 'preview',
      applied: false,
      summary: plan.summary,
      before: plan.before,
      after: plan.after,
      ...(plan.warnings?.length ? { warnings: plan.warnings } : {}),
      confirm_token: confirmToken(ctx.secret, tool, args, now + CONFIRM_TTL_MS),
      next_step:
        'Nothing has changed yet. Reddit checks the change only when it is applied. Show this preview to the user and get an explicit yes, then call the same tool again with identical arguments plus this confirm_token (valid 15 minutes).',
    }
  }
  if (!confirmTokenValid(ctx.secret, tool, args, now)) {
    throw new ToolInputError('confirm_token is invalid or expired, or the arguments changed. Run the tool again without it for a new preview.')
  }
  let result: unknown
  try {
    result = await plan.apply()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reddit rejected the change'
    if (/\b403\b/.test(message)) {
      throw new Error(`${message}. If Reddit says the token lacks permission, redo the Reddit sign-in (/dashboard/api/reddit/connect) so it includes edit access, and update REDDIT_ADS_REFRESH_TOKEN.`)
    }
    throw error
  }
  const { confirm_token: _t, ...logged } = args
  await logChange(ctx, { tool, summary: plan.summary, args: logged, ids: plan.ids })
  return { status: 'applied', applied: true, summary: plan.summary, before: plan.before, after: plan.after, result }
}

const patch = (s: Session, path: string, data: Record<string, unknown>) =>
  redditApi<Entity>(s.token, 'PATCH', `${REDDIT_ADS_API}${path}`, { data }, s.fetchImpl).then((p) => p.data ?? null)

const post = (s: Session, kind: 'ad_groups' | 'ads', data: Record<string, unknown>) =>
  redditApi<Entity>(
    s.token,
    'POST',
    `${REDDIT_ADS_API}/ad_accounts/${encodeURIComponent(s.c.adAccountId)}/${kind}`,
    { data },
    s.fetchImpl,
  ).then((p) => p.data ?? null)

const pickStatus = (e: Entity) => ({ configured_status: e.configured_status ?? null, effective_status: e.effective_status ?? null })

// ---------- tools ----------

const READ = { readOnlyHint: true, openWorldHint: true }
const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
const confirmProp = {
  confirm_token: {
    type: 'string',
    description: 'Leave out to preview. After the user approves the preview, send the token it returned to apply the change.',
  },
}
const listProp = (description: string) => ({ type: 'array', items: { type: 'string' }, maxItems: 200, description })

type Tool = Omit<ToolDef, 'run'> & { run: (args: Record<string, unknown>, ctx: RedditManageContext) => Promise<unknown> }

export const REDDIT_MANAGE_TOOLS: Tool[] = [
  {
    name: 'reddit_ads_structure',
    title: 'Reddit Ads campaigns, ad groups and ads',
    description:
      'Live Reddit Ads account structure: campaigns, their ad groups (status, daily budget, bid, optimization goal, keyword / community / interest targeting) and ads (status, destination URL). Use the ids it returns with the other reddit_ads_* tools. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
    run: async (_args, ctx) => {
      const s = await session(ctx)
      const [campaigns, adGroups, ads] = await Promise.all([list(s, 'campaigns'), list(s, 'ad_groups'), list(s, 'ads')])
      return {
        ad_account_id: s.c.adAccountId,
        note: 'Budgets and bids are dollars. Status ACTIVE means set to run; effective_status is what Reddit is actually doing (it can lag a few minutes).',
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          ...pickStatus(c),
          objective: c.objective ?? null,
          campaign_budget_optimization: Boolean(c.is_campaign_budget_optimization),
          ...(c.is_campaign_budget_optimization ? { goal_type: c.goal_type ?? null, budget: usd(c.goal_value) } : {}),
          ad_groups: adGroups
            .filter((g) => String(g.campaign_id) === String(c.id))
            .map((g) => ({
              id: g.id,
              name: g.name,
              ...pickStatus(g),
              goal_type: g.goal_type ?? null,
              budget: usd(g.goal_value),
              bid_strategy: g.bid_strategy ?? null,
              bid_type: g.bid_type ?? null,
              bid: usd(g.bid_value),
              optimization_goal: g.optimization_goal ?? null,
              targeting: summarizeTargeting(cleanTargeting(g.targeting)),
              ads: ads
                .filter((a) => String(a.ad_group_id) === String(g.id))
                .map((a) => ({ id: a.id, name: a.name, ...pickStatus(a), click_url: a.click_url ?? null, post_id: a.post_id ?? null })),
            })),
        })),
      }
    },
  },
  {
    name: 'reddit_ads_set_ad_url',
    title: 'Change a Reddit ad’s destination URL',
    description:
      'Change one ad’s destination (click) URL, or add/overwrite query parameters such as UTMs while keeping the rest. Must stay on sundayrollsgolf.com. On a live ad, clicks go to the new URL right away; Reddit may re-review the ad. Two steps: preview, then apply with confirm_token after the user approves.',
    inputSchema: {
      type: 'object',
      properties: {
        ad_id: { type: 'string' },
        click_url: { type: 'string', description: 'Full replacement URL (https://www.sundayrollsgolf.com/...). Optional if set_query_params is given.' },
        set_query_params: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Query params to set, e.g. {"utm_source":"reddit","utm_medium":"paid"}.',
        },
        ...confirmProp,
      },
      required: ['ad_id'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const adId = id(args, 'ad_id')
      const replacement = str(args, 'click_url', false)
      const params = args.set_query_params as Record<string, unknown> | undefined
      if (!replacement && (!params || !Object.keys(params).length)) throw new ToolInputError('Give click_url or set_query_params')
      const s = await session(ctx)
      const ad = await getOne(s, `/ads/${encodeURIComponent(adId)}`)
      sameAccount(s, ad, `Ad ${adId}`)
      const before = typeof ad.click_url === 'string' ? ad.click_url : ''
      const base = replacement || before
      if (!base) throw new ToolInputError('This ad has no destination URL; pass click_url')
      let next: URL
      try {
        next = new URL(base)
      } catch {
        throw new ToolInputError('click_url must be a full https:// URL')
      }
      if (next.protocol !== 'https:' || !/(^|\.)sundayrollsgolf\.com$/i.test(next.hostname)) {
        throw new ToolInputError('The destination must be an https://…sundayrollsgolf.com page')
      }
      for (const [k, v] of Object.entries(params ?? {})) {
        if (!k.trim()) continue
        next.searchParams.set(k.trim(), String(v))
      }
      const after = next.toString()
      if (after === before) throw new ToolInputError('That is already the ad’s destination URL')
      return change(ctx, 'reddit_ads_set_ad_url', args, {
        summary: `Change "${ad.name ?? adId}" destination URL`,
        before: { click_url: before || null },
        after: { click_url: after },
        warnings: ['Reddit may send the ad back through review after a URL change.'],
        ids: [adId],
        apply: () => patch(s, `/ads/${encodeURIComponent(adId)}`, { click_url: after }),
      })
    },
  },
  {
    name: 'reddit_ads_update_targeting',
    title: 'Change a Reddit ad group’s keywords or communities',
    description:
      'Add or remove an ad group’s targeted keywords, excluded keywords, communities (subreddit names without r/) or excluded communities. Everything else in its targeting stays as is. Two steps: preview, then apply with confirm_token after the user approves.',
    inputSchema: {
      type: 'object',
      properties: {
        ad_group_id: { type: 'string' },
        add_keywords: listProp('Keywords to target.'),
        remove_keywords: listProp('Targeted keywords to drop.'),
        add_excluded_keywords: listProp('Keywords to exclude.'),
        remove_excluded_keywords: listProp('Excluded keywords to drop.'),
        add_communities: listProp('Subreddits to target, e.g. "golf".'),
        remove_communities: listProp('Targeted subreddits to drop.'),
        add_excluded_communities: listProp('Subreddits to exclude.'),
        remove_excluded_communities: listProp('Excluded subreddits to drop.'),
        ...confirmProp,
      },
      required: ['ad_group_id'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const groupId = id(args, 'ad_group_id')
      const ops = {
        keywords: [stringList(args, 'add_keywords'), stringList(args, 'remove_keywords')],
        excluded_keywords: [stringList(args, 'add_excluded_keywords'), stringList(args, 'remove_excluded_keywords')],
        communities: [
          stringList(args, 'add_communities').map((c) => c.replace(/^\/?r\//i, '')),
          stringList(args, 'remove_communities').map((c) => c.replace(/^\/?r\//i, '')),
        ],
        excluded_communities: [
          stringList(args, 'add_excluded_communities').map((c) => c.replace(/^\/?r\//i, '')),
          stringList(args, 'remove_excluded_communities').map((c) => c.replace(/^\/?r\//i, '')),
        ],
      } as const
      if (Object.values(ops).every(([a, r]) => !a.length && !r.length)) throw new ToolInputError('Nothing to change: give at least one add_/remove_ list')
      const s = await session(ctx)
      const group = await getOne(s, `/ad_groups/${encodeURIComponent(groupId)}`)
      sameAccount(s, group, `Ad group ${groupId}`)
      const current = cleanTargeting(group.targeting)
      const next: Targeting = { ...current }
      const before: Record<string, string[]> = {}
      const after: Record<string, string[]> = {}
      for (const [key, [add, remove]] of Object.entries(ops)) {
        if (!add.length && !remove.length) continue
        before[key] = asList(current[key])
        after[key] = edit(current[key], add, remove)
        next[key] = after[key]
      }
      if (JSON.stringify(before) === JSON.stringify(after)) throw new ToolInputError('Those changes are already in place')
      const warnings: string[] = []
      const targetsLeft = ['keywords', 'communities', 'interests', 'custom_audience_ids'].some((k) => asList(next[k]).length)
      if (!targetsLeft) warnings.push('After this the ad group targets no keywords, communities, interests or audiences, so Reddit may show it broadly or reject the change.')
      return change(ctx, 'reddit_ads_update_targeting', args, {
        summary: `Update targeting on ad group "${group.name ?? groupId}"`,
        before,
        after,
        warnings,
        ids: [groupId],
        apply: () => patch(s, `/ad_groups/${encodeURIComponent(groupId)}`, { targeting: next }),
      })
    },
  },
  {
    name: 'reddit_ads_set_status',
    title: 'Pause or turn on a Reddit campaign, ad group or ad',
    description:
      'Set a campaign, ad group or ad to ACTIVE (runs and spends) or PAUSED. Two steps: preview, then apply with confirm_token after the user approves.',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['campaign', 'ad_group', 'ad'] },
        id: { type: 'string' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
        ...confirmProp,
      },
      required: ['level', 'id', 'status'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const level = str(args, 'level')
      const path = { campaign: 'campaigns', ad_group: 'ad_groups', ad: 'ads' }[level]
      if (!path) throw new ToolInputError('level must be campaign, ad_group or ad')
      const entityId = id(args, 'id')
      const status = str(args, 'status').toUpperCase()
      if (status !== 'ACTIVE' && status !== 'PAUSED') throw new ToolInputError('status must be ACTIVE or PAUSED')
      const s = await session(ctx)
      const entity = await getOne(s, `/${path}/${encodeURIComponent(entityId)}`)
      sameAccount(s, entity, `${level} ${entityId}`)
      if (entity.configured_status === status) throw new ToolInputError(`It is already ${status}`)
      const label = level.replace('_', ' ')
      return change(ctx, 'reddit_ads_set_status', args, {
        summary: `${status === 'PAUSED' ? 'Pause' : 'Turn on'} ${label} "${entity.name ?? entityId}"`,
        before: pickStatus(entity),
        after: { configured_status: status },
        warnings: status === 'ACTIVE' ? ['This starts or resumes spending.'] : [],
        ids: [entityId],
        apply: () => patch(s, `/${path}/${encodeURIComponent(entityId)}`, { configured_status: status }),
      })
    },
  },
  {
    name: 'reddit_ads_set_daily_budget',
    title: 'Change a Reddit daily budget',
    description: `Set the daily budget in dollars ($${MIN_DAILY_BUDGET}–$${MAX_DAILY_BUDGET}) for an ad group, or for its campaign when the campaign uses campaign budget optimization. Refuses lifetime budgets. Two steps: preview, then apply with confirm_token after the user approves.`,
    inputSchema: {
      type: 'object',
      properties: {
        ad_group_id: { type: 'string', description: 'The ad group whose budget to change (or whose CBO campaign budget to change).' },
        daily_budget: { type: 'number', minimum: MIN_DAILY_BUDGET, maximum: MAX_DAILY_BUDGET, description: 'Dollars per day.' },
        ...confirmProp,
      },
      required: ['ad_group_id', 'daily_budget'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const groupId = id(args, 'ad_group_id')
      const amount = round2(Number(args.daily_budget))
      if (!Number.isFinite(amount) || amount < MIN_DAILY_BUDGET || amount > MAX_DAILY_BUDGET) {
        throw new ToolInputError(`daily_budget must be between $${MIN_DAILY_BUDGET} and $${MAX_DAILY_BUDGET}`)
      }
      const s = await session(ctx)
      const group = await getOne(s, `/ad_groups/${encodeURIComponent(groupId)}`)
      sameAccount(s, group, `Ad group ${groupId}`)
      const campaignId = String(group.campaign_id ?? '')
      const campaign = campaignId ? await getOne(s, `/campaigns/${encodeURIComponent(campaignId)}`) : null
      const onCampaign = Boolean(campaign?.is_campaign_budget_optimization)
      const owner = onCampaign ? campaign! : group
      const goalType = owner.goal_type ?? null
      if (goalType && goalType !== 'DAILY_SPEND') {
        throw new ToolInputError(`This ${onCampaign ? 'campaign' : 'ad group'} uses a ${String(goalType)} budget, not a daily one. Change it in Reddit Ads Manager.`)
      }
      const current = usd(owner.goal_value)
      if (current === amount) throw new ToolInputError(`The daily budget is already $${amount.toFixed(2)}`)
      const label = onCampaign ? `campaign "${owner.name ?? campaignId}" (shared by its ad groups)` : `ad group "${owner.name ?? groupId}"`
      return change(ctx, 'reddit_ads_set_daily_budget', args, {
        summary: `Set ${label} daily budget from ${current === null ? 'unset' : `$${current.toFixed(2)}`} to $${amount.toFixed(2)}`,
        before: { daily_budget: current },
        after: { daily_budget: amount },
        ids: [onCampaign ? campaignId : groupId],
        apply: () =>
          onCampaign
            ? patch(s, `/campaigns/${encodeURIComponent(campaignId)}`, { goal_value: micro(amount) })
            : patch(s, `/ad_groups/${encodeURIComponent(groupId)}`, { goal_value: micro(amount) }),
      })
    },
  },
  {
    name: 'reddit_ads_create_ad_group',
    title: 'Add a Reddit ad group',
    description:
      'Add an ad group by copying an existing one (bidding, optimization goal, pixel, targeting), with a new name and its own keywords / communities. It is created PAUSED, along with paused copies of the source ad group’s ads (same post and link) unless copy_ads is false. Turn it on with reddit_ads_set_status. Two steps: preview, then apply with confirm_token after the user approves.',
    inputSchema: {
      type: 'object',
      properties: {
        source_ad_group_id: { type: 'string', description: 'Ad group to copy settings (and ads) from.' },
        name: { type: 'string', minLength: 3, maxLength: 200 },
        keywords: listProp('Keywords to target instead of the source’s. Leave out to keep the source’s.'),
        communities: listProp('Subreddits to target instead of the source’s. Leave out to keep the source’s.'),
        daily_budget: { type: 'number', minimum: MIN_DAILY_BUDGET, maximum: MAX_DAILY_BUDGET, description: 'Dollars per day. Leave out to copy the source’s (ignored on campaign-budget campaigns).' },
        copy_ads: { type: 'boolean', description: 'Copy the source ad group’s ads into the new one, paused (default true).' },
        ...confirmProp,
      },
      required: ['source_ad_group_id', 'name'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, ctx) => {
      const sourceId = id(args, 'source_ad_group_id')
      const name = str(args, 'name')
      if (name.length < 3 || name.length > 200) throw new ToolInputError('name must be 3–200 characters')
      const keywords = args.keywords === undefined ? null : stringList(args, 'keywords')
      const communities = args.communities === undefined ? null : stringList(args, 'communities').map((c) => c.replace(/^\/?r\//i, ''))
      const budgetArg = args.daily_budget === undefined ? null : round2(Number(args.daily_budget))
      if (budgetArg !== null && (!Number.isFinite(budgetArg) || budgetArg < MIN_DAILY_BUDGET || budgetArg > MAX_DAILY_BUDGET)) {
        throw new ToolInputError(`daily_budget must be between $${MIN_DAILY_BUDGET} and $${MAX_DAILY_BUDGET}`)
      }
      const copyAds = args.copy_ads !== false
      const s = await session(ctx)
      const source = await getOne(s, `/ad_groups/${encodeURIComponent(sourceId)}`)
      sameAccount(s, source, `Ad group ${sourceId}`)
      const campaignId = String(source.campaign_id ?? '')
      if (!campaignId) throw new ToolInputError('The source ad group has no campaign')
      const campaign = await getOne(s, `/campaigns/${encodeURIComponent(campaignId)}`)
      const cbo = Boolean(campaign.is_campaign_budget_optimization)

      const targeting = cleanTargeting(source.targeting)
      if (keywords) targeting.keywords = keywords
      if (communities) targeting.communities = communities

      const body: Record<string, unknown> = {
        campaign_id: campaignId,
        name,
        configured_status: 'PAUSED',
        targeting,
        conversion_pixel_id: source.conversion_pixel_id ?? s.c.adAccountId,
      }
      for (const key of ['bid_strategy', 'bid_type', 'optimization_goal'] as const) {
        if (source[key] !== undefined && source[key] !== null) body[key] = source[key]
      }
      // A campaign-level bid can't be repeated on the ad group.
      if (!cbo && source.bid_value !== undefined && source.bid_value !== null) body.bid_value = source.bid_value
      if (!cbo) {
        body.goal_type = 'DAILY_SPEND'
        body.goal_value = budgetArg !== null ? micro(budgetArg) : source.goal_type === 'DAILY_SPEND' ? source.goal_value : null
        if (!body.goal_value) throw new ToolInputError('The source has no daily budget to copy; pass daily_budget')
      }

      const sourceAds = copyAds
        ? (await list(s, 'ads')).filter((a) => String(a.ad_group_id) === sourceId && a.post_id && a.configured_status !== 'DELETED')
        : []
      const warnings = [
        'Created PAUSED: nothing spends until you turn it on with reddit_ads_set_status.',
        ...(cbo ? ['The campaign uses campaign budget optimization, so the new ad group shares the campaign budget.'] : []),
        ...(copyAds && !sourceAds.length ? ['The source ad group has no ads to copy; the new ad group will be empty until an ad is added in Reddit Ads Manager.'] : []),
      ]
      return change(ctx, 'reddit_ads_create_ad_group', args, {
        summary: `Add paused ad group "${name}" to campaign "${campaign.name ?? campaignId}", copied from "${source.name ?? sourceId}"${sourceAds.length ? ` with ${sourceAds.length} paused ad cop${sourceAds.length === 1 ? 'y' : 'ies'}` : ''}`,
        after: {
          name,
          daily_budget: cbo ? 'campaign budget' : usd(body.goal_value),
          bid_strategy: body.bid_strategy ?? null,
          optimization_goal: body.optimization_goal ?? null,
          targeting: summarizeTargeting(targeting),
          ads_to_copy: sourceAds.map((a) => ({ id: a.id, name: a.name, click_url: a.click_url ?? null })),
        },
        warnings,
        ids: [sourceId],
        apply: async () => {
          const created = await post(s, 'ad_groups', body)
          const newId = created?.id ? String(created.id) : ''
          const ads: Array<Record<string, unknown>> = []
          if (newId) {
            for (const a of sourceAds) {
              try {
                const ad = await post(s, 'ads', {
                  ad_group_id: newId,
                  name: String(a.name ?? 'Ad'),
                  configured_status: 'PAUSED',
                  post_id: a.post_id,
                  ...(typeof a.click_url === 'string' && a.click_url ? { click_url: a.click_url } : {}),
                })
                ads.push({ source_ad_id: a.id, ok: true, new_ad_id: ad?.id ?? null })
              } catch (error) {
                ads.push({ source_ad_id: a.id, ok: false, error: error instanceof Error ? error.message : 'failed' })
              }
            }
          }
          return { ad_group_id: newId || null, configured_status: created?.configured_status ?? null, ads }
        },
      })
    },
  },
  {
    name: 'reddit_ads_change_log',
    title: 'Reddit Ads change log',
    description: 'Changes made to Reddit Ads through this connector, newest first. Read-only.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 300 } }, additionalProperties: false },
    annotations: READ,
    run: async (args, ctx) => {
      const limit = Math.min(Math.max(Number(args.limit ?? 50) || 50, 1), CHANGE_LOG_MAX)
      const state = (await ctx.store.getIntegrationState(CHANGE_LOG_KEY)) ?? {}
      const entries = Array.isArray(state.entries) ? state.entries : []
      return { entries: entries.slice(0, limit) }
    },
  },
]
