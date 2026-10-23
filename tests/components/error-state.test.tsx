import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ErrorState, defaultErrorStateLabels } from "@/components/app/error-state"
import { dictionaries } from "@/lib/i18n"

// ErrorState (Design §8) with the optional `labels` prop (owner decision, Step 13, FR-35).
describe("ErrorState", () => {
  it("defaults to the mockup's Serbian copy", () => {
    render(<ErrorState />)
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    expect(screen.getByRole("button", { name: "Pokušaj ponovo" })).toBeInTheDocument()
    expect(defaultErrorStateLabels.retry).toBe(dictionaries.sr.common.retry)
  })

  it("takes the dictionary's button text and calls onRetry", async () => {
    const onRetry = vi.fn()
    render(<ErrorState message={dictionaries.en.common.error} labels={{ retry: dictionaries.en.common.retry }} onRetry={onRetry} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Try again.")
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
