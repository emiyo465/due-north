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
// distinctive, as long as they're close together (otherwise a date from one
// row and a title from another would count as a match).
const MAX_PIECES = 3
const MIN_PIECE_LENGTH = 6
const MAX_ITEM_SPAN = 10

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
  for (let piece = 0; piece < MAX_PIECES && rest; piece++) {
    // Longest prefix of what's left that appears on the page.
    let length = rest.length
    let at = -1
    while (length >= Math.min(MIN_PIECE_LENGTH, rest.length)) {
      at = text.indexOf(rest.slice(0, length))
      if (at !== -1) break
      length--
    }
    if (at === -1) return null
    for (let i = at; i < at + length; i++) matched.add(owner[i])
    rest = rest.slice(length)
  }

  if (rest) return null
  const indices = [...matched].sort((a, b) => a - b)
  return indices.at(-1)! - indices[0] <= MAX_ITEM_SPAN ? indices : null
}
