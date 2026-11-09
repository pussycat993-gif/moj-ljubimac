import { render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Calendar } from "@/components/ui/calendar"

// Step FX — Step 32 defect D-07 (c), FR-35: the date picker's screen-reader names were English
// ("Go to the Previous Month", "Today, Monday, October 19th, 2026, selected") in the Serbian UI.
// The Calendar now follows the page language (<html lang>, set from the user's locale) or an explicit
// `lang`, with the informal Serbian voice of Design §9 for the navigation labels.

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 19, 10, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
afterEach(() => {
  document.documentElement.lang = ""
})

const today = new Date(2026, 9, 19)

describe("Calendar labels follow the UI language", () => {
  it("Serbian page (<html lang=sr-Latn>): Serbian navigation and day names", () => {
    document.documentElement.lang = "sr-Latn"
    render(<Calendar mode="single" selected={today} />)
    expect(screen.getByRole("button", { name: "Idi na prethodni mesec" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Idi na sledeći mesec" })).toBeInTheDocument()
    const day = screen.getByRole("button", { name: /^Danas, .*19\. oktobar 2026\..*izabrano$/ })
    expect(day).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Go to the/ })).not.toBeInTheDocument()
  })

  it("no lang at all defaults to Serbian (the app default locale)", () => {
    render(<Calendar mode="single" />)
    expect(screen.getByRole("button", { name: "Idi na sledeći mesec" })).toBeInTheDocument()
  })

  it("English page (<html lang=en>): English labels", () => {
    document.documentElement.lang = "en"
    render(<Calendar mode="single" selected={today} />)
    expect(screen.getByRole("button", { name: "Go to the Previous Month" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Today, .*19 October 2026, selected$/ })).toBeInTheDocument()
  })

  it("an explicit lang wins over the page language", () => {
    document.documentElement.lang = "sr-Latn"
    render(<Calendar mode="single" lang="en" />)
    expect(screen.getByRole("button", { name: "Go to the Next Month" })).toBeInTheDocument()
  })
})
