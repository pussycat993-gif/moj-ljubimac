import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AdminData } from "@/app/admin/admin-screen"
import type { ModerationItem, Restriction } from "@/lib/actions/admin"

// S26 Moderacija (Step 28c, FR-71 #1–#5, EP-86): open reports oldest first as cards (reason pill, Oglas / Korisnik,
// "Prijava za isti oglas: N", title or user, author and reporter, the reporter's note, the date); the tab label and
// the admin shell's Moderacija badge carry open_count (from the layout's AdminCountsProvider before the tab loads);
// "Obrađeno ovog meseca: N"; Odbaci prijavu / Sakrij oglas / Isključi autora (AlertDialog with the optional
// "Razlog za korisnika" passed as reason_note) / Vrati oglas / Vrati pristup through moderate; 409 → toast and the
// list is read again; empty → "Nema otvorenih prijava".

const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }
let search = new URLSearchParams({ tab: "moderacija" })
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
  listModeration: vi.fn(),
  moderate: vi.fn(),
}
vi.mock("@/lib/actions/admin", () => actions)

const { AdminScreen, AdminCountsProvider } = await import("@/app/admin/admin-screen")
const { dictionaries } = await import("@/lib/i18n")

const MARKO = "a1000000-0000-4000-8000-000000000002"
const JELENA = "a1000000-0000-4000-8000-000000000003"
const NIKOLA = "a1000000-0000-4000-8000-000000000005"

function report(extra: Partial<ModerationItem> = {}): ModerationItem {
  return {
    report_id: "r1",
    target: "listing",
    reason: "scam",
    note: "Traži uplatu unapred na račun, ne želi lično preuzimanje.",
    status: "open",
    created_at: "2026-10-17T08:00:00Z",
    handled_at: null,
    reporter: { user_id: MARKO, display_name: "Marko J." },
    listing: { id: "l1", title: "Prodajem transporter za mačke", status: "active" },
    reported_user: { user_id: JELENA, display_name: "Goran M.", suspended_at: null },
    same_target_open_count: 2,
    ...extra,
  }
}

const userReport = report({
  report_id: "r2",
  target: "user",
  reason: "spam",
  note: "Šalje istu poruku sa linkom prodavnice na sve oglase.",
  created_at: "2026-10-18T08:00:00Z",
  reporter: { user_id: "a1000000-0000-4000-8000-000000000001", display_name: "Jelena S." },
  listing: { id: null, title: null, status: null },
  reported_user: { user_id: NIKOLA, display_name: "Dejan V.", suspended_at: null },
  same_target_open_count: 1,
})

const hiddenListing: Restriction = {
  kind: "listing",
  listing_id: "l9",
  listing_title: "Prodajem hranu na veliko, dostava cela Srbija",
  user_id: NIKOLA,
  user_display_name: "Dejan V.",
  restricted_at: "2026-10-17T10:00:00Z",
  reason: "spam",
}
const suspendedUser: Restriction = {
  kind: "user",
  listing_id: null,
  listing_title: null,
  user_id: "u-branko",
  user_display_name: "Branko L.",
  restricted_at: "2026-10-15T10:00:00Z",
  reason: "scam",
}

function lists(reports: ModerationItem[], restrictions: Restriction[] = [hiddenListing, suspendedUser], handled = 4) {
  actions.listModeration.mockImplementation(async ({ view }: { view: string }) => ({
    ok: true,
    data:
      view === "open_reports"
        ? { view, items: reports, total: reports.length, open_count: reports.length, handled_this_month: handled }
        : { view, items: restrictions, total: restrictions.length, open_count: reports.length, handled_this_month: handled },
  }))
}

const data = (): AdminData => ({
  pending: { ok: true, data: { items: [], total: 0 } },
  partners: { ok: true, data: { items: [], total: 0 } },
  stats: { ok: true, data: { period: "2026-10", available_periods: [], items: [], total: 0 } },
  settings: { ok: true, data: { viber_enabled: false, whatsapp_monthly_cap: 30, updated_at: "2026-10-20T08:00:00Z" } },
  cities: [],
})

const copy = (locale: "sr" | "en") => ({
  admin: dictionaries[locale].admin,
  common: dictionaries[locale].common,
  shell: dictionaries[locale].shell.app,
})

function renderTab(locale: "sr" | "en" = "sr", layoutCount = 0) {
  return render(
    <AdminCountsProvider moderacija={layoutCount}>
      <AdminScreen data={data()} copy={copy(locale)} locale={locale} user={{ name: "Ana Marković" }} />
    </AdminCountsProvider>,
  )
}

const cards = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  search = new URLSearchParams({ tab: "moderacija" })
  lists([report(), userReport])
})

describe("FR-71 #1 — open reports", () => {
  it("lists them oldest first with reason, target, note, author and reporter", async () => {
    renderTab()
    expect(await screen.findByRole("heading", { name: "Otvorene prijave" })).toBeInTheDocument()
    expect(cards()).toEqual(["Prodajem transporter za mačke", "Dejan V."])
    expect(actions.listModeration).toHaveBeenCalledWith({ view: "open_reports", limit: 50, offset: 0 })
    expect(actions.listModeration).toHaveBeenCalledWith({ view: "restrictions", limit: 50, offset: 0 })

    const first = screen.getByRole("heading", { name: "Prodajem transporter za mačke" }).closest("[data-slot='card']") as HTMLElement
    expect(within(first).getByText("Prevara")).toBeInTheDocument()
    expect(within(first).getByText("Oglas")).toBeInTheDocument()
    expect(within(first).getByText("Prijava za isti oglas: 2")).toBeInTheDocument()
    expect(within(first).getByText("Autor: Goran M. · Prijavio/la: Marko J.")).toBeInTheDocument()
    expect(within(first).getByText("Traži uplatu unapred na račun, ne želi lično preuzimanje.")).toBeInTheDocument()
    expect(within(first).getByText("17. 10. 2026.")).toBeInTheDocument()
    expect(within(first).getByRole("button", { name: "Sakrij oglas" })).toBeInTheDocument()
    expect(within(first).getByRole("button", { name: "Isključi autora" })).toBeInTheDocument()

    const second = screen.getByRole("heading", { name: "Dejan V." }).closest("[data-slot='card']") as HTMLElement
    expect(within(second).getByText("Korisnik")).toBeInTheDocument()
    expect(within(second).getByText("Prijavio/la: Jelena S.")).toBeInTheDocument()
    expect(within(second).queryByRole("button", { name: "Sakrij oglas" })).not.toBeInTheDocument()
    expect(within(second).getByRole("button", { name: "Isključi korisnika" })).toBeInTheDocument()
    expect(screen.getByText("Obrađeno ovog meseca: 4")).toBeInTheDocument()
  })

  it("the tab and the nav badge show open_count", async () => {
    renderTab("sr", 7)
    // Before the tab's own read: the layout's count.
    expect(screen.getByRole("tab", { name: "Moderacija (7)" })).toBeInTheDocument()
    expect(await screen.findByRole("tab", { name: "Moderacija (2)" })).toBeInTheDocument()
    const sidebar = screen.getAllByRole("navigation")[0]
    expect(within(sidebar).getByRole("link", { name: /Moderacija/ })).toHaveTextContent("Moderacija2")
  })

  it("restrictions list hidden listings and suspended users", async () => {
    renderTab()
    expect(await screen.findByRole("heading", { name: "Sakriveni oglasi i isključeni korisnici" })).toBeInTheDocument()
    expect(screen.getByText("Dejan V. · sakriven 17. 10. 2026. · spam ili reklama")).toBeInTheDocument()
    expect(screen.getByText("Isključen iz Šape pomoći 15. 10. 2026. · prevara")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Vrati oglas" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Vrati pristup" })).toBeInTheDocument()
  })

  it("empty → Nema otvorenih prijava; Trenutno ništa nije sakriveno", async () => {
    lists([], [])
    renderTab()
    expect(await screen.findByText("Nema otvorenih prijava")).toBeInTheDocument()
    expect(screen.getByText("Trenutno ništa nije sakriveno.")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Moderacija" })).toBeInTheDocument()
  })

  it("error → retry reads again", async () => {
    actions.listModeration.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "x" } })
    renderTab()
    expect(await screen.findByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    lists([report()])
    await userEvent.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(await screen.findByRole("heading", { name: "Prodajem transporter za mačke" })).toBeInTheDocument()
  })

  it("English copy", async () => {
    renderTab("en")
    expect(await screen.findByRole("heading", { name: "Open reports" })).toBeInTheDocument()
    expect(screen.getByText("Author: Goran M. · Reported by: Marko J.")).toBeInTheDocument()
    expect(screen.getByText("Handled this month: 4")).toBeInTheDocument()
  })
})

describe("FR-71 #2–#5 — decisions", () => {
  it("#5: Odbaci prijavu dismisses and the list is read again", async () => {
    actions.moderate.mockResolvedValue({ ok: true, data: { report: { ...report(), status: "dismissed" }, restriction: null } })
    renderTab()
    const first = (await screen.findByRole("heading", { name: "Prodajem transporter za mačke" })).closest("[data-slot='card']") as HTMLElement
    lists([userReport])
    await userEvent.click(within(first).getByRole("button", { name: "Odbaci prijavu" }))
    expect(actions.moderate).toHaveBeenCalledWith({ op: "dismiss_report", report_id: "r1" })
    expect(await screen.findByText("Prijava je odbačena. Oglas i korisnik ostaju kakvi jesu.")).toBeInTheDocument()
    await waitFor(() => expect(cards()).toEqual(["Dejan V."]))
    expect(router.refresh).toHaveBeenCalled()
  })

  it("#2: Sakrij oglas confirms in an AlertDialog and passes the reason for the user", async () => {
    actions.moderate.mockResolvedValue({ ok: true, data: { report: report(), restriction: null } })
    renderTab()
    const first = (await screen.findByRole("heading", { name: "Prodajem transporter za mačke" })).closest("[data-slot='card']") as HTMLElement
    await userEvent.click(within(first).getByRole("button", { name: "Sakrij oglas" }))
    const dialog = screen.getByRole("alertdialog", { name: "Sakriti oglas „Prodajem transporter za mačke“?" })
    await userEvent.type(within(dialog).getByLabelText("Razlog za korisnika (opciono)"), "Oglas traži uplatu unapred.")
    await userEvent.click(within(dialog).getByRole("button", { name: "Da, sakrij" }))
    expect(actions.moderate).toHaveBeenCalledWith({ op: "hide_listing", report_id: "r1", reason_note: "Oglas traži uplatu unapred." })
    expect(await screen.findByText("Oglas „Prodajem transporter za mačke“ je sakriven. Goran M. je dobio/la mejl.")).toBeInTheDocument()
  })

  it("#3: Isključi korisnika suspends (no reason → null)", async () => {
    actions.moderate.mockResolvedValue({ ok: true, data: { report: userReport, restriction: null } })
    renderTab()
    const second = (await screen.findByRole("heading", { name: "Dejan V." })).closest("[data-slot='card']") as HTMLElement
    await userEvent.click(within(second).getByRole("button", { name: "Isključi korisnika" }))
    const dialog = screen.getByRole("alertdialog", { name: "Isključiti korisnika Dejan V. iz Šape pomoći?" })
    await userEvent.click(within(dialog).getByRole("button", { name: "Da, isključi" }))
    expect(actions.moderate).toHaveBeenCalledWith({ op: "suspend_user", report_id: "r2", reason_note: null })
    expect(
      await screen.findByText("Dejan V. je isključen/a iz Šape pomoći i dobio/la je mejl. Aktivni oglasi te osobe su sakriveni."),
    ).toBeInTheDocument()
  })

  it("#4: Vrati oglas and Vrati pristup restore", async () => {
    actions.moderate.mockImplementation(async (input: { op: string }) => ({
      ok: true,
      data: { report: null, restriction: input.op === "restore_listing" ? hiddenListing : suspendedUser },
    }))
    renderTab()
    await userEvent.click(await screen.findByRole("button", { name: "Vrati oglas" }))
    expect(actions.moderate).toHaveBeenCalledWith({ op: "restore_listing", listing_id: "l9" })
    expect(await screen.findByText("Oglas „Prodajem hranu na veliko, dostava cela Srbija“ je ponovo vidljiv.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Vrati pristup" }))
    expect(actions.moderate).toHaveBeenCalledWith({ op: "restore_user", user_id: "u-branko" })
    expect(await screen.findByText("Branko L. ponovo može da koristi Šapu pomoći.")).toBeInTheDocument()
  })

  it("409 already_decided → toast and the card leaves the list", async () => {
    actions.moderate.mockResolvedValue({ ok: false, error: { code: "already_decided", message: "already_decided" } })
    renderTab()
    const first = (await screen.findByRole("heading", { name: "Prodajem transporter za mačke" })).closest("[data-slot='card']") as HTMLElement
    lists([userReport])
    await userEvent.click(within(first).getByRole("button", { name: "Odbaci prijavu" }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
    await waitFor(() => expect(cards()).toEqual(["Dejan V."]))
  })
})
