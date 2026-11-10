import { z } from "zod"
import { getGoogleToken } from "@/lib/server/google-token"

// POST { calendarName, timeZone, events } → { calendarId, link, inserted, failed }.
// Makes a new calendar for the term, so undoing the export is one delete.

export const maxDuration = 60

const API = "https://www.googleapis.com/calendar/v3"
const MAX_EVENTS = 500
const CONCURRENCY = 5
const RETRIES = 3

const timeSchema = z.union([
  z.object({ date: z.iso.date() }),
  z.object({
    dateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
    timeZone: z.string().min(1).max(64),
  }),
])

const eventSchema = z.object({
  summary: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  location: z.string().max(300).optional(),
  start: timeSchema,
  end: timeSchema,
  recurrence: z
    .array(z.string().regex(/^(RRULE|EXDATE)[:;]/).max(2000))
    .max(2)
    .optional(),
})

const bodySchema = z.object({
  calendarName: z.string().min(1).max(100),
  timeZone: z.string().min(1).max(64),
  events: z.array(eventSchema).min(1).max(MAX_EVENTS),
})

function error(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status })
}

class GoogleError extends Error {
  constructor(readonly status: number) {
    super(`Google Calendar returned ${status}`)
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Calls the Calendar API, backing off when Google asks us to slow down. */
async function google<T>(token: string, path: string, body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) return res.json() as Promise<T>
    const limited =
      res.status === 429 ||
      (res.status === 403 && /rateLimitExceeded/.test(await res.clone().text()))
    if (!limited || attempt >= RETRIES) throw new GoogleError(res.status)
    await wait(1000 * 2 ** attempt + Math.random() * 500)
  }
}

export async function POST(request: Request) {
  const token = await getGoogleToken(request)
  if (!token) return error(401, "signed_out", "Sign in with Google to export.")

  let parsed
  try {
    parsed = bodySchema.safeParse(await request.json())
  } catch {
    return error(400, "bad_request", "Expected a JSON body.")
  }
  if (!parsed.success) return error(400, "bad_request", "Some events couldn't be read.")
  const { calendarName, timeZone, events } = parsed.data

  let calendarId: string
  try {
    ;({ id: calendarId } = await google<{ id: string }>(token, "/calendars", {
      summary: calendarName,
      description: "Dates from your syllabi, added by Semester Planner.",
      timeZone,
    }))
  } catch (e) {
    if (e instanceof GoogleError && e.status === 401) {
      return error(401, "signed_out", "Your Google sign-in expired. Sign in again.")
    }
    return error(502, "google_failed", "Google Calendar didn't respond. Try again.")
  }

  const path = `/calendars/${encodeURIComponent(calendarId)}/events`
  let inserted = 0
  let link: string | null = null
  const queue = [...events]
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let event = queue.shift(); event; event = queue.shift()) {
        try {
          const created = await google<{ htmlLink?: string }>(token, path, event)
          inserted++
          link ??= created.htmlLink ?? null
        } catch {
          // Counted below; the rest still go in.
        }
      }
    })
  )

  return Response.json({
    calendarId,
    link: link ?? "https://calendar.google.com/calendar/r",
    inserted,
    failed: events.length - inserted,
  })
}
