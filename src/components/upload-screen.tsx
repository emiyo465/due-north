"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useDropzone, type FileRejection } from "react-dropzone"
import { CircleAlert, CircleCheck, FileText, LoaderCircle, Lock, RotateCw, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { ThemeToggle } from "@/components/theme-toggle"
import { usePlanner } from "@/lib/planner-store"
import type { SyllabusFile } from "@/lib/types"
import { cn } from "@/lib/utils"

// Generous for a syllabus; only the page text is sent on, not the file.
const MAX_FILE_SIZE = 32 * 1024 * 1024
// Long enough to read the "opening" note before the screen changes.
const ADVANCE_DELAY = 1500
const EXAMPLE_SYLLABUS = "/samples/CS340_Software_Design_Syllabus_USABILITY_TEST.pdf"

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function rejectionMessage({ file, errors }: FileRejection) {
  const code = errors[0]?.code
  if (code === "file-invalid-type") return `${file.name} isn't a PDF.`
  if (code === "file-too-large") return `${file.name} is larger than 32 MB.`
  return `${file.name}: ${errors[0]?.message ?? "couldn't be added."}`
}

export function UploadScreen() {
  const router = useRouter()
  const { state, addFiles, removeFile, retryFile, setTermStart } = usePlanner()
  const { files, termStart } = state
  const [rejections, setRejections] = useState<string[]>([])
  const [loadingExample, setLoadingExample] = useState(false)
  // Advance only for a batch running on this visit, so coming back to this
  // screen later doesn't bounce straight to analysis.
  const [autoAdvance, setAutoAdvance] = useState(() =>
    files.some((f) => f.status === "processing")
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
    maxSize: MAX_FILE_SIZE,
    noClick: true,
    onDrop: (accepted, rejected) => {
      setRejections(rejected.map(rejectionMessage))
      if (accepted.length) {
        setAutoAdvance(true)
        addFiles(accepted)
      }
    },
  })

  async function loadExample() {
    setLoadingExample(true)
    try {
      const res = await fetch(EXAMPLE_SYLLABUS)
      const blob = await res.blob()
      const name = EXAMPLE_SYLLABUS.split("/").pop()!
      setAutoAdvance(true)
      // The example has a hand-checked fixture, so it never spends API credits.
      addFiles([new File([blob], name, { type: "application/pdf" })], { useFixture: true })
    } finally {
      setLoadingExample(false)
    }
  }

  const processing = files.filter((f) => f.status === "processing").length
  const finished = files.length - processing
  const overall = files.length
    ? files.reduce((sum, f) => sum + (f.status === "processing" ? f.progress : 100), 0) / files.length
    : 0

  const hasResults = files.some((f) => f.status === "done")
  const advancing = autoAdvance && processing === 0 && hasResults

  useEffect(() => {
    if (!advancing) return
    const timeout = setTimeout(() => {
      // This screen stays mounted while hidden, so reset now or coming back
      // would advance again.
      setAutoAdvance(false)
      router.push("/analysis")
    }, ADVANCE_DELAY)
    return () => clearTimeout(timeout)
  }, [advancing, router])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 sm:py-20">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Semester Planner</h1>
          <ThemeToggle />
        </div>
        <p className="text-muted-foreground">
          Drop in your syllabi and we&apos;ll pull out every project, paper, and exam date for your
          calendar.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <Label htmlFor="term-start">First day of the term</Label>
        <Input
          id="term-start"
          type="date"
          value={termStart}
          onChange={(e) => setTermStart(e.target.value)}
          className="w-fit"
        />
        <p className="text-xs text-muted-foreground">
          Used to work out dates like &ldquo;Week 5, Friday&rdquo;.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          isDragActive ? "border-primary bg-muted" : "border-border"
        )}
      >
        <input {...getInputProps()} aria-label="Upload syllabus PDFs" />
        <Upload className="size-8 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium">
            {isDragActive ? "Drop to upload" : "Drag and drop syllabus PDFs here"}
          </p>
          <p className="text-sm text-muted-foreground">One or more files, up to 32 MB each</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={open}>Choose files</Button>
          <Button variant="outline" onClick={loadExample} disabled={loadingExample}>
            {loadingExample && <LoaderCircle className="animate-spin" />}
            Use example syllabus
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Your PDFs stay in your browser. Only their text is sent to find the dates.
        </p>
      </div>

      {rejections.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          {rejections.map((message) => (
            <li key={message} className="flex items-center gap-2">
              <CircleAlert className="size-4 shrink-0" aria-hidden />
              {message}
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <section className="flex flex-col gap-4">
          <Progress value={overall}>
            <ProgressLabel>
              {processing > 0
                ? `Processing ${files.length} ${files.length === 1 ? "file" : "files"} (${finished} done)`
                : `Processed ${files.length} ${files.length === 1 ? "file" : "files"}`}
            </ProgressLabel>
            <ProgressValue />
          </Progress>

          <ul className="flex flex-col divide-y rounded-xl border">
            {files.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                onRemove={() => removeFile(f.id)}
                onRetry={() => {
                  setAutoAdvance(true)
                  retryFile(f.id)
                }}
              />
            ))}
          </ul>

          {(processing > 0 || advancing) && (
            <p role="status" className="text-sm text-muted-foreground">
              {advancing
                ? "All done. Opening your dates…"
                : "Your dates will open automatically when this finishes."}
            </p>
          )}

          {processing === 0 && hasResults && !advancing && (
            <Button className="self-end" onClick={() => router.push("/analysis")}>
              Review dates
            </Button>
          )}
        </section>
      )}
    </main>
  )
}

function FileRow({
  file,
  onRemove,
  onRetry,
}: {
  file: SyllabusFile
  onRemove: () => void
  onRetry: () => void
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">{file.file.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatBytes(file.file.size)} ·{" "}
          {file.status === "processing" && "Extracting dates…"}
          {file.status === "done" &&
            `${file.events.length} ${file.events.length === 1 ? "date" : "dates"} found`}
          {file.status === "error" && <span className="text-destructive">{file.error}</span>}
        </span>
      </div>
      {file.status === "processing" && (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Processing" />
      )}
      {file.status === "done" && <CircleCheck className="size-4 text-primary" aria-label="Done" />}
      {file.status === "error" && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${file.file.name}`}>
        <X />
      </Button>
    </li>
  )
}
