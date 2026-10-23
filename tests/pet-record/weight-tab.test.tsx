import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S03 Težina tab · FR-04 (all entries in date order as a trend), FR-03 display half (values and input
// in the pet's unit, here grams) · EP-08 through lib/actions/weights.ts.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))

const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const deletePet = vi.fn()
vi.mock("@/lib/actions/pets", () => ({ deletePet: (...a: unknown[]) => deletePet(...a) }))
const createWeightEntry = vi.fn()
const updateWeightEntry = vi.fn()
const deleteWeightEntry = vi.fn()
vi.mock("@/lib/actions/weights", () => ({
  createWeightEntry: (...a: unknown[]) => createWeightEntry(...a),
  updateWeightEntry: (...a: unknown[]) => updateWeightEntry(...a),
  deleteWeightEntry: (...a: unknown[]) => deleteWeightEntry(...a),
}))
const deleteVaccination = vi.fn()
vi.mock("@/lib/actions/vaccinations", () => ({ deleteVaccination: (...a: unknown[]) => deleteVaccination(...a) }))

const supabase = { current: null as unknown }
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }))

const { PetRecordClient } = await import("@/app/(app)/ljubimci/[id]/pet-record-client")
const { dictionaries } = await import("@/lib/i18n")
const weightActions = await vi.importActual<typeof import("@/lib/actions/weights")>("@/lib/actions/weights")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const IVANA = "a1000000-0000-4000-8000-000000000001"
const OWNER_ACCESS = { role: "owner", can_edit: true, can_delete: true } as const

const copy = (locale: "sr" | "en") => ({
  petRecord: dictionaries[locale].petRecord,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

function weight(id: string, measured_on: string, value: number, unit: "kg" | "g" = "kg", note: string | null = null) {
  return {
    id,
    pet_id: LUNA,
    measured_on,
    value,
    weight_unit: unit,
    note,
    created_by: IVANA,
    created_by_name: "Ivana Petrović",
    created_at: `${measured_on}T08:00:00Z`,
    access: OWNER_ACCESS,
  }
}

function record({ unit = "kg", weights = [] as ReturnType<typeof weight>[] } = {}) {
  return {
    pet: {
      id: LUNA,
      owner_id: IVANA,
      organisation_id: null,
      name: "Luna",
      species: "cat",
      species_other: null,
      breed: "Britanska kratkodlaka",
      sex: "female",
      birth_date: "2023-04-12",
      birth_year: null,
      colour_markings: null,
      microchip_number: "688038000123456",
      passport_number: null,
      neutered: "yes",
      has_photo: false,
      photo_file_name: null,
      vet_name: null,
      vet_phone: null,
      weight_unit: unit,
      note: null,
      lifecycle: "active",
      shelter_status: null,
      offspring_status: null,
      breeding_status: null,
      litter_id: null,
      price: null,
      public_description: null,
      approx_age_text: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
    access: OWNER_ACCESS,
    can_log: true,
    read_only_reason: null,
    owner_name: "Ivana Petrović",
    memorial: null,
    upcoming_reminders: [],
    vaccinations: [],
    treatments: [],
    vet_visits: [],
    weights,
    attachment_count: 0,
  } as never
}

function renderRecord(rec: never, locale: "sr" | "en" = "sr") {
  return render(<PetRecordClient record={rec} now="2026-10-19T10:00:00Z" locale={locale} copy={copy(locale)} />)
}

async function openWeightTab(locale: "sr" | "en" = "sr") {
  const user = userEvent.setup()
  await user.click(screen.getByRole("tab", { name: dictionaries[locale].petRecord.tabWeight }))
  return user
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("FR-04 — weight history as a trend", () => {
  // EP-02 returns weights measured_on desc; one is out of order on purpose.
  const lunaWeights = [
    weight("w6", "2026-10-19", 4.2),
    weight("w5", "2026-10-02", 4.1, "kg", "Izmereno kod „Dr Vet”"),
    weight("w1", "2026-04-17", 3.8),
    weight("w3", "2026-06-17", 4.0),
  ]

  it("renders every entry as a bar in measured_on order, oldest first", async () => {
    renderRecord(record({ weights: lunaWeights }))
    await openWeightTab()
    const bars = screen.getAllByTestId("weight-bar")
    expect(bars).toHaveLength(4)
    expect(bars.map((b) => b.textContent)).toEqual(["3,8 kg17. 4.", "4,0 kg17. 6.", "4,1 kg2. 10.", "4,2 kg19. 10."])
    expect(screen.getByRole("img", { name: /Trend težine za Luna: od 3,8 kg \(17\. 4\. 2026\.\) do 4,2 kg \(19\. 10\. 2026\.\)/ })).toBeInTheDocument()
  })

  it("lists all measurements newest first with their notes", async () => {
    renderRecord(record({ weights: lunaWeights }))
    await openWeightTab()
    const list = screen.getByRole("heading", { name: "Sva merenja" }).parentElement!
    const rows = within(list).getAllByRole("listitem")
    expect(rows.map((r) => within(r).getByText(/\d{4}\.$/).textContent)).toEqual([
      "19. 10. 2026.",
      "2. 10. 2026.",
      "17. 6. 2026.",
      "17. 4. 2026.",
    ])
    expect(rows[1]).toHaveTextContent("Izmereno kod „Dr Vet”")
  })

  it("shows the latest weight and the change on Pregled", () => {
    renderRecord(record({ weights: lunaWeights }))
    expect(screen.getByText("Poslednja težina").parentElement).toHaveTextContent("4,2 kg")
    expect(screen.getByText("19. 10. 2026. · +0,1 kg od prošlog merenja")).toBeInTheDocument()
  })

  it("does not draw a trend for a single entry, and shows the empty state with none", async () => {
    const { unmount } = renderRecord(record({ weights: [weight("w1", "2026-04-17", 3.8)] }))
    await openWeightTab()
    expect(screen.queryAllByTestId("weight-bar")).toHaveLength(0)
    expect(screen.getByText("Sva merenja")).toBeInTheDocument()
    unmount()
    renderRecord(record())
    await openWeightTab()
    expect(screen.getByRole("heading", { name: "Još nema merenja" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Dodaj merenje" })).toBeInTheDocument()
  })

  it("renders English dates and decimals in English", async () => {
    renderRecord(record({ weights: lunaWeights }), "en")
    await openWeightTab("en")
    expect(screen.getAllByTestId("weight-bar").map((b) => b.textContent)).toEqual([
      "3.8 kg17 Apr",
      "4.0 kg17 Jun",
      "4.1 kg2 Oct",
      "4.2 kg19 Oct",
    ])
  })
})

describe("FR-03 — weights entered and shown in grams", () => {
  const hamster = [weight("g2", "2026-10-02", 852.5, "g"), weight("g1", "2026-09-02", 840, "g")]

  it("shows every value in g", async () => {
    renderRecord(record({ unit: "g", weights: hamster }))
    expect(screen.getByText("Poslednja težina").parentElement).toHaveTextContent("852,5 g")
    await openWeightTab()
    expect(screen.getAllByTestId("weight-bar").map((b) => b.textContent)).toEqual(["840 g2. 9.", "852,5 g2. 10."])
  })

  it("asks for grams in the dialog and sends the value in g (EP-08)", async () => {
    createWeightEntry.mockResolvedValue({ ok: true, data: weight("g3", "2026-10-19", 850, "g") })
    renderRecord(record({ unit: "g", weights: hamster }))
    const user = await openWeightTab()
    await user.click(screen.getByRole("button", { name: "Dodaj merenje" }))
    const dialog = screen.getByRole("dialog", { name: "Novo merenje — Luna" })
    expect(dialog).toHaveTextContent("Težinu upisuješ u jedinici izabranoj za ovog ljubimca (g).")
    const input = within(dialog).getByLabelText("Težina (g) *")
    expect(input).toHaveAttribute("placeholder", "npr. 850")

    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj merenje" }))
    expect(within(dialog).getByText("Upiši težinu u gramima, npr. 850.")).toBeInTheDocument()
    expect(createWeightEntry).not.toHaveBeenCalled()

    await user.type(input, "850")
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj merenje" }))
    expect(createWeightEntry).toHaveBeenCalledWith(
      expect.objectContaining({ pet_id: LUNA, value: 850, note: null, measured_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    )
    expect(toast).toHaveBeenCalledWith("Merenje je sačuvano.")
    expect(refresh).toHaveBeenCalled()
  })

  it("parses a decimal comma in kg", async () => {
    createWeightEntry.mockResolvedValue({ ok: true, data: weight("w7", "2026-10-19", 4.25) })
    renderRecord(record({ weights: [weight("w1", "2026-04-17", 3.8)] }))
    const user = await openWeightTab()
    await user.click(screen.getByRole("button", { name: "Dodaj merenje" }))
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByLabelText("Težina (kg) *"), "4,25")
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj merenje" }))
    expect(createWeightEntry).toHaveBeenCalledWith(expect.objectContaining({ value: 4.25 }))
  })

  it("edits an entry through the row menu with the edit title (EP-08 update)", async () => {
    updateWeightEntry.mockResolvedValue({ ok: true, data: weight("g2", "2026-10-02", 860, "g") })
    renderRecord(record({ unit: "g", weights: hamster }))
    const user = await openWeightTab()
    await user.click(screen.getByRole("button", { name: "Još opcija: 2. 10. 2026." }))
    await user.click(await screen.findByRole("menuitem", { name: "Izmeni" }))
    const dialog = screen.getByRole("dialog", { name: "Izmeni merenje — Luna" })
    const input = within(dialog).getByLabelText("Težina (g) *")
    expect(input).toHaveValue("852,5")
    await user.clear(input)
    await user.type(input, "860")
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj merenje" }))
    expect(updateWeightEntry).toHaveBeenCalledWith("g2", { measured_on: "2026-10-02", value: 860, note: null })
  })
})

describe("EP-08 action rules (lib/actions/weights.ts)", () => {
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
          insert: (row: unknown) => (inserted.push(row), builder),
          eq: () => builder,
          single: async () => ({ data: { id: "w-new" }, error: null }),
          maybeSingle: async () =>
            table === "profiles"
              ? { data: { id: IVANA, deletion_requested_at: null }, error: null }
              : { data: weight("w-new", "2026-10-19", 4.3), error: null },
          then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        }
        return builder
      },
    }
  }

  it("rejects a future date, a non-positive value, more than 3 decimals and a long note", async () => {
    supabase.current = fakeSupabase()
    const result = await weightActions.createWeightEntry({
      pet_id: LUNA,
      measured_on: "2999-01-01",
      value: 0,
      note: "x".repeat(501),
    })
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "validation_failed",
        fields: { measured_on: "out_of_range", value: "out_of_range", note: "too_long" },
      }),
    })
    const decimals = await weightActions.createWeightEntry({ pet_id: LUNA, measured_on: "2026-10-19", value: 4.2345 })
    expect(decimals.ok ? null : decimals.error.fields).toEqual({ value: "invalid" })
  })

  it("inserts and returns the WeightEntry read back through weight_entries_api", async () => {
    const fake = fakeSupabase()
    supabase.current = fake
    const result = await weightActions.createWeightEntry({ pet_id: LUNA, measured_on: "2026-10-19", value: 4.3, note: " " })
    expect(fake.inserted).toEqual([{ pet_id: LUNA, measured_on: "2026-10-19", value: 4.3, note: null }])
    expect(result.ok && result.data.id).toBe("w-new")
  })
})
