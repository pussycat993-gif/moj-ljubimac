import { StrictMode } from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MyListingsActions } from "@/app/(sapa)/sapa-pomoci/moje/my-listings-client"
import type { MarketplaceStatus, MyListing, MyListingsPage } from "@/lib/actions/listings"

// S35 Moji oglasi (Step 28b) · FR-64 #1 tabs with counts and rows with their expiry; FR-64 #4 the G state
// (usage limit reached → PremiumLock, "Objavi ponovo" disabled; premium_required from EP-77 extend → PremiumLock);
// FR-64 #5 resolve with the default outcome by type → toast, the Rešeni tab shows the outcome; FR-65 #2
// `?produzi=<id>` extends once on load; OQ-17 interim: resolved date from resolved_at (listings.updated_at), the
// hidden card from hidden_at / hidden_reason; suspended (S); error (X).

const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const { MyListingsClient } = await import("@/app/(sapa)/sapa-pomoci/moje/my-listings-client")
const { dictionaries } = await import("@/lib/i18n")

function row(extra: Partial<MyListing> & Pick<MyListing, "id" | "type" | "title" | "status">): MyListing {
  return {
    price: null,
    price_negotiable: false,
    resolved_outcome: null,
    resolved_at: null,
    published_at: "2026-10-18T10:00:00Z",
    expires_at: "2026-11-17T10:00:00Z",
    days_left: 29,
    photo_count: 0,
    cover_photo_id: null,
    conversation_count: 0,
    unread_count: 0,
    hidden_at: null,
    hidden_reason: null,
    can_extend: true,
    ...extra,
  }
}

const GIVING = row({
  id: "l2",
  type: "giving",
  title: "Poklanjam grebalicu za mačke, Bečej",
  status: "active",
  conversation_count: 2,
  unread_count: 1,
  photo_count: 3,
  cover_photo_id: "p2",
})
const SELLING = row({
  id: "l10",
  type: "selling",
  title: "Prodajem ležaljku za psa, veličina M",
  status: "active",
  price: { amount_minor: 180000, currency: "RSD" },
  expires_at: "2026-10-22T10:00:00Z",
  days_left: 3,
})
const HIDDEN = row({
  id: "l11",
  type: "seeking",
  title: "Tražim rashladnu prostirku za psa",
  status: "hidden",
  expires_at: "2026-11-05T10:00:00Z",
  days_left: 17,
  hidden_at: "2026-10-18T09:00:00Z",
  hidden_reason: "inappropriate",
  can_extend: false,
})
const EXPIRED = row({
  id: "l12",
  type: "selling",
  title: "Prodajem automatsku hranilicu",
  status: "expired",
  price_negotiable: true,
  expires_at: "2026-10-10T10:00:00Z",
  days_left: null,
  conversation_count: 3,
})
const RESOLVED = row({
  id: "l13",
  type: "giving",
  title: "Poklanjam 3 kg granula za mačke",
  status: "resolved",
  resolved_outcome: "given",
  resolved_at: "2026-09-28T10:00:00Z",
  expires_at: "2026-10-01T10:00:00Z",
  days_left: null,
})

function usage(extra: Partial<MarketplaceStatus> = {}): MarketplaceStatus {
  return {
    suspended_at: null,
    active_listings: 2,
    active_listing_limit: 3,
    can_post_need: false,
    need_organisation: null,
    unread_conversations: 1,
    ...extra,
  }
}

let groups: Record<"active" | "expired" | "resolved", MyListing[]>
let currentUsage: MarketplaceStatus

function pageOf(group: "active" | "expired" | "resolved"): MyListingsPage {
  return {
    items: groups[group],
    total: groups[group].length,
    counts: { active: groups.active.length, expired: groups.expired.length, resolved: groups.resolved.length },
    usage: currentUsage,
  }
}

const actions = {
  listMyListings: vi.fn(async (input: { group: "active" | "expired" | "resolved" }) => ({ ok: true as const, data: pageOf(input.group) })),
  changeListing: vi.fn(),
  getFileUrls: vi.fn(async () => ({
    ok: true as const,
    data: [{ kind: "listing_photo" as const, id: "p2", url: "https://r2.test/p2.jpg?sig", expires_at: null, mime_type: null }],
  })),
} satisfies Record<keyof MyListingsActions, unknown>

function copy(locale: "sr" | "en") {
  return { common: dictionaries[locale].common, sapa: dictionaries[locale].sapa.common, mine: dictionaries[locale].sapa.mine }
}

function renderScreen({ produzi = null, locale = "sr" }: { produzi?: string | null; locale?: "sr" | "en" } = {}) {
  return render(
    <StrictMode>
      <MyListingsClient
        locale={locale}
        produzi={produzi}
        copy={copy(locale)}
        actions={actions as unknown as MyListingsActions}
      />
    </StrictMode>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  groups = { active: [GIVING, SELLING, HIDDEN], expired: [EXPIRED], resolved: [RESOLVED] }
  currentUsage = usage()
})

describe("S35 tabs and rows (FR-64 #1)", () => {
  it("shows the counter, the tabs with counts and the rows with their expiry", async () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "Moji oglasi" })).toBeInTheDocument()
    expect(await screen.findByText("Poklanjam grebalicu za mačke, Bečej")).toBeInTheDocument()
    expect(actions.listMyListings).toHaveBeenCalledWith({ group: "active", limit: 50 })

    expect(screen.getByRole("tab", { name: "Aktivni (3)" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Istekli (1)" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Rešeni (1)" })).toBeInTheDocument()
    expect(screen.getByText("2 / 3")).toBeInTheDocument()
    expect(
      screen.getByText("Na Free planu imaš do 3 aktivna oglasa. Sakriveni oglasi se ne računaju. Premium: bez ograničenja."),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Novi oglas" })).toHaveAttribute("href", "/sapa-pomoci/nova")

    expect(screen.getByText("Besplatno · Aktivan do 17. 11. 2026.")).toBeInTheDocument()
    expect(screen.getByText("1.800 RSD · Aktivan do 22. 10. 2026.")).toBeInTheDocument()
    expect(screen.getByText("Ističe za 3 dana")).toBeInTheDocument()
    expect(screen.getByText("Razgovora: 2")).toBeInTheDocument()
    expect(screen.getByText("· nepročitano: 1")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Poklanjam grebalicu za mačke, Bečej" })).toHaveAttribute("href", "/sapa-pomoci/l2")
    await waitFor(() => expect(document.querySelector('img[src="https://r2.test/p2.jpg?sig"]')).not.toBeNull())
    expect(actions.getFileUrls).toHaveBeenCalledWith({ items: [{ kind: "listing_photo", id: "p2" }] })

    await userEvent.click(screen.getByRole("tab", { name: "Istekli (1)" }))
    expect(await screen.findByText("Po dogovoru · Istekao 10. 10. 2026.")).toBeInTheDocument()
    expect(actions.listMyListings).toHaveBeenLastCalledWith({ group: "expired", limit: 50 })
    expect(screen.getByRole("button", { name: "Objavi ponovo (30 dana)" })).toBeEnabled()
  })

  it("an empty tab shows the empty state with Novi oglas", async () => {
    groups = { active: [], expired: [], resolved: [] }
    currentUsage = usage({ active_listings: 0 })
    renderScreen()
    expect(await screen.findByText("Još nemaš aktivnih oglasa")).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "Novi oglas" }).length).toBeGreaterThan(0)
  })

  it("the counter is hidden when there is no limit (Premium / shelter)", async () => {
    currentUsage = usage({ active_listing_limit: null })
    renderScreen()
    await screen.findByText("Poklanjam grebalicu za mačke, Bečej")
    expect(screen.queryByText("2 / 3")).not.toBeInTheDocument()
  })

  it("a failed read shows the error state", async () => {
    actions.listMyListings.mockResolvedValueOnce({
      ok: false,
      error: { code: "internal_error", message: "x" },
    } as never)
    renderScreen()
    expect(await screen.findByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
  })
})

describe("S35 Premium limit (FR-64 #4)", () => {
  it("3 / 3 → PremiumLock and Objavi ponovo disabled", async () => {
    currentUsage = usage({ active_listings: 3 })
    renderScreen()
    expect(
      await screen.findByText(
        "Imaš 3 aktivna oglasa, koliko dozvoljava Free plan. Sa Premiumom objavljuješ bez ograničenja — ili označi neki oglas kao rešen.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Novi oglas" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("tab", { name: "Istekli (1)" }))
    expect(await screen.findByRole("button", { name: "Objavi ponovo (30 dana)" })).toBeDisabled()
    expect(screen.getByText("Imaš 3 aktivna oglasa — reši jedan ili pređi na Premium da ponovo objaviš ovaj.")).toBeInTheDocument()
  })

  it("premium_required from extend shows the PremiumLock", async () => {
    actions.changeListing.mockResolvedValue({
      ok: false,
      error: { code: "premium_required", message: "x", details: { limit: "listings" } },
    })
    renderScreen()
    await screen.findByText("Poklanjam grebalicu za mačke, Bečej")
    await userEvent.click(screen.getByRole("tab", { name: "Istekli (1)" }))
    await userEvent.click(await screen.findByRole("button", { name: "Objavi ponovo (30 dana)" }))
    expect(actions.changeListing).toHaveBeenCalledWith({ listing_id: "l12", op: "extend" })
    expect(
      await screen.findByText(
        "Imaš 3 aktivna oglasa, koliko dozvoljava Free plan. Sa Premiumom objavljuješ bez ograničenja — ili označi neki oglas kao rešen.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Objavi ponovo (30 dana)" })).toBeDisabled()
  })
})

describe("S35 extend, resolve and delete (FR-64 #3, #5, #6)", () => {
  it("Produži 30 dana → EP-77 extend and the toast", async () => {
    actions.changeListing.mockResolvedValue({ ok: true, data: { id: "l10", expires_at: "2026-11-28T10:00:00Z" } })
    renderScreen()
    await userEvent.click((await screen.findAllByRole("button", { name: "Produži 30 dana" }))[1])
    expect(actions.changeListing).toHaveBeenCalledWith({ listing_id: "l10", op: "extend" })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Oglas je produžen do 28. 11. 2026."))
  })

  it("resolve with the default outcome → toast, and the Rešeni tab shows the outcome and the resolved_at date", async () => {
    actions.changeListing.mockImplementation(async () => {
      groups = {
        active: [SELLING, HIDDEN],
        expired: [EXPIRED],
        resolved: [
          { ...GIVING, status: "resolved", resolved_outcome: "given", resolved_at: "2026-10-19T08:00:00Z", days_left: null },
          RESOLVED,
        ],
      }
      return { ok: true, data: { id: "l2" } }
    })
    const user = userEvent.setup()
    renderScreen()
    await user.click(await screen.findByRole("button", { name: "Radnje: Poklanjam grebalicu za mačke, Bečej" }))
    await user.click(await screen.findByRole("menuitem", { name: "Označi kao rešeno" }))
    const alert = screen.getByRole("alertdialog")
    expect(within(alert).getByText("Označiti kao rešeno — Poklonjeno?")).toBeInTheDocument()
    await user.click(within(alert).getByRole("button", { name: "Da, rešeno je" }))
    expect(actions.changeListing).toHaveBeenCalledWith({ listing_id: "l2", op: "resolve", outcome: "given" })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Oglas je označen kao rešen — Poklonjeno."))
    expect(await screen.findByRole("tab", { name: "Rešeni (2)" })).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "Rešeni (2)" }))
    // OQ-17 interim: the date is MyListing.resolved_at (listings.updated_at).
    expect(await screen.findByText("Besplatno · Poklonjeno 19. 10. 2026.")).toBeInTheDocument()
    expect(screen.getByText("Besplatno · Poklonjeno 28. 9. 2026.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Produži 30 dana" })).not.toBeInTheDocument()
  })

  it("delete → AlertDialog, the row is removed and the toast is shown", async () => {
    actions.changeListing.mockImplementation(async () => {
      groups = { ...groups, active: [SELLING, HIDDEN] }
      return { ok: true, data: { deleted_listing_id: "l2" } }
    })
    const user = userEvent.setup()
    renderScreen()
    await user.click(await screen.findByRole("button", { name: "Radnje: Poklanjam grebalicu za mačke, Bečej" }))
    await user.click(await screen.findByRole("menuitem", { name: "Obriši" }))
    const alert = screen.getByRole("alertdialog")
    expect(within(alert).getByText("Obrisati oglas?")).toBeInTheDocument()
    await user.click(within(alert).getByRole("button", { name: "Da, obriši" }))
    expect(actions.changeListing).toHaveBeenCalledWith({ listing_id: "l2", op: "delete", confirm: true })
    await waitFor(() => expect(screen.queryByText("Poklanjam grebalicu za mačke, Bečej")).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith("„Poklanjam grebalicu za mačke, Bečej“ je obrisan.")
  })
})

describe("S35 ?produzi=<id> (FR-65 #2)", () => {
  it("extends once on load, shows the toast and clears the parameter", async () => {
    actions.changeListing.mockResolvedValue({ ok: true, data: { id: "l12", expires_at: "2026-11-18T10:00:00Z" } })
    renderScreen({ produzi: "l12" })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Oglas je produžen do 18. 11. 2026."))
    expect(actions.changeListing).toHaveBeenCalledTimes(1)
    expect(actions.changeListing).toHaveBeenCalledWith({ listing_id: "l12", op: "extend" })
    expect(router.replace).toHaveBeenCalledWith("/sapa-pomoci/moje", { scroll: false })
    expect(await screen.findByText("Poklanjam grebalicu za mačke, Bečej")).toBeInTheDocument()
  })
})

describe("S35 hidden and suspended", () => {
  it("a hidden listing shows the Operator's reason (OQ-17 interim)", async () => {
    renderScreen()
    expect(
      await screen.findByText(
        "Sakrio operater 18. 10. 2026. — razlog: neprimeren sadržaj. Piši na podrska@mojljubimac.rs ako misliš da je greška.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("Sakriven")).toBeInTheDocument()
  })

  it("without a reason the reason part is dropped; English", async () => {
    groups = { ...groups, active: [{ ...HIDDEN, hidden_reason: null }] }
    renderScreen({ locale: "en" })
    expect(
      await screen.findByText(
        "Hidden by an operator on 18 Oct 2026. Write to podrska@mojljubimac.rs if you think this is a mistake.",
      ),
    ).toBeInTheDocument()
  })

  it("suspended: banner, no edit / extend / resolve, delete allowed", async () => {
    currentUsage = usage({ suspended_at: "2026-10-20T10:00:00Z" })
    const user = userEvent.setup()
    renderScreen()
    expect(
      await screen.findByText(
        "Tvoj nalog je isključen iz Šape pomoći. Tvoji oglasi su skriveni za druge, a nove ne možeš da objavljuješ. Možeš da ih obrišeš.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Produži 30 dana" })).not.toBeInTheDocument()
    expect(screen.queryByText("2 / 3")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Radnje: Poklanjam grebalicu za mačke, Bečej" }))
    expect(await screen.findByRole("menuitem", { name: "Obriši" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Izmeni" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Označi kao rešeno" })).not.toBeInTheDocument()
  })
})
