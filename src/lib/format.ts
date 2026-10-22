import { format, parse, parseISO } from "date-fns"
import type { PlannerEvent } from "@/lib/types"

/** "2026-09-17" → "Thu, Sep 17" */
export function formatDate(isoDate: string) {
  return format(parseISO(isoDate), "EEE, MMM d")
}

/** "13:30" → "1:30 PM" */
export function formatTime(time: string) {
  return format(parse(time, "HH:mm", new Date()), "h:mm a")
}

/** Chronological, with undated events last. */
export function compareEvents(a: PlannerEvent, b: PlannerEvent) {
  const key = (e: PlannerEvent) => `${e.due_date ?? "9999-99-99"} ${e.time ?? "99:99"}`
  return key(a).localeCompare(key(b))
}
