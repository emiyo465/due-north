// Locates an event's source_quote among a page's pdf.js text items so the
// viewer can highlight it. Matching ignores case, whitespace, and quote/dash
// variants, since pdf.js splits and spaces text differently from the model.

/** Part of one text item that the quote covers: `str.slice(start, end)`. */
export interface QuoteSpan {
  item: number
  start: number
  end: number
}

function normalizeChar(char: string) {
  return char
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, "")
}

function normalize(text: string) {
  return [...text].map(normalizeChar).join("")
}

// Table rows can come out with columns interleaved, so a quote may be split
// across non-adjacent items. Allow a few pieces, each long enough to be
// distinctive, in order and close together (otherwise a date from one row and
// a title from another would count as a match). The gap is measured in
// characters, not items: monospace layouts make every word its own item.
const MAX_PIECES = 3
const MIN_PIECE_LENGTH = 6
const MAX_GAP_CHARS = 60

interface Piece {
  at: number
  length: number
}

/**
 * Matches the quote greedily, with the first piece starting at or after
 * `from`: each piece is the longest prefix of what's left that appears soon
 * enough after the previous one. Returns the pieces (null if the rest of the
 * quote didn't follow) and where the first piece started (-1 if nowhere).
 */
function matchFrom(text: string, target: string, from: number) {
  const pieces: Piece[] = []
  const fail = () => ({ pieces: null, start: pieces[0]?.at ?? -1 })
  let rest = target
  let prevEnd = -1
  while (rest) {
    if (pieces.length === MAX_PIECES) return fail()
    let length = rest.length
    let at = -1
    while (length >= Math.min(MIN_PIECE_LENGTH, rest.length)) {
      at = text.indexOf(rest.slice(0, length), prevEnd === -1 ? from : prevEnd)
      if (at !== -1 && (prevEnd === -1 || at - prevEnd <= MAX_GAP_CHARS)) break
      at = -1
      length--
    }
    if (at === -1) return fail()
    pieces.push({ at, length })
    prevEnd = at + length
    rest = rest.slice(length)
  }
  return { pieces, start: pieces[0].at }
}

// Lower is better: an unbroken match beats a split one, then tighter beats looser.
function cost(pieces: Piece[]) {
  const last = pieces[pieces.length - 1]
  const spread = last.at + last.length - pieces[0].at
  return pieces.length * 1000 + spread
}

/** Returns the parts of items that contain the quote, or null if it isn't on the page. */
export function findQuote(items: string[], quote: string): QuoteSpan[] | null {
  const target = normalize(quote)
  if (!target) return null

  // owner[i] = which item, and where in it, text[i] came from.
  let text = ""
  const owner: { item: number; offset: number; length: number }[] = []
  items.forEach((str, item) => {
    let offset = 0
    for (const char of str) {
      const part = normalizeChar(char)
      text += part
      for (let i = 0; i < part.length; i++) owner.push({ item, offset, length: char.length })
      offset += char.length
    }
  })

  // The same text can appear more than once (an assessment table and a weekly
  // schedule), so try every place the quote could start and keep the best.
  let best: Piece[] | null = null
  for (let from = 0; from < text.length; ) {
    const { pieces, start } = matchFrom(text, target, from)
    if (start === -1) break
    if (pieces && (!best || cost(pieces) < cost(best))) best = pieces
    if (best?.length === 1) break // unbroken; ties go to the first occurrence
    from = start + 1
  }
  if (!best) return null

  const spans: QuoteSpan[] = []
  for (const { at, length } of best) {
    for (let i = at; i < at + length; i++) {
      const { item, offset, length: charLength } = owner[i]
      const last = spans[spans.length - 1]
      // Join runs in the same item that only whitespace separates.
      if (last && last.item === item && !items[item].slice(last.end, offset).trim()) {
        last.end = Math.max(last.end, offset + charLength)
      } else {
        spans.push({ item, start: offset, end: offset + charLength })
      }
    }
  }
  return spans
}
