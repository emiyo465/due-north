// pdf.js reads page text with `for await` over a ReadableStream, and Safari's
// streams can't be iterated that way. Without this, getTextContent fails there.
// Import it anywhere pdf.js runs in the browser.

type IterableStream = ReadableStream & { [Symbol.asyncIterator]?: () => AsyncGenerator<unknown> }

if (typeof ReadableStream !== "undefined") {
  const proto = ReadableStream.prototype as IterableStream
  proto[Symbol.asyncIterator] ??= async function* (this: ReadableStream) {
    const reader = this.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}
