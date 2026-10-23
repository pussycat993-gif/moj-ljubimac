import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S04 Nova vakcina (FR-05): sends next_due_on (the trigger then creates the reminder — FR-20, covered
// in supabase/tests/vaccination_reminder_sync.test.sql), shows the "Napravićemo podsetnik." helper and
// returns to S03 with the toast. Also the edit route (owner decision, Step 14) and the EP-09 action rules.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const createVaccination = vi.fn()
const updateVaccination = vi.fn()
vi.mock("@/lib/actions/vaccinations", () => ({
  createVaccination: (...a: unknown[]) => createVaccination(...a),
  updateVaccination: (...a: unknown[]) => updateVaccination(...a),
}))

const supabase = { current: null as unknown }
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }))

const { VaccinationFormClient } = await import("@/app/(app)/ljubimci/[id]/vakcine/nova/vaccination-form-client")
const { dictionaries } = await import("@/lib/i18n")
const actions = await vi.importActual<typeof import("@/lib/actions/vaccinations")>("@/lib/actions/vaccinations")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const IVANA = "a1000000-0000-4000-8000-000000000001"

const copy = (locale: "sr" | "en") => ({
  vaccinationForm: dictionaries[locale].vaccinationForm,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

const luna = {
  id: LUNA,
  name: "Luna",
  sex: "female",
  species: "cat",
  species_other: null,
  breed: "Britanska kratkodlaka",
  vet_name: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
} as const

const saved = {
  id: "v-new",
  pet_id: LUNA,
  name: "Besnilo — Rabisin",
  given_on: "2026-10-19",
  next_due_on: "2026-10-26",
  days_until_due: 7,
  clinic: luna.vet_name,
  batch_number: null,
  note: null,
  created_by: IVANA,
  created_at: "2026-10-19T08:00:00Z",
  updated_at: "2026-10-19T08:00:00Z",
}

beforeAll(() => {
  // Only Date is faked (19 Oct 2026), so the calendar opens on October 2026 and userEvent keeps real timers.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 19, 10, 0))
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

/** Opens the field's calendar and clicks the day (`YYYY-MM-DD`, react-day-picker `data-day`). */
async function pickDay(user: ReturnType<typeof userEvent.setup>, fieldLabel: string, day: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(`^${fieldLabel}`) }))
  const popover = await screen.findByRole("dialog")
  const cell = popover.querySelector<HTMLElement>(`[data-day="${day}"] button`)
  if (!cell) throw new Error(`no calendar day ${day}`)
  await user.click(cell)
}

describe("S04 — new vaccination", () => {
  it("shows the pet header, the prefilled clinic and the reminder helper", () => {
    render(<VaccinationFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    expect(screen.getByRole("heading", { level: 1, name: "Nova vakcina" })).toBeInTheDocument()
    expect(screen.getByText("Luna · Mačka · Britanska kratkodlaka")).toBeInTheDocument()
    expect(screen.getByLabelText("Veterinar ili ambulanta")).toHaveValue("Veterinarska ambulanta „Dr Vet”, Novi Sad")
    expect(screen.getByText("Napravićemo podsetnik.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Datum sledeće doze/ })).toHaveAccessibleDescription("Napravićemo podsetnik.")
    expect(screen.getByRole("button", { name: /^Datum davanja/ })).toHaveTextContent("19. 10. 2026.")
    expect(screen.getByRole("link", { name: "Nazad na karton" })).toHaveAttribute("href", `/ljubimci/${LUNA}`)
  })

  it("FR-05: sends next_due_on, toasts the reminder date and returns to S03", async () => {
    createVaccination.mockResolvedValue({ ok: true, data: saved })
    render(<VaccinationFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv ili vrsta vakcine *"), "Besnilo — Rabisin")
    await pickDay(user, "Datum sledeće doze", "2026-10-26")
    expect(screen.getByRole("button", { name: /^Datum sledeće doze/ })).toHaveTextContent("26. 10. 2026.")
    await user.type(screen.getByLabelText("Serijski broj"), "RB-26-1019")
    await user.click(screen.getByRole("button", { name: "Sačuvaj vakcinu" }))

    expect(createVaccination).toHaveBeenCalledWith({
      pet_id: LUNA,
      name: "Besnilo — Rabisin",
      given_on: "2026-10-19",
      next_due_on: "2026-10-26",
      clinic: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
      batch_number: "RB-26-1019",
      note: null,
    })
    expect(toast).toHaveBeenCalledWith("Vakcina sačuvana. Podsetićemo te 26. 10. 2026. na sledeću dozu.")
    expect(push).toHaveBeenCalledWith(`/ljubimci/${LUNA}`)
  })

  it("without a next dose sends null and toasts the short confirmation", async () => {
    createVaccination.mockResolvedValue({ ok: true, data: { ...saved, next_due_on: null } })
    render(<VaccinationFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv ili vrsta vakcine *"), "Leukoza")
    await user.click(screen.getByRole("button", { name: "Sačuvaj vakcinu" }))
    expect(createVaccination).toHaveBeenCalledWith(expect.objectContaining({ next_due_on: null }))
    expect(toast).toHaveBeenCalledWith("Vakcina sačuvana.")
  })

  it("validates the name on submit without calling EP-09", async () => {
    render(<VaccinationFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    await userEvent.setup().click(screen.getByRole("button", { name: "Sačuvaj vakcinu" }))
    expect(screen.getByText("Upiši naziv ili vrstu vakcine.")).toBeInTheDocument()
    expect(createVaccination).not.toHaveBeenCalled()
  })

  it("422 before_start → the inline next-dose error", async () => {
    createVaccination.mockResolvedValue({
      ok: false,
      error: { code: "validation_failed", message: "x", fields: { next_due_on: "before_start" } },
    })
    render(<VaccinationFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv ili vrsta vakcine *"), "Besnilo")
    await pickDay(user, "Datum sledeće doze", "2026-10-26")
    await user.click(screen.getByRole("button", { name: "Sačuvaj vakcinu" }))
    expect(screen.getByText("Datum sledeće doze mora biti posle datuma davanja.")).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it("any other failure → the X ErrorState", async () => {
    createVaccination.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "x" } })
    render(<VaccinationFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv ili vrsta vakcine *"), "Besnilo")
    await user.click(screen.getByRole("button", { name: "Sačuvaj vakcinu" }))
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nismo uspeli da sačuvamo vakcinu. Proveri označena polja i pokušaj ponovo.",
    )
    expect(push).not.toHaveBeenCalled()
  })

  it("renders in English", () => {
    render(<VaccinationFormClient pet={luna} locale="en" copy={copy("en")} />)
    expect(screen.getByRole("heading", { level: 1, name: "New vaccination" })).toBeInTheDocument()
    expect(screen.getByText("Luna · Cat · Britanska kratkodlaka")).toBeInTheDocument()
    expect(screen.getByText("We'll create a reminder.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Date given/ })).toHaveTextContent("19 Oct 2026")
  })
})

describe("edit route — Izmeni vakcinu (owner decision, Step 14)", () => {
  it("prefills the vaccination and saves the changed next dose with EP-09 update", async () => {
    updateVaccination.mockResolvedValue({ ok: true, data: { ...saved, next_due_on: "2026-10-28" } })
    render(<VaccinationFormClient pet={luna} vaccination={saved} locale="sr" copy={copy("sr")} />)
    expect(screen.getByRole("heading", { level: 1, name: "Izmeni vakcinu" })).toBeInTheDocument()
    expect(screen.getByLabelText("Naziv ili vrsta vakcine *")).toHaveValue("Besnilo — Rabisin")
    const user = userEvent.setup()
    await pickDay(user, "Datum sledeće doze", "2026-10-28")
    await user.click(screen.getByRole("button", { name: "Sačuvaj izmene" }))
    expect(updateVaccination).toHaveBeenCalledWith("v-new", expect.objectContaining({ next_due_on: "2026-10-28", given_on: "2026-10-19" }))
    expect(createVaccination).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith(`/ljubimci/${LUNA}`)
  })
})

describe("EP-09 action rules (lib/actions/vaccinations.ts)", () => {
  function fakeSupabase() {
    const inserted: unknown[] = []
    return {
      inserted,
      auth: {
        getUser: async () => ({
          data: { user: { id: IVANA, email: "ivana@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
          error: null,
        }),
      },
      from(table: string) {
        const builder = {
          select: () => builder,
          insert: (row: Record<string, unknown>) => (inserted.push(row), builder),
          eq: () => builder,
          single: async () => ({
            data: { ...saved, ...(inserted[0] as object), id: "v-new", created_by: IVANA },
            error: null,
          }),
          maybeSingle: async () =>
            table === "profiles" ? { data: { id: IVANA, deletion_requested_at: null }, error: null } : { data: null, error: null },
          then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        }
        return builder
      },
    }
  }

  it("next_due_on on or before given_on → validation_failed before_start", async () => {
    supabase.current = fakeSupabase()
    const result = await actions.createVaccination({
      pet_id: LUNA,
      name: "Besnilo",
      given_on: "2026-10-19",
      next_due_on: "2026-10-19",
    })
    expect(result.ok ? null : result.error).toEqual(
      expect.objectContaining({ code: "validation_failed", fields: { next_due_on: "before_start" } }),
    )
  })

  it("checks the name, the given date and the text lengths", async () => {
    supabase.current = fakeSupabase()
    const result = await actions.createVaccination({
      pet_id: LUNA,
      name: " ",
      given_on: "2999-01-01",
      batch_number: "x".repeat(61),
      clinic: "x".repeat(101),
      note: "x".repeat(1001),
    })
    expect(result.ok ? null : result.error.fields).toEqual({
      name: "required",
      given_on: "out_of_range",
      batch_number: "too_long",
      clinic: "too_long",
      note: "too_long",
    })
  })

  it("inserts the trimmed values and returns the Vaccination with days_until_due", async () => {
    const fake = fakeSupabase()
    supabase.current = fake
    const result = await actions.createVaccination({
      pet_id: LUNA,
      name: " Besnilo — Rabisin ",
      given_on: "2026-10-19",
      next_due_on: "2026-10-26",
      clinic: "",
    })
    expect(fake.inserted).toEqual([
      { pet_id: LUNA, name: "Besnilo — Rabisin", given_on: "2026-10-19", next_due_on: "2026-10-26", clinic: null, batch_number: null, note: null },
    ])
    expect(result.ok && result.data.days_until_due).toBe(7)
  })

  it("update of an unknown vaccination → not_found", async () => {
    supabase.current = fakeSupabase()
    const result = await actions.updateVaccination("missing", { next_due_on: null })
    expect(result.ok ? null : result.error.code).toBe("not_found")
  })
})
