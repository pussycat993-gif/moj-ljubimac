import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S03 DropdownMenu "Premesti u Uspomene" → dialog (date *, reason, note) → EP-06 move_pet_to_memorial
// → toast + redirect to S06 (FR-11). A Free owner's third memorial → premium_required (limit
// memorials) → PremiumLock inside the dialog (FR-11, FR-36, E-02). Owner only: a member sees no item;
// a memorial pet cannot be moved again (owner decision, Step 16).

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const movePetToMemorial = vi.fn()
vi.mock("@/lib/actions/memorial", () => ({ movePetToMemorial: (...a: unknown[]) => movePetToMemorial(...a) }))
vi.mock("@/lib/actions/pdf-export", () => ({ getPdfExportBundle: vi.fn() }))

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
  lifecycle = "active",
  access = { role: "owner", can_edit: true, can_delete: true },
  readOnly = null as string | null,
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
      lifecycle,
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
    read_only_reason: readOnly,
    owner_name: "Ivana Petrović",
    memorial:
      lifecycle === "memorial"
        ? { id: "m1", pet_id: LUNA, date: "2026-10-18", reason: "lost", note: null, created_at: "2026-10-18T10:00:00Z" }
        : null,
    upcoming_reminders: [],
    vaccinations: [],
    treatments: [],
    vet_visits: [],
    weights: [],
    attachment_count: 0,
  } as never
}

function renderRecord(rec: never) {
  return render(<PetRecordClient record={rec} now="2026-10-19T10:00:00Z" locale="sr" copy={copy} />)
}

async function openMemorialDialog() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Još opcija" }))
  await user.click(await screen.findByRole("menuitem", { name: "Premesti u Uspomene" }))
  return user
}

/** Opens the date field's calendar and clicks the day (`YYYY-MM-DD`, react-day-picker `data-day`). */
async function pickDay(user: ReturnType<typeof userEvent.setup>, day: string) {
  await user.click(screen.getByRole("button", { name: /^Datum \*/ }))
  const cell = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[data-day="${day}"] button`)
    if (!found) throw new Error(`no calendar day ${day}`)
    return found
  })
  await user.click(cell)
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

describe("EP-06 — Premesti u Uspomene", () => {
  it("opens the dialog from the DropdownMenu with the mockup copy", async () => {
    renderRecord(record())
    await openMemorialDialog()
    const dialog = screen.getByRole("dialog", { name: "Premesti u Uspomene — Luna" })
    expect(dialog).toHaveTextContent("Karton ostaje sačuvan, a svi podsetnici za ovog ljubimca se zaustavljaju.")
    expect(within(dialog).getByRole("group", { name: "Razlog" })).toBeInTheDocument()
    expect(within(dialog).getByRole("radio", { name: "Preminula" })).toBeChecked()
    expect(within(dialog).getByRole("radio", { name: "Udomljena kod drugih" })).toBeInTheDocument()
    expect(within(dialog).getByRole("radio", { name: "Izgubljena" })).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Napomena")).toHaveAttribute("placeholder", "Nešto što želiš da zapamtiš")
  })

  it("uses the masculine reason forms for a male pet", async () => {
    renderRecord(record({ sex: "male" }))
    await openMemorialDialog()
    const dialog = screen.getByRole("dialog", { name: "Premesti u Uspomene — Maks" })
    expect(within(dialog).getByRole("radio", { name: "Preminuo" })).toBeInTheDocument()
    expect(within(dialog).getByRole("radio", { name: "Udomljen kod drugih" })).toBeInTheDocument()
    expect(within(dialog).getByRole("radio", { name: "Izgubljen" })).toBeInTheDocument()
  })

  it("asks for a date before calling EP-06", async () => {
    renderRecord(record())
    const user = await openMemorialDialog()
    const dialog = screen.getByRole("dialog", { name: "Premesti u Uspomene — Luna" })
    await user.click(within(dialog).getByRole("button", { name: "Premesti u Uspomene" }))
    expect(within(dialog).getByText("Izaberi datum.")).toBeInTheDocument()
    expect(movePetToMemorial).not.toHaveBeenCalled()
  })

  it("FR-11: moves the pet, toasts that reminders stopped and redirects to S06", async () => {
    movePetToMemorial.mockResolvedValue({
      ok: true,
      data: { id: "m1", pet_id: LUNA, date: "2026-10-18", reason: "lost", note: "Pobegla", created_at: "2026-10-19T10:00:00Z" },
    })
    renderRecord(record())
    const user = await openMemorialDialog()
    await pickDay(user, "2026-10-18")
    const dialog = screen.getByRole("dialog", { name: "Premesti u Uspomene — Luna" })
    await user.click(within(dialog).getByRole("radio", { name: "Izgubljena" }))
    await user.type(within(dialog).getByLabelText("Napomena"), "Pobegla")
    await user.click(within(dialog).getByRole("button", { name: "Premesti u Uspomene" }))

    expect(movePetToMemorial).toHaveBeenCalledWith({ pet_id: LUNA, date: "2026-10-18", reason: "lost", note: "Pobegla" })
    expect(toast).toHaveBeenCalledWith("Luna je premeštena u Uspomene. Podsetnici su zaustavljeni.")
    expect(push).toHaveBeenCalledWith("/uspomene")
  })

  it("FR-11 / FR-36: a Free owner's third memorial shows PremiumLock inside the dialog", async () => {
    movePetToMemorial.mockResolvedValue({
      ok: false,
      error: { code: "premium_required", message: "premium_required:memorials", details: { limit: "memorials" } },
    })
    renderRecord(record())
    const user = await openMemorialDialog()
    await pickDay(user, "2026-10-18")
    const dialog = screen.getByRole("dialog", { name: "Premesti u Uspomene — Luna" })
    await user.click(within(dialog).getByRole("button", { name: "Premesti u Uspomene" }))

    expect(within(dialog).getByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
    expect(within(dialog).getByText(dictionaries.sr.petRecord.memorialLockDescription)).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Probaj 7 dana besplatno" })).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Premesti u Uspomene" })).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it("a 5xx closes the dialog with the error toast", async () => {
    movePetToMemorial.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "boom" } })
    renderRecord(record())
    const user = await openMemorialDialog()
    await pickDay(user, "2026-10-18")
    await user.click(
      within(screen.getByRole("dialog", { name: "Premesti u Uspomene — Luna" })).getByRole("button", {
        name: "Premesti u Uspomene",
      }),
    )
    expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
    expect(push).not.toHaveBeenCalled()
  })

  it("a memorial pet has no 'Premesti u Uspomene' item", async () => {
    renderRecord(record({ lifecycle: "memorial" }))
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Još opcija" }))
    expect(await screen.findByRole("menuitem", { name: "Obriši trajno" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Premesti u Uspomene" })).not.toBeInTheDocument()
  })

  it("a household member sees neither the menu nor 'Izvezi PDF'", () => {
    renderRecord(
      record({ access: { role: "member", can_edit: false, can_delete: false }, readOnly: "household_member" }),
    )
    expect(screen.queryByRole("button", { name: "Još opcija" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Izvezi PDF/ })).not.toBeInTheDocument()
  })
})
