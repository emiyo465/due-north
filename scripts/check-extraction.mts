// Scores real extraction against the hand-labeled answer key.
//   npm run check:extract            (all syllabi in private/testing/)
//   npm run check:extract -- PHYS341 (one syllabus, by file-name prefix)
// Spends API credits: about $0.002 per syllabus on claude-haiku-5-5.
// Uses EXTRACT_MODEL / EXTRACT_EFFORT from .env.local like the app does.

import Anthropic from "@anthropic-ai/sdk"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { readFileSync } from "node:fs"
import { extractSyllabus } from "../src/lib/server/extract-syllabus.ts"
import { findQuote } from "../src/lib/quote-match.ts"
import type { CourseFieldKey } from "../src/lib/types.ts"

interface AnswerKey {
  term: { start_date: string }
  syllabi: {
    file: string
    course: Record<CourseFieldKey, string | null>
    events: { title: string; type: string; due_date: string | null; time: string | null }[]
    non_deadlines: { date: string; reason: string }[]
  }[]
}

const only = process.argv[2]
const key: AnswerKey = JSON.parse(readFileSync("private/syllabi-answer-key.json", "utf8"))
const client = new Anthropic({ timeout: 110_000, maxRetries: 0 })
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
let totalIn = 0, totalOut = 0

for (const syl of key.syllabi.filter((s) => !only || s.file.startsWith(only))) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync("private/testing/" + syl.file)), verbosity: 0 }).promise
  const items: string[][] = [], pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const c = await (await pdf.getPage(n)).getTextContent()
    items.push(c.items.map((i) => ("str" in i ? i.str : "")))
    // Same text the browser sends (src/lib/pdf-text.ts).
    pages.push(c.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim())
  }
  const t0 = Date.now()
  const r = await extractSyllabus(client, { fileName: syl.file, termStart: key.term.start_date, pages })
  totalIn += r.usage.input_tokens; totalOut += r.usage.output_tokens
  console.log(`\n=== ${syl.file}  (${((Date.now() - t0) / 1000).toFixed(1)} s, ${r.usage.input_tokens} in / ${r.usage.output_tokens} out, ${r.model})`)

  // Course fields
  for (const [k, want] of Object.entries(syl.course) as [CourseFieldKey, string | null][]) {
    const got = r.course[k]
    const quoteFound = got ? !!findQuote(items[got.page - 1] ?? [], got.source_quote) : null
    const same = norm(got?.value ?? "") === norm(want ?? "")
    console.log(`  course.${k.padEnd(16)} ${same ? "same " : "DIFF "} got=${JSON.stringify(got?.value ?? null)}${same ? "" : `  want=${JSON.stringify(want)}`}  quote ${quoteFound === null ? "-" : quoteFound ? "found" : "NOT FOUND"}`)
  }

  // Events: match by date, then by title words.
  const used = new Set<number>()
  let hit = 0, timeOk = 0, typeOk = 0
  for (const want of syl.events) {
    const wantWords = norm(want.title).split(" ").filter((w: string) => w.length > 1)
    let best = -1, bestScore = 0
    r.events.forEach((e, i) => {
      if (used.has(i) || e.due_date !== want.due_date) return
      const words = new Set(norm(e.title).split(" "))
      const score = wantWords.filter((w: string) => words.has(w)).length / Math.max(1, wantWords.length)
      if (score > bestScore) { best = i; bestScore = score }
    })
    if (best >= 0 && bestScore >= 0.3) {
      used.add(best); hit++
      const e = r.events[best]
      if (e.time === want.time) timeOk++
      if (e.type === want.type) typeOk++
      const q = !!findQuote(items[e.page - 1] ?? [], e.source_quote)
      const notes = [e.time !== want.time && `time ${e.time} vs ${want.time}`, e.type !== want.type && `type ${e.type} vs ${want.type}`, !q && "QUOTE NOT FOUND", e.confidence !== "high" && `conf ${e.confidence}`].filter(Boolean)
      console.log(`  ok    ${want.due_date ?? "no date"}  ${want.title}${notes.length ? "  [" + notes.join("; ") + "]" : ""}`)
      if (!q) console.log(`          quote p${e.page}: ${JSON.stringify(e.source_quote)}`)
    } else {
      console.log(`  MISS  ${want.due_date ?? "no date"}  ${want.title}`)
    }
  }
  const extra = r.events.filter((_, i) => !used.has(i))
  for (const e of extra) {
    const nd = syl.non_deadlines.find((n) => n.date === e.due_date)
    console.log(`  EXTRA ${e.due_date ?? "no date"}  ${e.title}${nd ? "  (answer key: non-deadline, " + nd.reason + ")" : ""}`)
  }
  const quotesFound = r.events.filter((e) => findQuote(items[e.page - 1] ?? [], e.source_quote)).length
  console.log(`  recall ${hit}/${syl.events.length} · precision ${hit}/${r.events.length} · time ${timeOk}/${hit} · type ${typeOk}/${hit} · quotes found ${quotesFound}/${r.events.length}`)
}
console.log(`\nTotal ${totalIn} in / ${totalOut} out tokens ≈ $${(totalIn * 0.1e-6 + totalOut * 0.5e-6).toFixed(4)} at Haiku 5.5 prices`)
