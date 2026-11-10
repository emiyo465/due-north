"use client"

import { useRef, useState } from "react"
import {
  Calendar,
  CalendarPlus,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
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
  buildCalendarEntries,
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
import { SignInError, signInWithGoogle } from "@/lib/google-auth"
import { browserTimeZone, calendarName, toGoogleEvents } from "@/lib/google-calendar"
import { usePlanner } from "@/lib/planner-store"
import { needsReview, type SyllabusFile } from "@/lib/types"

const FILE_NAME = "semester-dates"
const ICS = { extension: "ics", mimeType: "text/calendar", build: toIcs, calendar: true }

// Google Calendar inserts directly once sign-in is set up on the server, and
// otherwise downloads the .ics with import steps.
const GOOGLE_ICS = {
  label: "Google Calendar",
  ...ICS,
  next: "In Google Calendar, open Settings, then Import & export, and choose the file.",
}

const TARGETS = [
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

type DownloadTarget = Omit<(typeof TARGETS)[number], "icon">

interface GoogleStatus {
  configured: boolean
  signedIn: boolean
}

interface Notice {
  text: string
  link?: string
  /** Offer the .ics download when the direct export didn't work. */
  fallback?: boolean
}

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
  const [notice, setNotice] = useState<Notice | null>(null)
  const [google, setGoogle] = useState<GoogleStatus | null>(null)
  const [busy, setBusy] = useState<"signing-in" | "exporting" | null>(null)
  const signInAbort = useRef<AbortController | null>(null)
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
  const withClasses = (calendar: boolean) =>
    calendar && classes.length > 0
      ? ` and class times for ${classes.length} ${classes.length === 1 ? "course" : "courses"}`
      : ""

  function exportTo(target: DownloadTarget) {
    try {
      downloadFile(target.build(dated, icsOptions), target.extension, target.mimeType)
      setNotice({
        text: `Downloaded ${countDates(dated.length)}${withClasses(target.calendar)}. ${target.next}`.trim(),
      })
    } catch {
      setNotice({ text: `Couldn't create the ${target.label} file. Check the dates and try again.` })
    }
  }

  async function checkGoogle() {
    try {
      const res = await fetch("/api/google/status")
      setGoogle(res.ok ? await res.json() : { configured: false, signedIn: false })
    } catch {
      setGoogle({ configured: false, signedIn: false })
    }
  }

  async function exportToGoogle() {
    if (!google?.configured) return exportTo(GOOGLE_ICS)
    setNotice(null)
    // The popup has to open straight from the click, before anything is awaited.
    let signIn: Promise<void> | null = null
    if (!google.signedIn) {
      signInAbort.current = new AbortController()
      signIn = signInWithGoogle(signInAbort.current.signal)
    }
    try {
      if (signIn) {
        setBusy("signing-in")
        await signIn
        setGoogle({ configured: true, signedIn: true })
      }
      setBusy("exporting")
      const name = calendarName(state.termStart)
      const timeZone = browserTimeZone()
      const res = await fetch("/api/google/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarName: name,
          timeZone,
          events: toGoogleEvents(buildCalendarEntries(dated, icsOptions), timeZone),
        }),
      })
      if (res.status === 401) {
        setGoogle({ configured: true, signedIn: false })
        setNotice({ text: "Your Google sign-in expired. Choose Google Calendar again to sign in." })
        return
      }
      if (!res.ok) throw new Error(`Export failed with ${res.status}`)
      const { link, inserted, failed } = (await res.json()) as {
        link: string
        inserted: number
        failed: number
      }
      const added = inserted === 1 ? "1 event" : `${inserted} events`
      setNotice({
        text:
          `Added ${added} to a new calendar, “${name}”.` +
          (failed > 0 ? ` ${failed} couldn't be added. Delete that calendar and try again, or download the file.` : ""),
        link,
        fallback: failed > 0,
      })
    } catch (e) {
      if (e instanceof SignInError && e.reason === "cancelled") return
      setNotice({
        text:
          e instanceof SignInError && e.reason === "blocked"
            ? "The browser blocked the Google sign-in window. Allow pop-ups for this site, or download the file instead."
            : "Couldn't add the dates to Google Calendar. Try again, or download the file instead.",
        fallback: true,
      })
    } finally {
      signInAbort.current = null
      setBusy(null)
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          void checkGoogle()
        } else {
          signInAbort.current?.abort()
          setNotice(null)
        }
      }}
    >
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
          <Button
            variant="outline"
            className="h-auto flex-col gap-2 py-4"
            disabled={dated.length === 0 || busy !== null}
            onClick={exportToGoogle}
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <CalendarPlus className="size-5" aria-hidden />
            )}
            Google Calendar
          </Button>
          {TARGETS.map((target) => (
            <Button
              key={target.label}
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              disabled={dated.length === 0 || busy !== null}
              onClick={() => exportTo(target)}
            >
              <target.icon className="size-5" aria-hidden />
              {target.label}
            </Button>
          ))}
        </div>

        <div role="status" className="flex min-h-5 flex-col items-start gap-2 text-muted-foreground">
          {busy === "signing-in" && (
            <p className="flex flex-wrap items-center gap-x-2">
              Finish signing in to Google in the pop-up window.
              <Button variant="link" className="h-auto p-0" onClick={() => signInAbort.current?.abort()}>
                Cancel
              </Button>
            </p>
          )}
          {busy === "exporting" && <p>Adding your dates to Google Calendar…</p>}
          {notice && <p>{notice.text}</p>}
          {notice?.link && (
            <a
              href={notice.link}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline underline-offset-4"
            >
              Open Google Calendar
            </a>
          )}
          {notice?.fallback && (
            <Button variant="link" className="h-auto p-0" onClick={() => exportTo(GOOGLE_ICS)}>
              Download the .ics file instead
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
