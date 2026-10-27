"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { LoaderCircle } from "lucide-react"
import { findQuote } from "@/lib/quote-match"
import "react-pdf/dist/Page/TextLayer.css"

// Must be set in the same module that renders <Document> (see react-pdf docs).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

interface SourceMatch {
  page: number
  items: Set<number>
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
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

export default function PdfViewer({
  file,
  sources,
  selectedId,
  onMissingSourcesChange,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageTexts, setPageTexts] = useState<string[][] | null>(null)

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
      Array.from({ length: pdf.numPages }, async (_, i) => {
        const content = await (await pdf.getPage(i + 1)).getTextContent()
        return content.items.map((item) => ("str" in item ? item.str : ""))
      })
    ).then((texts) => {
      if (!cancelled) setPageTexts(texts)
    })
    return () => {
      cancelled = true
    }
  }, [pdf])

  const matches = useMemo(() => {
    const result = new Map<string, SourceMatch | null>()
    if (!pageTexts) return result
    for (const source of sources) {
      if (!source.quote) continue
      // Try the page the extractor reported first, then the rest.
      const order = pageTexts.map((_, i) => i + 1)
      if (source.page) order.sort((a, b) => Number(b === source.page) - Number(a === source.page))
      let match: SourceMatch | null = null
      for (const page of order) {
        const items = findQuote(pageTexts[page - 1], source.quote)
        if (items) {
          match = { page, items: new Set(items) }
          break
        }
      }
      result.set(source.id, match)
    }
    return result
  }, [sources, pageTexts])

  useEffect(() => {
    if (!pageTexts) return
    const missing = new Set([...matches].filter(([, m]) => m === null).map(([id]) => id))
    onMissingSourcesChange(missing)
  }, [matches, pageTexts, onMissingSourcesChange])

  const selectedMatch = selectedId ? matches.get(selectedId) : undefined
  const selectedSource = sources.find((s) => s.id === selectedId)
  const targetPage = selectedMatch?.page ?? selectedSource?.page ?? null

  // Scroll once the target page's text layer (and its highlight) has rendered.
  const pendingScroll = useRef(false)
  useEffect(() => {
    pendingScroll.current = targetPage !== null
  }, [selectedId, targetPage])

  const scrollToTarget = useCallback(() => {
    const container = containerRef.current
    if (!container || targetPage === null) return
    const target =
      container.querySelector<HTMLElement>("mark.pdf-hl-active") ??
      container.querySelector<HTMLElement>(`[data-page="${targetPage}"]`)
    if (!target) return
    const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollTo({ top: container.scrollTop + offset - container.clientHeight / 3, behavior: "smooth" })
    // On narrow screens the viewer sits below the list, so bring it into view too.
    container.scrollIntoView({ block: "nearest", behavior: "smooth" })
    pendingScroll.current = false
  }, [targetPage])

  // Pages without a quote match still need a scroll (e.g. the quote wasn't found).
  useEffect(() => {
    if (pendingScroll.current && targetPage !== null && !selectedMatch) scrollToTarget()
  }, [targetPage, selectedMatch, scrollToTarget])

  function textRendererFor(page: number) {
    return ({ str, itemIndex }: { str: string; itemIndex: number }) => {
      const text = escapeHtml(str)
      if (selectedMatch?.page === page && selectedMatch.items.has(itemIndex)) {
        return `<mark class="pdf-hl pdf-hl-active">${text}</mark>`
      }
      for (const match of matches.values()) {
        if (match?.page === page && match.items.has(itemIndex)) {
          return `<mark class="pdf-hl">${text}</mark>`
        }
      }
      return text
    }
  }

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
              className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-foreground/10"
            >
              <Page
                pageNumber={page}
                width={width - 24}
                renderAnnotationLayer={false}
                customTextRenderer={textRendererFor(page)}
                onRenderTextLayerSuccess={() => {
                  if (pendingScroll.current && page === targetPage) scrollToTarget()
                }}
                loading={<div style={{ height: (width - 24) * 1.3 }} />}
              />
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
