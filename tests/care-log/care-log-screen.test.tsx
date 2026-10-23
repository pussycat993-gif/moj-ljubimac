import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  CareLogActions,
  CareLogPet,
  FeedingEntry,
  StoolEntry,
} from "@/app/(app)/ljubimci/[id]/dnevnik/care-log-client"

// S07 Dnevnik ishrane i stolice (Step 20) · FR-14 feeding and FR-16 stool entries through EP-18 (quick-add,
// edit and delete Dialogs; fed_at / observed_at built from date + HH:MM in Europe/Belgrade), no limit on
// any tier; EP-17 lists grouped by day in Europe/Belgrade ("Danas" / "Juče"), paged with "Učitaj još";
// FR-28 / BR-23 the row menu only on entries the caller may edit.

const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { CareLogClient, CareLogLoading, belgradeToIso } = await import("@/app/(app)/ljubimci/[id]/dnevnik/care-log-client")
const { dictionaries } = await import("@/lib/i18n")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const IVANA = "a1000000-0000-4000-8000-000000000001"
const JELENA = "a1000000-0000-4000-8000-000000000003"
const OWNER = { role: "owner", can_edit: true, can_delete: true } as const
const MEMBER_OWN = { role: "member", can_edit: true, can_delete: true } as const
const MEMBER_OTHER = { role: "member", can_edit: false, can_delete: false } as const
// 2026-10-19 12:00 in Belgrade (CEST, UTC+2).
const NOW = "2026-10-19T10:00:00Z"

const copy = (locale: "sr" | "en") => ({
  careLog: dictionaries[locale].careLog,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

const PET: CareLogPet = {
  id: LUNA,
  name: "Luna",
  sex: "female",
  species: "cat",
  species_other: null,
  breed: "Britanska kratkodlaka",
  lifecycle: "active",
  access: OWNER,
  can_log: true,
}

function feed(id: string, fed_at: string, extra: Partial<FeedingEntry> = {}): FeedingEntry {
  return {
    id,
    pet_id: LUNA,
    fed_at,
    type: "dry",
    brand: "Royal Canin Indoor",
    amount_g: 40,
    note: null,
    created_by: IVANA,
    created_by_name: "Ivana Petrović",
    created_at: fed_at,
    access: OWNER,
    ...extra,
  }
}

function stoolEntry(id: string, observed_at: string, extra: Partial<StoolEntry> = {}): StoolEntry {
  return {
    id,
    pet_id: LUNA,
    observed_at,
    consistency: "normal",
    blood_or_mucus: false,
    note: null,
    created_by: IVANA,
    created_by_name: "Ivana Petrović",
    created_at: observed_at,
    access: OWNER,
    ...extra,
  }
}

const FEEDING = [
  feed("f1", "2026-10-19T06:00:00Z", { type: "wet", brand: "Gourmet Gold", amount_g: 85 }),
  // 00:30 on 19 Oct in Belgrade, still 18 Oct in UTC: grouped under "Danas".
  feed("f2", "2026-10-18T22:30:00Z", { type: "treat", brand: "Dreamies", amount_g: 12.5 }),
  feed("f3", "2026-10-18T06:10:00Z", { note: "Ostavila pola porcije.", created_by: JELENA, created_by_name: "Jelena Nikolić" }),
  feed("f4", "2026-10-16T16:00:00Z", { brand: null, amount_g: null }),
]

const listEntries = vi.fn()
const createFeeding = vi.fn()
const updateFeeding = vi.fn()
const createStool = vi.fn()
const updateStool = vi.fn()
const deleteEntry = vi.fn()
const setMealSchedule = vi.fn()
const actions: CareLogActions = {
  listEntries: (...a) => listEntries(...a),
  createFeeding: (...a) => createFeeding(...a),
  updateFeeding: (...a) => updateFeeding(...a),
  createStool: (...a) => createStool(...a),
  updateStool: (...a) => updateStool(...a),
  deleteEntry: (...a) => deleteEntry(...a),
  setMealSchedule: (...a) => setMealSchedule(...a),
}

function renderLog({
  pet = PET,
  feeding = { items: FEEDING, total: FEEDING.length },
  stool = { items: [] as StoolEntry[], total: 0 },
  locale = "sr" as "sr" | "en",
} = {}) {
  return render(
    <CareLogClient
      pet={pet}
      feeding={feeding}
      stool={stool}
      schedule={null}
      now={NOW}
      locale={locale}
      copy={copy(locale)}
      actions={actions}
    />,
  )
}

beforeAll(() => {
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("S07 care log — lists (EP-17)", () => {
  it("groups entries by day in Europe/Belgrade with Danas / Juče labels and Belgrade times", () => {
    renderLog()
    const today = screen.getByRole("region", { name: "Danas, 19. 10. 2026." })
    expect(within(today).getAllByRole("listitem")).toHaveLength(2)
    expect(within(today).getByText("Gourmet Gold")).toBeInTheDocument()
    expect(within(today).getByText("08:00 · 85 g · upisao/la Ivana Petrović")).toBeInTheDocument()
    expect(within(today).getByText("Dreamies")).toBeInTheDocument()
    expect(within(today).getByText("00:30 · 12,5 g · upisao/la Ivana Petrović")).toBeInTheDocument()
    expect(within(today).getByText("Poslastica")).toBeInTheDocument()

    const yesterday = screen.getByRole("region", { name: "Juče, 18. 10. 2026." })
    expect(within(yesterday).getByText("08:10 · 40 g · upisao/la Jelena Nikolić")).toBeInTheDocument()
    expect(within(yesterday).getByText("Ostavila pola porcije.")).toBeInTheDocument()

    const older = screen.getByRole("region", { name: "16. 10. 2026." })
    // No brand → the food type is the title; no amount → no grams.
    expect(within(older).getByText("18:00 · upisao/la Ivana Petrović")).toBeInTheDocument()
    expect(within(older).getAllByText("Suva hrana")).toHaveLength(2)
  })

  it("uses en-GB dates in English", () => {
    renderLog({ locale: "en" })
    expect(screen.getByRole("region", { name: "Today, 19 Oct 2026" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Yesterday, 18 Oct 2026" })).toBeInTheDocument()
    expect(screen.getByText("00:30 · 12.5 g · logged by Ivana Petrović")).toBeInTheDocument()
  })

  it("“Učitaj još” loads the next page from the current offset and disappears when all are shown", async () => {
    const user = userEvent.setup()
    renderLog({ feeding: { items: FEEDING.slice(0, 2), total: 3 } })
    listEntries.mockResolvedValueOnce({ ok: true, data: { items: [FEEDING[2]], total: 3 } })
    await user.click(screen.getByRole("button", { name: "Učitaj još" }))
    expect(listEntries).toHaveBeenCalledWith({ pet_id: LUNA, kind: "feeding", offset: 2 })
    expect(await screen.findByText("Ostavila pola porcije.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Učitaj još" })).not.toBeInTheDocument()
  })

  it("shows the empty state per tab (total = 0) with its action", () => {
    renderLog({ feeding: { items: [], total: 0 } })
    expect(screen.getByRole("heading", { name: "Još nema unosa ishrane" })).toBeInTheDocument()
    expect(
      screen.getByText("Zabeleži šta Luna jede i koliko, pa ćeš lako pratiti ishranu iz dana u dan."),
    ).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Dodaj obrok" })).toHaveLength(2)
  })

  it("loading state: skeleton list", () => {
    render(<CareLogLoading copy={copy("sr")} />)
    expect(screen.getByLabelText("Učitavanje dnevnika")).toHaveAttribute("aria-busy", "true")
  })
})

describe("S07 care log — feeding (FR-14, EP-18)", () => {
  it("builds fed_at from date + HH:MM in Europe/Belgrade (DST-aware)", () => {
    expect(belgradeToIso("2026-10-19", "08:15")).toBe("2026-10-19T06:15:00.000Z")
    expect(belgradeToIso("2026-12-01", "08:15")).toBe("2026-12-01T07:15:00.000Z")
  })

  it("quick-add Dialog validates, saves through EP-18 and shows the new entry with a toast", async () => {
    const user = userEvent.setup()
    renderLog()
    await user.click(screen.getByRole("button", { name: "Dodaj obrok" }))
    const dialog = await screen.findByRole("dialog", { name: "Novi obrok" })
    expect(within(dialog).getByText("Šta je Luna jela i koliko.")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Vreme *")).toHaveValue("12:00")

    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj obrok" }))
    expect(within(dialog).getByText("Izaberi vrstu hrane.")).toBeInTheDocument()
    expect(createFeeding).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole("combobox", { name: "Vrsta hrane *" }))
    await user.click(await screen.findByRole("option", { name: "Vlažna hrana" }))
    fireEvent.change(within(dialog).getByLabelText("Vreme *"), { target: { value: "08:15" } })
    await user.type(within(dialog).getByLabelText("Naziv ili brend"), "Gourmet Gold, piletina")
    await user.type(within(dialog).getByLabelText("Količina (g)"), "0")
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj obrok" }))
    expect(within(dialog).getByText("Količina mora biti broj veći od nule.")).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText("Količina (g)"))
    await user.type(within(dialog).getByLabelText("Količina (g)"), "85,5")
    const saved = feed("f9", "2026-10-19T06:15:00.000Z", { type: "wet", brand: "Gourmet Gold, piletina", amount_g: 85.5 })
    createFeeding.mockResolvedValueOnce({ ok: true, data: saved })
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj obrok" }))

    expect(createFeeding).toHaveBeenCalledWith({
      pet_id: LUNA,
      fed_at: "2026-10-19T06:15:00.000Z",
      type: "wet",
      brand: "Gourmet Gold, piletina",
      amount_g: 85.5,
      note: null,
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(toast).toHaveBeenCalledWith("Unos sačuvan")
    const today = screen.getByRole("region", { name: "Danas, 19. 10. 2026." })
    expect(within(today).getByText("08:15 · 85,5 g · upisao/la Ivana Petrović")).toBeInTheDocument()
  })

  it("rejects a time in the future without calling EP-18", async () => {
    const user = userEvent.setup()
    renderLog()
    await user.click(screen.getByRole("button", { name: "Dodaj obrok" }))
    const dialog = await screen.findByRole("dialog", { name: "Novi obrok" })
    await user.click(within(dialog).getByRole("combobox", { name: "Vrsta hrane *" }))
    await user.click(await screen.findByRole("option", { name: "Suva hrana" }))
    fireEvent.change(within(dialog).getByLabelText("Vreme *"), { target: { value: "23:00" } })
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj obrok" }))
    expect(within(dialog).getByText("Vreme ne može biti u budućnosti.")).toBeInTheDocument()
    expect(createFeeding).not.toHaveBeenCalled()
  })

  it("shows 422 field errors inline and anything else as the error toast", async () => {
    const user = userEvent.setup()
    renderLog()
    await user.click(screen.getByRole("button", { name: "Dodaj obrok" }))
    const dialog = await screen.findByRole("dialog", { name: "Novi obrok" })
    await user.click(within(dialog).getByRole("combobox", { name: "Vrsta hrane *" }))
    await user.click(await screen.findByRole("option", { name: "Suva hrana" }))
    createFeeding.mockResolvedValueOnce({
      ok: false,
      error: { code: "validation_failed", message: "x", fields: { fed_at: "out_of_range" } },
    })
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj obrok" }))
    expect(await within(dialog).findByText("Vreme ne može biti u budućnosti.")).toBeInTheDocument()

    createFeeding.mockResolvedValueOnce({ ok: false, error: { code: "household_read_only", message: "x" } })
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj obrok" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
  })

  it("edits an entry from the row menu (“Izmeni obrok”, prefilled) and deletes one after the AlertDialog", async () => {
    const user = userEvent.setup()
    renderLog()
    const row = screen.getByText("Dreamies").closest("li")!
    await user.click(within(row).getByRole("button", { name: "Još opcija" }))
    await user.click(await screen.findByRole("menuitem", { name: "Izmeni" }))
    const dialog = await screen.findByRole("dialog", { name: "Izmeni obrok" })
    expect(within(dialog).getByLabelText("Vreme *")).toHaveValue("00:30")
    expect(within(dialog).getByLabelText("Naziv ili brend")).toHaveValue("Dreamies")
    expect(within(dialog).getByLabelText("Količina (g)")).toHaveValue("12,5")

    await user.clear(within(dialog).getByLabelText("Količina (g)"))
    await user.type(within(dialog).getByLabelText("Količina (g)"), "15")
    updateFeeding.mockResolvedValueOnce({ ok: true, data: { ...FEEDING[1], amount_g: 15 } })
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj obrok" }))
    expect(updateFeeding).toHaveBeenCalledWith("f2", {
      fed_at: "2026-10-18T22:30:00.000Z",
      type: "treat",
      brand: "Dreamies",
      amount_g: 15,
      note: null,
    })
    expect(await screen.findByText("00:30 · 15 g · upisao/la Ivana Petrović")).toBeInTheDocument()

    const other = screen.getByText("Gourmet Gold").closest("li")!
    await user.click(within(other).getByRole("button", { name: "Još opcija" }))
    await user.click(await screen.findByRole("menuitem", { name: "Obriši" }))
    const confirm = await screen.findByRole("alertdialog", { name: "Obrisati unos?" })
    expect(within(confirm).getByText("Ovo ne može da se poništi.")).toBeInTheDocument()
    deleteEntry.mockResolvedValueOnce({ ok: true, data: { id: "f1" } })
    await user.click(within(confirm).getByRole("button", { name: "Da, obriši" }))
    expect(deleteEntry).toHaveBeenCalledWith("feeding", "f1")
    await waitFor(() => expect(screen.queryByText("Gourmet Gold")).not.toBeInTheDocument())
    expect(toast).toHaveBeenCalledWith("Unos obrisan")
  })

  it("FR-28: a member can add entries but gets the row menu only on their own (BR-23)", () => {
    renderLog({
      pet: { ...PET, access: { role: "member", can_edit: false, can_delete: false } },
      feeding: {
        items: [
          feed("f1", "2026-10-19T06:00:00Z", { brand: "Owner meal", access: MEMBER_OTHER }),
          feed("f2", "2026-10-19T07:00:00Z", { brand: "Own meal", created_by: JELENA, access: MEMBER_OWN }),
        ],
        total: 2,
      },
    })
    expect(screen.getByRole("button", { name: "Dodaj obrok" })).toBeInTheDocument()
    expect(within(screen.getByText("Owner meal").closest("li")!).queryByRole("button", { name: "Još opcija" })).toBeNull()
    expect(within(screen.getByText("Own meal").closest("li")!).getByRole("button", { name: "Još opcija" })).toBeInTheDocument()
  })

  it("read-only household (can_log = false): no add buttons, no row menus", () => {
    renderLog({
      pet: { ...PET, access: { role: "member", can_edit: false, can_delete: false }, can_log: false },
      feeding: { items: [feed("f1", "2026-10-19T06:00:00Z", { access: MEMBER_OTHER })], total: 1 },
    })
    expect(screen.queryByRole("button", { name: "Dodaj obrok" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Još opcija" })).not.toBeInTheDocument()
  })
})

describe("S07 care log — Stolica tab (FR-16, EP-18)", () => {
  it("lists stool entries with consistency, blood/mucus and author", async () => {
    const user = userEvent.setup()
    renderLog({
      stool: {
        items: [
          stoolEntry("s1", "2026-10-19T07:15:00Z"),
          stoolEntry("s2", "2026-10-17T05:50:00Z", {
            consistency: "diarrhoea",
            blood_or_mucus: true,
            note: "Pratiti, javiti Dr Vet ako se ponovi.",
          }),
        ],
        total: 2,
      },
    })
    await user.click(screen.getByRole("tab", { name: "Stolica" }))
    expect(screen.getByRole("button", { name: "Dodaj stolicu" })).toBeInTheDocument()
    const today = screen.getByRole("region", { name: "Danas, 19. 10. 2026." })
    expect(within(today).getByText("Normalna")).toBeInTheDocument()
    expect(within(today).getByText("09:15 · upisao/la Ivana Petrović")).toBeInTheDocument()
    const older = screen.getByRole("region", { name: "17. 10. 2026." })
    expect(within(older).getByText("Proliv")).toBeInTheDocument()
    expect(within(older).getByText("Krv ili sluz: da")).toBeInTheDocument()
  })

  it("empty state, then the quick-add Dialog saves observed_at, consistency and blood/mucus", async () => {
    const user = userEvent.setup()
    renderLog()
    await user.click(screen.getByRole("tab", { name: "Stolica" }))
    expect(screen.getByRole("heading", { name: "Još nema unosa stolice" })).toBeInTheDocument()
    await user.click(screen.getAllByRole("button", { name: "Dodaj stolicu" })[0])
    const dialog = await screen.findByRole("dialog", { name: "Nova stolica" })
    expect(within(dialog).getByText("Kratak unos pomaže veterinaru ako se nešto promeni.")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj unos" }))
    expect(within(dialog).getByText("Izaberi konzistenciju.")).toBeInTheDocument()
    expect(createStool).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole("radio", { name: "Meka" }))
    await user.click(within(dialog).getByRole("switch", { name: "Vidi se krv ili sluz" }))
    fireEvent.change(within(dialog).getByLabelText("Vreme *"), { target: { value: "09:40" } })
    await user.type(within(dialog).getByLabelText("Napomena"), "Posle nove konzerve.")
    createStool.mockResolvedValueOnce({
      ok: true,
      data: stoolEntry("s9", "2026-10-19T07:40:00.000Z", {
        consistency: "soft",
        blood_or_mucus: true,
        note: "Posle nove konzerve.",
      }),
    })
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj unos" }))
    expect(createStool).toHaveBeenCalledWith({
      pet_id: LUNA,
      observed_at: "2026-10-19T07:40:00.000Z",
      consistency: "soft",
      blood_or_mucus: true,
      note: "Posle nove konzerve.",
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(toast).toHaveBeenCalledWith("Unos sačuvan")
    expect(screen.getByText("Meka")).toBeInTheDocument()
    expect(screen.getByText("Krv ili sluz: da")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Još nema unosa stolice" })).not.toBeInTheDocument()
  })

  it("edit uses “Izmeni unos stolice” and EP-18 update", async () => {
    const user = userEvent.setup()
    renderLog({ stool: { items: [stoolEntry("s1", "2026-10-19T07:15:00Z")], total: 1 } })
    await user.click(screen.getByRole("tab", { name: "Stolica" }))
    await user.click(screen.getByRole("button", { name: "Još opcija" }))
    await user.click(await screen.findByRole("menuitem", { name: "Izmeni" }))
    const dialog = await screen.findByRole("dialog", { name: "Izmeni unos stolice" })
    await user.click(within(dialog).getByRole("radio", { name: "Tvrda" }))
    updateStool.mockResolvedValueOnce({ ok: true, data: stoolEntry("s1", "2026-10-19T07:15:00Z", { consistency: "hard" }) })
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj unos" }))
    expect(updateStool).toHaveBeenCalledWith("s1", {
      observed_at: "2026-10-19T07:15:00.000Z",
      consistency: "hard",
      blood_or_mucus: false,
      note: null,
    })
    expect(await screen.findByText("Tvrda")).toBeInTheDocument()
  })
})
