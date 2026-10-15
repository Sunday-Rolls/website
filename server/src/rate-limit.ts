type Bucket = { count: number; resetAt: number }

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

export type RateLimiter = (
  key: string,
  options?: { limit?: number; windowMs?: number },
) => RateLimitResult

/** Simple in-memory IP rate limit. Fine for a single Railway instance. */
export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, Bucket>()

  return (key, { limit = 5, windowMs = 60_000 } = {}) => {
    const current = now()
    const existing = buckets.get(key)

    if (!existing || existing.resetAt <= current) {
      buckets.set(key, { count: 1, resetAt: current + windowMs })
      return { ok: true }
    }

    if (existing.count >= limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - current) / 1000)),
      }
    }

    existing.count += 1
    return { ok: true }
  }
}
