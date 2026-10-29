// Locates an event's source_quote among a page's pdf.js text items so the
// viewer can highlight it. Matching ignores case, whitespace, and quote/dash
// variants, since pdf.js splits and spaces text differently from the model.

function normalize(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, "")
}

// Table rows can come out with columns interleaved, so a quote may be split
// across non-adjacent items. Allow a few pieces, each long enough to be
// distinctive, in order and close together (otherwise a date from one row and
// a title from another would count as a match). The gap is measured in
// characters, not items: monospace layouts make every word its own item.
const MAX_PIECES = 3
const MIN_PIECE_LENGTH = 6
const MAX_GAP_CHARS = 60

/** Returns the indices of the items that contain the quote, or null if it isn't on the page. */
export function findQuote(items: string[], quote: string): number[] | null {
  const target = normalize(quote)
  if (!target) return null

  let text = ""
  const owner: number[] = [] // owner[i] = index of the item that text[i] came from
  items.forEach((item, index) => {
    const part = normalize(item)
    text += part
    for (let i = 0; i < part.length; i++) owner.push(index)
  })

  const matched = new Set<number>()
  let rest = target
  let prevEnd = -1
  for (let piece = 0; piece < MAX_PIECES && rest; piece++) {
    // Longest prefix of what's left that appears on the page (after the
    // previous piece, and not too far after it).
    let length = rest.length
    let at = -1
    while (length >= Math.min(MIN_PIECE_LENGTH, rest.length)) {
      at = text.indexOf(rest.slice(0, length), prevEnd === -1 ? 0 : prevEnd)
      if (at !== -1 && (prevEnd === -1 || at - prevEnd <= MAX_GAP_CHARS)) break
      at = -1
      length--
    }
    if (at === -1) return null
    for (let i = at; i < at + length; i++) matched.add(owner[i])
    prevEnd = at + length
    rest = rest.slice(length)
  }

  return rest ? null : [...matched].sort((a, b) => a - b)
}
