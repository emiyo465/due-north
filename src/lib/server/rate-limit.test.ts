import { expect, it } from "vitest"
import { checkRateLimit } from "./rate-limit"

it("allows 30 requests an hour per IP, then says how long to wait", () => {
  const start = 1_000_000
  for (let i = 0; i < 30; i++) expect(checkRateLimit("1.1.1.1", start + i)).toBe(0)
  expect(checkRateLimit("1.1.1.1", start + 30)).toBe(3600)
  expect(checkRateLimit("2.2.2.2", start + 30)).toBe(0)
  // The oldest request ages out after an hour.
  expect(checkRateLimit("1.1.1.1", start + 60 * 60 * 1000)).toBe(0)
})
