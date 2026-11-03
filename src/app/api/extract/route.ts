import Anthropic from "@anthropic-ai/sdk"
import { ExtractionError, extractSyllabus } from "@/lib/server/extract-syllabus"
import { checkRateLimit, clientIp } from "@/lib/server/rate-limit"

// POST { fileName, termStart, pages: string[] } → { course, events, model, usage }.
// The browser extracts the page text, so the PDF itself never reaches the server.

// Long syllabi can take the model 30+ s; leave room, but still fail inside the
// function limit instead of hanging so the user can press "Try again".
export const maxDuration = 120

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ timeout: 110_000, maxRetries: 0 })
  : null

// Limits that keep one request from running up the bill.
const MAX_PAGES = 60
const MAX_CHARS = 200_000

function error(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status })
}

export async function POST(request: Request) {
  if (!client) {
    return error(503, "not_configured", "Extraction isn't set up on this server.")
  }

  const retryAfter = checkRateLimit(clientIp(request))
  if (retryAfter) {
    const minutes = Math.ceil(retryAfter / 60)
    const res = error(
      429,
      "rate_limited",
      `Too many syllabi from this network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
    )
    res.headers.set("Retry-After", String(retryAfter))
    return res
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error(400, "bad_request", "Expected a JSON body.")
  }
  const { fileName, termStart, pages } = (body ?? {}) as Record<string, unknown>
  if (
    typeof fileName !== "string" ||
    typeof termStart !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(termStart) ||
    !Array.isArray(pages) ||
    !pages.every((p) => typeof p === "string")
  ) {
    return error(400, "bad_request", "Expected fileName, termStart (YYYY-MM-DD), and pages.")
  }
  if (pages.length > MAX_PAGES || pages.join("").length > MAX_CHARS) {
    return error(413, "too_large", `Syllabi are limited to ${MAX_PAGES} pages.`)
  }
  if (pages.join("").trim().length < 50) {
    return error(
      422,
      "no_text",
      "This PDF has no selectable text, so it may be a scan. Try a text-based PDF."
    )
  }

  try {
    const result = await extractSyllabus(client, {
      fileName: fileName.slice(0, 200),
      termStart,
      pages,
    })
    console.log(
      `[extract] ${fileName}: ${result.events.length} events, ${result.usage.input_tokens} in / ${result.usage.output_tokens} out tokens (${result.model})`
    )
    return Response.json(result)
  } catch (err) {
    if (err instanceof ExtractionError) return error(err.status, "extraction_failed", err.message)
    if (err instanceof Anthropic.RateLimitError) {
      return error(429, "rate_limited", "Too many requests right now. Try again in a minute.")
    }
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return error(504, "timeout", "Extraction took too long. Try again.")
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("[extract] Anthropic rejected the API key")
      return error(500, "server_misconfigured", "Extraction isn't set up correctly on this server.")
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[extract] Anthropic API error ${err.status}: ${err.message}`)
      return error(502, "upstream_error", "The extraction service had a problem. Try again.")
    }
    console.error("[extract] unexpected error", err)
    return error(500, "internal_error", "Something went wrong while extracting.")
  }
}
