import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S03 read_only (05- §7.3): FR-28 — a member adds weight entries but cannot change someone else's
// (row actions only where the entry's access.can_edit is true), and views vaccinations without add /
// edit controls; the ReadOnlyBanner text follows read_only_reason. Controls are hidden, never disabled.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
vi.mock("@/lib/actions/pets", () => ({ deletePet: vi.fn() }))
const createWeightEntry = vi.fn()
vi.mock("@/lib/actions/weights", () => ({
  createWeightEntry: (...a: unknown[]) => createWeightEntry(...a),
  updateWeightEntry: vi.fn(),
  deleteWeightEntry: vi.fn(),
}))
vi.mock("@/lib/actions/vaccinations", () => ({ deleteVaccination: vi.fn() }))

const { PetRecordClient } = await import("@/app/(app)/ljubimci/[id]/pet-record-client")
const { dictionaries } = await import("@/lib/i18n")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const IVANA = "a1000000-0000-4000-8000-000000000001"
const JELENA = "a1000000-0000-4000-8000-000000000003"

type Reason = "household_member" | "household_read_only" | "transferred" | null

const copy = (locale: "sr" | "en") => ({
  petRecord: dictionaries[locale].petRecord,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

function weight(id: string, measured_on: string, value: number, createdBy: string, canEdit: boolean, role = "member") {
  return {
    id,
    pet_id: LUNA,
    measured_on,
    value,
    weight_unit: "kg",
    note: null,
    created_by: createdBy,
    created_by_name: createdBy === IVANA ? "Ivana Petrović" : "Jelena Nikolić",
    created_at: `${measured_on}T08:00:00Z`,
    access: { role, can_edit: canEdit, can_delete: canEdit },
  }
}

function record({
  access = { role: "member", can_edit: false, can_delete: false },
  canLog = true,
  reason = "household_member" as Reason,
  weights = [
    weight("w1", "2026-04-17", 3.8, IVANA, false),
    weight("w6", "2026-10-19", 4.2, JELENA, true),
  ],
} = {}) {
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
      microchip_number: null,
      passport_number: null,
      neutered: "yes",
      has_photo: false,
      photo_file_name: null,
      vet_name: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
      vet_phone: "021 456 789",
      weight_unit: "kg",
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
    access,
    can_log: canLog,
    read_only_reason: reason,
    owner_name: "Ivana Petrović",
    memorial: null,
    upcoming_reminders: [],
    vaccinations: [
      {
        id: "v1",
        pet_id: LUNA,
        name: "Besnilo — Rabisin",
        given_on: "2025-10-26",
        next_due_on: "2026-10-26",
        days_until_due: 7,
        clinic: "Veterinarska ambulanta „Dr Vet”",
        batch_number: "RB-24-0917",
        note: null,
        created_by: IVANA,
        created_at: "2025-10-26T08:00:00Z",
        updated_at: "2025-10-26T08:00:00Z",
      },
    ],
    treatments: [],
    vet_visits: [],
    weights,
    attachment_count: 0,
  } as never
}

function renderRecord(rec: never, locale: "sr" | "en" = "sr") {
  return render(<PetRecordClient record={rec} now="2026-10-19T10:00:00Z" locale={locale} copy={copy(locale)} />)
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

describe("household member (read_only_reason household_member)", () => {
  it("shows the member ReadOnlyBanner with the owner's name", () => {
    renderRecord(record())
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ti si član domaćinstva (vlasnik: Ivana Petrović). Možeš da pregledaš karton, označiš podsetnike i date doze, a medicinske unose menja samo vlasnik.",
    )
  })

  it("hides the pet's Izmeni link and the DropdownMenu", () => {
    renderRecord(record())
    expect(screen.queryByRole("link", { name: "Izmeni" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Još opcija" })).not.toBeInTheDocument()
  })

  it("FR-28: views vaccinations without add, edit or delete controls", async () => {
    renderRecord(record())
    await userEvent.setup().click(screen.getByRole("tab", { name: "Vakcine" }))
    expect(screen.getByText("Besnilo — Rabisin")).toBeInTheDocument()
    expect(screen.getByText("Sledeća 26. 10. 2026. · za 7 dana")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Dodaj vakcinu/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Još opcija/ })).not.toBeInTheDocument()
  })

  it("FR-28: offers Dodaj merenje (can_log) and row actions only on the member's own entry", async () => {
    renderRecord(record())
    await userEvent.setup().click(screen.getByRole("tab", { name: "Težina" }))
    expect(screen.getByRole("button", { name: "Dodaj merenje" })).toBeInTheDocument()
    const list = screen.getByRole("heading", { name: "Sva merenja" }).parentElement!
    const [own, others] = within(list).getAllByRole("listitem")
    expect(own).toHaveTextContent("19. 10. 2026.")
    expect(within(own).getByRole("button", { name: "Još opcija: 19. 10. 2026." })).toBeInTheDocument()
    expect(others).toHaveTextContent("17. 4. 2026.")
    expect(within(others).queryByRole("button")).not.toBeInTheDocument()
  })

  it("FR-28: the member's weight goes through EP-08", async () => {
    createWeightEntry.mockResolvedValue({ ok: true, data: {} })
    renderRecord(record())
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: "Težina" }))
    await user.click(screen.getByRole("button", { name: "Dodaj merenje" }))
    await user.type(screen.getByLabelText("Težina (kg) *"), "4,3")
    await user.click(screen.getByRole("button", { name: "Sačuvaj merenje" }))
    expect(createWeightEntry).toHaveBeenCalledWith(expect.objectContaining({ pet_id: LUNA, value: 4.3 }))
  })

  it("a forbidden write answers with the error toast and reloads the record", async () => {
    createWeightEntry.mockResolvedValue({ ok: false, error: { code: "household_read_only", message: "household_read_only" } })
    renderRecord(record())
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: "Težina" }))
    await user.click(screen.getByRole("button", { name: "Dodaj merenje" }))
    await user.type(screen.getByLabelText("Težina (kg) *"), "4,3")
    await user.click(screen.getByRole("button", { name: "Sačuvaj merenje" }))
    expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
    expect(refresh).toHaveBeenCalled()
  })

  it("speaks English with the English dictionary", () => {
    renderRecord(record(), "en")
    expect(screen.getByRole("status")).toHaveTextContent(
      "You're a member of Ivana Petrović's household. You can view the record, mark reminders and log doses; only the owner changes medical entries.",
    )
  })
})

describe("read-only household (household_read_only)", () => {
  const readOnly = () =>
    record({
      canLog: false,
      reason: "household_read_only",
      weights: [weight("w1", "2026-04-17", 3.8, IVANA, false), weight("w6", "2026-10-19", 4.2, JELENA, false)],
    })

  it("shows the read-only banner", () => {
    renderRecord(readOnly())
    expect(screen.getByRole("status")).toHaveTextContent("Domaćinstvo je samo za čitanje dok vlasnik ne obnovi Premium.")
  })

  it("hides Dodaj merenje and every row action", async () => {
    renderRecord(readOnly())
    await userEvent.setup().click(screen.getByRole("tab", { name: "Težina" }))
    expect(screen.queryByRole("button", { name: "Dodaj merenje" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Još opcija/ })).not.toBeInTheDocument()
  })
})

describe("organisation copy after a transfer (transferred)", () => {
  it("shows the transferred banner and no edit controls", async () => {
    renderRecord(
      record({
        access: { role: "org_admin", can_edit: false, can_delete: false },
        canLog: false,
        reason: "transferred",
        weights: [weight("w1", "2026-04-17", 3.8, IVANA, false, "org_admin")],
      }),
    )
    expect(screen.getByRole("status")).toHaveTextContent("Karton je predat novom vlasniku. Ovo je kopija samo za čitanje.")
    expect(screen.queryByRole("link", { name: "Izmeni" })).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole("tab", { name: "Vakcine" }))
    expect(screen.queryByRole("button", { name: /Još opcija/ })).not.toBeInTheDocument()
  })
})

describe("owner (can_edit)", () => {
  it("shows no banner and the vaccination add and row controls", async () => {
    renderRecord(
      record({
        access: { role: "owner", can_edit: true, can_delete: true },
        reason: null,
        weights: [weight("w1", "2026-04-17", 3.8, IVANA, true, "owner")],
      }),
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Izmeni" })).toHaveAttribute("href", `/ljubimci/${LUNA}/izmena`)
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: "Vakcine" }))
    expect(screen.getByRole("link", { name: "Dodaj vakcinu" })).toHaveAttribute("href", `/ljubimci/${LUNA}/vakcine/nova`)
    await user.click(screen.getByRole("button", { name: "Još opcija: Besnilo — Rabisin" }))
    expect(await screen.findByRole("menuitem", { name: "Izmeni" })).toHaveAttribute("href", `/ljubimci/${LUNA}/vakcine/v1`)
  })
})
