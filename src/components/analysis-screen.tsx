"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { usePlanner } from "@/lib/planner-store"

// Placeholder until day 4 builds the editable list and PDF viewer.
export function AnalysisScreen() {
  const { state } = usePlanner()
  const done = state.files.filter((f) => f.status === "done")

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <Link href="/" className={buttonVariants({ variant: "ghost", className: "self-start" })}>
        <ArrowLeft />
        Back to upload
      </Link>
      {done.length === 0 ? (
        <p className="text-muted-foreground">No syllabi processed yet.</p>
      ) : (
        done.map((f) => (
          <section key={f.id} className="flex flex-col gap-2">
            <h2 className="font-semibold">{f.file.name}</h2>
            <ul className="text-sm">
              {f.events.map((e) => (
                <li key={e.id}>
                  {e.due_date ?? "No date"} — {e.title}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  )
}
