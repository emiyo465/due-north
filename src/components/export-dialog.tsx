"use client"

import { useState } from "react"
import {
  Calendar,
  CalendarPlus,
  Download,
  FileSpreadsheet,
  FileText,
  TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  collectExportEvents,
  courseLabel,
  defaultClassEnd,
  formatMeeting,
  classNotes,
  toCsv,
  toIcs,
  toPlainText,
  type ClassExport,
  type IcsOptions,
} from "@/lib/export"
import { usePlanner } from "@/lib/planner-store"
import { needsReview, type SyllabusFile } from "@/lib/types"

const FILE_NAME = "semester-dates"
const ICS = { extension: "ics", mimeType: "text/calendar", build: toIcs, calendar: true }

// Google Calendar imports the .ics until direct insert lands in week 3.
const TARGETS = [
  {
    label: "Google Calendar",
    icon: CalendarPlus,
    ...ICS,
    next: "In Google Calendar, open Settings, then Import & export, and choose the file.",
  },
  { label: "Apple Calendar", icon: Calendar, ...ICS, next: "Open the file to add it to Calendar." },
  {
    label: "Plaintext",
    icon: FileText,
    extension: "txt",
    mimeType: "text/plain",
    build: toPlainText,
    calendar: false,
    next: "",
  },
  {
    label: "Excel / CSV",
    icon: FileSpreadsheet,
    extension: "csv",
    mimeType: "text/csv",
    build: toCsv,
    calendar: false,
    next: "",
  },
]

function downloadFile(content: string, extension: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }))
  const link = document.createElement("a")
  link.href = url
  link.download = `${FILE_NAME}.${extension}`
  link.click()
  URL.revokeObjectURL(url)
}

function countDates(count: number) {
  return `${count} ${count === 1 ? "date" : "dates"}`
}

interface ExportDialogProps {
  files: SyllabusFile[]
  /** Per file, the events whose source quote couldn't be found in the PDF. */
  missingSources: Record<string, Set<string>>
}

export function ExportDialog({ files, missingSources }: ExportDialogProps) {
  const { state } = usePlanner()
  const [notice, setNotice] = useState<string | null>(null)
  const [allDayDeadlines, setAllDayDeadlines] = useState(true)
  const [includeClasses, setIncludeClasses] = useState(false)
  const [includeDetails, setIncludeDetails] = useState(true)
  // Only the end dates the user changed; the rest come from defaultClassEnd.
  const [classEnds, setClassEnds] = useState<Record<string, string>>({})

  const done = files.filter((f) => f.status === "done")
  const { dated, undatedCount } = collectExportEvents(files)
  // Only what's being exported; undated events are reported separately.
  const reviewCount = done.flatMap((f) =>
    f.events.filter((e) => e.title && e.due_date && needsReview(e, missingSources[f.id]?.has(e.id)))
  ).length
  const source =
    done.length === 1 ? (done[0].course?.name?.value ?? done[0].file.name) : `${done.length} syllabi`

  const coursesWithClasses = done.filter((f) => f.schedule?.meetings.length)
  const classEnd = (f: SyllabusFile) => classEnds[f.id] ?? defaultClassEnd(f) ?? ""
  const classes: ClassExport[] = includeClasses
    ? coursesWithClasses.flatMap((f) =>
        f.schedule && classEnd(f)
          ? [
              {
                course: courseLabel(f),
                schedule: f.schedule,
                firstDay: state.termStart,
                lastDay: classEnd(f),
                notes: includeDetails ? classNotes(f) : "",
              },
            ]
          : []
      )
    : []
  const icsOptions: IcsOptions = { allDayDeadlines, classes }

  function exportTo(target: (typeof TARGETS)[number]) {
    try {
      downloadFile(target.build(dated, icsOptions), target.extension, target.mimeType)
      const withClasses =
        target.calendar && classes.length > 0
          ? ` and class times for ${classes.length} ${classes.length === 1 ? "course" : "courses"}`
          : ""
      setNotice(`Downloaded ${countDates(dated.length)}${withClasses}. ${target.next}`.trim())
    } catch {
      setNotice(`Couldn't create the ${target.label} file. Check the dates and try again.`)
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && setNotice(null)}>
      <DialogTrigger render={<Button size="lg" className="h-11 gap-2 px-6 text-base" />}>
        <Download className="size-5" aria-hidden />
        Export dates
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export your dates</DialogTitle>
          <DialogDescription>
            {dated.length === 0
              ? "There are no dates to export yet."
              : `${countDates(dated.length)} from ${source}.`}
          </DialogDescription>
        </DialogHeader>

        {reviewCount > 0 && (
          <p className="flex gap-2 rounded-lg bg-amber-100 px-3 py-2 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {reviewCount} {reviewCount === 1 ? "date still needs" : "dates still need"} verifying.
            You can export now and fix them later.
          </p>
        )}

        {undatedCount > 0 && (
          <p className="text-muted-foreground">
            {undatedCount} {undatedCount === 1 ? "event" : "events"} without a date will be left out.
          </p>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">Calendar options</legend>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={allDayDeadlines}
              onChange={(e) => setAllDayDeadlines(e.target.checked)}
            />
            <span>
              Show deadlines as all-day events
              <span className="block text-muted-foreground">
                They sit at the top of the day. Exams and quizzes keep their times.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={includeClasses}
              disabled={coursesWithClasses.length === 0}
              onChange={(e) => setIncludeClasses(e.target.checked)}
            />
            <span>
              Include class meeting times
              {coursesWithClasses.length === 0 && (
                <span className="block text-muted-foreground">
                  No weekly class times were found.
                </span>
              )}
            </span>
          </label>
          {includeClasses && coursesWithClasses.some((f) => classNotes(f)) && (
            <label className="ml-6 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={includeDetails}
                onChange={(e) => setIncludeDetails(e.target.checked)}
              />
              <span>Add instructor and office details to class event notes</span>
            </label>
          )}
          {includeClasses &&
            coursesWithClasses.map((f) => (
              <div key={f.id} className="ml-6 flex flex-col gap-1">
                <p className="font-medium">{courseLabel(f)}</p>
                {f.schedule?.meetings.map((meeting, i) => (
                  <p key={i} className="text-muted-foreground">
                    {formatMeeting(meeting)}
                  </p>
                ))}
                <label className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  Repeats until
                  <Input
                    type="date"
                    className="w-fit"
                    min={state.termStart}
                    value={classEnd(f)}
                    onChange={(e) => setClassEnds((prev) => ({ ...prev, [f.id]: e.target.value }))}
                  />
                </label>
                {!classEnd(f) && (
                  <p className="text-amber-900 dark:text-amber-200">
                    Add an end date to include this course.
                  </p>
                )}
              </div>
            ))}
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          {TARGETS.map((target) => (
            <Button
              key={target.label}
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              disabled={dated.length === 0}
              onClick={() => exportTo(target)}
            >
              <target.icon className="size-5" aria-hidden />
              {target.label}
            </Button>
          ))}
        </div>

        <p role="status" className="min-h-5 text-muted-foreground">
          {notice}
        </p>
      </DialogContent>
    </Dialog>
  )
}
