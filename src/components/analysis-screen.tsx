"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CircleAlert, LoaderCircle } from "lucide-react"
import { CourseInfoSection } from "@/components/course-info"
import { EventList } from "@/components/event-list"
import { ExportDialog } from "@/components/export-dialog"
import { buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePlanner } from "@/lib/planner-store"
import { COURSE_FIELDS, courseFieldId, type SyllabusFile } from "@/lib/types"
import type { HighlightSource } from "@/components/pdf-viewer"

export function AnalysisScreen() {
  const router = useRouter()
  const { state } = usePlanner()
  const { files } = state
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = files.find((f) => f.id === activeId) ?? files[0]
  // Kept here rather than per tab so it survives tab switches and feeds the export summary.
  const [missingSources, setMissingSources] = useState<Record<string, Set<string>>>({})
  const handleMissingSources = useCallback(
    (fileId: string, ids: Set<string>) => setMissingSources((prev) => ({ ...prev, [fileId]: ids })),
    []
  )

  // Nothing to review (direct visit or reload, since uploads aren't stored).
  useEffect(() => {
    if (files.length === 0) router.replace("/")
  }, [files.length, router])

  if (!active) return null

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Back to upload"
          >
            <ArrowLeft />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Review your dates</h1>
        </div>
      </header>

      <Tabs value={active.id} onValueChange={(value) => setActiveId(value)}>
        {files.length > 1 && (
          <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
            {files.map((f) => (
              <TabsTrigger key={f.id} value={f.id} className="flex-none">
                {f.status === "processing" && <LoaderCircle className="animate-spin" />}
                {f.status === "error" && <CircleAlert className="text-destructive" />}
                <span className="max-w-48 truncate">{f.course?.name?.value ?? f.file.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {files.map((f) => (
          <TabsContent key={f.id} value={f.id}>
            <FilePanel
              file={f}
              missingSources={missingSources[f.id]}
              onMissingSourcesChange={handleMissingSources}
              // Export comes after reviewing, so it sits at the end of the list.
              footer={<ExportDialog files={files} missingSources={missingSources} />}
            />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  )
}

// pdf.js needs browser APIs, so the viewer is never prerendered.
const PdfViewer = dynamic(() => import("@/components/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading PDF viewer…
    </div>
  ),
})

const NO_MISSING = new Set<string>()

interface FilePanelProps {
  file: SyllabusFile
  missingSources: Set<string> | undefined
  onMissingSourcesChange: (fileId: string, ids: Set<string>) => void
  footer: React.ReactNode
}

function FilePanel({
  file,
  missingSources = NO_MISSING,
  onMissingSourcesChange,
  footer,
}: FilePanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const reportMissing = useCallback(
    (ids: Set<string>) => onMissingSourcesChange(file.id, ids),
    [file.id, onMissingSourcesChange]
  )

  // Course fields and events share one list of things the viewer can highlight.
  const sources = useMemo<HighlightSource[]>(
    () => [
      ...COURSE_FIELDS.flatMap(({ key }) => {
        const field = file.course?.[key]
        return field ? [{ id: courseFieldId(key), quote: field.source_quote, page: field.page }] : []
      }),
      ...file.events.map((e) => ({ id: e.id, quote: e.source_quote, page: e.page })),
    ],
    [file.course, file.events]
  )

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {file.course?.name?.value ?? file.file.name}
          </h2>
          <p className="text-sm break-words text-muted-foreground">{file.file.name}</p>
        </div>
        {file.status === "done" && (
          <CourseInfoSection
            file={file}
            selectedId={selectedId}
            onSelect={setSelectedId}
            missingSources={missingSources}
          />
        )}
        {file.status === "done" && (
          <EventList
            file={file}
            selectedId={selectedId}
            onSelect={setSelectedId}
            missingSources={missingSources}
          />
        )}
        {file.status === "processing" && (
          <p className="text-sm text-muted-foreground">Still extracting dates from this file…</p>
        )}
        {file.status === "error" && (
          <p className="text-sm text-destructive">Couldn&apos;t read this file: {file.error}</p>
        )}
        <div className="pt-3">{footer}</div>
      </div>

      <aside
        aria-label={`${file.file.name} preview`}
        className="h-[75dvh] overflow-hidden rounded-xl border bg-muted/40 lg:sticky lg:top-8 lg:h-[calc(100dvh-8rem)]"
      >
        <PdfViewer
          file={file.file}
          sources={sources}
          selectedId={selectedId}
          onMissingSourcesChange={reportMissing}
        />
      </aside>
    </div>
  )
}
