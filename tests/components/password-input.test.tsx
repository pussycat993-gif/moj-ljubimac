import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { PasswordInput, defaultPasswordInputLabels } from "@/components/app/password-input"
import { Label } from "@/components/ui/label"
import { dictionaries } from "@/lib/i18n"

// PasswordInput (QA Q1): show/hide toggle inside the field, shared by S15, S16 and S28.
describe("PasswordInput", () => {
  it("starts hidden; the toggle shows and hides the password with aria-pressed", async () => {
    const user = userEvent.setup()
    render(
      <>
        <Label htmlFor="pw">Lozinka</Label>
        <PasswordInput id="pw" defaultValue="lunaimaks2026" />
      </>,
    )
    const field = screen.getByLabelText("Lozinka")
    expect(field).toHaveAttribute("type", "password")
    const show = screen.getByRole("button", { name: "Prikaži lozinku" })
    expect(show).toHaveAttribute("aria-pressed", "false")
    expect(show).toHaveAttribute("type", "button")
    expect(show).toHaveAttribute("aria-controls", "pw")

    await user.click(show)
    expect(field).toHaveAttribute("type", "text")
    const hide = screen.getByRole("button", { name: "Sakrij lozinku" })
    expect(hide).toHaveAttribute("aria-pressed", "true")

    await user.click(hide)
    expect(field).toHaveAttribute("type", "password")
    expect(field).toHaveValue("lunaimaks2026")
  })

  it("defaults match the Serbian dictionary; English labels come from the en dictionary", () => {
    expect(defaultPasswordInputLabels).toEqual({
      show: dictionaries.sr.common.showPassword,
      hide: dictionaries.sr.common.hidePassword,
    })
    render(
      <PasswordInput
        aria-label="Password"
        labels={{ show: dictionaries.en.common.showPassword, hide: dictionaries.en.common.hidePassword }}
      />,
    )
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument()
  })

  it("keeps the Input's invalid styling hook and leaves room for the icon button", () => {
    render(<PasswordInput aria-label="Lozinka" aria-invalid />)
    const field = screen.getByLabelText("Lozinka")
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field.className).toContain("aria-invalid:border-destructive")
    expect(field.className).toContain("pr-11")
  })
})
