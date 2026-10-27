import cs340 from "@/fixtures/cs340.json"
import type { ExtractionResult } from "@/lib/types"

// Stand-in for /api/extract until days 7–10: waits a realistic amount of
// time, then returns fixture data for known syllabi.

const FIXTURES: { match: RegExp; result: ExtractionResult }[] = [
  { match: /cs\s*_?340/i, result: cs340 as ExtractionResult },
]

const EMPTY_RESULT: ExtractionResult = {
  course: {
    name: null,
    instructor: null,
    meeting_times: null,
    office_location: null,
    office_hours: null,
  },
  events: [],
}

export async function fakeExtract(
  file: File,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<ExtractionResult> {
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

  return FIXTURES.find((f) => f.match.test(file.name))?.result ?? EMPTY_RESULT
}
