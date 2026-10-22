"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { EventRow } from "@/components/event-row"
import { Button } from "@/components/ui/button"
import { compareEvents } from "@/lib/format"
import { usePlanner } from "@/lib/planner-store"
import { needsReview, type SyllabusFile } from "@/lib/types"

export function EventList({ file }: { file: SyllabusFile }) {
  const { addEvent, updateEvent, removeEvent } = usePlanner()
  const [editingId, setEditingId] = useState<string | null>(null)
  // A just-added event is discarded if the user cancels before saving it.
  const [unsavedId, setUnsavedId] = useState<string | null>(null)

  const events = file.events.toSorted(compareEvents)
  const reviewCount = events.filter(needsReview).length

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
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {events.length} {events.length === 1 ? "date" : "dates"} found
          {reviewCount > 0 && ` · ${reviewCount} to verify`}
        </p>
        <Button variant="outline" size="sm" onClick={startNewEvent}>
          <Plus />
          Add event
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No dates found in this syllabus. Add any you know about with &ldquo;Add event&rdquo;.
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              editing={event.id === editingId}
              onEdit={() => {
                if (unsavedId && unsavedId !== event.id) removeEvent(file.id, unsavedId)
                setEditingId(event.id)
                setUnsavedId(null)
              }}
              onSave={(patch) => {
                updateEvent(file.id, event.id, patch)
                stopEditing()
              }}
              onCancel={() => {
                if (event.id === unsavedId) removeEvent(file.id, event.id)
                stopEditing()
              }}
              onDelete={() => {
                removeEvent(file.id, event.id)
                if (event.id === editingId) stopEditing()
              }}
              onToggleVerified={() => updateEvent(file.id, event.id, { verified: !event.verified })}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
