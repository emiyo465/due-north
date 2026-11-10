import type { CSSProperties } from "react"
import type { EventType } from "@/lib/types"

/**
 * Sets `--type` to an event type's color (defined per theme in globals.css),
 * so the list, its badges, and the PDF highlights all share one color per type.
 */
export function typeColor(type: EventType | undefined): CSSProperties {
  return type ? ({ "--type": `var(--type-${type})` } as CSSProperties) : {}
}
