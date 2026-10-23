import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { LittersActions } from "@/app/(org)/organizacija/legla/litters-screen"
import type { MyOrganisation } from "@/lib/actions/organisation"
import type { Litter, LittersPage } from "@/lib/actions/litters"
import type { ActionResult } from "@/lib/server/result"

// S22 Legla (Step 26) · states from EP-61 (API §7.3): default (litter cards from list_litters, the first expanded,
// offspring rows with status and "Cena (RSD)"), empty (items []), read_only (access.can_edit = false → the plan
// banner, no "Novo leglo", controls disabled), error; the new litter Dialog calls EP-61 createLitter (inline errors,
// count 1–20); offspring status / price changes call EP-61 updateOffspring.

const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const { LittersScreen, LittersLoading } = await import("@/app/(org)/organizacija/legla/litters-screen")
const { dictionaries } = await import("@/lib/i18n")

const BELA = "f9260000-0000-4000-8000-000000000001"

const copy = (locale: "sr" | "en" = "sr") => ({
  litters: dictionaries[locale].litters,
  orgAnimals: dictionaries[locale].orgAnimals,
  orgProfile: dictionaries[locale].orgProfile,
  petForm: dictionaries[locale].petForm,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

function org(planActive = true): MyOrganisation {
  return {
    organisation: {
      id: "b2000000-0000-4000-8000-000000000002",
      type: "breeder",
      name: "Odgajivačnica Đorđević",
      slug: "odgajivacnica-djordjevic",
      public_path: "/o/odgajivacnica-djordjevic",
      city: { id: "c", name_sr: "Beograd", name_en: "Belgrade", latitude: 0, longitude: 0 },
      approval_status: "approved",
      rejection_reason: null,
      tax_id: null,
      registration_note: null,
      description: null,
      phone: null,
      email: null,
      website: null,
      logo_url: null,
      donation: null,
      member_count: 1,
      member_limit: 20,
      created_at: "2026-10-01T00:00:00Z",
    },
    team: [],
    pending_invitations: [],
    breeder_plan_active: planActive,
    access: { role: "org_admin", can_edit: planActive, can_delete: planActive },
  }
}

const litterOne: Litter = {
  id: "e2600000-0000-4000-8000-000000000001",
  mother: { pet_id: BELA, name: "Bela" },
  breed: "Zlatni retriver",
  father_id: null,
  father_name: "Rex",
  father_external: true,
  born_on: "2026-08-15",
  offspring_count: 3,
  available_count: 2,
  offspring: [
    {
      pet_id: "e2600000-0000-4000-8000-000000000101",
      name: "Zlatko",
      sex: "male",
      offspring_status: "available",
      price: { amount_minor: 12_000_000, currency: "RSD" },
    },
    { pet_id: "e2600000-0000-4000-8000-000000000102", name: "Mila", sex: "female", offspring_status: "reserved", price: null },
    { pet_id: "e2600000-0000-4000-8000-000000000103", name: "Mladunče 3", sex: "unknown", offspring_status: "available", price: null },
  ],
}

const litterTwo: Litter = {
  id: "e2600000-0000-4000-8000-000000000002",
  mother: { pet_id: "f9260000-0000-4000-8000-000000000003", name: "Daša" },
  breed: "Zlatni retriver",
  father_id: "f9260000-0000-4000-8000-000000000002",
  father_name: "Ares",
  father_external: false,
  born_on: "2026-03-02",
  offspring_count: 1,
  available_count: 0,
  offspring: [{ pet_id: "e2600000-0000-4000-8000-000000000201", name: "Nala", sex: "female", offspring_status: "sold", price: null }],
}

function page(items: Litter[], canEdit = true): LittersPage {
  return {
    items,
    eligible_mothers: [{ pet_id: BELA, name: "Bela" }],
    eligible_fathers: [],
    access: { role: "org_admin", can_edit: canEdit, can_delete: canEdit },
  }
}

function actions(): LittersActions & { [K in keyof LittersActions]: ReturnType<typeof vi.fn> } {
  return {
    listLitters: vi.fn(),
    createLitter: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        ...litterOne,
        id: "e2600000-0000-4000-8000-000000000009",
        father_name: input.father_name ?? null,
        born_on: input.born_on,
        offspring_count: input.offspring_count,
        available_count: input.offspring_count,
        offspring: [
          { pet_id: "e2600000-0000-4000-8000-000000000901", name: "Mladunče 1", sex: "unknown", offspring_status: "available", price: null },
        ],
      },
    })),
    updateOffspring: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        ...litterOne.offspring.find((o) => o.pet_id === input.pet_id)!,
        ...(input.offspring_status ? { offspring_status: input.offspring_status } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
      },
    })),
  } as never
}

function renderScreen(
  litters: ActionResult<LittersPage>,
  a = actions(),
  locale: "sr" | "en" = "sr",
  organisation: ActionResult<MyOrganisation> = { ok: true, data: org() },
) {
  render(<LittersScreen initialOrg={organisation} initialLitters={litters} locale={locale} copy={copy(locale)} actions={a} />)
  return a
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

beforeAll(() => {
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("S22 — default (EP-61 list)", () => {
  it("shows the litter cards: parents, breed and birth date, counts; the first card is expanded", () => {
    renderScreen({ ok: true, data: page([litterOne, litterTwo]) })
    expect(screen.getByRole("heading", { level: 1, name: "Legla" })).toBeInTheDocument()
    expect(screen.getByText("Odgajivačnica Đorđević, Beograd")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Bela × Rex (spoljni pastuv)" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Daša × Ares" })).toBeInTheDocument()
    expect(screen.getByText("Zlatni retriver · okot 15. 8. 2026.")).toBeInTheDocument()
    expect(screen.getByText("3 mladunčeta · 2 dostupno")).toBeInTheDocument()
    expect(screen.getByText("1 mladunče · 0 dostupno")).toBeInTheDocument()

    const [first, second] = screen.getAllByRole("button", { expanded: true }).concat(screen.getAllByRole("button", { expanded: false }))
    expect(first).toHaveAttribute("aria-expanded", "true")
    expect(second).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("link", { name: "Zlatko" })).toHaveAttribute("href", "/ljubimci/e2600000-0000-4000-8000-000000000101")
    expect(screen.getByText("Mužjak · 120.000 RSD")).toBeInTheDocument()
    expect(screen.getByText("Ženka · Cena nije upisana")).toBeInTheDocument()
    // Unknown sex is left out (owner decision).
    expect(screen.getByText("Cena nije upisana")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Nala" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Novo leglo" })).toBeInTheDocument()
  })

  it("toggles a litter open and closed", async () => {
    const user = userEvent.setup()
    renderScreen({ ok: true, data: page([litterOne, litterTwo]) })
    await user.click(screen.getByRole("button", { name: /Daša × Ares/ }))
    expect(screen.getByRole("link", { name: "Nala" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Bela × Rex/ }))
    expect(screen.queryByRole("link", { name: "Zlatko" })).not.toBeInTheDocument()
  })

  it("changes an offspring's status through EP-61 and updates the badge and count", async () => {
    const user = userEvent.setup()
    const a = renderScreen({ ok: true, data: page([litterOne]) })
    await user.click(screen.getByRole("combobox", { name: "Status za Zlatko" }))
    await user.click(await screen.findByRole("option", { name: "Prodato" }))
    expect(a.updateOffspring).toHaveBeenCalledWith({ pet_id: "e2600000-0000-4000-8000-000000000101", offspring_status: "sold" })
    expect(await screen.findByText("3 mladunčeta · 1 dostupno")).toBeInTheDocument()
  })

  it("saves a price (RSD) on blur through EP-61; an empty price clears it", async () => {
    const user = userEvent.setup()
    const a = renderScreen({ ok: true, data: page([litterOne]) })
    const mila = screen.getByLabelText("Cena (RSD) — Mila")
    await user.type(mila, "130000")
    fireEvent.blur(mila)
    expect(a.updateOffspring).toHaveBeenCalledWith({
      pet_id: "e2600000-0000-4000-8000-000000000102",
      price: { amount_minor: 13_000_000, currency: "RSD" },
    })
    expect(await screen.findByText("Ženka · 130.000 RSD")).toBeInTheDocument()

    const zlatko = screen.getByLabelText("Cena (RSD) — Zlatko")
    expect(zlatko).toHaveValue(120000)
    await user.clear(zlatko)
    fireEvent.blur(zlatko)
    expect(a.updateOffspring).toHaveBeenLastCalledWith({ pet_id: "e2600000-0000-4000-8000-000000000101", price: null })
  })

  it("a failed update shows the generic toast", async () => {
    const user = userEvent.setup()
    const a = actions()
    a.updateOffspring.mockResolvedValueOnce({ ok: false, error: { code: "breeder_plan_required", message: "x" } })
    renderScreen({ ok: true, data: page([litterOne]) }, a)
    await user.click(screen.getByRole("combobox", { name: "Status za Zlatko" }))
    await user.click(await screen.findByRole("option", { name: "Rezervisano" }))
    expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
    expect(screen.getByText("3 mladunčeta · 2 dostupno")).toBeInTheDocument()
  })
})

describe("S22 — empty and the new litter Dialog (EP-61 create)", () => {
  it("shows the empty state from items [] with the Novo leglo action", async () => {
    const user = userEvent.setup()
    renderScreen({ ok: true, data: page([]) })
    expect(screen.getByRole("heading", { name: "Još nema legla" })).toBeInTheDocument()
    expect(screen.getByText("Upiši prvo leglo i svako mladunče dobija svoj karton od rođenja.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Novo leglo" }))
    expect(await screen.findByRole("dialog", { name: "Novo leglo" })).toBeInTheDocument()
  })

  it("validates the Dialog, then creates the litter with father_name and shows it", async () => {
    const user = userEvent.setup()
    const a = renderScreen({ ok: true, data: page([]) })
    await user.click(screen.getByRole("button", { name: "Novo leglo" }))
    const dialog = await screen.findByRole("dialog", { name: "Novo leglo" })
    const count = within(dialog).getByLabelText("Broj mladunaca")
    await user.clear(count)
    await user.type(count, "25")
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj leglo" }))
    expect(within(dialog).getByText("Izaberi majku.")).toBeInTheDocument()
    expect(within(dialog).getByText("Izaberi datum okota.")).toBeInTheDocument()
    expect(within(dialog).getByText("Upiši broj od 1 do 20.")).toBeInTheDocument()
    expect(a.createLitter).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole("combobox", { name: "Majka *" }))
    await user.click(await screen.findByRole("option", { name: "Bela" }))
    await user.type(within(dialog).getByLabelText("Otac"), "Rex")
    await user.click(within(dialog).getByRole("button", { name: /^Datum okota/ }))
    const cell = document.querySelector<HTMLElement>(`[data-day="${today()}"] button`)
    if (!cell) throw new Error("no calendar day for today")
    await user.click(cell)
    await user.clear(count)
    await user.type(count, "3")
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj leglo" }))

    expect(a.createLitter).toHaveBeenCalledWith({ mother_id: BELA, father_name: "Rex", born_on: today(), offspring_count: 3 })
    expect(await screen.findByRole("heading", { level: 2, name: "Bela × Rex (spoljni pastuv)" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "Novo leglo" })).not.toBeInTheDocument()
  })

  it("shows the database's field error inline (422 mother_id)", async () => {
    const user = userEvent.setup()
    const a = actions()
    a.createLitter.mockResolvedValueOnce({
      ok: false,
      error: { code: "validation_failed", message: "x", fields: { mother_id: "invalid" } },
    })
    renderScreen({ ok: true, data: page([]) }, a)
    await user.click(screen.getByRole("button", { name: "Novo leglo" }))
    const dialog = await screen.findByRole("dialog", { name: "Novo leglo" })
    await user.click(within(dialog).getByRole("combobox", { name: "Majka *" }))
    await user.click(await screen.findByRole("option", { name: "Bela" }))
    await user.click(within(dialog).getByRole("button", { name: /^Datum okota/ }))
    await user.click(document.querySelector<HTMLElement>(`[data-day="${today()}"] button`)!)
    await user.click(within(dialog).getByRole("button", { name: "Sačuvaj leglo" }))
    expect(await within(dialog).findByText("Izaberi majku.")).toBeInTheDocument()
  })
})

describe("S22 — read_only, error, loading, English", () => {
  it("read_only (no breeder plan): banner, no Novo leglo, controls disabled", () => {
    renderScreen({ ok: true, data: page([litterOne], false) }, actions(), "sr", { ok: true, data: org(false) })
    expect(screen.getByText("Odgajivački plan nije aktivan — sve možeš samo da pregledaš.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Novo leglo" })).not.toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Status za Zlatko" })).toBeDisabled()
    expect(screen.getByLabelText("Cena (RSD) — Zlatko")).toBeDisabled()
  })

  it("read_only empty: no action in the empty state", () => {
    renderScreen({ ok: true, data: page([], false) }, actions(), "sr", { ok: true, data: org(false) })
    expect(screen.getByRole("heading", { name: "Još nema legla" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Novo leglo" })).not.toBeInTheDocument()
  })

  it("error: EP-61 failure → ErrorState with retry", async () => {
    const user = userEvent.setup()
    renderScreen({ ok: false, error: { code: "internal_error", message: "x" } })
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    await user.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(refresh).toHaveBeenCalled()
  })

  it("loading: the Suspense fallback is busy", () => {
    render(<LittersLoading label="Učitavanje" />)
    expect(screen.getByLabelText("Učitavanje")).toHaveAttribute("aria-busy", "true")
  })

  it("renders the English dictionary", () => {
    renderScreen({ ok: true, data: page([litterOne]) }, actions(), "en")
    expect(screen.getByRole("heading", { level: 1, name: "Litters" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Bela × Rex (outside sire)" })).toBeInTheDocument()
    expect(screen.getByText("Zlatni retriver · born 15 Aug 2026")).toBeInTheDocument()
    expect(screen.getByText("3 young · 2 available")).toBeInTheDocument()
    expect(screen.getByText("Male · 120,000 RSD")).toBeInTheDocument()
  })
})
