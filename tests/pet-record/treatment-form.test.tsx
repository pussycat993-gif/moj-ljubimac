import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S27 Nova terapija (FR-06): "Trajanje N dana" is sent as ends_on = starts_on + N − 1 (EP-10) and the
// dose-schedule summary shows the reminders the trigger will create (FR-20; the reminders themselves
// are asserted in supabase/tests/treatment_dose_reminders.test.sql). Also the edit route (owner
// decision, Step 15), 422 → inline / X, and the EP-10 action rules.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const createTreatment = vi.fn()
const updateTreatment = vi.fn()
vi.mock("@/lib/actions/treatments", () => ({
  createTreatment: (...a: unknown[]) => createTreatment(...a),
  updateTreatment: (...a: unknown[]) => updateTreatment(...a),
}))

const supabase = { current: null as unknown }
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }))

const { TreatmentFormClient } = await import("@/app/(app)/ljubimci/[id]/terapije/nova/treatment-form-client")
const { dictionaries } = await import("@/lib/i18n")
const actions = await vi.importActual<typeof import("@/lib/actions/treatments")>("@/lib/actions/treatments")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const IVANA = "a1000000-0000-4000-8000-000000000001"

const copy = (locale: "sr" | "en") => ({
  treatmentForm: dictionaries[locale].treatmentForm,
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
} as const

const saved = {
  id: "t-new",
  pet_id: LUNA,
  type: "medication",
  name: "Synulox 50 mg",
  dose: null,
  interval_value: 12,
  interval_unit: "hours",
  starts_on: "2026-10-19",
  ends_on: "2026-10-21",
  note: null,
  is_active: true,
  next_dose_at: null,
  next_dose_occurrence_id: null,
  recent_doses: [],
  dose_count: 0,
  created_by: IVANA,
  created_at: "2026-10-19T08:00:00Z",
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

async function pickDay(user: ReturnType<typeof userEvent.setup>, fieldLabel: string, day: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(`^${fieldLabel}`) }))
  const popover = await screen.findByRole("dialog")
  const cell = popover.querySelector<HTMLElement>(`[data-day="${day}"] button`)
  if (!cell) throw new Error(`no calendar day ${day}`)
  await user.click(cell)
}

describe("S27 — new treatment", () => {
  it("shows the pet header, the dose helper and the default schedule summary", () => {
    render(<TreatmentFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    expect(screen.getByRole("heading", { level: 1, name: "Nova terapija" })).toBeInTheDocument()
    expect(screen.getByText("Luna · Mačka · Britanska kratkodlaka")).toBeInTheDocument()
    expect(screen.getByText("Napravićemo podsetnike za svaku dozu.")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Vrsta *" })).toHaveTextContent("Lek")
    expect(screen.getByLabelText("Na svakih")).toHaveValue("12")
    expect(screen.getByRole("combobox", { name: "Jedinica učestalosti" })).toHaveTextContent("sati")
    expect(screen.getByRole("button", { name: /^Datum početka/ })).toHaveTextContent("19. 10. 2026.")
    expect(screen.getByLabelText("Trajanje u danima")).toHaveValue("7")
    // Trajanje 7 dana from 19. 10. → the last day is 25. 10. (starts_on + 7 − 1).
    expect(screen.getByText("Podsetnik na svakih 12 sati, od 19. 10. 2026. do 25. 10. 2026.")).toBeInTheDocument()
  })

  it("FR-06: 'Trajanje 3 dana' is sent as ends_on = starts_on + 2, with the toast summary and back to S03", async () => {
    createTreatment.mockResolvedValue({ ok: true, data: saved })
    render(<TreatmentFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv *"), "Synulox 50 mg")
    await user.type(screen.getByLabelText("Doza"), "½ tablete")
    const duration = screen.getByLabelText("Trajanje u danima")
    await user.clear(duration)
    await user.type(duration, "3")
    expect(screen.getByText("Podsetnik na svakih 12 sati, od 19. 10. 2026. do 21. 10. 2026.")).toBeInTheDocument()
    await user.type(screen.getByLabelText("Napomena"), "davati uz hranu")
    await user.click(screen.getByRole("button", { name: "Sačuvaj terapiju" }))

    expect(createTreatment).toHaveBeenCalledWith({
      pet_id: LUNA,
      type: "medication",
      name: "Synulox 50 mg",
      dose: "½ tablete",
      interval_value: 12,
      interval_unit: "hours",
      starts_on: "2026-10-19",
      ends_on: "2026-10-21",
      note: "davati uz hranu",
    })
    expect(toast).toHaveBeenCalledWith(
      "Terapija sačuvana. Podsetnik na svakih 12 sati, od 19. 10. 2026. do 21. 10. 2026.",
    )
    expect(push).toHaveBeenCalledWith(`/ljubimci/${LUNA}`)
  })

  it("duration conversion crosses the month: 1. 11. + 30 dana → 30. 11.", async () => {
    createTreatment.mockResolvedValue({ ok: true, data: saved })
    render(<TreatmentFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv *"), "Stronghold")
    await pickDay(user, "Datum početka", "2026-10-31")
    const duration = screen.getByLabelText("Trajanje u danima")
    await user.clear(duration)
    await user.type(duration, "30")
    await user.click(screen.getByRole("button", { name: "Sačuvaj terapiju" }))
    expect(createTreatment).toHaveBeenCalledWith(
      expect.objectContaining({ starts_on: "2026-10-31", ends_on: "2026-11-29" }),
    )
  })

  it("every day, no end: 'svaki dan … dok ne završiš terapiju' and ends_on = null", async () => {
    createTreatment.mockResolvedValue({ ok: true, data: saved })
    render(<TreatmentFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv *"), "Vitamini")
    const every = screen.getByLabelText("Na svakih")
    await user.clear(every)
    await user.type(every, "1")
    await user.click(screen.getByRole("combobox", { name: "Jedinica učestalosti" }))
    await user.click(await screen.findByRole("option", { name: "dan" }))
    await user.clear(screen.getByLabelText("Trajanje u danima"))
    expect(screen.getByText("Podsetnik svaki dan, od 19. 10. 2026. dok ne završiš terapiju.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sačuvaj terapiju" }))
    expect(createTreatment).toHaveBeenCalledWith(
      expect.objectContaining({ interval_value: 1, interval_unit: "days", ends_on: null }),
    )
    expect(toast).toHaveBeenCalledWith("Terapija sačuvana. Podsetnik svaki dan, od 19. 10. 2026. dok ne završiš terapiju.")
  })

  it("an end date instead of a duration is sent as is; every 30 days reads 'na svakih 30 dana'", async () => {
    createTreatment.mockResolvedValue({ ok: true, data: saved })
    render(<TreatmentFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv *"), "Stronghold Plus")
    const every = screen.getByLabelText("Na svakih")
    await user.clear(every)
    await user.type(every, "30")
    await user.click(screen.getByRole("combobox", { name: "Jedinica učestalosti" }))
    await user.click(await screen.findByRole("option", { name: "dana" }))
    await user.click(screen.getByRole("radio", { name: "Datum završetka" }))
    await pickDay(user, "Datum završetka", "2026-10-31")
    expect(screen.getByText("Podsetnik na svakih 30 dana, od 19. 10. 2026. do 31. 10. 2026.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sačuvaj terapiju" }))
    expect(createTreatment).toHaveBeenCalledWith(
      expect.objectContaining({ interval_value: 30, interval_unit: "days", ends_on: "2026-10-31" }),
    )
  })

  it("no frequency → a one-time dose: no interval, no summary, plain toast", async () => {
    createTreatment.mockResolvedValue({ ok: true, data: saved })
    render(<TreatmentFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv *"), "Milbemax")
    await user.clear(screen.getByLabelText("Na svakih"))
    expect(screen.queryByText(/^Podsetnik /)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sačuvaj terapiju" }))
    expect(createTreatment).toHaveBeenCalledWith(expect.objectContaining({ interval_value: null, interval_unit: null }))
    expect(toast).toHaveBeenCalledWith("Terapija sačuvana.")
  })

  it("validates inline and sends nothing: name, frequency 0, duration 0", async () => {
    render(<TreatmentFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    const every = screen.getByLabelText("Na svakih")
    await user.clear(every)
    await user.type(every, "0")
    const duration = screen.getByLabelText("Trajanje u danima")
    await user.clear(duration)
    await user.type(duration, "0")
    await user.click(screen.getByRole("button", { name: "Sačuvaj terapiju" }))
    expect(screen.getByText("Upiši naziv leka ili preparata.")).toBeInTheDocument()
    expect(screen.getByText("Upiši ceo broj veći od nule, npr. 12.")).toBeInTheDocument()
    expect(screen.getByText("Upiši broj dana veći od nule.")).toBeInTheDocument()
    expect(screen.getByLabelText("Naziv *")).toHaveAttribute("aria-invalid", "true")
    expect(createTreatment).not.toHaveBeenCalled()
  })

  it("422 before_start on ends_on → inline; an unmapped failure → the X error state", async () => {
    render(<TreatmentFormClient pet={luna} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Naziv *"), "Synulox")
    await user.click(screen.getByRole("radio", { name: "Datum završetka" }))
    await pickDay(user, "Datum završetka", "2026-10-25")
    createTreatment.mockResolvedValueOnce({
      ok: false,
      error: { code: "validation_failed", message: "x", fields: { ends_on: "before_start" } },
    })
    await user.click(screen.getByRole("button", { name: "Sačuvaj terapiju" }))
    expect(screen.getByText("Datum završetka ne može biti pre datuma početka.")).toBeInTheDocument()

    createTreatment.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "x" } })
    await user.click(screen.getByRole("button", { name: "Sačuvaj terapiju" }))
    expect(
      screen.getByText("Nismo uspeli da sačuvamo terapiju. Proveri označena polja i pokušaj ponovo."),
    ).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it("English: faithful copy and en-GB dates in the summary", () => {
    render(<TreatmentFormClient pet={luna} locale="en" copy={copy("en")} />)
    expect(screen.getByRole("heading", { level: 1, name: "New treatment" })).toBeInTheDocument()
    expect(screen.getByText("Reminder every 12 hours, from 19 Oct 2026 to 25 Oct 2026.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save treatment" })).toBeInTheDocument()
  })
})

describe("Izmeni terapiju — edit route (owner decision, Step 15)", () => {
  it("preloads the treatment and saves with EP-10 update", async () => {
    updateTreatment.mockResolvedValue({ ok: true, data: saved })
    render(<TreatmentFormClient pet={luna} treatment={{ ...saved, type: "flea_tick", interval_unit: "hours" } as never} locale="sr" copy={copy("sr")} />)
    expect(screen.getByRole("heading", { level: 1, name: "Izmeni terapiju" })).toBeInTheDocument()
    expect(screen.getByLabelText("Naziv *")).toHaveValue("Synulox 50 mg")
    expect(screen.getByRole("combobox", { name: "Vrsta *" })).toHaveTextContent("Zaštita od buva i krpelja")
    expect(screen.getByRole("radio", { name: "Datum završetka" })).toBeChecked()
    expect(screen.getByRole("button", { name: /^Datum završetka/ })).toHaveTextContent("21. 10. 2026.")
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Sačuvaj izmene" }))
    expect(updateTreatment).toHaveBeenCalledWith("t-new", {
      type: "flea_tick",
      name: "Synulox 50 mg",
      dose: null,
      interval_value: 12,
      interval_unit: "hours",
      starts_on: "2026-10-19",
      ends_on: "2026-10-21",
      note: null,
    })
    expect(createTreatment).not.toHaveBeenCalled()
  })
})

describe("EP-10 action rules (lib/actions/treatments.ts)", () => {
  function fakeSupabase() {
    const inserted: Record<string, unknown>[] = []
    return {
      inserted,
      auth: {
        getUser: async () => ({
          data: { user: { id: IVANA, email: "ivana@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
          error: null,
        }),
      },
      rpc: async () => ({ data: { treatments: [{ ...saved, ...(inserted[0] as object), id: "t-new" }] }, error: null }),
      from(table: string) {
        const builder = {
          select: () => builder,
          insert: (row: Record<string, unknown>) => (inserted.push(row), builder),
          eq: () => builder,
          single: async () => ({ data: { id: "t-new", pet_id: LUNA }, error: null }),
          maybeSingle: async () =>
            table === "profiles" ? { data: { id: IVANA, deletion_requested_at: null }, error: null } : { data: null, error: null },
          then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        }
        return builder
      },
    }
  }

  it("ends_on before starts_on → before_start; a lone interval half → required; interval 0 → out_of_range", async () => {
    supabase.current = fakeSupabase()
    const before = await actions.createTreatment({
      pet_id: LUNA,
      type: "medication",
      name: "Lek",
      starts_on: "2026-10-19",
      ends_on: "2026-10-18",
    })
    expect(before.ok ? null : before.error.fields).toEqual({ ends_on: "before_start" })
    const half = await actions.createTreatment({
      pet_id: LUNA,
      type: "medication",
      name: "Lek",
      starts_on: "2026-10-19",
      interval_value: 12,
    })
    expect(half.ok ? null : half.error.fields).toEqual({ interval_unit: "required" })
    const zero = await actions.createTreatment({
      pet_id: LUNA,
      type: "medication",
      name: "Lek",
      starts_on: "2026-10-19",
      interval_value: 0,
      interval_unit: "hours",
    })
    expect(zero.ok ? null : zero.error.fields).toEqual({ interval_value: "out_of_range" })
  })

  it("checks type, name and lengths", async () => {
    supabase.current = fakeSupabase()
    const result = await actions.createTreatment({
      pet_id: LUNA,
      type: "vitamin" as never,
      name: " ",
      dose: "x".repeat(61),
      starts_on: "",
      note: "x".repeat(1001),
    })
    expect(result.ok ? null : result.error.fields).toEqual({
      type: "invalid",
      name: "required",
      dose: "too_long",
      starts_on: "required",
      note: "too_long",
    })
  })

  it("inserts the trimmed values and returns the Treatment read back through EP-02", async () => {
    const fake = fakeSupabase()
    supabase.current = fake
    const result = await actions.createTreatment({
      pet_id: LUNA,
      type: "medication",
      name: " Synulox 50 mg ",
      dose: "",
      interval_value: 12,
      interval_unit: "hours",
      starts_on: "2026-10-19",
      ends_on: "2026-10-21",
    })
    expect(fake.inserted).toEqual([
      {
        pet_id: LUNA,
        type: "medication",
        name: "Synulox 50 mg",
        dose: null,
        interval_value: 12,
        interval_unit: "hours",
        starts_on: "2026-10-19",
        ends_on: "2026-10-21",
        note: null,
      },
    ])
    expect(result.ok && result.data).toMatchObject({ id: "t-new", is_active: true, recent_doses: [], dose_count: 0 })
  })

  it("update of an unknown treatment → not_found", async () => {
    supabase.current = fakeSupabase()
    const result = await actions.updateTreatment("missing", { ends_on: null })
    expect(result.ok ? null : result.error.code).toBe("not_found")
  })

  it("EP-11 logDose: calls rpc:log_dose and maps its DETAIL '<field>:<code>' to fields", async () => {
    const calls: unknown[] = []
    const fake = fakeSupabase()
    supabase.current = {
      ...fake,
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args })
        return { data: null, error: { code: "P0001", message: "validation_failed", details: "p_occurrence_id:invalid" } }
      },
    }
    const result = await actions.logDose({ treatment_id: "t1", occurrence_id: "occ-x" })
    expect(calls).toEqual([{ name: "log_dose", args: { p_treatment_id: "t1", p_occurrence_id: "occ-x" } }])
    expect(result.ok ? null : result.error).toMatchObject({ code: "validation_failed", fields: { p_occurrence_id: "invalid" } })

    supabase.current = {
      ...fake,
      rpc: async () => ({ data: null, error: { code: "P0001", message: "household_read_only", details: null } }),
    }
    expect(await actions.logDose({ treatment_id: "t1" })).toMatchObject({ ok: false, error: { code: "household_read_only" } })
  })
})
