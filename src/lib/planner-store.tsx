"use client"

import { createContext, use, useCallback, useEffect, useReducer, useRef } from "react"
import { fakeExtract } from "@/lib/fake-extract"
import type { CourseInfo, ExtractedEvent, PlannerEvent, SyllabusFile } from "@/lib/types"

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
  | { type: "done"; id: string; course: CourseInfo; events: PlannerEvent[] }
  | { type: "error"; id: string; message: string }
  | { type: "remove"; id: string }
  | { type: "setTermStart"; date: string }
  | { type: "addEvent"; fileId: string; event: PlannerEvent }
  | { type: "updateEvent"; fileId: string; eventId: string; patch: Partial<PlannerEvent> }
  | { type: "removeEvent"; fileId: string; eventId: string }

function updateFile(state: PlannerState, id: string, patch: Partial<SyllabusFile>) {
  return {
    ...state,
    files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  }
}

function updateEvents(
  state: PlannerState,
  fileId: string,
  update: (events: PlannerEvent[]) => PlannerEvent[]
) {
  const file = state.files.find((f) => f.id === fileId)
  return file ? updateFile(state, fileId, { events: update(file.events) }) : state
}

function reducer(state: PlannerState, action: Action): PlannerState {
  switch (action.type) {
    case "add":
      return { ...state, files: [...state.files, ...action.files] }
    case "progress":
      return updateFile(state, action.id, { progress: action.progress })
    case "done":
      return updateFile(state, action.id, {
        status: "done",
        progress: 100,
        course: action.course,
        events: action.events,
      })
    case "error":
      return updateFile(state, action.id, { status: "error", error: action.message })
    case "remove":
      return { ...state, files: state.files.filter((f) => f.id !== action.id) }
    case "setTermStart":
      return { ...state, termStart: action.date }
    case "addEvent":
      return updateEvents(state, action.fileId, (events) => [...events, action.event])
    case "updateEvent":
      return updateEvents(state, action.fileId, (events) =>
        events.map((e) => (e.id === action.eventId ? { ...e, ...action.patch } : e))
      )
    case "removeEvent":
      return updateEvents(state, action.fileId, (events) =>
        events.filter((e) => e.id !== action.eventId)
      )
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
  /** Adds a blank, hand-entered event and returns its id. */
  addEvent: (fileId: string) => string
  updateEvent: (fileId: string, eventId: string, patch: Partial<PlannerEvent>) => void
  removeEvent: (fileId: string, eventId: string) => void
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

  // Nothing is stored, so warn before a reload or tab close throws work away.
  const hasFiles = state.files.length > 0
  useEffect(() => {
    if (!hasFiles) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [hasFiles])

  const addFiles = useCallback((files: File[]) => {
    const added: SyllabusFile[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "processing",
      progress: 0,
      course: null,
      events: [],
    }))
    dispatch({ type: "add", files: added })

    for (const { id, file } of added) {
      const controller = new AbortController()
      controllers.current.set(id, controller)
      fakeExtract(file, (progress) => dispatch({ type: "progress", id, progress }), controller.signal)
        .then(({ course, events }) =>
          dispatch({ type: "done", id, course, events: toPlannerEvents(events) })
        )
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

  const addEvent = useCallback((fileId: string) => {
    const event: PlannerEvent = {
      id: crypto.randomUUID(),
      title: "",
      type: "other",
      due_date: null,
      time: null,
      source_quote: "",
      page: null,
      confidence: "high",
      verified: false,
    }
    dispatch({ type: "addEvent", fileId, event })
    return event.id
  }, [])

  const updateEvent = useCallback(
    (fileId: string, eventId: string, patch: Partial<PlannerEvent>) =>
      dispatch({ type: "updateEvent", fileId, eventId, patch }),
    []
  )

  const removeEvent = useCallback(
    (fileId: string, eventId: string) => dispatch({ type: "removeEvent", fileId, eventId }),
    []
  )

  return (
    <PlannerContext
      value={{ state, addFiles, removeFile, setTermStart, addEvent, updateEvent, removeEvent }}
    >
      {children}
    </PlannerContext>
  )
}

export function usePlanner() {
  const ctx = use(PlannerContext)
  if (!ctx) throw new Error("usePlanner must be used inside <PlannerProvider>")
  return ctx
}
