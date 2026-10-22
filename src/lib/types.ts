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

/** Show a verify badge until the user confirms anything we weren't sure of. */
export function needsReview(event: PlannerEvent) {
  return !event.verified && (event.confidence !== "high" || event.due_date === null)
}

export type FileStatus = "processing" | "done" | "error"

export interface SyllabusFile {
  id: string
  file: File
  status: FileStatus
  /** 0–100 */
  progress: number
  events: PlannerEvent[]
  error?: string
}
