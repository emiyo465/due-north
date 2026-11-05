"use client"

import { useState } from "react"
import {
  Calendar,
  CalendarPlus,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
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
import { needsReview, type SyllabusFile } from "@/lib/types"

// Placeholder targets; real exports land in Milestone 2, weeks 2–3.
const TARGETS = [
  { label: "Google Calendar", icon: CalendarPlus },
  { label: "Apple Calendar", icon: Calendar },
  { label: "Plaintext", icon: ClipboardCopy },
  { label: "Excel / CSV", icon: FileSpreadsheet },
]

interface ExportDialogProps {
  files: SyllabusFile[]
  /** Per file, the events whose source quote couldn't be found in the PDF. */
  missingSources: Record<string, Set<string>>
}

export function ExportDialog({ files, missingSources }: ExportDialogProps) {
  const [notice, setNotice] = useState<string | null>(null)

  const done = files.filter((f) => f.status === "done")
  const events = done.flatMap((f) => f.events.map((e) => ({ file: f, event: e })))
  const reviewCount = events.filter(({ file, event }) =>
    needsReview(event, missingSources[file.id]?.has(event.id))
  ).length
  const source =
    done.length === 1 ? (done[0].course?.name?.value ?? done[0].file.name) : `${done.length} syllabi`

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
            {events.length === 0
              ? "There are no dates to export yet."
              : `${events.length} ${events.length === 1 ? "date" : "dates"} from ${source}.`}
          </DialogDescription>
        </DialogHeader>

        {reviewCount > 0 && (
          <p className="flex gap-2 rounded-lg bg-amber-100 px-3 py-2 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {reviewCount} {reviewCount === 1 ? "date still needs" : "dates still need"} verifying.
            You can export now and fix them later.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {TARGETS.map(({ label, icon: Icon }) => (
            <Button
              key={label}
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              disabled={events.length === 0}
              onClick={() => setNotice(`${label} export isn't available in this prototype yet.`)}
            >
              <Icon className="size-5" aria-hidden />
              {label}
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
