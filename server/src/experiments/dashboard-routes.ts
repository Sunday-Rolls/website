import { Hono, type Context } from 'hono'
import type { ConclusionDispatcher } from './dispatch.js'
import { buildExperimentResults } from './results.js'
import { ExperimentKeyTakenError, type ExperimentStore } from './store.js'
import {
  canChangeTraffic,
  findPathConflicts,
  isStatusAction,
  newSeed,
  parseCreateExperiment,
  parseTrafficPct,
  planTransition,
} from './validation.js'

export type ExperimentDashboardDeps = {
  experiments: ExperimentStore
  /** The signed-in dashboard user, or null. Any signed-in user may act (owner decision, plan §12). */
  currentUser: (c: Context) => Promise<{ email: string } | null>
  now?: () => Date
  /** Conclusion `repository_dispatch` on promote/stop; omitted when GitHub isn't configured. */
  dispatch?: ConclusionDispatcher | null
}

/** Mounted at `/dashboard/api/experiments`. Every write is recorded in `experiment_audit`. */
export function createExperimentDashboardRoutes({
  experiments,
  currentUser,
  now = () => new Date(),
  dispatch = null,
}: ExperimentDashboardDeps) {
  const app = new Hono<{ Variables: { actor: string } }>()

  app.use('*', async (c, next) => {
    const user = await currentUser(c)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    c.set('actor', user.email)
    return next()
  })

  app.get('/', async (c) => {
    const [list, counts] = await Promise.all([experiments.list(), experiments.exposureCounts()])
    return c.json({
      ok: true,
      experiments: list.map((e) => {
        const arms = counts.get(e.id) ?? {}
        return {
          ...e,
          variants: e.variants.map((v) => ({
            ...v,
            visitors: arms[v.key]?.visitors ?? 0,
            forcedVisitors: arms[v.key]?.forced ?? 0,
          })),
        }
      }),
    })
  })

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = parseCreateExperiment(body)
    if (!parsed.ok) return c.json({ ok: false, error: parsed.error }, 400)
    const actor = c.get('actor')
    try {
      const exp = await experiments.create({ ...parsed.value, seed: newSeed(), createdBy: actor, source: 'dashboard' })
      await experiments.addAudit({
        experimentId: exp.id,
        actor,
        action: 'created',
        detail: { variants: exp.variants.map((v) => `${v.key}:${v.weight}`), trafficPct: exp.trafficPct, paths: exp.paths },
      })
      return c.json({ ok: true, experiment: exp }, 201)
    } catch (error) {
      if (error instanceof ExperimentKeyTakenError) return c.json({ ok: false, error: error.message }, 409)
      throw error
    }
  })

  app.get('/:key', async (c) => {
    const exp = await experiments.getByKey(c.req.param('key'))
    if (!exp) return notFound(c)
    return c.json({ ok: true, experiment: exp, audit: await experiments.listAudit(exp.id) })
  })

  app.post('/:key/status', async (c) => {
    const exp = await experiments.getByKey(c.req.param('key'))
    if (!exp) return notFound(c)
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const action = body?.action
    if (!isStatusAction(action)) {
      return c.json({ ok: false, error: 'action must be start, pause, resume, stop, promote or archive' }, 400)
    }
    const plan = planTransition(exp, action, body?.variant, now())
    if (!plan.ok) return c.json({ ok: false, error: plan.error }, plan.status)
    if (action === 'start' || action === 'resume') {
      // Overlap rule: two running tests never share a page (plan §9).
      const conflicts = findPathConflicts(exp, await experiments.list())
      if (conflicts.length) {
        return c.json(
          { ok: false, error: `Another running experiment targets the same page: ${conflicts.join(', ')}`, conflicts },
          409,
        )
      }
    }
    const updated = await experiments.update(exp.id, plan.value.patch)
    await experiments.addAudit({ experimentId: exp.id, actor: c.get('actor'), action: plan.value.audit, detail: plan.value.detail })
    if (dispatch && (action === 'promote' || action === 'stop')) {
      // Fire-and-forget: failures are logged and audited as dispatch_failed, never surfaced here.
      void dispatch(updated, action === 'promote' ? 'promoted' : 'stopped')
    }
    return c.json({ ok: true, experiment: updated })
  })

  app.post('/:key/traffic', async (c) => {
    const exp = await experiments.getByKey(c.req.param('key'))
    if (!exp) return notFound(c)
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const traffic = parseTrafficPct(body?.trafficPct)
    if (!traffic.ok) return c.json({ ok: false, error: traffic.error }, 400)
    if (!canChangeTraffic(exp)) {
      return c.json({ ok: false, error: `Cannot change traffic on an experiment that is ${exp.status}` }, 409)
    }
    const updated = await experiments.update(exp.id, { trafficPct: traffic.value })
    await experiments.addAudit({
      experimentId: exp.id,
      actor: c.get('actor'),
      action: 'traffic_changed',
      detail: { from: exp.trafficPct, to: traffic.value },
    })
    return c.json({ ok: true, experiment: updated })
  })

  app.get('/:key/results', async (c) => {
    const exp = await experiments.getByKey(c.req.param('key'))
    if (!exp) return notFound(c)
    return c.json({ ok: true, data: await buildExperimentResults(experiments, exp, now()) })
  })

  return app
}

function notFound(c: Context) {
  return c.json({ ok: false, error: 'Experiment not found' }, 404)
}
