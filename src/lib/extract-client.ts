import { fakeExtract, fixtureFor } from "@/lib/fake-extract"
import type { ExtractionResult } from "@/lib/types"

// Runs one syllabus through extraction: page text in the browser, then
// /api/extract. Falls back to a fixture when the server has no API key.

export interface ExtractOptions {
  termStart: string
  /** Skip the API and use the fixture (the example syllabus, to save credits). */
  useFixture?: boolean
}

export async function extractFile(
  file: File,
  options: ExtractOptions,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<ExtractionResult> {
  if (options.useFixture) return fakeExtract(file, onProgress, signal)

  onProgress(5)
  const { readPageTexts } = await import("@/lib/pdf-text")
  const pages = await readPageTexts(file)
  signal.throwIfAborted()
  onProgress(20)

  // The model call has no real progress to report, so ease toward 90% while
  // it runs (most of the way there by about 15 s).
  const start = performance.now()
  const ticker = setInterval(() => {
    const elapsed = (performance.now() - start) / 1000
    onProgress(20 + 70 * (1 - Math.exp(-elapsed / 8)))
  }, 250)

  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, termStart: options.termStart, pages }),
      // The server gives up at about 110 s; this catches a request that never answers.
      signal: AbortSignal.any([signal, AbortSignal.timeout(130_000)]),
    })
    const body = await res.json().catch(() => null)

    if (res.status === 503 && body?.error === "not_configured") {
      const fixture = fixtureFor(file)
      if (fixture) return fixture
    }
    if (!res.ok) throw new Error(body?.message ?? `Extraction failed (${res.status}).`)
    return { course: body.course, schedule: body.schedule, events: body.events }
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Extraction took too long. Try again.")
    }
    throw err
  } finally {
    clearInterval(ticker)
  }
}
