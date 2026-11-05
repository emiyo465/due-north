import { addDays, addMinutes, format, parse, parseISO } from "date-fns"
import { createEvents, type DateArray, type EventAttributes } from "ics"
import { compareEvents, formatDateWithYear, formatTime } from "@/lib/format"
import {
  EVENT_TYPE_LABELS,
  type ClassMeeting,
  type ClassSchedule,
  type EventType,
  type PlannerEvent,
  type SyllabusFile,
  type Weekday,
} from "@/lib/types"

/** A dated event ready to export, with the course it belongs to. */
export interface ExportEvent {
  course: string
  event: PlannerEvent & { due_date: string }
}

/** A course's weekly classes, with the date range to repeat them over. */
export interface ClassExport {
  course: string
  schedule: ClassSchedule
  /** ISO dates, both inclusive. */
  firstDay: string
  lastDay: string
  /** Shown in each class event's description. */
  notes?: string
}

export interface IcsOptions {
  /** Show deadlines in the calendar's all-day row. Exams and quizzes stay timed. */
  allDayDeadlines?: boolean
  classes?: ClassExport[]
}

// A code with colons of its own, such as "07:081:221" or "ART:2210".
const COLON_CODE = /^[^\s:]*(?::\d+)+(?=[:\s]|$)/

/** "CS 340: Software Design" → "CS 340"; falls back to the file name. */
export function courseLabel(file: Pick<SyllabusFile, "course" | "file">) {
  const name = file.course?.name?.value.trim()
  if (name) return name.match(COLON_CODE)?.[0] ?? (name.split(":")[0].trim() || name)
  return file.file.name.replace(/\.pdf$/i, "")
}

/** Events to export in date order, plus how many are left out for having no date. */
export function collectExportEvents(files: SyllabusFile[]) {
  // A blank title only exists while a hand-added event hasn't been saved yet.
  const entries = files
    .filter((f) => f.status === "done")
    .flatMap((f) => f.events.filter((e) => e.title).map((event) => ({ file: f, event })))

  const dated: ExportEvent[] = []
  for (const { file, event } of entries) {
    if (event.due_date) {
      dated.push({ course: courseLabel(file), event: { ...event, due_date: event.due_date } })
    }
  }
  dated.sort((a, b) => compareEvents(a.event, b.event))
  return { dated, undatedCount: entries.length - dated.length }
}

// Exams and quizzes start at their time; everything else is due at it.
const STARTS_AT_TIME: EventType[] = ["exam", "quiz"]
const SITTING_MINUTES = 60
const DEADLINE_MINUTES = 30

function toDateArray(date: Date): DateArray {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ]
}

function toDayArray(date: Date): DateArray {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
}

function eventSpan({ due_date, time, type }: ExportEvent["event"], allDay: boolean) {
  if (!time || allDay) {
    const day = parseISO(due_date)
    // The end of an all-day event is exclusive, so it's the next day.
    return { start: toDayArray(day), end: toDayArray(addDays(day, 1)) }
  }
  const at = parse(`${due_date} ${time}`, "yyyy-MM-dd HH:mm", new Date())
  return STARTS_AT_TIME.includes(type)
    ? { start: toDateArray(at), end: toDateArray(addMinutes(at, SITTING_MINUTES)) }
    : { start: toDateArray(addMinutes(at, -DEADLINE_MINUTES)), end: toDateArray(at) }
}

const WEEKDAYS: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

function weekdayOf(date: Date) {
  return WEEKDAYS[date.getDay()]
}

function atTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), hours, minutes] as DateArray
}

function meetingEvent(
  meeting: ClassMeeting,
  { course, schedule, firstDay, lastDay, notes }: ClassExport
) {
  let first = parseISO(firstDay)
  const last = parseISO(lastDay)
  while (first <= last && !meeting.days.includes(weekdayOf(first))) first = addDays(first, 1)
  if (first > last) return null

  const skipped = schedule.no_class_dates
    .map((date) => parseISO(date))
    .filter((date) => date >= first && date <= last && meeting.days.includes(weekdayOf(date)))
    .map((date) => `${format(date, "yyyyMMdd")}T${meeting.start.replace(":", "")}00`)

  // Written as wall-clock time with no zone: a recurrence stored in UTC would
  // shift an hour when daylight saving changes partway through the term.
  const event: EventAttributes = {
    start: atTime(first, meeting.start),
    end: atTime(first, meeting.end),
    startOutputType: "local",
    endOutputType: "local",
    title: `${course}: ${meeting.label ?? "Class"}`,
    recurrenceRule: `FREQ=WEEKLY;BYDAY=${meeting.days.join(",")};UNTIL=${format(last, "yyyyMMdd")}T235959`,
    productId: "automated-semester-planner",
  }
  if (meeting.location) event.location = meeting.location
  if (notes) event.description = notes
  if (skipped.length > 0) event.exclusionDates = skipped
  return event
}

/** An .ics calendar. Deadlines are read in the browser's time zone and written as UTC. */
export function toIcs(events: ExportEvent[], { allDayDeadlines = false, classes = [] }: IcsOptions = {}) {
  const attributes = events.map(({ course, event }): EventAttributes => {
    const allDay = allDayDeadlines && !STARTS_AT_TIME.includes(event.type)
    return {
      ...eventSpan(event, allDay),
      uid: event.id,
      title: `${course}: ${event.title}`,
      description: [
        EVENT_TYPE_LABELS[event.type],
        allDay && event.time && `Due ${formatTime(event.time)}`,
        event.source_quote && `From the syllabus: "${event.source_quote}"`,
      ]
        .filter(Boolean)
        .join("\n"),
      productId: "automated-semester-planner",
    }
  })
  for (const entry of classes) {
    for (const meeting of entry.schedule.meetings) {
      const event = meetingEvent(meeting, entry)
      if (event) attributes.push(event)
    }
  }
  const { error, value } = createEvents(attributes)
  if (error || !value) throw error ?? new Error("Couldn't create the calendar file")
  return value
}

/** Instructor and office details for class events, from Class info so edits carry through. */
export function classNotes({ course }: Pick<SyllabusFile, "course">) {
  return [
    course?.instructor && `Instructor: ${course.instructor.value}`,
    course?.office_hours && `Office hours: ${course.office_hours.value}`,
    course?.office_location && `Office: ${course.office_location.value}`,
  ]
    .filter(Boolean)
    .join("\n")
}

/** The day to stop repeating a course's classes, if the syllabus suggests one. */
export function defaultClassEnd(file: Pick<SyllabusFile, "schedule" | "events">) {
  if (file.schedule?.last_day) return file.schedule.last_day
  const dates = file.events.flatMap((e) => (e.due_date ? [e.due_date] : [])).sort()
  return dates.at(-1) ?? null
}

const DAY_LABELS: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
}

/** "Lab: Tue, Thu 1:30 PM–2:45 PM" */
export function formatMeeting({ label, days, start, end }: ClassMeeting) {
  const when = `${days.map((d) => DAY_LABELS[d]).join(", ")} ${formatTime(start)}–${formatTime(end)}`
  return label ? `${label}: ${when}` : when
}

/** Quotes a cell, and stops Excel running text from a PDF as a formula. */
function csvCell(text: string) {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function toCsv(events: ExportEvent[]) {
  const header = ["Course", "Title", "Type", "Date", "Time", "Verified"]
  const rows = events.map(({ course, event }) => [
    course,
    event.title,
    EVENT_TYPE_LABELS[event.type],
    event.due_date,
    event.time ?? "",
    event.verified ? "Yes" : "No",
  ])
  // The byte order mark makes Excel read the file as UTF-8.
  return "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

/** One section per course, in date order. */
export function toPlainText(events: ExportEvent[]) {
  const courses = new Map<string, string[]>()
  for (const { course, event } of events) {
    const when = formatDateWithYear(event.due_date) + (event.time ? `, ${formatTime(event.time)}` : "")
    courses.set(course, [...(courses.get(course) ?? []), `${when}: ${event.title}`])
  }
  return [...courses].map(([course, lines]) => [course, ...lines].join("\n")).join("\n\n") + "\n"
}
