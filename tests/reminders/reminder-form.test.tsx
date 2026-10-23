import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S11 Novi / izmeni podsetnik (FR-21, BR-18): create sends the Belgrade date + time as UTC (EP-27), the edit
// variant is prefilled from EP-27 get and sends only what changed, "Obriši podsetnik" opens the AlertDialog
// and deletes (future occurrences go, history stays — supabase/tests/manual_reminders.test.sql), and the
// field codes required / too_long / in_past / pet_memorial show inline; anything else → the X error state.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const createManualReminder = vi.fn()
const updateManualReminder = vi.fn()
const deleteManualReminder = vi.fn()
vi.mock("@/lib/actions/reminders", () => ({
  createManualReminder: (...a: unknown[]) => createManualReminder(...a),
  updateManualReminder: (...a: unknown[]) => updateManualReminder(...a),
  deleteManualReminder: (...a: unknown[]) => deleteManualReminder(...a),
}))

const { ReminderFormClient, belgradeToUtc } = await import("@/app/(app)/podsetnici/novi/reminder-form-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en") => ({
  reminderForm: dictionaries[locale].reminderForm,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

const pets = [
  { id: "c1", name: "Luna", sex: "female", species: "cat" },
  { id: "c2", name: "Maks", sex: "male", species: "dog" },
] as const

const existing = {
  id: "rem-1",
  user_id: "u1",
  pet_id: "c2",
  type: "manual" as const,
  title: "Šišanje u salonu „Čupko”",
  starts_at: "2026-11-08T10:00:00Z", // 11:00 Belgrade (CET)
  recurrence: "monthly" as const,
  active: true,
  next_due_at: "2026-11-08T10:00:00Z",
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-01T08:00:00Z",
}

beforeAll(() => {
  // Only Date is faked: 19 Oct 2026, 10:00 in Belgrade.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-19T08:00:00Z"))
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  vi.clearAllMocks()
})

async function pickDay(user: ReturnType<typeof userEvent.setup>, day: string) {
  await user.click(screen.getByRole("button", { name: /^Datum/ }))
  const popover = await screen.findByRole("dialog")
  const cell = popover.querySelector<HTMLElement>(`[data-day="${day}"] button`)
  if (!cell) throw new Error(`no calendar day ${day}`)
  await user.click(cell)
}

describe("Belgrade → UTC (NFR-02)", () => {
  it("converts on both sides of the October DST change", () => {
    expect(belgradeToUtc(new Date(2026, 9, 24), "09:00")).toBe("2026-10-24T07:00:00.000Z")
    expect(belgradeToUtc(new Date(2026, 9, 26), "09:00")).toBe("2026-10-26T08:00:00.000Z")
  })
})

describe("S11 — create (EP-27)", () => {
  it("sends title, pet, starts_at in UTC and recurrence; toasts and returns to S10", async () => {
    createManualReminder.mockResolvedValue({ ok: true, data: { ...existing, id: "rem-new" } })
    render(<ReminderFormClient pets={[...pets]} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    expect(screen.getByRole("heading", { level: 1, name: "Novi podsetnik" })).toBeInTheDocument()
    expect(screen.getByText("Vidiš ga samo ti, nije vezan za ljubimca.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "podešavanjima podsetnika" })).toHaveAttribute("href", "/podesavanja/podsetnici")

    await user.type(screen.getByLabelText("Naslov *"), "Kupi hranu")
    await pickDay(user, "2026-10-26")
    await user.click(screen.getByRole("combobox", { name: "Ponavljanje" }))
    await user.click(await screen.findByRole("option", { name: "Svakog meseca" }))
    expect(screen.getByText("Sledeći put stiže tačno mesec dana kasnije.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sačuvaj podsetnik" }))

    expect(createManualReminder).toHaveBeenCalledWith({
      title: "Kupi hranu",
      pet_id: null,
      recurrence: "monthly",
      starts_at: "2026-10-26T08:00:00.000Z",
    })
    expect(toast).toHaveBeenCalledWith("Podsetnik „Kupi hranu“ je sačuvan za 26. 10. 2026. u 09:00.")
    expect(push).toHaveBeenCalledWith("/podsetnici")
  })

  it("a pet from the picker is linked and named in the hint", async () => {
    createManualReminder.mockResolvedValue({ ok: true, data: existing })
    render(<ReminderFormClient pets={[...pets]} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Za koga" }))
    await user.click(await screen.findByRole("option", { name: "Luna" }))
    expect(screen.getByText("Podsetnik će se videti i u kartonu: Luna.")).toBeInTheDocument()
    await user.type(screen.getByLabelText("Naslov *"), "Šišanje")
    await pickDay(user, "2026-10-26")
    await user.click(screen.getByRole("button", { name: "Sačuvaj podsetnik" }))
    expect(createManualReminder).toHaveBeenCalledWith(expect.objectContaining({ pet_id: "c1" }))
  })
})

describe("S11 — inline field errors", () => {
  it("required: title and date, without calling EP-27", async () => {
    render(<ReminderFormClient pets={[...pets]} locale="sr" copy={copy("sr")} />)
    await userEvent.setup().click(screen.getByRole("button", { name: "Sačuvaj podsetnik" }))
    expect(screen.getByText("Upiši naslov podsetnika.")).toBeInTheDocument()
    expect(screen.getByText("Izaberi datum.")).toBeInTheDocument()
    expect(screen.getByLabelText("Naslov *")).toHaveAttribute("aria-invalid", "true")
    expect(createManualReminder).not.toHaveBeenCalled()
  })

  it("too_long: more than 80 characters", async () => {
    render(<ReminderFormClient pets={[...pets]} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naslov *"), "a".repeat(81))
    await user.click(screen.getByRole("button", { name: "Sačuvaj podsetnik" }))
    expect(screen.getByText("Naslov može imati najviše 80 znakova.")).toBeInTheDocument()
    expect(createManualReminder).not.toHaveBeenCalled()
  })

  it("in_past: today at a time already passed is caught before sending", async () => {
    render(<ReminderFormClient pets={[...pets]} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naslov *"), "Kupi hranu")
    await pickDay(user, "2026-10-19")
    await user.click(screen.getByRole("button", { name: "Sačuvaj podsetnik" }))
    expect(screen.getByText("Izaberi datum i vreme u budućnosti.")).toBeInTheDocument()
    expect(createManualReminder).not.toHaveBeenCalled()
  })

  it("server field codes show inline: in_past, too_long, pet_memorial", async () => {
    createManualReminder.mockResolvedValue({
      ok: false,
      error: { code: "validation_failed", message: "", fields: { starts_at: "in_past", title: "too_long", pet_id: "pet_memorial" } },
    })
    render(<ReminderFormClient pets={[...pets]} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naslov *"), "Kupi hranu")
    await pickDay(user, "2026-10-26")
    await user.click(screen.getByRole("button", { name: "Sačuvaj podsetnik" }))
    expect(screen.getByText("Izaberi datum i vreme u budućnosti.")).toBeInTheDocument()
    expect(screen.getByText("Naslov može imati najviše 80 znakova.")).toBeInTheDocument()
    expect(screen.getByText("Ovaj ljubimac je u Uspomenama.")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it("any other failure → the X error state", async () => {
    createManualReminder.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "" } })
    render(<ReminderFormClient pets={[...pets]} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naslov *"), "Kupi hranu")
    await pickDay(user, "2026-10-26")
    await user.click(screen.getByRole("button", { name: "Sačuvaj podsetnik" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Podsetnik nije sačuvan. Nešto nije u redu, pokušaj ponovo.")
  })
})

describe("S11 — edit variant (/podsetnici/[id])", () => {
  it("is prefilled from EP-27 get", () => {
    render(<ReminderFormClient pets={[...pets]} reminder={existing} locale="sr" copy={copy("sr")} />)
    expect(screen.getByRole("heading", { level: 1, name: "Izmeni podsetnik" })).toBeInTheDocument()
    expect(screen.getByLabelText("Naslov *")).toHaveValue("Šišanje u salonu „Čupko”")
    expect(screen.getByRole("combobox", { name: "Za koga" })).toHaveTextContent("Maks")
    expect(screen.getByRole("button", { name: /^Datum/ })).toHaveTextContent("8. 11. 2026.")
    expect(screen.getByLabelText("Vreme *")).toHaveValue("11:00")
    expect(screen.getByRole("combobox", { name: "Ponavljanje" })).toHaveTextContent("Svakog meseca")
  })

  it("saves only the changed fields (starts_at untouched) and toasts the saved time", async () => {
    updateManualReminder.mockResolvedValue({ ok: true, data: existing })
    render(<ReminderFormClient pets={[...pets]} reminder={existing} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    const title = screen.getByLabelText("Naslov *")
    await user.clear(title)
    await user.type(title, "Šišanje u Čupku")
    await user.click(screen.getByRole("button", { name: "Sačuvaj izmene" }))
    expect(updateManualReminder).toHaveBeenCalledWith("rem-1", { title: "Šišanje u Čupku", pet_id: "c2", recurrence: "monthly" })
    expect(toast).toHaveBeenCalledWith("Izmene su sačuvane za 8. 11. 2026. u 11:00.")
    expect(push).toHaveBeenCalledWith("/podsetnici")
  })

  it("'Obriši podsetnik' asks in an AlertDialog, then deletes and returns to S10", async () => {
    deleteManualReminder.mockResolvedValue({ ok: true, data: { id: "rem-1" } })
    render(<ReminderFormClient pets={[...pets]} reminder={existing} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Obriši podsetnik" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("Obrisati podsetnik „Šišanje u salonu „Čupko”“?")
    expect(dialog).toHaveTextContent("Sledeća ponavljanja više neće stizati. Ono što je već urađeno ostaje u istoriji.")
    await user.click(screen.getByRole("button", { name: "Da, obriši" }))
    expect(deleteManualReminder).toHaveBeenCalledWith("rem-1")
    expect(toast).toHaveBeenCalledWith(
      "Podsetnik „Šišanje u salonu „Čupko”“ je obrisan. Sledeća ponavljanja su otkazana, a prošla istorija ostaje.",
    )
    expect(push).toHaveBeenCalledWith("/podsetnici")
  })

  it("the create variant has no delete button; English copy comes from en", () => {
    render(<ReminderFormClient pets={[...pets]} locale="en" copy={copy("en")} />)
    expect(screen.queryByRole("button", { name: "Delete reminder" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "New reminder" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save reminder" })).toBeInTheDocument()
  })
})
