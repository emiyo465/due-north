import { describe, expect, it } from "vitest"
import { buildCalendarEntries, type ExportEvent } from "./export"
import { calendarName, toGoogleEvents } from "./google-calendar"
import type { ClassSchedule, PlannerEvent } from "./types"

// Vitest pins TZ to America/Chicago (see vitest.config.mts).
const ZONE = "America/Chicago"

function dated(patch: Partial<PlannerEvent> = {}): ExportEvent {
  return {
    course: "CS 340",
    event: {
      id: "event-1",
      title: "Project 1",
      type: "project",
      time: null,
      source_quote: "",
      page: 1,
      confidence: "high",
      verified: false,
      ...patch,
      due_date: patch.due_date ?? "2026-09-25",
    },
  }
}

const google = (events: ExportEvent[], options = {}) =>
  toGoogleEvents(buildCalendarEntries(events, options), ZONE)

describe("toGoogleEvents", () => {
  it("makes an untimed event all-day, ending the next day", () => {
    const [event] = google([dated()])
    expect(event.summary).toBe("CS 340: Project 1")
    expect(event.start).toEqual({ date: "2026-09-25" })
    expect(event.end).toEqual({ date: "2026-09-26" })
  })

  it("keeps exams timed for an hour in the given zone", () => {
    const [event] = google([dated({ type: "exam", time: "13:30" })], { allDayDeadlines: true })
    expect(event.start).toEqual({ dateTime: "2026-09-25T13:30:00", timeZone: ZONE })
    expect(event.end).toEqual({ dateTime: "2026-09-25T14:30:00", timeZone: ZONE })
  })

  it("ends a timed deadline at its due time", () => {
    const [event] = google([dated({ time: "23:59" })])
    expect(event.start).toEqual({ dateTime: "2026-09-25T23:29:00", timeZone: ZONE })
    expect(event.end).toEqual({ dateTime: "2026-09-25T23:59:00", timeZone: ZONE })
  })

  it("moves deadlines to all-day with the due time in the notes", () => {
    const [event] = google([dated({ time: "23:59" })], { allDayDeadlines: true })
    expect(event.start).toEqual({ date: "2026-09-25" })
    expect(event.description).toContain("Due 11:59 PM")
  })

  it("repeats classes weekly with a UTC end and skipped days in the zone", () => {
    const schedule: ClassSchedule = {
      meetings: [{ label: null, days: ["TU", "TH"], start: "13:30", end: "14:45", location: "MSB 1.04" }],
      last_day: "2026-12-03",
      no_class_dates: ["2026-11-26"],
    }
    const [event] = google([], {
      classes: [{ course: "CS 340", schedule, firstDay: "2026-09-07", lastDay: "2026-12-03" }],
    })
    expect(event.summary).toBe("CS 340: Class")
    expect(event.location).toBe("MSB 1.04")
    expect(event.start).toEqual({ dateTime: "2026-09-08T13:30:00", timeZone: ZONE })
    expect(event.recurrence).toEqual([
      // 23:59:59 on Dec 3 in Chicago (CST) is 05:59:59 on Dec 4 in UTC.
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261204T055959Z",
      `EXDATE;TZID=${ZONE}:20261126T133000`,
    ])
  })
})

describe("calendarName", () => {
  it("names the term by season and year", () => {
    expect(calendarName("2026-08-24")).toBe("Fall 2026 classes")
    expect(calendarName("2027-01-11")).toBe("Spring 2027 classes")
    expect(calendarName("2027-06-01")).toBe("Summer 2027 classes")
  })
})
