import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S03 DropdownMenu "Obriši trajno" → AlertDialog "Da, obriši" → EP-05 delete_pet({ pet_id, confirm: true })
// → toast + redirect to S01 (FR-13). Also the row menus' entry delete dialog (owner decision, Step 14):
// "Obrisati unos?" → EP-08 / EP-09 delete.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const deletePet = vi.fn()
vi.mock("@/lib/actions/pets", () => ({ deletePet: (...a: unknown[]) => deletePet(...a) }))
const deleteWeightEntry = vi.fn()
vi.mock("@/lib/actions/weights", () => ({
  createWeightEntry: vi.fn(),
  updateWeightEntry: vi.fn(),
  deleteWeightEntry: (...a: unknown[]) => deleteWeightEntry(...a),
}))
const deleteVaccination = vi.fn()
vi.mock("@/lib/actions/vaccinations", () => ({ deleteVaccination: (...a: unknown[]) => deleteVaccination(...a) }))

const { PetRecordClient } = await import("@/app/(app)/ljubimci/[id]/pet-record-client")
const { dictionaries } = await import("@/lib/i18n")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const IVANA = "a1000000-0000-4000-8000-000000000001"

const copy = {
  petRecord: dictionaries.sr.petRecord,
  pet: dictionaries.sr.pet,
  petForm: dictionaries.sr.petForm,
  common: dictionaries.sr.common,
}

function record({
  sex = "female",
  access = { role: "owner", can_edit: true, can_delete: true },
} = {}) {
  return {
    pet: {
      id: LUNA,
      owner_id: IVANA,
      organisation_id: null,
      name: sex === "female" ? "Luna" : "Maks",
      species: sex === "female" ? "cat" : "dog",
      species_other: null,
      breed: null,
      sex,
      birth_date: null,
      birth_year: null,
      colour_markings: null,
      microchip_number: null,
      passport_number: null,
      neutered: "unknown",
      has_photo: false,
      photo_file_name: null,
      vet_name: null,
      vet_phone: null,
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
    can_log: true,
    read_only_reason: null,
    owner_name: "Ivana Petrović",
    memorial: null,
    upcoming_reminders: [],
    vaccinations: [
      {
        id: "v1",
        pet_id: LUNA,
        name: "Besnilo — Rabisin",
        given_on: "2025-10-26",
        next_due_on: null,
        days_until_due: null,
        clinic: null,
        batch_number: null,
        note: null,
        created_by: IVANA,
        created_at: "2025-10-26T08:00:00Z",
        updated_at: "2025-10-26T08:00:00Z",
      },
    ],
    treatments: [],
    vet_visits: [],
    weights: [
      {
        id: "w1",
        pet_id: LUNA,
        measured_on: "2026-10-19",
        value: 4.2,
        weight_unit: "kg",
        note: null,
        created_by: IVANA,
        created_by_name: "Ivana Petrović",
        created_at: "2026-10-19T08:00:00Z",
        access: { role: "owner", can_edit: true, can_delete: true },
      },
    ],
    attachment_count: 0,
  } as never
}

function renderRecord(rec: never) {
  return render(<PetRecordClient record={rec} now="2026-10-19T10:00:00Z" locale="sr" copy={copy} />)
}

async function openDeleteDialog() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Još opcija" }))
  await user.click(await screen.findByRole("menuitem", { name: "Obriši trajno" }))
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

describe("EP-05 — Obriši trajno", () => {
  it("asks for confirmation before deleting", async () => {
    renderRecord(record())
    await openDeleteDialog()
    const dialog = screen.getByRole("alertdialog", { name: "Trajno obriši karton — Luna?" })
    expect(dialog).toHaveTextContent("Brišu se svi unosi, prilozi, trenuci i podsetnici. Ovo ne može da se poništi.")
    expect(deletePet).not.toHaveBeenCalled()
  })

  it("Odustani closes the dialog without deleting", async () => {
    renderRecord(record())
    const user = await openDeleteDialog()
    await user.click(screen.getByRole("button", { name: "Odustani" }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(deletePet).not.toHaveBeenCalled()
  })

  it("“Da, obriši” calls delete_pet with confirm: true, then toasts and redirects to S01", async () => {
    deletePet.mockResolvedValue({ ok: true, data: { deleted_pet_id: LUNA } })
    renderRecord(record())
    const user = await openDeleteDialog()
    await user.click(screen.getByRole("button", { name: "Da, obriši" }))
    expect(deletePet).toHaveBeenCalledWith({ pet_id: LUNA, confirm: true })
    expect(toast).toHaveBeenCalledWith("Luna je trajno obrisana, sa svim unosima i podsetnicima.")
    expect(push).toHaveBeenCalledWith("/ljubimci")
  })

  it("uses the masculine form for a male pet", async () => {
    deletePet.mockResolvedValue({ ok: true, data: { deleted_pet_id: LUNA } })
    renderRecord(record({ sex: "male" }))
    const user = await openDeleteDialog()
    await user.click(screen.getByRole("button", { name: "Da, obriši" }))
    expect(toast).toHaveBeenCalledWith("Maks je trajno obrisan, sa svim unosima i podsetnicima.")
  })

  it("an error shows the error toast and stays on S03", async () => {
    deletePet.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "x" } })
    renderRecord(record())
    const user = await openDeleteDialog()
    await user.click(screen.getByRole("button", { name: "Da, obriši" }))
    expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
    expect(push).not.toHaveBeenCalled()
  })

  it("is not offered without can_delete (volunteer)", () => {
    renderRecord(record({ access: { role: "volunteer", can_edit: true, can_delete: false } }))
    expect(screen.getByRole("link", { name: "Izmeni" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Još opcija" })).not.toBeInTheDocument()
  })
})

describe("entry delete dialog (owner decision, Step 14)", () => {
  it("deletes a weight entry after “Obrisati unos?”", async () => {
    deleteWeightEntry.mockResolvedValue({ ok: true, data: { id: "w1" } })
    renderRecord(record())
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: "Težina" }))
    await user.click(screen.getByRole("button", { name: "Još opcija: 19. 10. 2026." }))
    await user.click(await screen.findByRole("menuitem", { name: "Obriši" }))
    const dialog = screen.getByRole("alertdialog", { name: "Obrisati unos?" })
    expect(dialog).toHaveTextContent("Ovo ne može da se poništi.")
    await user.click(screen.getByRole("button", { name: "Da, obriši" }))
    expect(deleteWeightEntry).toHaveBeenCalledWith("w1")
    expect(refresh).toHaveBeenCalled()
  })

  it("deletes a vaccination after “Obrisati unos?”", async () => {
    deleteVaccination.mockResolvedValue({ ok: true, data: { id: "v1" } })
    renderRecord(record())
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: "Vakcine" }))
    expect(screen.getByText("Bez sledeće doze")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Još opcija: Besnilo — Rabisin" }))
    await user.click(await screen.findByRole("menuitem", { name: "Obriši" }))
    await user.click(screen.getByRole("button", { name: "Da, obriši" }))
    expect(deleteVaccination).toHaveBeenCalledWith("v1")
  })
})
