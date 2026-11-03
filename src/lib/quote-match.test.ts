import { describe, expect, it } from "vitest"
import { findQuote, type QuoteSpan } from "./quote-match"

// The highlighted text, joined across items.
function highlighted(items: string[], spans: QuoteSpan[] | null) {
  return spans?.map((s) => items[s.item].slice(s.start, s.end)).join("|") ?? null
}

// Shaped like pdf.js output for CS340 page 1: a grading table, then the
// assessment calendar, with spacer items between columns.
const cs340 = [
  "Project 1: Requirements Spec & UML Models (individual)", " ", "10%",
  "Project 2: Design Patterns Implementation (individual)", " ", "12%",
  "Due Date", " ", "Assessment", " ", "Type",
  "Thu, Sep 17", " ", "Quiz 1: Requirements & UML", " ", "Quiz", " ", "In class, 1:30 PM",
  "Fri, Sep 25", " ", "Project 1: Requirements Spec & UML Models", " ", "Project",
]

describe("findQuote", () => {
  it("highlights only the quoted part of an item", () => {
    const items = ["Office Hours", " ", "Tuesdays 3:00–4:30 PM and Fridays 10:00–11:00 AM, Room 2.18"]
    const spans = findQuote(items, "Office Hours Tuesdays 3:00-4:30 PM")
    expect(highlighted(items, spans)).toBe("Office Hours|Tuesdays 3:00–4:30 PM")
  })

  it("ignores case, whitespace, and quote/dash variants", () => {
    const items = ["Midterm  Exam — “Chapters 1–4”"]
    expect(highlighted(items, findQuote(items, 'midterm exam - "chapters 1-4"'))).toBe(items[0])
  })

  it("matches across items that split a row", () => {
    const spans = findQuote(cs340, "Thu, Sep 17 Quiz 1: Requirements & UML")
    expect(highlighted(cs340, spans)).toBe("Thu, Sep 17|Quiz 1: Requirements & UML")
  })

  it("prefers the dated row over an earlier mention of the title", () => {
    const spans = findQuote(cs340, "Fri, Sep 25 Project 1: Requirements Spec & UML Models")
    expect(spans?.map((s) => s.item)).toEqual([18, 20])
  })

  it("takes the first occurrence when the quote appears whole more than once", () => {
    const spans = findQuote(cs340, "Project 1: Requirements Spec & UML Models")
    expect(spans).toEqual([{ item: 0, start: 0, end: 41 }])
  })

  it("prefers an unbroken match over a split one", () => {
    // Earlier on the page, the date and title sit in different columns.
    const items = ["Fri, Oct 16", " ", "Lab", " ", "Project 2: Design Patterns", "Fri, Oct 16 Project 2: Design Patterns"]
    const spans = findQuote(items, "Fri, Oct 16 Project 2: Design Patterns")
    expect(spans).toEqual([{ item: 5, start: 0, end: items[5].length }])
  })

  it("handles layouts that make every word its own item", () => {
    const words = "Week 5 Fri Oct 9 Homework 3 due on Canvas".split(" ")
    const items = words.flatMap((w) => [w, " "])
    expect(highlighted(items, findQuote(items, "Fri Oct 9 Homework 3"))).toBe("Fri|Oct|9|Homework|3")
  })

  it("rejects a date and title from rows too far apart", () => {
    const filler = "Reading: chapter four of the course text and the posted lecture notes"
    const items = ["Mon, Nov 2", " ", filler, " ", filler, " ", "Paper 2: Argument Essay"]
    expect(findQuote(items, "Mon, Nov 2 Paper 2: Argument Essay")).toBeNull()
  })

  it("returns null when the quote isn't on the page", () => {
    expect(findQuote(cs340, "Final Exam: Wed, Dec 9")).toBeNull()
    expect(findQuote(cs340, "   ")).toBeNull()
  })
})
