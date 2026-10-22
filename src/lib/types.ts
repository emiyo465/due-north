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
export interface PlannerEvent extends ExtractedEvent {
  id: string
  verified: boolean
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
