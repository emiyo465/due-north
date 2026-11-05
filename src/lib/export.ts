import { addDays, addMinutes, parse, parseISO } from "date-fns"
import { createEvents, type DateArray, type EventAttributes } from "ics"
import { compareEvents, formatDateWithYear, formatTime } from "@/lib/format"
import { EVENT_TYPE_LABELS, type EventType, type PlannerEvent, type SyllabusFile } from "@/lib/types"

/** A dated event ready to export, with the course it belongs to. */
export interface ExportEvent {
  course: string
  event: PlannerEvent & { due_date: string }
}

/** "CS 340: Software Design" → "CS 340"; falls back to the file name. */
export function courseLabel(file: Pick<SyllabusFile, "course" | "file">) {
  const name = file.course?.name?.value.trim()
  if (name) return name.split(":")[0].trim() || name
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

function eventSpan({ due_date, time, type }: ExportEvent["event"]) {
  if (!time) {
    const day = parseISO(due_date)
    // The end of an all-day event is exclusive, so it's the next day.
    return { start: toDayArray(day), end: toDayArray(addDays(day, 1)) }
  }
  const at = parse(`${due_date} ${time}`, "yyyy-MM-dd HH:mm", new Date())
  return STARTS_AT_TIME.includes(type)
    ? { start: toDateArray(at), end: toDateArray(addMinutes(at, SITTING_MINUTES)) }
    : { start: toDateArray(addMinutes(at, -DEADLINE_MINUTES)), end: toDateArray(at) }
}

/** An .ics calendar. Times are read in the browser's time zone and written as UTC. */
export function toIcs(events: ExportEvent[]) {
  const attributes = events.map(({ course, event }): EventAttributes => ({
    ...eventSpan(event),
    uid: event.id,
    title: `${course}: ${event.title}`,
    description: [
      EVENT_TYPE_LABELS[event.type],
      event.source_quote && `From the syllabus: "${event.source_quote}"`,
    ]
      .filter(Boolean)
      .join("\n"),
    productId: "automated-semester-planner",
  }))
  const { error, value } = createEvents(attributes)
  if (error || !value) throw error ?? new Error("Couldn't create the calendar file")
  return value
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
