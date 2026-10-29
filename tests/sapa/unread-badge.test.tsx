import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// FR-68 #5 — the Poruke badge (Step 28c): app/(app)/layout.tsx, app/(org)/layout.tsx and app/(sapa)/layout.tsx pass
// AppShell counts.poruke = EP-43 Me.marketplace.unread_conversations, read on each page load (NFR-11); owner and
// organisation shells show it on the Poruke icon ("Poruke, 3 nepročitanih"); zero → no badge.

vi.mock("next/navigation", () => ({
  usePathname: () => "/ljubimci",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`)
  },
}))
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }))
vi.mock("@/lib/actions/registration", () => ({ getVisitorLocale: async () => "sr" }))

const rpc = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "ivana.petrovic@mojljubimac.test" } } }) },
    rpc: (...a: unknown[]) => rpc(...a),
  }),
}))

const { default: AppLayout } = await import("@/app/(app)/layout")
const { default: OrgLayout } = await import("@/app/(org)/layout")
const { default: SapaLayout } = await import("@/app/(sapa)/layout")

const shelter = { id: "o1", name: "Azil „Druga šansa“", type: "shelter", slug: "azil-druga-sansa", role: "admin", approval_status: "approved" }

function me(unread: number, organisation: unknown = null) {
  return {
    full_name: "Ivana Petrović",
    email: "ivana.petrovic@mojljubimac.test",
    locale: "sr-Latn",
    organisation,
    marketplace: {
      suspended_at: null,
      active_listings: 0,
      active_listing_limit: 3,
      can_post_need: false,
      need_organisation: null,
      unread_conversations: unread,
    },
  }
}

function mockReads(profile: unknown) {
  rpc.mockImplementation(async (name: string) => {
    if (name === "get_me") return { data: profile, error: null }
    if (name === "get_my_organisation") return { data: { organisation: { type: "shelter" } }, error: null }
    return { data: { items: [], total: 0 }, error: null }
  })
}

const topBar = () => screen.getByRole("banner")

beforeEach(() => rpc.mockReset())

describe("Poruke badge = Me.marketplace.unread_conversations (FR-68 #5)", () => {
  it("owner shell (app/(app)/layout.tsx) shows the count on the Poruke icon", async () => {
    mockReads(me(3))
    render(await AppLayout({ children: <p>x</p> }))
    expect(within(topBar()).getByRole("link", { name: "Poruke, 3 nepročitanih" })).toHaveAttribute("href", "/poruke")
    const footerLink = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/poruke" && l.textContent?.includes("Poruke3"))
    expect(footerLink).toBeDefined()
  })

  it("organisation shell (app/(org)/layout.tsx) shows it too", async () => {
    mockReads(me(2, shelter))
    render(await OrgLayout({ children: <p>x</p> }))
    expect(within(topBar()).getByRole("link", { name: "Poruke, 2 nepročitanih" })).toBeInTheDocument()
  })

  it("Šapa pomoći shell (app/(sapa)/layout.tsx), owner and organisation", async () => {
    mockReads(me(4))
    render(await SapaLayout({ children: <p>x</p> }))
    expect(within(topBar()).getByRole("link", { name: "Poruke, 4 nepročitanih" })).toBeInTheDocument()
  })

  it("Šapa pomoći shell for an organisation member", async () => {
    mockReads(me(1, shelter))
    render(await SapaLayout({ children: <p>x</p> }))
    expect(within(topBar()).getByRole("link", { name: "Poruke, 1 nepročitanih" })).toBeInTheDocument()
  })

  it("zero → no badge", async () => {
    mockReads(me(0))
    render(await AppLayout({ children: <p>x</p> }))
    expect(within(topBar()).getByRole("link", { name: "Poruke" })).toHaveAttribute("href", "/poruke")
    expect(screen.queryByText("nepročitanih")).not.toBeInTheDocument()
  })

  it("is read from get_me on the page load — no other read for it", async () => {
    mockReads(me(5))
    render(await AppLayout({ children: <p>x</p> }))
    expect(rpc.mock.calls.map((c) => c[0]).sort()).toEqual(["get_me", "list_reminder_occurrences"])
  })
})
