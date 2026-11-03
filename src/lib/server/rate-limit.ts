// Per-IP sliding-window limit for /api/extract, which is public and spends
// prepaid API credits. State lives in memory, so each server instance counts
// separately and a cold start resets it: a speed bump against a script
// hammering the endpoint, not a hard cap.

const WINDOW_MS = 60 * 60 * 1000
const MAX_REQUESTS = 30 // a few semesters of syllabi, with retries

const hits = new Map<string, number[]>()

/** Records a request; returns seconds to wait if the IP is over the limit, else 0. */
export function checkRateLimit(ip: string, now = Date.now()): number {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent)
    return Math.ceil((recent[0] + WINDOW_MS - now) / 1000)
  }
  recent.push(now)
  hits.set(ip, recent)

  // Drop idle IPs now and then so the map can't grow without bound.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (now - times[times.length - 1] >= WINDOW_MS) hits.delete(key)
    }
  }
  return 0
}

export function clientIp(request: Request) {
  // Vercel sets x-forwarded-for; the first entry is the client.
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
}
