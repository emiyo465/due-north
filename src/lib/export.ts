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

/** A whole day ("2026-09-25") or a wall-clock time with no zone ("2026-09-25T13:30"). */
export type CalendarTime = { date: string } | { dateTime: string }

/** One calendar event, before it's written as .ics or sent to Google Calendar. */
export interface CalendarEntry {
  uid?: string
  title: string
  description?: string
  location?: string
  start: CalendarTime
  /** Exclusive for whole days, so a one-day event ends the next day. */
  end: CalendarTime
  /** Weekly repeats for class meetings, kept in wall-clock time. */
  repeat?: {
    days: Weekday[]
    /** ISO date of the last day, inclusive. */
    until: string
    /** Wall-clock start times of skipped occurrences. */
    skip: string[]
  }
}

const wholeDay = (date: Date): CalendarTime => ({ date: format(date, "yyyy-MM-dd") })
const wallClock = (date: Date): CalendarTime => ({ dateTime: format(date, "yyyy-MM-dd'T'HH:mm") })

function eventSpan({ due_date, time, type }: ExportEvent["event"], allDay: boolean) {
  if (!time || allDay) {
    const day = parseISO(due_date)
    return { start: wholeDay(day), end: wholeDay(addDays(day, 1)) }
  }
  const due = parse(`${due_date} ${time}`, "yyyy-MM-dd HH:mm", new Date())
  return STARTS_AT_TIME.includes(type)
    ? { start: wallClock(due), end: wallClock(addMinutes(due, SITTING_MINUTES)) }
    : { start: wallClock(addMinutes(due, -DEADLINE_MINUTES)), end: wallClock(due) }
}

const WEEKDAYS: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

function weekdayOf(date: Date) {
  return WEEKDAYS[date.getDay()]
}

function onDayAt(date: Date, time: string) {
  return `${format(date, "yyyy-MM-dd")}T${time}`
}

function meetingEntry(
  meeting: ClassMeeting,
  { course, schedule, firstDay, lastDay, notes }: ClassExport
): CalendarEntry | null {
  let first = parseISO(firstDay)
  const last = parseISO(lastDay)
  while (first <= last && !meeting.days.includes(weekdayOf(first))) first = addDays(first, 1)
  if (first > last) return null

  const skip = schedule.no_class_dates
    .map((date) => parseISO(date))
    .filter((date) => date >= first && date <= last && meeting.days.includes(weekdayOf(date)))
    .map((date) => onDayAt(date, meeting.start))

  const entry: CalendarEntry = {
    title: `${course}: ${meeting.label ?? "Class"}`,
    start: { dateTime: onDayAt(first, meeting.start) },
    end: { dateTime: onDayAt(first, meeting.end) },
    repeat: { days: meeting.days, until: lastDay, skip },
  }
  if (meeting.location) entry.location = meeting.location
  if (notes) entry.description = notes
  return entry
}

/** Every event and weekly class meeting to put in a calendar. */
export function buildCalendarEntries(
  events: ExportEvent[],
  { allDayDeadlines = false, classes = [] }: IcsOptions = {}
) {
  const entries = events.map(({ course, event }): CalendarEntry => {
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
    }
  })
  for (const entry of classes) {
    for (const meeting of entry.schedule.meetings) {
      const event = meetingEntry(meeting, entry)
      if (event) entries.push(event)
    }
  }
  return entries
}

function toDateArray(time: CalendarTime): DateArray {
  if ("date" in time) {
    const [year, month, day] = time.date.split("-").map(Number)
    return [year, month, day]
  }
  const [date, clock] = time.dateTime.split("T")
  const [year, month, day] = date.split("-").map(Number)
  const [hours, minutes] = clock.split(":").map(Number)
  return [year, month, day, hours, minutes]
}

/** "2026-11-26T13:30" → "20261126T133000" */
export function compactDateTime(dateTime: string) {
  return `${dateTime.replace(/[-:]/g, "")}00`
}

function toIcsAttributes(entry: CalendarEntry): EventAttributes {
  const attributes: EventAttributes = {
    start: toDateArray(entry.start),
    end: toDateArray(entry.end),
    title: entry.title,
    productId: "automated-semester-planner",
  }
  if (entry.uid) attributes.uid = entry.uid
  if (entry.description) attributes.description = entry.description
  if (entry.location) attributes.location = entry.location
  if (entry.repeat) {
    // Written as wall-clock time with no zone: a recurrence stored in UTC would
    // shift an hour when daylight saving changes partway through the term.
    const { days, until, skip } = entry.repeat
    attributes.startOutputType = "local"
    attributes.endOutputType = "local"
    attributes.recurrenceRule = `FREQ=WEEKLY;BYDAY=${days.join(",")};UNTIL=${until.replaceAll("-", "")}T235959`
    if (skip.length > 0) attributes.exclusionDates = skip.map(compactDateTime)
  }
  return attributes
}

/** An .ics calendar. One-off events are read in the browser's time zone and written as UTC. */
export function toIcs(events: ExportEvent[], options: IcsOptions = {}) {
  const { error, value } = createEvents(buildCalendarEntries(events, options).map(toIcsAttributes))
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
