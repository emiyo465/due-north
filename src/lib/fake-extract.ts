import cs340 from "@/fixtures/cs340.json"
import type { ExtractionResult } from "@/lib/types"

// Fixture data for known sample syllabi. Used by "Use example syllabus" (no
// credits spent) and as the fallback when the server has no API key.

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
  schedule: { meetings: [], last_day: null, no_class_dates: [] },
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

  return fixtureFor(file) ?? EMPTY_RESULT
}

/** The fixture for a known sample syllabus, if there is one. */
export function fixtureFor(file: File): ExtractionResult | null {
  return FIXTURES.find((f) => f.match.test(file.name))?.result ?? null
}
