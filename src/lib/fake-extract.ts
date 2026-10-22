import cs340 from "@/fixtures/cs340.json"
import type { ExtractedEvent } from "@/lib/types"

// Stand-in for /api/extract until days 7–10: waits a realistic amount of
// time, then returns fixture events for known syllabi.

const FIXTURES: { match: RegExp; events: ExtractedEvent[] }[] = [
  { match: /cs\s*_?340/i, events: cs340.events as ExtractedEvent[] },
]

export async function fakeExtract(
  file: File,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<ExtractedEvent[]> {
  const duration = 1500 + Math.random() * 1500
  const start = performance.now()

  await new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (signal.aborted) {
        clearInterval(interval)
        reject(signal.reason)
        return
      }
      const progress = Math.min(100, ((performance.now() - start) / duration) * 100)
      onProgress(progress)
      if (progress >= 100) {
        clearInterval(interval)
        resolve()
      }
    }, 100)
  })

  return FIXTURES.find((f) => f.match.test(file.name))?.events ?? []
}
