"use client"

import { useState } from "react"
import { CircleCheck, FileSearch, Pencil, Trash2, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate, formatTime } from "@/lib/format"
import { EVENT_TYPES, needsReview, type EventType, type PlannerEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

const TYPE_LABELS = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, t.label])) as Record<
  EventType,
  string
>

interface EventRowProps {
  event: PlannerEvent
  editing: boolean
  selected: boolean
  sourceMissing: boolean
  onSelect: () => void
  onEdit: () => void
  onSave: (patch: Partial<PlannerEvent>) => void
  onCancel: () => void
  onDelete: () => void
  onToggleVerified: () => void
}

export function EventRow({ event, editing, selected, ...rest }: EventRowProps) {
  return (
    <li
      className={cn(
        "px-4 py-3 transition-colors",
        selected && !editing && "bg-muted/60 shadow-[inset_3px_0_0_var(--color-primary)]"
      )}
      // Clicking anywhere on the row (except its controls) shows its source.
      onClick={(e) => {
        if (editing || event.page === null) return
        if ((e.target as HTMLElement).closest("button, input, a, [role=combobox]")) return
        rest.onSelect()
      }}
    >
      {editing ? (
        <EventForm event={event} onSave={rest.onSave} onCancel={rest.onCancel} />
      ) : (
        <EventView event={event} {...rest} />
      )}
    </li>
  )
}

function EventView({
  event,
  sourceMissing,
  onSelect,
  onEdit,
  onDelete,
  onToggleVerified,
}: Omit<EventRowProps, "editing" | "selected" | "onSave" | "onCancel">) {
  const review = needsReview(event, sourceMissing)
  const label = event.title || "Untitled event"

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex shrink-0 gap-2 text-sm sm:block sm:w-24">
        {event.due_date ? (
          <p className="font-medium">{formatDate(event.due_date)}</p>
        ) : (
          <p className="text-muted-foreground">No date</p>
        )}
        {event.time && <p className="text-muted-foreground">{formatTime(event.time)}</p>}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className={cn("text-sm font-medium", !event.title && "text-muted-foreground italic")}>
          {label}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{TYPE_LABELS[event.type]}</Badge>
          {event.page !== null ? (
            <button
              type="button"
              onClick={onSelect}
              className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={`Show ${label} in the PDF (page ${event.page})`}
            >
              <FileSearch className="size-3" aria-hidden />
              Page {event.page}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Added by you</span>
          )}
          {review && (
            <Badge
              className="bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
              title={sourceMissing ? "Couldn't find this in the PDF" : undefined}
            >
              <TriangleAlert />
              {sourceMissing ? "Verify · not found in PDF" : "Verify"}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant={event.verified ? "secondary" : "outline"}
          size="sm"
          onClick={onToggleVerified}
          aria-pressed={event.verified}
          aria-label={event.verified ? `Unmark ${label} as verified` : `Mark ${label} as verified`}
        >
          {event.verified && <CircleCheck />}
          {event.verified ? "Verified" : "Verify"}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${label}`}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={`Delete ${label}`}>
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function EventForm({
  event,
  onSave,
  onCancel,
}: Pick<EventRowProps, "event" | "onSave" | "onCancel">) {
  const [title, setTitle] = useState(event.title)
  const [type, setType] = useState<EventType>(event.type)
  const [date, setDate] = useState(event.due_date ?? "")
  const [time, setTime] = useState(event.time ?? "")

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ title: title.trim(), type, due_date: date || null, time: time || null })
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`title-${event.id}`}>Title</Label>
        <Input
          id={`title-${event.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Project 2: Design Patterns"
          autoFocus
          required
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`type-${event.id}`}>Type</Label>
          <Select items={EVENT_TYPES} value={type} onValueChange={(v) => v && setType(v)}>
            <SelectTrigger id={`type-${event.id}`} className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`date-${event.id}`}>Date</Label>
          <Input
            id={`date-${event.id}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-fit"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`time-${event.id}`}>Time</Label>
          <Input
            id={`time-${event.id}`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-fit"
          />
        </div>
      </div>
      {event.source_quote && (
        <p className="text-xs text-muted-foreground">
          From the syllabus: &ldquo;{event.source_quote}&rdquo;
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}
