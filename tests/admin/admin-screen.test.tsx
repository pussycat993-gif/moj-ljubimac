import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AdminData } from "@/app/admin/admin-screen"
import type { AdminPartner, PendingOrganisation } from "@/lib/actions/admin"

// S26 Administracija (Step 28) · FR-58: the Statistika tab renders the EP-70 clicks per partner and action;
// EP-71: the Kanali Viber Switch calls setAppSettings — switching on only after the cost-warning confirm.
// Also FR-57 on the screen: approve / reject (with reason) through EP-68 and the notice; the Partneri table
// with the Istaknut Switch "n / 3" / "3 / 3 — limit" and the toast for featured_limit_reached; the edit
// Dialog saves through EP-69; loading / empty / error states; ?tab=moderacija opens the Moderacija tab (Step 28c).

const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }
let search = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/admin",
  useSearchParams: () => search,
}))

const actions = {
  decideOrganisation: vi.fn(),
  geocodeAddress: vi.fn(),
  createPartnerLogoUpload: vi.fn(),
  savePartner: vi.fn(),
  setAppSettings: vi.fn(),
}
vi.mock("@/lib/actions/admin", () => actions)

const { AdminScreen } = await import("@/app/admin/admin-screen")
const { dictionaries } = await import("@/lib/i18n")

const NOVI_SAD = { id: "c1", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.26, longitude: 19.83 }
const BECEJ = { id: "c2", name_sr: "Bečej", name_en: "Becej", latitude: 45.6, longitude: 20.03 }

function pendingOrg(extra: Partial<PendingOrganisation> = {}): PendingOrganisation {
  return {
    id: "b2000000-0000-4000-8000-000000000001",
    type: "shelter",
    name: "Azil Šapica",
    city: BECEJ,
    tax_id: "112233445",
    registration_note: "Oko 40 pasa i 25 mačaka.",
    email: null,
    phone: null,
    contact_full_name: "Milica Stojanović",
    contact_email: "milica.stojanovic@mojljubimac.test",
    approval_status: "pending",
    rejection_reason: null,
    registered_at: "2026-10-18T08:00:00Z",
    ...extra,
  }
}

function partner(extra: Partial<AdminPartner> = {}): AdminPartner {
  return {
    id: "e1000000-0000-4000-8000-000000000001",
    type: "vet",
    name: "Veterinarska ambulanta „Dr Vet“",
    initials: "DV",
    address: "Bulevar oslobođenja 45, Novi Sad",
    city: NOVI_SAD,
    phone: "+381 21 455 100",
    message_channel: "whatsapp",
    message_number: "+381 64 455 1000",
    email: "kontakt@drvet.rs",
    website: "https://drvet.rs",
    instagram: "drvet.ns",
    description: null,
    logo_url: null,
    latitude: 45.2541,
    longitude: 19.8425,
    featured: true,
    paid_until: "2027-12-31",
    active: true,
    distance_km: null,
    hours: [{ weekday: 1, opens: "08:00", closes: "20:00" }],
    today_hours: null,
    featured_count: 1,
    ...extra,
  }
}

function data(extra: Partial<AdminData> = {}): AdminData {
  return {
    pending: { ok: true, data: { items: [pendingOrg()], total: 1 } },
    partners: {
      ok: true,
      data: {
        items: [
          partner(),
          partner({ id: "p2", name: "Pet hotel „Kod Mace“", type: "pet_hotel", featured: false, featured_count: 0, active: false, paid_until: "2026-09-30" }),
          partner({ id: "p3", name: "Veterinarska stanica „Zdrava šapa“", featured: false, featured_count: 3 }),
        ],
        total: 3,
      },
    },
    stats: {
      ok: true,
      data: {
        period: "2026-10",
        available_periods: ["2026-10", "2026-09"],
        items: [
          { partner_id: "e1", partner_name: "Veterinarska ambulanta „Dr Vet“", partner_type: "vet", city_name_sr: "Novi Sad", call: 142, message: 61, email: 18, website: 44, total: 265 },
          { partner_id: "e2", partner_name: "Pet shop „Šapica“", partner_type: "pet_shop", city_name_sr: "Novi Sad", call: 37, message: 52, email: 9, website: 71, total: 169 },
        ],
        total: 2,
      },
    },
    settings: { ok: true, data: { viber_enabled: false, whatsapp_monthly_cap: 30, updated_at: "2026-10-20T08:00:00Z" } },
    cities: [BECEJ, NOVI_SAD],
    ...extra,
  }
}

const copy = (locale: "sr" | "en") => ({
  admin: dictionaries[locale].admin,
  common: dictionaries[locale].common,
  shell: dictionaries[locale].shell.app,
})

function renderScreen(d: AdminData | null = data(), tab?: string, locale: "sr" | "en" = "sr") {
  search = new URLSearchParams(tab ? { tab } : {})
  return render(<AdminScreen data={d} copy={copy(locale)} locale={locale} user={{ name: "Ana Marković" }} />)
}

beforeEach(() => vi.clearAllMocks())

describe("S26 Statistika (FR-58, EP-70)", () => {
  it("renders the clicks per partner and action for the period", () => {
    renderScreen(data(), "statistika")
    expect(screen.getByRole("heading", { name: "Klikovi po partneru" })).toBeInTheDocument()
    const rows = screen.getAllByRole("row")
    expect(within(rows[0]).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Partner",
      "Pozovi",
      "Poruka",
      "Mejl",
      "Sajt",
      "Ukupno",
    ])
    expect(within(rows[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Veterinarska ambulanta „Dr Vet“",
      "142",
      "61",
      "18",
      "44",
      "265",
    ])
    expect(within(rows[2]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Pet shop „Šapica“", "37", "52", "9", "71", "169"])
    expect(screen.getByLabelText("Period")).toBeInTheDocument()
  })

  it("shows the empty state when the period has no clicks", () => {
    renderScreen(
      data({ stats: { ok: true, data: { period: "2026-10", available_periods: [], items: [], total: 0 } } }),
      "statistika",
    )
    expect(screen.getByText("Još nema klikova")).toBeInTheDocument()
  })

  it("shows the error state and retries with a refresh", async () => {
    renderScreen(data({ stats: { ok: false } }), "statistika")
    await userEvent.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(router.refresh).toHaveBeenCalled()
  })
})

describe("S26 Kanali (EP-71)", () => {
  it("switching Viber on asks for the cost confirmation, then calls setAppSettings", async () => {
    actions.setAppSettings.mockResolvedValue({ ok: true, data: { viber_enabled: true, whatsapp_monthly_cap: 30, updated_at: "x" } })
    renderScreen(data(), "kanali")
    expect(screen.getByText("Isključen")).toBeInTheDocument()
    expect(screen.getByText(/Limit: 30 WhatsApp\/Viber poruka/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("switch", { name: "Viber" }))
    expect(actions.setAppSettings).not.toHaveBeenCalled()
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Uključiti Viber?")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Da, uključi" }))

    expect(actions.setAppSettings).toHaveBeenCalledWith({ viber_enabled: true })
    // Badge "Uključen" next to Viber (the WhatsApp card always says "Uključen" too).
    await waitFor(() => expect(screen.getAllByText("Uključen")).toHaveLength(2))
    expect(screen.getByRole("switch", { name: "Viber" })).toBeChecked()
  })

  it("switching Viber off calls setAppSettings at once; a refusal shows the error toast", async () => {
    actions.setAppSettings.mockResolvedValue({ ok: false, error: { code: "forbidden_role", message: "" } })
    renderScreen(data({ settings: { ok: true, data: { viber_enabled: true, whatsapp_monthly_cap: 30, updated_at: "x" } } }), "kanali")
    await userEvent.click(screen.getByRole("switch", { name: "Viber" }))
    expect(actions.setAppSettings).toHaveBeenCalledWith({ viber_enabled: false })
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
    expect(screen.getAllByText("Uključen")).toHaveLength(2)
    expect(screen.getByRole("switch", { name: "Viber" })).toBeChecked()
  })
})

describe("S26 Azili na čekanju (FR-57 #1, EP-68)", () => {
  it("lists the pending shelter and approves it", async () => {
    actions.decideOrganisation.mockResolvedValue({ ok: true, data: pendingOrg({ approval_status: "approved" }) })
    renderScreen()
    expect(screen.getByRole("heading", { name: "Azil Šapica" })).toBeInTheDocument()
    expect(screen.getByText("Bečej · Milica Stojanović · milica.stojanovic@mojljubimac.test")).toBeInTheDocument()
    expect(screen.getByText("Prijava 18. 10. 2026.")).toBeInTheDocument()
    expect(screen.getByText("PIB 112233445 · Oko 40 pasa i 25 mačaka.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Odobri" }))
    expect(actions.decideOrganisation).toHaveBeenCalledWith({
      organisation_id: "b2000000-0000-4000-8000-000000000001",
      decision: "approve",
      rejection_reason: null,
    })
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Azil Šapica je odobren. Poslali smo mejl na milica.stojanovic@mojljubimac.test.",
    )
    expect(screen.queryByRole("heading", { name: "Azil Šapica" })).not.toBeInTheDocument()
    expect(router.refresh).toHaveBeenCalled()
  })

  it("rejects with a reason after the confirmation", async () => {
    actions.decideOrganisation.mockResolvedValue({ ok: true, data: pendingOrg({ approval_status: "rejected" }) })
    renderScreen()
    await userEvent.click(screen.getByRole("button", { name: "Odbij" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Odbiti Azil Šapica?")).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText("Razlog (opciono)"), "Nedostaje dokaz.")
    await userEvent.click(within(dialog).getByRole("button", { name: "Da, odbij" }))
    expect(actions.decideOrganisation).toHaveBeenCalledWith({
      organisation_id: "b2000000-0000-4000-8000-000000000001",
      decision: "reject",
      rejection_reason: "Nedostaje dokaz.",
    })
    expect(await screen.findByRole("status")).toHaveTextContent("Azil Šapica je odbijen i obavešten mejlom.")
  })

  it("shows the empty state", () => {
    renderScreen(data({ pending: { ok: true, data: { items: [], total: 0 } } }))
    expect(screen.getByText("Nema azila na čekanju")).toBeInTheDocument()
  })

  it("?tab=moderacija opens the Moderacija tab (added by Step 28c)", () => {
    renderScreen(data(), "moderacija")
    expect(screen.getByRole("tab", { name: /Moderacija/ })).toHaveAttribute("aria-selected", "true")
  })

  it("loading state while the reads are in flight", () => {
    renderScreen(null)
    expect(screen.getByLabelText("Učitavanje")).toHaveAttribute("aria-busy", "true")
  })
})

describe("S26 Partneri (FR-57 #2, EP-69)", () => {
  it("shows the featured count and the limit, and saves the Istaknut switch", async () => {
    actions.savePartner.mockResolvedValue({ ok: true, data: partner() })
    renderScreen(data(), "partneri")
    const rows = screen.getAllByRole("row")
    expect(within(rows[1]).getByText("1 / 3")).toBeInTheDocument()
    expect(within(rows[1]).getByText("Aktivan")).toBeInTheDocument()
    expect(within(rows[1]).getByText("31. 12. 2027.")).toBeInTheDocument()
    expect(within(rows[2]).getByText("Istekao — skriven")).toBeInTheDocument()
    expect(within(rows[2]).getByRole("switch")).toBeDisabled()
    expect(within(rows[3]).getByText("3 / 3 — limit")).toBeInTheDocument()
    expect(within(rows[3]).getByRole("switch")).toBeDisabled()

    await userEvent.click(screen.getByRole("switch", { name: "Istaknut: Veterinarska ambulanta „Dr Vet“" }))
    expect(actions.savePartner).toHaveBeenCalledWith({ id: "e1000000-0000-4000-8000-000000000001", featured: false })
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Partner sačuvan"))
  })

  it("featured_limit_reached shows its toast", async () => {
    actions.savePartner.mockResolvedValue({ ok: false, error: { code: "featured_limit_reached", message: "" } })
    renderScreen(
      data({ partners: { ok: true, data: { items: [partner({ featured: false, featured_count: 2 })], total: 1 } } }),
      "partneri",
    )
    await userEvent.click(screen.getByRole("switch", { name: "Istaknut: Veterinarska ambulanta „Dr Vet“" }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Već postoje 3 istaknuta partnera ove vrste u ovom gradu."))
  })

  it("the edit Dialog saves every field through savePartner", async () => {
    actions.savePartner.mockResolvedValue({ ok: true, data: partner() })
    renderScreen(data(), "partneri")
    await userEvent.click(screen.getByRole("button", { name: "Izmeni Veterinarska ambulanta „Dr Vet“" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Izmeni partnera")).toBeInTheDocument()
    const name = within(dialog).getByLabelText("Naziv *")
    await userEvent.clear(name)
    await userEvent.type(name, "Veterinarska klinika „Dr Vet“")
    await userEvent.click(within(dialog).getByRole("button", { name: "Sačuvaj partnera" }))

    expect(actions.savePartner).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "e1000000-0000-4000-8000-000000000001",
        name: "Veterinarska klinika „Dr Vet“",
        type: "vet",
        city_id: "c1",
        latitude: 45.2541,
        longitude: 19.8425,
        message_channel: "whatsapp",
        message_number: "+381 64 455 1000",
        paid_until: "2027-12-31",
        featured: true,
        hours: [{ weekday: 1, opens: "08:00", closes: "20:00" }],
      }),
    )
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Partner sačuvan"))
  })

  it("Pronađi koordinate fills latitude and longitude; geocoding_failed shows its toast", async () => {
    actions.geocodeAddress.mockResolvedValueOnce({ ok: true, data: { latitude: 45.2551, longitude: 19.8452, display_name: "x" } })
    renderScreen(data(), "partneri")
    await userEvent.click(screen.getByRole("button", { name: "Izmeni Veterinarska ambulanta „Dr Vet“" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pronađi koordinate" }))
    expect(actions.geocodeAddress).toHaveBeenCalledWith({ address: "Bulevar oslobođenja 45, Novi Sad", city_id: "c1" })
    expect(await within(dialog).findByText("Koordinate: 45,2551° N, 19,8452° E")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Geografska širina")).toHaveValue("45.2551")

    actions.geocodeAddress.mockResolvedValueOnce({ ok: false, error: { code: "geocoding_failed", message: "" } })
    await userEvent.click(within(dialog).getByRole("button", { name: "Pronađi koordinate" }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Adresa nije pronađena. Upiši koordinate ručno i sačuvaj ponovo."))
  })

  it("shows the empty state with the add action", () => {
    renderScreen(data({ partners: { ok: true, data: { items: [], total: 0 } } }), "partneri")
    expect(screen.getByText("Još nema partnera")).toBeInTheDocument()
  })
})

describe("English", () => {
  it("renders the dictionary copy", () => {
    renderScreen(data(), undefined, "en")
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Pending shelters" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()
    expect(screen.getByText("Applied 18/10/2026")).toBeInTheDocument()
  })
})
