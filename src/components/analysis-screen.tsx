"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CircleAlert, FileText, LoaderCircle } from "lucide-react"
import { EventList } from "@/components/event-list"
import { Button, buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePlanner } from "@/lib/planner-store"
import type { SyllabusFile } from "@/lib/types"

export function AnalysisScreen() {
  const router = useRouter()
  const { state } = usePlanner()
  const { files } = state
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = files.find((f) => f.id === activeId) ?? files[0]

  // Nothing to review (direct visit or reload, since uploads aren't stored).
  useEffect(() => {
    if (files.length === 0) router.replace("/")
  }, [files.length, router])

  if (!active) return null

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
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
        {/* Wired up to the export popup on day 6. */}
        <Button disabled>Export</Button>
      </header>

      <Tabs value={active.id} onValueChange={(value) => setActiveId(value)}>
        {files.length > 1 && (
          <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
            {files.map((f) => (
              <TabsTrigger key={f.id} value={f.id} className="flex-none">
                {f.status === "processing" && <LoaderCircle className="animate-spin" />}
                {f.status === "error" && <CircleAlert className="text-destructive" />}
                <span className="max-w-48 truncate">{f.file.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {files.map((f) => (
          <TabsContent key={f.id} value={f.id}>
            <FilePanel file={f} />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  )
}

function FilePanel({ file }: { file: SyllabusFile }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-medium">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{file.file.name}</span>
        </h2>
        {file.status === "done" && <EventList file={file} />}
        {file.status === "processing" && (
          <p className="text-sm text-muted-foreground">Still extracting dates from this file…</p>
        )}
        {file.status === "error" && (
          <p className="text-sm text-destructive">Couldn&apos;t read this file: {file.error}</p>
        )}
      </div>

      {/* Replaced by the react-pdf viewer with source highlights on day 5. */}
      <aside className="flex min-h-80 items-center justify-center rounded-xl border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground lg:sticky lg:top-8 lg:h-[calc(100dvh-8rem)]">
        PDF preview coming soon
      </aside>
    </div>
  )
}
