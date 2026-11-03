"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { LoaderCircle } from "lucide-react"
import { findQuote, type QuoteSpan } from "@/lib/quote-match"
import "react-pdf/dist/Page/TextLayer.css"

// Must be set in the same module that renders <Document> (see react-pdf docs).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

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
}

interface PdfViewerProps {
  file: File
  sources: HighlightSource[]
  selectedId: string | null
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
  onMissingSourcesChange,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState<PageInfo[] | null>(null)

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
        const content = await page.getTextContent()
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

  useEffect(() => {
    if (!pages) return
    const missing = new Set([...matches].filter(([, m]) => m === null).map(([id]) => id))
    onMissingSourcesChange(missing)
  }, [matches, pages, onMissingSourcesChange])

  const selectedMatch = selectedId ? matches.get(selectedId) : undefined
  const selectedSource = sources.find((s) => s.id === selectedId)
  const targetPage = selectedMatch?.page ?? selectedSource?.page ?? null

  const scrollToTarget = useCallback(() => {
    const container = containerRef.current
    if (!container || targetPage === null) return
    const target =
      container.querySelector<HTMLElement>(".pdf-hl-active") ??
      container.querySelector<HTMLElement>(`[data-page="${targetPage}"]`)
    if (!target) return
    const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollTo({ top: container.scrollTop + offset - container.clientHeight / 3, behavior: "smooth" })
    // On narrow screens the viewer sits below the list, so bring it into view too.
    container.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [targetPage])

  // Scroll on selection once the target page has rendered (until then its
  // height is a placeholder); a page that renders later finishes the scroll.
  const [renderedPages, setRenderedPages] = useState<ReadonlySet<number>>(new Set())
  const targetRendered = targetPage !== null && renderedPages.has(targetPage)
  useEffect(() => {
    if (targetRendered) scrollToTarget()
  }, [selectedId, targetRendered, scrollToTarget])

  const handlePageRendered = useCallback((page: number) => {
    setRenderedPages((prev) => (prev.has(page) ? prev : new Set(prev).add(page)))
  }, [])

  return (
    <div ref={containerRef} className="h-full overflow-y-auto p-3">
      <Document
        file={file}
        onLoadSuccess={setPdf}
        loading={<ViewerMessage spinner>Loading PDF…</ViewerMessage>}
        error={<ViewerMessage>Couldn&apos;t display this PDF.</ViewerMessage>}
        className="flex flex-col gap-3"
      >
        {pdf &&
          width > 0 &&
          Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((page) => (
            <div
              key={page}
              data-page={page}
              // Exactly the page's size, since highlights are placed in percentages of it.
              className="relative mx-auto w-fit overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-foreground/10"
            >
              <Page
                pageNumber={page}
                width={width - 24}
                renderAnnotationLayer={false}
                onRenderSuccess={() => handlePageRendered(page)}
                loading={<div style={{ width: width - 24, height: (width - 24) * 1.3 }} />}
              />
              <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
                {(boxes.get(page) ?? [])
                  // The selected source goes last so it draws on top.
                  .toSorted((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
                  .flatMap(({ id, boxes }) =>
                    boxes.map((box, i) => (
                      <div
                        key={`${id}-${i}`}
                        data-source={id}
                        className={id === selectedId ? "pdf-hl pdf-hl-active" : "pdf-hl"}
                        style={{
                          left: `${box.left}%`,
                          top: `${box.top}%`,
                          width: `${box.width}%`,
                          height: `${box.height}%`,
                        }}
                      />
                    ))
                  )}
              </div>
            </div>
          ))}
      </Document>
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
