/**
 * Runs a background sync on boot, on a timer, and shortly after webhooks.
 *
 * Only one run happens at a time. A trigger that lands mid-run queues exactly one
 * follow-up run, and bursts of webhooks collapse into a single run.
 * Used by the Merchant Center feed sync and the Shopify order sync.
 */

export type SyncSchedule = {
  /** 0 disables the timer (webhooks still trigger runs). */
  intervalMs: number
  /** Wait this long after a webhook before syncing, to batch bursts. */
  debounceMs: number
}

export type SyncRunner = {
  start(): void
  stop(): void
  /** Schedule a debounced run (webhooks). */
  trigger(reason: string): void
  /** Run now, or after the current run finishes. Resolves when that run is done. */
  runNow(reason: string): Promise<void>
}

/** Parse `<prefix>_INTERVAL_MINUTES` / `<prefix>_DEBOUNCE_SECONDS` with defaults. Intervals clamp to ≥ 5 minutes. */
export function loadSyncScheduleFromEnv(
  env: NodeJS.ProcessEnv,
  prefix: string,
  defaults: { intervalMinutes: number; debounceSeconds: number },
): SyncSchedule {
  const minutes = Number(env[`${prefix}_INTERVAL_MINUTES`] ?? String(defaults.intervalMinutes))
  const seconds = Number(env[`${prefix}_DEBOUNCE_SECONDS`] ?? String(defaults.debounceSeconds))
  return {
    intervalMs: Number.isFinite(minutes) && minutes > 0 ? Math.max(5, minutes) * 60_000 : 0,
    debounceMs: (Number.isFinite(seconds) && seconds >= 0 ? seconds : defaults.debounceSeconds) * 1000,
  }
}

export function createSyncRunner(options: {
  run: (reason: string) => Promise<void>
  schedule: SyncSchedule
  /** Used in failure logs, e.g. "Merchant sync". */
  label: string
  log?: (msg: string) => void
}): SyncRunner {
  const { run, schedule, label, log = console.log } = options
  let interval: ReturnType<typeof setInterval> | null = null
  let debounce: ReturnType<typeof setTimeout> | null = null
  let current: Promise<void> | null = null
  let queued: { reason: string; done: Promise<void> } | null = null

  async function execute(reason: string) {
    try {
      await run(reason)
    } catch (error) {
      log(`${label} (${reason}) failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  function runNow(reason: string): Promise<void> {
    if (!current) {
      current = execute(reason).finally(() => {
        current = null
      })
      return current
    }
    // A run is in progress: data may have changed after it read Shopify, so queue one more.
    if (!queued) {
      const done = current.then(() => {
        const next = queued!
        queued = null
        return runNow(next.reason)
      })
      queued = { reason, done }
    }
    return queued.done
  }

  return {
    start() {
      void runNow('boot')
      if (schedule.intervalMs > 0) {
        interval = setInterval(() => void runNow('schedule'), schedule.intervalMs)
        interval.unref?.()
      }
    },
    stop() {
      if (interval) clearInterval(interval)
      if (debounce) clearTimeout(debounce)
      interval = null
      debounce = null
    },
    trigger(reason) {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void runNow(reason)
      }, schedule.debounceMs)
      debounce.unref?.()
    },
    runNow,
  }
}
