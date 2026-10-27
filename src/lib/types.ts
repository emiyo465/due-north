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

/** Course details from the syllabus header; null when the syllabus doesn't say. */
export interface CourseInfo {
  /** e.g. "CS 340: Software Design" */
  name: string | null
  instructor: string | null
  /** When and where the class meets, e.g. "Tuesdays & Thursdays, 1:30–2:45 PM, Millennium Science Building 1.04" */
  meeting_times: string | null
  office_location: string | null
  office_hours: string | null
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

export const EVENT_TYPES: { value: EventType; label: string }[] = [
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
  course: CourseInfo | null
  events: PlannerEvent[]
  error?: string
}
