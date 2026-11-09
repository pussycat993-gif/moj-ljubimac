import { useRef, useState, type FormEvent } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { focusFirstInvalid, useFocusFirstInvalid } from "@/lib/forms/focus-first-invalid"

// Shared form pattern (QA Q1): after an invalid submit the first invalid field (DOM order)
// is scrolled into view and focused.

function spyScroll() {
  Element.prototype.scrollIntoView ??= () => {}
  const scrolled: Element[] = []
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
    scrolled.push(this)
  })
  return scrolled
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

describe("focusFirstInvalid", () => {
  it("focuses and scrolls the first aria-invalid field in DOM order", () => {
    const scrolled = spyScroll()
    document.body.innerHTML = `
      <form>
        <input id="a" />
        <input id="b" aria-invalid="true" />
        <input id="c" aria-invalid="true" />
      </form>`
    const target = focusFirstInvalid(document.querySelector("form"))
    expect(target?.id).toBe("b")
    expect(document.activeElement?.id).toBe("b")
    expect(scrolled.map((e) => e.id)).toEqual(["b"])
  })

  it("an invalid group that is not focusable hands focus to its tab stop", () => {
    spyScroll()
    document.body.innerHTML = `
      <form>
        <div role="radiogroup" aria-invalid="true">
          <button type="button" role="radio" tabindex="-1" id="r1"></button>
          <button type="button" role="radio" tabindex="0" id="r2"></button>
        </div>
      </form>`
    focusFirstInvalid(document.querySelector("form"))
    expect(document.activeElement?.id).toBe("r2")
  })

  it("aria-invalid=false and fields outside the root are ignored; nothing invalid → null", () => {
    spyScroll()
    document.body.innerHTML = `
      <input id="outside" aria-invalid="true" />
      <form><input id="ok" aria-invalid="false" /></form>`
    expect(focusFirstInvalid(document.querySelector("form"))).toBeNull()
    expect(document.activeElement).toBe(document.body)
    expect(focusFirstInvalid(null)).toBeNull()
  })
})

function Demo() {
  const ref = useRef<HTMLFormElement>(null)
  const focusInvalid = useFocusFirstInvalid(ref)
  const [errors, setErrors] = useState<{ name?: string; city?: string }>({})
  function submit(ev: FormEvent) {
    ev.preventDefault()
    setErrors({ city: "Izaberi grad." })
    focusInvalid()
  }
  return (
    <form ref={ref} noValidate onSubmit={submit}>
      <label htmlFor="name">Ime</label>
      <input id="name" aria-invalid={!!errors.name} />
      <label htmlFor="city">Grad</label>
      <input id="city" aria-invalid={!!errors.city} />
      {errors.city && <p>{errors.city}</p>}
      <button type="submit">Sačuvaj</button>
    </form>
  )
}

describe("useFocusFirstInvalid", () => {
  it("focuses the field once React has rendered the new errors", async () => {
    const scrolled = spyScroll()
    const user = userEvent.setup()
    render(<Demo />)
    await user.click(screen.getByRole("button", { name: "Sačuvaj" }))
    const city = screen.getByLabelText("Grad")
    expect(screen.getByText("Izaberi grad.")).toBeInTheDocument()
    await waitFor(() => expect(city).toHaveFocus())
    expect(scrolled).toContain(city)
  })
})
