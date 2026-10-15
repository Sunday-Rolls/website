import { randomUUID } from 'node:crypto'
import { ANALYTICS_SCHEMA_SQL } from './schema.js'
import type {
  AbandonedCartStats,
  CashForecastRow,
  DailyAdSpend,
  DailyProductView,
  DailyTraffic,
  DashboardSession,
  DashboardUser,
  Expense,
  Order,
  PublicUser,
  SearchKeyword,
  SyncRun,
} from './types.js'

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

export type AnalyticsStore = {
  migrate(): Promise<void>
  /** Wipe metrics tables (orders, traffic, ads, etc). Keeps dashboard users/sessions. */
  clearAnalyticsData(): Promise<void>
  // users / sessions
  getUserByEmail(email: string): Promise<DashboardUser | null>
  getUserById(id: string): Promise<DashboardUser | null>
  upsertUser(user: Omit<DashboardUser, 'createdAt'> & { createdAt?: string }): Promise<DashboardUser>
  createSession(session: DashboardSession): Promise<void>
  getSession(id: string): Promise<(DashboardSession & { user: PublicUser }) | null>
  deleteSession(id: string): Promise<void>
  // data
  replaceOrders(orders: Order[]): Promise<number>
  /** Insert or update by (channel, externalId). Leaves other orders untouched. */
  upsertOrders(orders: Order[]): Promise<number>
  listOrders(): Promise<Order[]>
  replaceTraffic(rows: DailyTraffic[]): Promise<number>
  /** Merge traffic rows by (date, channel); leaves other days untouched. */
  upsertTraffic(rows: DailyTraffic[]): Promise<number>
  listTraffic(): Promise<DailyTraffic[]>
  replaceAdSpend(rows: DailyAdSpend[]): Promise<number>
  upsertAdSpend(rows: DailyAdSpend[]): Promise<number>
  listAdSpend(): Promise<DailyAdSpend[]>
  replaceKeywords(rows: SearchKeyword[]): Promise<number>
  listKeywords(): Promise<SearchKeyword[]>
  replaceProductViews(rows: DailyProductView[]): Promise<number>
  upsertProductViews(rows: DailyProductView[]): Promise<number>
  listProductViews(): Promise<DailyProductView[]>
  replaceExpenses(rows: Expense[]): Promise<number>
  upsertExpenses(rows: Expense[]): Promise<number>
  listExpenses(): Promise<Expense[]>
  replaceCashForecast(rows: CashForecastRow[]): Promise<number>
  upsertCashForecast(rows: CashForecastRow[]): Promise<number>
  listCashForecast(): Promise<CashForecastRow[]>
  replaceAbandoned(stats: AbandonedCartStats): Promise<void>
  getAbandoned(periodStart: string, periodEnd: string): Promise<AbandonedCartStats | null>
  startSync(source: string): Promise<SyncRun>
  finishSync(id: string, status: 'ok' | 'error', message: string | null, rowsTouched: number): Promise<void>
  latestSyncs(): Promise<SyncRun[]>
}

function num(value: unknown): number {
  return Number(value ?? 0)
}

function str(value: unknown): string {
  return String(value ?? '')
}

function optionalStr(value: unknown): string | null {
  return value == null || value === '' ? null : String(value)
}

export function createMemoryAnalyticsStore(): AnalyticsStore {
  const users = new Map<string, DashboardUser>()
  const sessions = new Map<string, DashboardSession>()
  let orders: Order[] = []
  let traffic: DailyTraffic[] = []
  let adSpend: DailyAdSpend[] = []
  let keywords: SearchKeyword[] = []
  let productViews: DailyProductView[] = []
  let expenses: Expense[] = []
  let cash: CashForecastRow[] = []
  let abandoned: AbandonedCartStats[] = []
  let syncs: SyncRun[] = []

  return {
    async migrate() {},

    async clearAnalyticsData() {
      orders = []
      traffic = []
      adSpend = []
      keywords = []
      productViews = []
      expenses = []
      cash = []
      abandoned = []
      syncs = []
    },

    async getUserByEmail(email) {
      return [...users.values()].find((u) => u.email === email) ?? null
    },

    async getUserById(id) {
      return users.get(id) ?? null
    },

    async upsertUser(user) {
      const saved: DashboardUser = {
        ...user,
        createdAt: user.createdAt ?? new Date().toISOString(),
      }
      users.set(saved.id, saved)
      return saved
    },

    async createSession(session) {
      sessions.set(session.id, session)
    },

    async getSession(id) {
      const session = sessions.get(id)
      if (!session) return null
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        sessions.delete(id)
        return null
      }
      const user = users.get(session.userId)
      if (!user) return null
      return {
        ...session,
        user: { id: user.id, email: user.email, name: user.name },
      }
    },

    async deleteSession(id) {
      sessions.delete(id)
    },

    async replaceOrders(next) {
      orders = next
      return next.length
    },

    async upsertOrders(next) {
      const map = new Map(orders.map((o) => [`${o.channel}|${o.externalId}`, o]))
      for (const order of next) map.set(`${order.channel}|${order.externalId}`, order)
      orders = [...map.values()]
      return next.length
    },

    async listOrders() {
      return orders
    },

    async replaceTraffic(rows) {
      traffic = rows
      return rows.length
    },

    async upsertTraffic(rows) {
      const map = new Map(traffic.map((r) => [`${r.date}|${r.channel}`, r]))
      for (const row of rows) map.set(`${row.date}|${row.channel}`, row)
      traffic = [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
      return rows.length
    },

    async listTraffic() {
      return traffic
    },

    async replaceAdSpend(rows) {
      adSpend = rows
      return rows.length
    },

    async upsertAdSpend(rows) {
      const map = new Map(adSpend.map((r) => [`${r.date}|${r.platform}|${r.campaign}`, r]))
      for (const row of rows) map.set(`${row.date}|${row.platform}|${row.campaign}`, row)
      adSpend = [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
      return rows.length
    },

    async listAdSpend() {
      return adSpend
    },

    async replaceKeywords(rows) {
      keywords = rows
      return rows.length
    },

    async listKeywords() {
      return keywords
    },

    async replaceProductViews(rows) {
      productViews = rows
      return rows.length
    },

    async upsertProductViews(rows) {
      const map = new Map(productViews.map((r) => [`${r.date}|${r.productName}`, r]))
      for (const row of rows) map.set(`${row.date}|${row.productName}`, row)
      productViews = [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
      return rows.length
    },

    async listProductViews() {
      return productViews
    },

    async replaceExpenses(rows) {
      expenses = rows
      return rows.length
    },

    async upsertExpenses(rows) {
      const map = new Map(expenses.map((e) => [e.id, e]))
      // Prefer matching by date+category+amount+explanation when id is new
      for (const row of rows) {
        const existing = expenses.find(
          (e) =>
            e.spentAt === row.spentAt &&
            e.category === row.category &&
            e.amount === row.amount &&
            e.explanation === row.explanation,
        )
        if (existing) {
          map.set(existing.id, { ...row, id: existing.id })
        } else {
          map.set(row.id, row)
        }
      }
      expenses = [...map.values()]
      return rows.length
    },

    async listExpenses() {
      return expenses
    },

    async replaceCashForecast(rows) {
      cash = rows
      return rows.length
    },

    async upsertCashForecast(rows) {
      const map = new Map(cash.map((r) => [r.monthEnd, r]))
      for (const row of rows) map.set(row.monthEnd, row)
      cash = [...map.values()].sort((a, b) => a.monthEnd.localeCompare(b.monthEnd))
      return rows.length
    },

    async listCashForecast() {
      return cash
    },

    async replaceAbandoned(stats) {
      abandoned = [stats]
    },

    async getAbandoned(periodStart, periodEnd) {
      return (
        abandoned.find((a) => a.periodStart === periodStart && a.periodEnd === periodEnd) ??
        abandoned[0] ??
        null
      )
    },

    async startSync(source) {
      const run: SyncRun = {
        id: randomUUID(),
        source,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: 'running',
        message: null,
        rowsTouched: 0,
      }
      syncs.unshift(run)
      return run
    },

    async finishSync(id, status, message, rowsTouched) {
      const run = syncs.find((s) => s.id === id)
      if (!run) return
      run.status = status
      run.message = message
      run.rowsTouched = rowsTouched
      run.finishedAt = new Date().toISOString()
    },

    async latestSyncs() {
      const bySource = new Map<string, SyncRun>()
      for (const run of syncs) {
        if (!bySource.has(run.source)) bySource.set(run.source, run)
      }
      return [...bySource.values()]
    },
  }
}

export function createPgAnalyticsStore(db: Queryable): AnalyticsStore {
  return {
    async migrate() {
      await db.query(ANALYTICS_SCHEMA_SQL)
    },

    async clearAnalyticsData() {
      await db.query(`
        TRUNCATE TABLE
          analytics_order_lines,
          analytics_orders,
          analytics_daily_traffic,
          analytics_daily_ad_spend,
          analytics_search_keywords,
          analytics_daily_product_views,
          analytics_expenses,
          analytics_cash_forecast,
          analytics_abandoned_carts,
          analytics_sync_runs
        RESTART IDENTITY CASCADE
      `)
    },

    async getUserByEmail(email) {
      const { rows } = await db.query(
        `SELECT id, email, name, password_hash, created_at FROM dashboard_users WHERE email = $1`,
        [email],
      )
      return rows[0] ? rowToUser(rows[0]) : null
    },

    async getUserById(id) {
      const { rows } = await db.query(
        `SELECT id, email, name, password_hash, created_at FROM dashboard_users WHERE id = $1`,
        [id],
      )
      return rows[0] ? rowToUser(rows[0]) : null
    },

    async upsertUser(user) {
      const { rows } = await db.query(
        `INSERT INTO dashboard_users (id, email, name, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
         RETURNING id, email, name, password_hash, created_at`,
        [user.id, user.email, user.name, user.passwordHash],
      )
      return rowToUser(rows[0])
    },

    async createSession(session) {
      await db.query(
        `INSERT INTO dashboard_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
        [session.id, session.userId, session.expiresAt],
      )
    },

    async getSession(id) {
      const { rows } = await db.query(
        `SELECT s.id, s.user_id, s.expires_at, u.email, u.name
         FROM dashboard_sessions s
         JOIN dashboard_users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.expires_at > now()`,
        [id],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: str(row.id),
        userId: str(row.user_id),
        expiresAt: toIso(row.expires_at),
        user: { id: str(row.user_id), email: str(row.email), name: str(row.name) },
      }
    },

    async deleteSession(id) {
      await db.query(`DELETE FROM dashboard_sessions WHERE id = $1`, [id])
    },

    async replaceOrders(orders) {
      await db.query(`DELETE FROM analytics_order_lines`)
      await db.query(`DELETE FROM analytics_orders`)
      for (const order of orders) {
        await insertOrder(db, order)
      }
      return orders.length
    },

    async upsertOrders(orders) {
      for (const order of orders) {
        const { rows } = await db.query(
          `SELECT id FROM analytics_orders WHERE channel = $1 AND external_id = $2`,
          [order.channel, order.externalId],
        )
        const existingId = rows[0] ? str(rows[0].id) : null
        if (existingId) {
          await db.query(`DELETE FROM analytics_order_lines WHERE order_id = $1`, [existingId])
          await db.query(
            `UPDATE analytics_orders SET
               ordered_at = $2, revenue = $3, fees = $4, shipping_cost = $5, marketing_cost = $6,
               state = $7, customer_email = $8, is_returning = $9, traffic_source = $10
             WHERE id = $1`,
            [
              existingId,
              order.orderedAt,
              order.revenue,
              order.fees,
              order.shippingCost,
              order.marketingCost,
              order.state,
              order.customerEmail,
              order.isReturning,
              order.trafficSource,
            ],
          )
          for (const line of order.lines) {
            await db.query(
              `INSERT INTO analytics_order_lines
                (id, order_id, product_name, product_sku, category, quantity, unit_price, line_revenue)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                randomUUID(),
                existingId,
                line.productName,
                line.productSku,
                line.category,
                line.quantity,
                line.unitPrice,
                line.lineRevenue,
              ],
            )
          }
        } else {
          await insertOrder(db, order)
        }
      }
      return orders.length
    },

    async listOrders() {
      const { rows: orderRows } = await db.query(
        `SELECT * FROM analytics_orders ORDER BY ordered_at DESC`,
      )
      const { rows: lineRows } = await db.query(`SELECT * FROM analytics_order_lines`)
      const linesByOrder = new Map<string, Order['lines']>()
      for (const row of lineRows) {
        const orderId = str(row.order_id)
        const list = linesByOrder.get(orderId) ?? []
        list.push({
          productName: str(row.product_name),
          productSku: optionalStr(row.product_sku),
          category: optionalStr(row.category),
          quantity: num(row.quantity),
          unitPrice: num(row.unit_price),
          lineRevenue: num(row.line_revenue),
        })
        linesByOrder.set(orderId, list)
      }
      return orderRows.map((row) => ({
        id: str(row.id),
        externalId: str(row.external_id),
        channel: str(row.channel) as Order['channel'],
        orderedAt: toIso(row.ordered_at),
        revenue: num(row.revenue),
        fees: num(row.fees),
        shippingCost: num(row.shipping_cost),
        marketingCost: num(row.marketing_cost),
        state: optionalStr(row.state),
        customerEmail: optionalStr(row.customer_email),
        isReturning: Boolean(row.is_returning),
        trafficSource: optionalStr(row.traffic_source),
        lines: linesByOrder.get(str(row.id)) ?? [],
      }))
    },

    async replaceTraffic(rows) {
      await db.query(`DELETE FROM analytics_daily_traffic`)
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_daily_traffic
            (date, channel, visits, unique_visitors, product_views, add_to_carts, checkouts, purchases, source_breakdown, region_breakdown)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            row.date,
            row.channel,
            row.visits,
            row.uniqueVisitors,
            row.productViews,
            row.addToCarts,
            row.checkouts,
            row.purchases,
            JSON.stringify(row.sourceBreakdown),
            JSON.stringify(row.regionBreakdown ?? {}),
          ],
        )
      }
      return rows.length
    },

    async upsertTraffic(rows) {
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_daily_traffic
            (date, channel, visits, unique_visitors, product_views, add_to_carts, checkouts, purchases, source_breakdown, region_breakdown)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (date, channel) DO UPDATE SET
             visits = EXCLUDED.visits,
             unique_visitors = EXCLUDED.unique_visitors,
             product_views = EXCLUDED.product_views,
             add_to_carts = EXCLUDED.add_to_carts,
             checkouts = EXCLUDED.checkouts,
             purchases = EXCLUDED.purchases,
             source_breakdown = EXCLUDED.source_breakdown,
             region_breakdown = EXCLUDED.region_breakdown`,
          [
            row.date,
            row.channel,
            row.visits,
            row.uniqueVisitors,
            row.productViews,
            row.addToCarts,
            row.checkouts,
            row.purchases,
            JSON.stringify(row.sourceBreakdown),
            JSON.stringify(row.regionBreakdown ?? {}),
          ],
        )
      }
      return rows.length
    },

    async listTraffic() {
      const { rows } = await db.query(`SELECT * FROM analytics_daily_traffic ORDER BY date`)
      return rows.map((row) => ({
        date: toDateOnly(row.date),
        channel: 'website' as const,
        visits: num(row.visits),
        uniqueVisitors: num(row.unique_visitors),
        productViews: num(row.product_views),
        addToCarts: num(row.add_to_carts),
        checkouts: num(row.checkouts),
        purchases: num(row.purchases),
        sourceBreakdown:
          typeof row.source_breakdown === 'string'
            ? (JSON.parse(row.source_breakdown) as Record<string, number>)
            : ((row.source_breakdown as Record<string, number>) ?? {}),
        regionBreakdown:
          typeof row.region_breakdown === 'string'
            ? (JSON.parse(row.region_breakdown) as Record<string, number>)
            : ((row.region_breakdown as Record<string, number>) ?? {}),
      }))
    },

    async replaceAdSpend(rows) {
      await db.query(`DELETE FROM analytics_daily_ad_spend`)
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_daily_ad_spend
            (date, platform, campaign, spend, platform_reported_sales, platform_reported_orders)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            row.date,
            row.platform,
            row.campaign ?? '',
            row.spend,
            row.platformReportedSales,
            row.platformReportedOrders,
          ],
        )
      }
      return rows.length
    },

    async upsertAdSpend(rows) {
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_daily_ad_spend
            (date, platform, campaign, spend, platform_reported_sales, platform_reported_orders)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (date, platform, campaign) DO UPDATE SET
             spend = EXCLUDED.spend,
             platform_reported_sales = EXCLUDED.platform_reported_sales,
             platform_reported_orders = EXCLUDED.platform_reported_orders`,
          [
            row.date,
            row.platform,
            row.campaign ?? '',
            row.spend,
            row.platformReportedSales,
            row.platformReportedOrders,
          ],
        )
      }
      return rows.length
    },

    async listAdSpend() {
      const { rows } = await db.query(`SELECT * FROM analytics_daily_ad_spend ORDER BY date, platform, campaign`)
      return rows.map((row) => ({
        date: toDateOnly(row.date),
        platform: str(row.platform),
        campaign: str(row.campaign ?? ''),
        spend: num(row.spend),
        platformReportedSales: num(row.platform_reported_sales),
        platformReportedOrders: num(row.platform_reported_orders),
      }))
    },

    async replaceKeywords(rows) {
      await db.query(`DELETE FROM analytics_search_keywords`)
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_search_keywords (query, period_start, period_end, visits)
           VALUES ($1,$2,$3,$4)`,
          [row.query, row.periodStart, row.periodEnd, row.visits],
        )
      }
      return rows.length
    },

    async listKeywords() {
      const { rows } = await db.query(`SELECT * FROM analytics_search_keywords`)
      return rows.map((row) => ({
        query: str(row.query),
        visits: num(row.visits),
        periodStart: toDateOnly(row.period_start),
        periodEnd: toDateOnly(row.period_end),
      }))
    },

    async replaceProductViews(rows) {
      await db.query(`DELETE FROM analytics_daily_product_views`)
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_daily_product_views (date, product_name, category, views)
           VALUES ($1,$2,$3,$4)`,
          [row.date, row.productName, row.category, row.views],
        )
      }
      return rows.length
    },

    async upsertProductViews(rows) {
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_daily_product_views (date, product_name, category, views)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (date, product_name) DO UPDATE SET
             category = EXCLUDED.category,
             views = EXCLUDED.views`,
          [row.date, row.productName, row.category, row.views],
        )
      }
      return rows.length
    },

    async listProductViews() {
      const { rows } = await db.query(
        `SELECT * FROM analytics_daily_product_views ORDER BY date, product_name`,
      )
      return rows.map((row) => ({
        date: toDateOnly(row.date),
        productName: str(row.product_name),
        category: optionalStr(row.category),
        views: num(row.views),
      }))
    },

    async replaceExpenses(rows) {
      await db.query(`DELETE FROM analytics_expenses`)
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_expenses
            (id, spent_at, category, explanation, amount, bucket, product_line)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [row.id, row.spentAt, row.category, row.explanation, row.amount, row.bucket, row.productLine],
        )
      }
      return rows.length
    },

    async upsertExpenses(rows) {
      for (const row of rows) {
        const { rows: existing } = await db.query(
          `SELECT id FROM analytics_expenses
           WHERE spent_at = $1 AND category = $2 AND amount = $3 AND explanation = $4
           LIMIT 1`,
          [row.spentAt, row.category, row.amount, row.explanation],
        )
        if (existing[0]) {
          await db.query(
            `UPDATE analytics_expenses SET bucket = $2, product_line = $3 WHERE id = $1`,
            [str(existing[0].id), row.bucket, row.productLine],
          )
        } else {
          await db.query(
            `INSERT INTO analytics_expenses
              (id, spent_at, category, explanation, amount, bucket, product_line)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [row.id, row.spentAt, row.category, row.explanation, row.amount, row.bucket, row.productLine],
          )
        }
      }
      return rows.length
    },

    async listExpenses() {
      const { rows } = await db.query(`SELECT * FROM analytics_expenses ORDER BY spent_at`)
      return rows.map((row) => ({
        id: str(row.id),
        spentAt: toDateOnly(row.spent_at),
        category: str(row.category),
        explanation: str(row.explanation),
        amount: num(row.amount),
        bucket: str(row.bucket) as Expense['bucket'],
        productLine: optionalStr(row.product_line),
      }))
    },

    async replaceCashForecast(rows) {
      await db.query(`DELETE FROM analytics_cash_forecast`)
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_cash_forecast
            (month_end, beginning_balance, collections, freight_and_fees, marketing, website, manufacturing, ending_balance)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            row.monthEnd,
            row.beginningBalance,
            row.collections,
            row.freightAndFees,
            row.marketing,
            row.website,
            row.manufacturing,
            row.endingBalance,
          ],
        )
      }
      return rows.length
    },

    async upsertCashForecast(rows) {
      for (const row of rows) {
        await db.query(
          `INSERT INTO analytics_cash_forecast
            (month_end, beginning_balance, collections, freight_and_fees, marketing, website, manufacturing, ending_balance)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (month_end) DO UPDATE SET
             beginning_balance = EXCLUDED.beginning_balance,
             collections = EXCLUDED.collections,
             freight_and_fees = EXCLUDED.freight_and_fees,
             marketing = EXCLUDED.marketing,
             website = EXCLUDED.website,
             manufacturing = EXCLUDED.manufacturing,
             ending_balance = EXCLUDED.ending_balance`,
          [
            row.monthEnd,
            row.beginningBalance,
            row.collections,
            row.freightAndFees,
            row.marketing,
            row.website,
            row.manufacturing,
            row.endingBalance,
          ],
        )
      }
      return rows.length
    },

    async listCashForecast() {
      const { rows } = await db.query(`SELECT * FROM analytics_cash_forecast ORDER BY month_end`)
      return rows.map((row) => ({
        monthEnd: toDateOnly(row.month_end),
        beginningBalance: num(row.beginning_balance),
        collections: num(row.collections),
        freightAndFees: num(row.freight_and_fees),
        marketing: num(row.marketing),
        website: num(row.website),
        manufacturing: num(row.manufacturing),
        endingBalance: num(row.ending_balance),
      }))
    },

    async replaceAbandoned(stats) {
      await db.query(`DELETE FROM analytics_abandoned_carts`)
      await db.query(
        `INSERT INTO analytics_abandoned_carts
          (period_start, period_end, abandoned, recovered, recovered_revenue)
         VALUES ($1,$2,$3,$4,$5)`,
        [stats.periodStart, stats.periodEnd, stats.abandoned, stats.recovered, stats.recoveredRevenue],
      )
    },

    async getAbandoned(periodStart, periodEnd) {
      const { rows } = await db.query(
        `SELECT * FROM analytics_abandoned_carts
         WHERE period_start <= $2 AND period_end >= $1
         ORDER BY period_end DESC LIMIT 1`,
        [periodStart, periodEnd],
      )
      const row = rows[0]
      if (!row) return null
      return {
        periodStart: toDateOnly(row.period_start),
        periodEnd: toDateOnly(row.period_end),
        abandoned: num(row.abandoned),
        recovered: num(row.recovered),
        recoveredRevenue: num(row.recovered_revenue),
      }
    },

    async startSync(source) {
      const id = randomUUID()
      const { rows } = await db.query(
        `INSERT INTO analytics_sync_runs (id, source, status)
         VALUES ($1, $2, 'running')
         RETURNING id, source, started_at, finished_at, status, message, rows_touched`,
        [id, source],
      )
      return rowToSync(rows[0])
    },

    async finishSync(id, status, message, rowsTouched) {
      await db.query(
        `UPDATE analytics_sync_runs
         SET status = $2, message = $3, rows_touched = $4, finished_at = now()
         WHERE id = $1`,
        [id, status, message, rowsTouched],
      )
    },

    async latestSyncs() {
      const { rows } = await db.query(
        `SELECT DISTINCT ON (source) id, source, started_at, finished_at, status, message, rows_touched
         FROM analytics_sync_runs
         ORDER BY source, started_at DESC`,
      )
      return rows.map(rowToSync)
    },
  }
}

async function insertOrder(db: Queryable, order: Order) {
  await db.query(
    `INSERT INTO analytics_orders
      (id, external_id, channel, ordered_at, revenue, fees, shipping_cost, marketing_cost, state, customer_email, is_returning, traffic_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      order.id,
      order.externalId,
      order.channel,
      order.orderedAt,
      order.revenue,
      order.fees,
      order.shippingCost,
      order.marketingCost,
      order.state,
      order.customerEmail,
      order.isReturning,
      order.trafficSource,
    ],
  )
  for (const line of order.lines) {
    await db.query(
      `INSERT INTO analytics_order_lines
        (id, order_id, product_name, product_sku, category, quantity, unit_price, line_revenue)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        order.id,
        line.productName,
        line.productSku,
        line.category,
        line.quantity,
        line.unitPrice,
        line.lineRevenue,
      ],
    )
  }
}

function rowToUser(row: Record<string, unknown>): DashboardUser {
  return {
    id: str(row.id),
    email: str(row.email),
    name: str(row.name),
    passwordHash: str(row.password_hash),
    createdAt: toIso(row.created_at),
  }
}

function rowToSync(row: Record<string, unknown>): SyncRun {
  return {
    id: str(row.id),
    source: str(row.source),
    startedAt: toIso(row.started_at),
    finishedAt: row.finished_at == null ? null : toIso(row.finished_at),
    status: str(row.status) as SyncRun['status'],
    message: optionalStr(row.message),
    rowsTouched: num(row.rows_touched),
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return new Date(String(value)).toISOString()
}

function toDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}
