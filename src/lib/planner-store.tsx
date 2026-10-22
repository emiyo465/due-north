"use client"

import { createContext, use, useCallback, useEffect, useReducer, useRef } from "react"
import { fakeExtract } from "@/lib/fake-extract"
import type { ExtractedEvent, PlannerEvent, SyllabusFile } from "@/lib/types"

// Client-only app state. Uploaded PDFs live in memory and are never sent
// anywhere or persisted, per the privacy note in docs/SPEC.md.

interface PlannerState {
  /** ISO date the term starts; used later to resolve "Week 5 Friday" etc. */
  termStart: string
  files: SyllabusFile[]
}

type Action =
  | { type: "add"; files: SyllabusFile[] }
  | { type: "progress"; id: string; progress: number }
  | { type: "done"; id: string; events: PlannerEvent[] }
  | { type: "error"; id: string; message: string }
  | { type: "remove"; id: string }
  | { type: "setTermStart"; date: string }

function updateFile(state: PlannerState, id: string, patch: Partial<SyllabusFile>) {
  return {
    ...state,
    files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  }
}

function reducer(state: PlannerState, action: Action): PlannerState {
  switch (action.type) {
    case "add":
      return { ...state, files: [...state.files, ...action.files] }
    case "progress":
      return updateFile(state, action.id, { progress: action.progress })
    case "done":
      return updateFile(state, action.id, { status: "done", progress: 100, events: action.events })
    case "error":
      return updateFile(state, action.id, { status: "error", error: action.message })
    case "remove":
      return { ...state, files: state.files.filter((f) => f.id !== action.id) }
    case "setTermStart":
      return { ...state, termStart: action.date }
  }
}

function toPlannerEvents(events: ExtractedEvent[]): PlannerEvent[] {
  return events.map((e) => ({ ...e, id: crypto.randomUUID(), verified: false }))
}

interface PlannerContextValue {
  state: PlannerState
  addFiles: (files: File[]) => void
  removeFile: (id: string) => void
  setTermStart: (date: string) => void
}

const PlannerContext = createContext<PlannerContextValue | null>(null)

const DEFAULT_TERM_START = "2026-09-08"

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { termStart: DEFAULT_TERM_START, files: [] })
  const controllers = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const active = controllers.current
    return () => active.forEach((c) => c.abort())
  }, [])

  const addFiles = useCallback((files: File[]) => {
    const added: SyllabusFile[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "processing",
      progress: 0,
      events: [],
    }))
    dispatch({ type: "add", files: added })

    for (const { id, file } of added) {
      const controller = new AbortController()
      controllers.current.set(id, controller)
      fakeExtract(file, (progress) => dispatch({ type: "progress", id, progress }), controller.signal)
        .then((events) => dispatch({ type: "done", id, events: toPlannerEvents(events) }))
        .catch((err: unknown) => {
          if (controller.signal.aborted) return
          dispatch({ type: "error", id, message: err instanceof Error ? err.message : "Extraction failed" })
        })
        .finally(() => controllers.current.delete(id))
    }
  }, [])

  const removeFile = useCallback((id: string) => {
    controllers.current.get(id)?.abort()
    dispatch({ type: "remove", id })
  }, [])

  const setTermStart = useCallback((date: string) => dispatch({ type: "setTermStart", date }), [])

  return (
    <PlannerContext value={{ state, addFiles, removeFile, setTermStart }}>{children}</PlannerContext>
  )
}

export function usePlanner() {
  const ctx = use(PlannerContext)
  if (!ctx) throw new Error("usePlanner must be used inside <PlannerProvider>")
  return ctx
}
