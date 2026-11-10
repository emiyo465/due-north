"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { LoaderCircle, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import "@/lib/pdf-safari"
import { typeColor } from "@/lib/event-colors"
import { findQuote, type QuoteSpan } from "@/lib/quote-match"
import type { EventType } from "@/lib/types"
import { cn } from "@/lib/utils"
import "react-pdf/dist/Page/TextLayer.css"

// Must be set in the same module that renders <Document> (see react-pdf docs).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

// 1 is fit-to-width.
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

function clampZoom(level: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level))
}

function zoomLabel(level: number) {
  return `${Math.round(level * 100)}%`
}

type Matrix = number[]

interface TextItem {
  str: string
  transform: Matrix
  width: number
  fontName: string
}

interface FontStyle {
  fontFamily: string
  ascent: number
  descent: number
}

/** A page's text and geometry at scale 1, in CSS pixels. */
interface PageInfo {
  items: TextItem[]
  styles: Record<string, FontStyle>
  width: number
  height: number
  transform: Matrix
}

interface SourceMatch {
  page: number
  spans: QuoteSpan[]
}

/** A highlight box as percentages of the page, so it scales with the page. */
interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Something to highlight: an event or a course field. */
export interface HighlightSource {
  id: string
  /** Empty for things the user typed in, which have nothing to highlight. */
  quote: string
  /** The page the extractor reported, or null if unknown. */
  page: number | null
  /** Colors an event's highlight by its type; course fields have none. */
  type?: EventType
}

interface PdfViewerProps {
  file: File
  sources: HighlightSource[]
  selectedId: string | null
  /** Whether a new selection scrolls the PDF to it. */
  followSelection: boolean
  /** The source being hovered or keyboard-focused, here or in the list. */
  focusedId: string | null
  /** A highlight was clicked. */
  onSelect: (id: string) => void
  /** The pointer entered (id) or left (null) a highlight. */
  onFocusChange: (id: string | null) => void
  /** Reports which sources' quotes couldn't be found in the PDF. */
  onMissingSourcesChange: (ids: Set<string>) => void
}

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

let measureContext: CanvasRenderingContext2D | null = null

/** How far into an item's width each end of a span sits, from 0 to 1. */
function spanFractions(str: string, start: number, end: number, fontFamily: string) {
  measureContext ??= document.createElement("canvas").getContext("2d")
  if (!measureContext) return [start / str.length, end / str.length]
  measureContext.font = `100px ${fontFamily}`
  const total = measureContext.measureText(str).width || 1
  const at = (i: number) => measureContext!.measureText(str.slice(0, i)).width / total
  return [at(start), at(end)]
}

// Boxes come from the PDF's own text positions rather than the text layer's
// spans, whose size depends on the browser's fallback font metrics.
function boxesFor(info: PageInfo, spans: QuoteSpan[]): Box[] {
  return spans.map(({ item: index, start, end }) => {
    const item = info.items[index]
    const style = info.styles[item.fontName]
    const tx = multiply(info.transform, item.transform)
    const fontHeight = Math.hypot(tx[2], tx[3])
    const ascent = style?.ascent || 0.8
    const descent = style?.descent || -0.2
    const [from, to] = spanFractions(item.str, start, end, style?.fontFamily ?? "sans-serif")
    const itemWidth = item.width * Math.hypot(info.transform[0], info.transform[1])
    return {
      left: ((tx[4] + itemWidth * from) / info.width) * 100,
      top: ((tx[5] - ascent * fontHeight) / info.height) * 100,
      width: ((itemWidth * (to - from)) / info.width) * 100,
      height: (((ascent - descent) * fontHeight) / info.height) * 100,
    }
  })
}

export default function PdfViewer({
  file,
  sources,
  selectedId,
  followSelection,
  focusedId,
  onSelect,
  onFocusChange,
  onMissingSourcesChange,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState<PageInfo[] | null>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  // Where to scroll once a new zoom has laid out, to keep a point in place.
  const pendingScroll = useRef<{ left: number; top: number } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  /** The pinch or ctrl+wheel zoom in progress, not yet rendered. */
  const gesture = useRef<{ level: number; x: number; y: number } | null>(null)
  const [nearbyPages, setNearbyPages] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      // Round so tiny layout shifts don't re-render every page.
      setWidth(Math.floor(entry.contentRect.width / 10) * 10)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Pull every page's text once so quotes can be matched up front.
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i): Promise<PageInfo> => {
        const page = await pdf.getPage(i + 1)
        // Without text a page can still display; its quotes just show as not found.
        const content = await page
          .getTextContent()
          .catch(() => ({ items: [], styles: {}, lang: null }))
        const viewport = page.getViewport({ scale: 1 })
        return {
          items: content.items.map((item) =>
            "str" in item ? item : { str: "", transform: [1, 0, 0, 1, 0, 0], width: 0, fontName: "" }
          ),
          styles: content.styles,
          width: viewport.width,
          height: viewport.height,
          transform: viewport.transform,
        }
      })
    ).then((result) => {
      if (!cancelled) setPages(result)
    })
    return () => {
      cancelled = true
    }
  }, [pdf])

  const matches = useMemo(() => {
    const result = new Map<string, SourceMatch | null>()
    if (!pages) return result
    const texts = pages.map((p) => p.items.map((item) => item.str))
    for (const source of sources) {
      if (!source.quote) continue
      // Try the page the extractor reported first, then the rest.
      const order = texts.map((_, i) => i + 1)
      if (source.page) order.sort((a, b) => Number(b === source.page) - Number(a === source.page))
      let match: SourceMatch | null = null
      for (const page of order) {
        const spans = findQuote(texts[page - 1], source.quote)
        if (spans) {
          match = { page, spans }
          break
        }
      }
      result.set(source.id, match)
    }
    return result
  }, [sources, pages])

  // Boxes per page, keyed by source id.
  const boxes = useMemo(() => {
    const result = new Map<number, { id: string; boxes: Box[] }[]>()
    if (!pages) return result
    for (const [id, match] of matches) {
      if (!match) continue
      const list = result.get(match.page) ?? []
      list.push({ id, boxes: boxesFor(pages[match.page - 1], match.spans) })
      result.set(match.page, list)
    }
    return result
  }, [matches, pages])

  const typeById = useMemo(() => new Map(sources.map((s) => [s.id, s.type])), [sources])

  useEffect(() => {
    if (!pages) return
    const missing = new Set([...matches].filter(([, m]) => m === null).map(([id]) => id))
    onMissingSourcesChange(missing)
  }, [matches, pages, onMissingSourcesChange])

  const selectedMatch = selectedId ? matches.get(selectedId) : undefined
  const selectedSource = sources.find((s) => s.id === selectedId)
  const targetPage = selectedMatch?.page ?? selectedSource?.page ?? null
  // Pages are laid out at full size from the start, rendered or not.
  const ready = pages !== null && width > 0

  const scrollToTarget = useCallback(() => {
    const container = containerRef.current
    if (!container || targetPage === null) return
    const target =
      container.querySelector<HTMLElement>(".pdf-hl-active") ??
      container.querySelector<HTMLElement>(`[data-page="${targetPage}"]`)
    if (!target) return
    const from = container.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    container.scrollTo({
      top: container.scrollTop + to.top - from.top - container.clientHeight / 3,
      left: container.scrollLeft + to.left - from.left - container.clientWidth / 3,
      behavior: "smooth",
    })
    // On narrow screens the viewer sits below the list, so bring it into view too.
    container.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [targetPage])

  useEffect(() => {
    if (ready && followSelection) scrollToTarget()
  }, [selectedId, ready, followSelection, scrollToTarget])

  // Only pages near the view get a canvas, which matters at high zoom.
  useEffect(() => {
    const container = containerRef.current
    if (!container || !ready) return
    const observer = new IntersectionObserver(
      (entries) => {
        setNearbyPages((prev) => {
          const next = new Set(prev)
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.page)
            if (entry.isIntersecting) next.add(page)
            else next.delete(page)
          }
          return next
        })
      },
      { root: container, rootMargin: "100% 0px" }
    )
    container.querySelectorAll("[data-page]").forEach((page) => observer.observe(page))
    return () => observer.disconnect()
  }, [ready])

  /** Zooms to a level, keeping the given screen point where it is. Returns whether it changed. */
  const zoomTo = useCallback((level: number, clientX?: number, clientY?: number) => {
    const container = containerRef.current
    const next = Math.round(clampZoom(level) * 100) / 100
    if (!container || next === zoomRef.current) return false
    const rect = container.getBoundingClientRect()
    const x = (clientX ?? rect.left + rect.width / 2) - rect.left
    const y = (clientY ?? rect.top + rect.height / 2) - rect.top
    const ratio = next / zoomRef.current
    pendingScroll.current = {
      left: (container.scrollLeft + x) * ratio - x,
      top: (container.scrollTop + y) * ratio - y,
    }
    zoomRef.current = next
    setZoom(next)
    return true
  }, [])

  const clearPreview = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.style.transform = ""
      contentRef.current.style.transformOrigin = ""
    }
    if (labelRef.current) labelRef.current.textContent = zoomLabel(zoomRef.current)
  }, [])

  // Re-rendering pages on every finger movement makes a pinch stutter, so during
  // a gesture the pages are only scaled visually, then rendered once at the end.
  const previewZoom = useCallback((level: number, clientX: number, clientY: number) => {
    const content = contentRef.current
    if (!content) return
    const next = clampZoom(level)
    if (gesture.current) {
      gesture.current.level = next
    } else {
      const rect = content.getBoundingClientRect()
      content.style.transformOrigin = `${clientX - rect.left}px ${clientY - rect.top}px`
      gesture.current = { level: next, x: clientX, y: clientY }
    }
    content.style.transform = `scale(${next / zoomRef.current})`
    if (labelRef.current) labelRef.current.textContent = zoomLabel(next)
  }, [])

  const commitPreview = useCallback(() => {
    const finished = gesture.current
    gesture.current = null
    if (finished && !zoomTo(finished.level, finished.x, finished.y)) clearPreview()
  }, [zoomTo, clearPreview])

  // Before paint, so the pages swap from scaled to re-laid-out in a single frame.
  useLayoutEffect(() => {
    if (pendingScroll.current) containerRef.current?.scrollTo(pendingScroll.current)
    pendingScroll.current = null
    clearPreview()
  }, [zoom, clearPreview])

  // Ctrl+wheel and trackpad pinch both arrive as wheel events with ctrlKey set.
  // Touch pinch needs its own handling. Both must be non-passive to stop the
  // browser zooming the whole app.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let pinch: { distance: number; zoom: number } | null = null
    let wheelEnd: ReturnType<typeof setTimeout> | undefined

    const distance = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const level = gesture.current?.level ?? zoomRef.current
      previewZoom(level * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
      clearTimeout(wheelEnd)
      wheelEnd = setTimeout(commitPreview, 150)
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { distance: distance(e.touches), zoom: zoomRef.current }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return
      e.preventDefault()
      previewZoom(
        (pinch.zoom * distance(e.touches)) / pinch.distance,
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2
      )
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!pinch || e.touches.length >= 2) return
      pinch = null
      commitPreview()
    }

    container.addEventListener("wheel", onWheel, { passive: false })
    container.addEventListener("touchstart", onTouchStart, { passive: true })
    container.addEventListener("touchmove", onTouchMove, { passive: false })
    container.addEventListener("touchend", onTouchEnd)
    container.addEventListener("touchcancel", onTouchEnd)
    return () => {
      clearTimeout(wheelEnd)
      container.removeEventListener("wheel", onWheel)
      container.removeEventListener("touchstart", onTouchStart)
      container.removeEventListener("touchmove", onTouchMove)
      container.removeEventListener("touchend", onTouchEnd)
      container.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [previewZoom, commitPreview])

  const pageWidth = (width - 24) * zoom
  // Dim the rest only when the focused source actually has a highlight.
  const focusShown = focusedId !== null && Boolean(matches.get(focusedId))

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b bg-background px-2 py-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomTo(zoomRef.current - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
        >
          <ZoomOut />
        </Button>
        <span ref={labelRef} className="w-11 text-center text-xs text-muted-foreground tabular-nums">
          {zoomLabel(zoom)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomTo(zoomRef.current + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
        >
          <ZoomIn />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => zoomTo(1)} disabled={zoom === 1}>
          Fit width
        </Button>
      </div>

      <div
        ref={containerRef}
        className={cn(
          "min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto p-3",
          focusShown && "pdf-dim"
        )}
      >
        <div ref={contentRef}>
          <Document
            file={file}
            onLoadSuccess={setPdf}
            loading={<ViewerMessage spinner>Loading PDF…</ViewerMessage>}
            error={<ViewerMessage>Couldn&apos;t display this PDF.</ViewerMessage>}
            className="flex flex-col gap-3"
          >
            {ready &&
              pages.map((info, i) => {
                const page = i + 1
                return (
                  <div
                    key={page}
                    data-page={page}
                    // Exactly the page's size, since highlights are placed in percentages of it.
                    className="relative mx-auto shrink-0 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-foreground/10"
                    style={{ width: pageWidth, height: (pageWidth * info.height) / info.width }}
                  >
                    {nearbyPages.has(page) && (
                      <Page
                        pageNumber={page}
                        width={pageWidth}
                        renderAnnotationLayer={false}
                        loading={<div />}
                      />
                    )}
                    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
                      {(boxes.get(page) ?? [])
                        // The selected and focused sources go last so they draw on top.
                        .toSorted(
                          (a, b) =>
                            Number(a.id === selectedId) - Number(b.id === selectedId) ||
                            Number(a.id === focusedId) - Number(b.id === focusedId)
                        )
                        .flatMap(({ id, boxes }) =>
                          boxes.map((box, i) => (
                            <div
                              key={`${id}-${i}`}
                              data-source={id}
                              className={cn(
                                "pdf-hl",
                                id === selectedId && "pdf-hl-active",
                                id === focusedId && "pdf-hl-focus"
                              )}
                              style={{
                                ...typeColor(typeById.get(id)),
                                left: `${box.left}%`,
                                top: `${box.top}%`,
                                width: `${box.width}%`,
                                height: `${box.height}%`,
                              }}
                              onClick={() => onSelect(id)}
                              onMouseEnter={() => onFocusChange(id)}
                              onMouseLeave={() => onFocusChange(null)}
                            />
                          ))
                        )}
                    </div>
                  </div>
                )
              })}
          </Document>
        </div>
      </div>
    </div>
  )
}

function ViewerMessage({ children, spinner }: { children: React.ReactNode; spinner?: boolean }) {
  return (
    <div className="flex h-60 items-center justify-center gap-2 text-sm text-muted-foreground">
      {spinner && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </div>
  )
}
