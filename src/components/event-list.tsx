"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { EventRow, RemovedEventRow } from "@/components/event-row"
import { Button } from "@/components/ui/button"
import { compareEvents } from "@/lib/format"
import { usePlanner } from "@/lib/planner-store"
import { needsReview, type PlannerEvent, type SyllabusFile } from "@/lib/types"

interface EventListProps {
  file: SyllabusFile
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  /** Events whose source quote couldn't be found in the PDF. */
  missingSources: Set<string>
}

export function EventList({
  file,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  missingSources,
}: EventListProps) {
  const { addEvent, updateEvent, removeEvent, restoreEvent } = usePlanner()
  const [editingId, setEditingId] = useState<string | null>(null)
  // A just-added event is discarded if the user cancels before saving it.
  const [unsavedId, setUnsavedId] = useState<string | null>(null)
  // Deleted events keep their place in the list so they can be brought back.
  const [removed, setRemoved] = useState<PlannerEvent[]>([])

  const events = file.events.toSorted(compareEvents)
  const reviewCount = events.filter((e) => needsReview(e, missingSources.has(e.id))).length
  const removedIds = new Set(removed.map((e) => e.id))
  const rows = [...events, ...removed].toSorted(compareEvents)

  function startNewEvent() {
    if (unsavedId) removeEvent(file.id, unsavedId)
    const id = addEvent(file.id)
    setEditingId(id)
    setUnsavedId(id)
  }

  function stopEditing() {
    setEditingId(null)
    setUnsavedId(null)
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`key-dates-${file.id}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 id={`key-dates-${file.id}`} className="text-sm font-semibold">
            Key dates
          </h3>
          <p className="text-sm text-muted-foreground">
            {events.length} {events.length === 1 ? "date" : "dates"} found
            {reviewCount > 0 && ` · ${reviewCount} to verify`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={startNewEvent}>
          <Plus />
          Add event
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No dates found in this syllabus. Add any you know about with &ldquo;Add event&rdquo;.
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {rows.map((event) =>
            removedIds.has(event.id) ? (
              <RemovedEventRow
                key={event.id}
                event={event}
                onUndo={() => {
                  setRemoved((prev) => prev.filter((e) => e.id !== event.id))
                  restoreEvent(file.id, event)
                }}
              />
            ) : (
              <EventRow
                key={event.id}
                event={event}
                editing={event.id === editingId}
                selected={event.id === selectedId}
                hovered={event.id === hoveredId}
                sourceMissing={missingSources.has(event.id)}
                onSelect={() => onSelect(event.id)}
                onHover={(hovering) => onHover(hovering ? event.id : null)}
                onEdit={() => {
                  if (unsavedId && unsavedId !== event.id) removeEvent(file.id, unsavedId)
                  setEditingId(event.id)
                  setUnsavedId(null)
                }}
                onSave={(patch) => {
                  // Saving means the user has checked it, including hand-added events.
                  updateEvent(file.id, event.id, { ...patch, verified: true })
                  stopEditing()
                }}
                onCancel={() => {
                  if (event.id === unsavedId) removeEvent(file.id, event.id)
                  stopEditing()
                }}
                onDelete={() => {
                  setRemoved((prev) => [...prev, event])
                  // The row goes away under the pointer, so it never reports leaving.
                  onHover(null)
                  removeEvent(file.id, event.id)
                  if (event.id === editingId) stopEditing()
                }}
                onToggleVerified={() => updateEvent(file.id, event.id, { verified: !event.verified })}
              />
            )
          )}
        </ul>
      )}
    </section>
  )
}
