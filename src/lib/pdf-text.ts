import { pdfjs } from "react-pdf"

// Browser-only (import it dynamically). Reads each page's text with the same
// pdf.js the viewer uses, so quotes the model copies from this text are the
// ones the highlighter can find.

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

export async function readPageTexts(file: File): Promise<string[]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const pages: string[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent()
      const text = content.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("")
      pages.push(text.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim())
    }
    return pages
  } finally {
    await task.destroy()
  }
}
