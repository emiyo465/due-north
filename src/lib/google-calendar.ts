import { format, parse } from "date-fns"
import { compactDateTime, type CalendarEntry, type CalendarTime } from "@/lib/export"

/** The subset of a Google Calendar API event resource this app sends. */
export interface GoogleEvent {
  summary: string
  description?: string
  location?: string
  start: GoogleTime
  end: GoogleTime
  recurrence?: string[]
}

export type GoogleTime = { date: string } | { dateTime: string; timeZone: string }

function toGoogleTime(time: CalendarTime, timeZone: string): GoogleTime {
  return "date" in time ? { date: time.date } : { dateTime: `${time.dateTime}:00`, timeZone }
}

/**
 * Google event bodies for the given entries. Times are wall-clock in `timeZone`,
 * so weekly classes keep their hour across daylight saving changes.
 */
export function toGoogleEvents(entries: CalendarEntry[], timeZone: string): GoogleEvent[] {
  return entries.map((entry) => {
    const event: GoogleEvent = {
      summary: entry.title,
      start: toGoogleTime(entry.start, timeZone),
      end: toGoogleTime(entry.end, timeZone),
    }
    if (entry.description) event.description = entry.description
    if (entry.location) event.location = entry.location
    if (entry.repeat) {
      const { days, until, skip } = entry.repeat
      // RFC 5545 wants UNTIL in UTC when the start has a time zone; the end of
      // the last day is read in the browser's zone, which is `timeZone`.
      const lastMoment = parse(`${until} 23:59:59`, "yyyy-MM-dd HH:mm:ss", new Date())
      const untilUtc = lastMoment.toISOString().replace(/[-:]|\.\d{3}/g, "")
      event.recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${days.join(",")};UNTIL=${untilUtc}`]
      if (skip.length > 0) {
        event.recurrence.push(`EXDATE;TZID=${timeZone}:${skip.map(compactDateTime).join(",")}`)
      }
    }
    return event
  })
}

/** A name for the new calendar, from the term's start date: "Fall 2026 classes". */
export function calendarName(termStart: string) {
  const start = parse(termStart, "yyyy-MM-dd", new Date())
  const month = start.getMonth() // 0-based
  const season = month <= 3 ? "Spring" : month <= 6 ? "Summer" : "Fall"
  return `${season} ${format(start, "yyyy")} classes`
}

/** The browser's IANA time zone, e.g. "America/Chicago". */
export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
