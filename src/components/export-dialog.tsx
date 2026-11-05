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
import { collectExportEvents, toCsv, toIcs, toPlainText } from "@/lib/export"
import { needsReview, type SyllabusFile } from "@/lib/types"

const FILE_NAME = "semester-dates"
const ICS = { extension: "ics", mimeType: "text/calendar", build: toIcs }

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
    next: "",
  },
  {
    label: "Excel / CSV",
    icon: FileSpreadsheet,
    extension: "csv",
    mimeType: "text/csv",
    build: toCsv,
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
  const [notice, setNotice] = useState<string | null>(null)

  const done = files.filter((f) => f.status === "done")
  const { dated, undatedCount } = collectExportEvents(files)
  // Only what's being exported; undated events are reported separately.
  const reviewCount = done.flatMap((f) =>
    f.events.filter((e) => e.title && e.due_date && needsReview(e, missingSources[f.id]?.has(e.id)))
  ).length
  const source =
    done.length === 1 ? (done[0].course?.name?.value ?? done[0].file.name) : `${done.length} syllabi`

  function exportTo(target: (typeof TARGETS)[number]) {
    try {
      downloadFile(target.build(dated), target.extension, target.mimeType)
      setNotice(`Downloaded ${countDates(dated.length)}. ${target.next}`.trim())
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
      <DialogContent>
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
