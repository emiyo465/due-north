"use client"

import { useState } from "react"
import { CircleCheck, FileSearch, Pencil, Plus, TriangleAlert } from "lucide-react"
import { rowHoverProps } from "@/components/row-hover"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usePlanner } from "@/lib/planner-store"
import {
  COURSE_FIELDS,
  courseFieldId,
  type CourseFieldKey,
  type PlannerCourseField,
  type SyllabusFile,
} from "@/lib/types"
import { cn } from "@/lib/utils"

interface CourseInfoSectionProps {
  file: SyllabusFile
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  /** Ids (see courseFieldId) whose source quote couldn't be found in the PDF. */
  missingSources: Set<string>
}

/** Class details from the syllabus header, reviewable and editable like events. */
export function CourseInfoSection({
  file,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  missingSources,
}: CourseInfoSectionProps) {
  const { setCourseField } = usePlanner()
  const [editingKey, setEditingKey] = useState<CourseFieldKey | null>(null)
  const course = file.course
  if (!course) return null

  const reviewCount = COURSE_FIELDS.filter(({ key }) => {
    const field = course[key]
    return field && !field.verified && missingSources.has(courseFieldId(key))
  }).length

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`class-info-${file.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`class-info-${file.id}`} className="text-sm font-semibold">
          Class info
        </h3>
        {reviewCount > 0 && (
          <p className="text-sm text-muted-foreground">{reviewCount} to verify</p>
        )}
      </div>
      <ul className="flex flex-col divide-y rounded-xl border">
        {COURSE_FIELDS.map(({ key, label }) => (
          <CourseRow
            key={key}
            label={label}
            inputId={`course-${file.id}-${key}`}
            field={course[key]}
            editing={editingKey === key}
            sourceId={courseFieldId(key)}
            selected={selectedId === courseFieldId(key)}
            hovered={hoveredId === courseFieldId(key)}
            sourceMissing={missingSources.has(courseFieldId(key))}
            onSelect={() => onSelect(courseFieldId(key))}
            onHover={(hovering) => onHover(hovering ? courseFieldId(key) : null)}
            onEdit={() => setEditingKey(key)}
            onCancel={() => setEditingKey(null)}
            onSave={(value) => {
              const field = course[key]
              // Saving means the user has checked it, so it counts as verified.
              setCourseField(
                file.id,
                key,
                !value
                  ? null
                  : field
                    ? { ...field, value, verified: true }
                    : { value, source_quote: "", page: null, verified: true }
              )
              setEditingKey(null)
            }}
            onToggleVerified={() => {
              const field = course[key]
              if (field) setCourseField(file.id, key, { ...field, verified: !field.verified })
            }}
          />
        ))}
      </ul>
    </section>
  )
}

interface CourseRowProps {
  label: string
  inputId: string
  field: PlannerCourseField | null
  sourceId: string
  editing: boolean
  selected: boolean
  hovered: boolean
  sourceMissing: boolean
  onSelect: () => void
  onHover: (hovering: boolean) => void
  onEdit: () => void
  onCancel: () => void
  onSave: (value: string) => void
  onToggleVerified: () => void
}

function CourseRow({
  label,
  inputId,
  field,
  sourceId,
  editing,
  selected,
  hovered,
  sourceMissing,
  onHover,
  ...handlers
}: CourseRowProps) {
  const canSelect = !editing && field?.page != null
  const review = field && !field.verified && sourceMissing

  return (
    <li
      data-source-row={sourceId}
      className={cn(
        "px-4 py-3 transition-colors",
        hovered && !editing && "bg-muted/40",
        selected && !editing && "bg-muted/60 shadow-[inset_3px_0_0_var(--color-primary)]"
      )}
      {...rowHoverProps(onHover)}
      // Clicking anywhere on the row (except its controls) shows its source.
      onClick={(e) => {
        if (!canSelect || (e.target as HTMLElement).closest("button, input, a")) return
        handlers.onSelect()
      }}
    >
      {editing ? (
        <CourseFieldForm
          label={label}
          inputId={inputId}
          field={field}
          onSave={handlers.onSave}
          onCancel={handlers.onCancel}
        />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          <p className="shrink-0 text-sm font-medium sm:w-28">{label}</p>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {field ? (
              <p className="text-sm break-words">{field.value}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Not found in syllabus</p>
            )}
            {field && (
              <div className="flex flex-wrap items-center gap-1.5">
                {field.page !== null ? (
                  <button
                    type="button"
                    onClick={handlers.onSelect}
                    className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    aria-label={`Show ${label.toLowerCase()} in the PDF (page ${field.page})`}
                  >
                    <FileSearch className="size-3" aria-hidden />
                    Page {field.page}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">Added by you</span>
                )}
                {review && (
                  <Badge
                    className="bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                    title="Couldn't find this in the PDF"
                  >
                    <TriangleAlert />
                    Verify · not found in PDF
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {field ? (
              <>
                <Button
                  variant={field.verified ? "secondary" : "outline"}
                  size="sm"
                  onClick={handlers.onToggleVerified}
                  aria-pressed={field.verified}
                  aria-label={
                    field.verified ? `Unmark ${label} as verified` : `Mark ${label} as verified`
                  }
                >
                  {field.verified && <CircleCheck />}
                  {field.verified ? "Verified" : "Verify"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handlers.onEdit}
                  aria-label={`Edit ${label}`}
                >
                  <Pencil />
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={handlers.onEdit}>
                <Plus />
                Add
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

function CourseFieldForm({
  label,
  inputId,
  field,
  onSave,
  onCancel,
}: Pick<CourseRowProps, "label" | "inputId" | "field" | "onSave" | "onCancel">) {
  const [value, setValue] = useState(field?.value ?? "")

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(value.trim())
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>{label}</Label>
        <Input id={inputId} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <p className="text-xs text-muted-foreground">Leave empty to remove it.</p>
      </div>
      {field?.source_quote && (
        <p className="text-xs text-muted-foreground">
          From the syllabus: &ldquo;{field.source_quote}&rdquo;
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
