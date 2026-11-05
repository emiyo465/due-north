import { describe, expect, it } from "vitest"
import {
  collectExportEvents,
  courseLabel,
  defaultClassEnd,
  formatMeeting,
  classNotes,
  toCsv,
  toIcs,
  toPlainText,
  type ExportEvent,
} from "./export"
import type { ClassSchedule, PlannerEvent, SyllabusFile } from "./types"

// Vitest pins TZ to America/Chicago (see vitest.config.mts).

function event(patch: Partial<PlannerEvent> = {}): PlannerEvent {
  return {
    id: "event-1",
    title: "Project 1",
    type: "project",
    due_date: "2026-09-25",
    time: null,
    source_quote: "",
    page: 1,
    confidence: "high",
    verified: false,
    ...patch,
  }
}

function file(events: PlannerEvent[], patch: Partial<SyllabusFile> = {}): SyllabusFile {
  return {
    id: "file-1",
    file: new File([], "CS340_Syllabus.pdf"),
    status: "done",
    progress: 100,
    useFixture: false,
    course: null,
    schedule: null,
    events,
    ...patch,
  }
}

function dated(patch: Partial<PlannerEvent> = {}): ExportEvent {
  return { course: "CS 340", event: { ...event(patch), due_date: patch.due_date ?? "2026-09-25" } }
}

/** A property's value from an .ics file, with folded lines rejoined. */
function icsField(ics: string, name: string) {
  const unfolded = ics.replace(/\r\n[ \t]/g, "")
  return unfolded.match(new RegExp(`^${name}[:;](.*)$`, "m"))?.[1].trim()
}

describe("courseLabel", () => {
  const named = (value: string) =>
    file([], { course: { name: { value, source_quote: "", page: 1, verified: false } } as never })

  it("uses the part of the course name before the colon", () => {
    expect(courseLabel(named("CS 340: Software Design"))).toBe("CS 340")
  })

  it("uses the whole name when there's no colon", () => {
    expect(courseLabel(named("Software Design"))).toBe("Software Design")
  })

  it("falls back to the file name", () => {
    expect(courseLabel(file([]))).toBe("CS340_Syllabus")
  })
})

describe("collectExportEvents", () => {
  it("sorts by date across files and counts undated events", () => {
    const { dated, undatedCount } = collectExportEvents([
      file([event({ id: "late", due_date: "2026-10-01" }), event({ id: "tbd", due_date: null })]),
      file([event({ id: "early", due_date: "2026-09-01" })], { id: "file-2" }),
    ])
    expect(dated.map((d) => d.event.id)).toEqual(["early", "late"])
    expect(undatedCount).toBe(1)
  })

  it("skips unsaved blank events and files that aren't done", () => {
    const { dated, undatedCount } = collectExportEvents([
      file([event({ id: "blank", title: "", due_date: null })]),
      file([event({ id: "failed" })], { id: "file-2", status: "error" }),
    ])
    expect(dated).toEqual([])
    expect(undatedCount).toBe(0)
  })
})

describe("toIcs", () => {
  it("makes an event with no time all-day, ending the next day", () => {
    const ics = toIcs([dated({ due_date: "2026-09-30" })])
    expect(icsField(ics, "DTSTART")).toBe("VALUE=DATE:20260930")
    expect(icsField(ics, "DTEND")).toBe("VALUE=DATE:20261001")
  })

  it("runs exams and quizzes for an hour from their start", () => {
    const ics = toIcs([dated({ type: "exam", due_date: "2026-09-17", time: "13:30" })])
    expect(icsField(ics, "DTSTART")).toBe("20260917T183000Z")
    expect(icsField(ics, "DTEND")).toBe("20260917T193000Z")
  })

  it("ends deadlines at the due time, so 23:59 stays on its day", () => {
    const ics = toIcs([dated({ due_date: "2026-09-25", time: "23:59" })])
    expect(icsField(ics, "DTSTART")).toBe("20260926T042900Z")
    expect(icsField(ics, "DTEND")).toBe("20260926T045900Z")
  })

  it("starts a just-after-midnight deadline on the previous day", () => {
    const ics = toIcs([dated({ due_date: "2026-09-18", time: "00:10" })])
    // 23:40 on Sep 17 in Chicago is 04:40 on Sep 18 in UTC.
    expect(icsField(ics, "DTSTART")).toBe("20260918T044000Z")
    expect(icsField(ics, "DTEND")).toBe("20260918T051000Z")
  })

  it("follows the local offset across a daylight saving change", () => {
    const before = toIcs([dated({ type: "exam", due_date: "2026-10-30", time: "10:00" })])
    const after = toIcs([dated({ type: "exam", due_date: "2026-11-02", time: "10:00" })])
    expect(icsField(before, "DTSTART")).toBe("20261030T150000Z")
    expect(icsField(after, "DTSTART")).toBe("20261102T160000Z")
  })

  it("puts the course in the title and keeps the event id as the uid", () => {
    const ics = toIcs([dated({ id: "abc", title: "Quiz 1", source_quote: "Thu, Sep 17 Quiz 1" })])
    expect(icsField(ics, "SUMMARY")).toBe("CS 340: Quiz 1")
    expect(icsField(ics, "UID")).toBe("abc")
    expect(icsField(ics, "DESCRIPTION")).toContain("Thu\\, Sep 17 Quiz 1")
  })
})

describe("toIcs with all-day deadlines", () => {
  const options = { allDayDeadlines: true }

  it("moves deadlines to the all-day row and keeps the due time in the notes", () => {
    const ics = toIcs([dated({ due_date: "2026-09-25", time: "23:59" })], options)
    expect(icsField(ics, "DTSTART")).toBe("VALUE=DATE:20260925")
    expect(icsField(ics, "DTEND")).toBe("VALUE=DATE:20260926")
    expect(icsField(ics, "DESCRIPTION")).toContain("Due 11:59 PM")
  })

  it("keeps exams and quizzes at their times", () => {
    const exam = dated({ type: "exam", due_date: "2026-09-17", time: "13:30" })
    expect(icsField(toIcs([exam], options), "DTSTART")).toBe("20260917T183000Z")
  })
})

describe("toIcs with class meetings", () => {
  const schedule: ClassSchedule = {
    meetings: [
      {
        label: null,
        days: ["TU", "TH"],
        start: "13:30",
        end: "14:45",
        location: "MSB 1.04",
      },
    ],
    last_day: "2026-12-03",
    no_class_dates: ["2026-11-26", "2026-11-25"],
  }
  const classes = [
    { course: "CS 340", schedule, firstDay: "2026-09-07", lastDay: "2026-12-03" },
  ]

  it("repeats weekly from the first matching day until the last day", () => {
    const ics = toIcs([], { classes })
    expect(icsField(ics, "SUMMARY")).toBe("CS 340: Class")
    expect(icsField(ics, "LOCATION")).toBe("MSB 1.04")
    expect(icsField(ics, "DTSTART")).toBe("20260908T133000")
    expect(icsField(ics, "DTEND")).toBe("20260908T144500")
    expect(icsField(ics, "RRULE")).toBe("FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261203T235959")
  })

  it("uses wall-clock times so daylight saving doesn't shift classes", () => {
    expect(icsField(toIcs([], { classes }), "DTSTART")).not.toContain("Z")
  })

  it("skips no-class dates that fall on a class day, at the class's time", () => {
    expect(icsField(toIcs([], { classes }), "EXDATE")).toBe("20261126T133000")
  })

  it("makes one repeating event per meeting, labeled", () => {
    const lab = { label: "Lab", days: ["TH" as const], start: "14:00", end: "16:50", location: null }
    const both = { ...schedule, meetings: [{ ...schedule.meetings[0], label: "Lecture" }, lab] }
    const ics = toIcs([], { classes: [{ ...classes[0], schedule: both }] })
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain("SUMMARY:CS 340: Lab")
  })

  it("puts notes in the class event's description", () => {
    const ics = toIcs([], { classes: [{ ...classes[0], notes: "Office hours: Tue 3 PM\nOffice: MSB 2.18" }] })
    expect(icsField(ics, "DESCRIPTION")).toBe("Office hours: Tue 3 PM\\nOffice: MSB 2.18")
  })

  it("leaves the description out without notes", () => {
    expect(icsField(toIcs([], { classes }), "DESCRIPTION")).toBeUndefined()
  })

  it("leaves out a meeting that never falls in the range", () => {
    const short = [{ ...classes[0], firstDay: "2026-09-09", lastDay: "2026-09-09" }]
    expect(() => toIcs([], { classes: short })).not.toThrow()
  })
})

describe("classNotes", () => {
  const field = (value: string) => ({ value, source_quote: "", page: 1, verified: false })

  it("lists the instructor first, then office details", () => {
    const course = {
      instructor: field("Professor Plana"),
      office_hours: field("Tue 3 PM"),
      office_location: field("MSB 2.18"),
    } as never
    expect(classNotes({ course })).toBe(
      "Instructor: Professor Plana\nOffice hours: Tue 3 PM\nOffice: MSB 2.18"
    )
  })

  it("lists whichever details the course has", () => {
    const hoursOnly = { instructor: null, office_hours: field("Tue 3 PM"), office_location: null } as never
    expect(classNotes({ course: hoursOnly })).toBe("Office hours: Tue 3 PM")
  })

  it("is empty without details", () => {
    expect(classNotes({ course: null })).toBe("")
  })
})

describe("defaultClassEnd", () => {
  it("prefers the syllabus's last day", () => {
    const schedule = { meetings: [], last_day: "2026-12-03", no_class_dates: [] }
    expect(defaultClassEnd({ schedule, events: [event({ due_date: "2026-12-08" })] })).toBe("2026-12-03")
  })

  it("falls back to the last dated event, then nothing", () => {
    const events = [event({ due_date: "2026-12-08" }), event({ due_date: "2026-09-01" })]
    expect(defaultClassEnd({ schedule: null, events })).toBe("2026-12-08")
    expect(defaultClassEnd({ schedule: null, events: [] })).toBeNull()
  })
})

describe("formatMeeting", () => {
  it("names the days and times, with any label", () => {
    const meeting = { label: "Lab", days: ["TU" as const], start: "13:30", end: "14:45", location: null }
    expect(formatMeeting(meeting)).toBe("Lab: Tue 1:30 PM–2:45 PM")
  })
})

describe("toCsv", () => {
  it("writes a BOM, header, and quoted rows", () => {
    const csv = toCsv([dated({ title: 'Paper "A", draft', time: "23:59", verified: true })])
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv.slice(1).split("\r\n")).toEqual([
      '"Course","Title","Type","Date","Time","Verified"',
      '"CS 340","Paper ""A"", draft","Project","2026-09-25","23:59","Yes"',
      "",
    ])
  })

  it("neutralizes text Excel would run as a formula", () => {
    expect(toCsv([dated({ title: "=HYPERLINK(1)" })])).toContain(`"'=HYPERLINK(1)"`)
    expect(toCsv([dated({ title: "@SUM(1)" })])).toContain(`"'@SUM(1)"`)
  })
})

describe("toPlainText", () => {
  it("groups by course with dated lines", () => {
    const text = toPlainText([
      dated({ title: "Project 1", time: "23:59" }),
      { ...dated({ title: "Essay" }), course: "HIST 231" },
      dated({ title: "Project 2", due_date: "2026-10-16" }),
    ])
    expect(text).toBe(
      "CS 340\nFri, Sep 25, 2026, 11:59 PM: Project 1\nFri, Oct 16, 2026: Project 2\n\n" +
        "HIST 231\nFri, Sep 25, 2026: Essay\n"
    )
  })
})
