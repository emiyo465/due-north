// Shapes follow the extraction contract in docs/SPEC.md.

export type EventType = "project" | "paper" | "exam" | "quiz" | "homework" | "other"

export type Confidence = "high" | "medium" | "low"

export interface ExtractedEvent {
  title: string
  type: EventType
  /** ISO date (YYYY-MM-DD), or null when the syllabus doesn't give one. */
  due_date: string | null
  /** 24-hour local time (HH:mm), or null when none is stated. */
  time: string | null
  /** Verbatim text from the syllabus, used to place the source highlight. */
  source_quote: string
  page: number
  confidence: Confidence
}

/** One course detail, with where it came from so it can be highlighted. */
export interface CourseField {
  value: string
  /** Verbatim text from the syllabus, including its label (e.g. "Meetings Tuesdays & …"). */
  source_quote: string
  page: number
}

export type CourseFieldKey = "name" | "instructor" | "meeting_times" | "office_location" | "office_hours"

/** Course details from the syllabus header; a field is null when the syllabus doesn't say. */
export type CourseInfo = Record<CourseFieldKey, CourseField | null>

export const COURSE_FIELDS: { key: CourseFieldKey; label: string }[] = [
  { key: "name", label: "Course" },
  { key: "instructor", label: "Instructor" },
  { key: "meeting_times", label: "Class meetings" },
  { key: "office_location", label: "Office" },
  { key: "office_hours", label: "Office hours" },
]

/** Id for a course field wherever events and course fields share one id space (selection, highlights). */
export function courseFieldId(key: CourseFieldKey) {
  return `course:${key}`
}

export interface ExtractionResult {
  course: CourseInfo
  events: ExtractedEvent[]
}

/** An extracted event plus client-only fields for editing and review. */
export interface PlannerEvent extends Omit<ExtractedEvent, "page"> {
  id: string
  /** null for events the user added by hand. */
  page: number | null
  verified: boolean
}

/** A course field plus client-only review state; page is null when the user typed it in. */
export interface PlannerCourseField extends Omit<CourseField, "page"> {
  page: number | null
  verified: boolean
}

export type PlannerCourse = Record<CourseFieldKey, PlannerCourseField | null>

export const EVENT_TYPES:{ value: EventType; label: string }[] = [
  { value: "project", label: "Project" },
  { value: "paper", label: "Paper" },
  { value: "exam", label: "Exam" },
  { value: "quiz", label: "Quiz" },
  { value: "homework", label: "Homework" },
  { value: "other", label: "Other" },
]

/**
 * Show a verify badge until the user confirms anything we weren't sure of,
 * including events whose source quote couldn't be found in the PDF.
 */
export function needsReview(event: PlannerEvent, sourceMissing = false) {
  return (
    !event.verified && (event.confidence !== "high" || event.due_date === null || sourceMissing)
  )
}

export type FileStatus = "processing" | "done" | "error"

export interface SyllabusFile {
  id: string
  file: File
  status: FileStatus
  /** 0–100 */
  progress: number
  /** Set once extraction finishes. */
  course: PlannerCourse | null
  events: PlannerEvent[]
  error?: string
}
