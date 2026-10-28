import { NextRequest } from "next/server"
import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// Šapa pomoći shells (Step 28b, CR-27; Design §5.1–§5.3, §11): app/(sapa)/layout.tsx picks the shell from the
// session — no session → PublicShell wide; an organisation member → the organisation AppShell; otherwise the owner
// AppShell with the Podsetnici badge source of app/(app)/layout.tsx. Both AppShells show "Šapa pomoći" (HandHeart)
// in the sidebar and "Šapa" in the bottom nav. /sapa-pomoci/nova, /sapa-pomoci/moje and /sapa-pomoci/<id>/izmeni
// are signed-in only (request interception → /prijava); /sapa-pomoci, /sapa-pomoci/<id> and /korisnik/<id> stay
// public.

vi.mock("next/navigation", () => ({
  usePathname: () => "/sapa-pomoci",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`)
  },
}))
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }))
vi.mock("@/lib/actions/registration", () => ({ getVisitorLocale: async () => "sr" }))

const state = { user: null as null | { id: string; email: string } }
const rpc = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: (...a: unknown[]) => rpc(...a),
  }),
}))

const { default: SapaLayout } = await import("@/app/(sapa)/layout")

const owner = {
  full_name: "Ivana Petrović",
  email: "ivana.petrovic@mojljubimac.test",
  locale: "sr-Latn",
  organisation: null,
}
const shelterAdmin = {
  full_name: "Dragana Kovačević",
  email: "dragana.kovacevic@mojljubimac.test",
  locale: "sr-Latn",
  organisation: { id: "o1", name: "Azil „Druga šansa“", type: "shelter", slug: "azil-druga-sansa", role: "admin", approval_status: "approved" },
}

function mockMe(me: unknown, todayTotal = 2) {
  rpc.mockImplementation(async (name: string) =>
    name === "get_me" ? { data: me, error: null } : { data: { items: [], total: todayTotal }, error: null },
  )
}

async function renderLayout() {
  render(await SapaLayout({ children: <h1>Šapa pomoći</h1> }))
}

beforeEach(() => {
  rpc.mockReset()
  state.user = null
})

describe("(sapa) layout — shell by session", () => {
  it("no session → PublicShell wide (sign-in link, no app navigation)", async () => {
    await renderLayout()
    expect(screen.getByRole("heading", { name: "Šapa pomoći" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Prijavi se" })).toHaveAttribute("href", "/prijava")
    expect(screen.queryByRole("navigation", { name: "Glavna navigacija" })).not.toBeInTheDocument()
    expect(screen.getByRole("main")).toHaveClass("max-w-5xl")
    expect(rpc).not.toHaveBeenCalled()
  })

  it("owner → owner AppShell with Šapa pomoći in the sidebar and Šapa in the bottom nav, plus the Podsetnici badge", async () => {
    state.user = { id: "u1", email: owner.email }
    mockMe(owner)
    await renderLayout()
    const [sidebar, bottom] = screen.getAllByRole("navigation", { name: "Glavna navigacija" })
    expect(within(sidebar).getByRole("link", { name: /Šapa pomoći/ })).toHaveAttribute("href", "/sapa-pomoci")
    expect(within(bottom).getByRole("link", { name: /Šapa pomoći/ })).toHaveTextContent("Šapa")
    expect(within(sidebar).getByRole("link", { name: /Ljubimci/ })).toBeInTheDocument()
    expect(within(sidebar).getByRole("link", { name: /Podsetnici/ })).toHaveTextContent("Podsetnici2 novih")
    expect(rpc).toHaveBeenCalledWith("list_reminder_occurrences", { p_filter: "today" })
    expect(screen.queryByRole("link", { name: "Prijavi se" })).not.toBeInTheDocument()
  })

  it("organisation member → organisation AppShell with Šapa pomoći", async () => {
    state.user = { id: "u7", email: shelterAdmin.email }
    mockMe(shelterAdmin)
    await renderLayout()
    const [sidebar, bottom] = screen.getAllByRole("navigation", { name: "Glavna navigacija" })
    expect(within(sidebar).getByRole("link", { name: /Životinje/ })).toHaveAttribute("href", "/organizacija")
    expect(within(sidebar).getByRole("link", { name: /Šapa pomoći/ })).toHaveAttribute("href", "/sapa-pomoci")
    expect(within(bottom).getByRole("link", { name: /Šapa pomoći/ })).toHaveTextContent("Šapa")
    expect(within(sidebar).queryByRole("link", { name: /Podsetnici/ })).not.toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalledWith("list_reminder_occurrences", expect.anything())
  })

  it("English profile → English labels", async () => {
    state.user = { id: "u1", email: owner.email }
    mockMe({ ...owner, locale: "en" })
    await renderLayout()
    const [sidebar] = screen.getAllByRole("navigation", { name: "Main navigation" })
    expect(within(sidebar).getByRole("link", { name: /Helping Paw/ })).toHaveAttribute("href", "/sapa-pomoci")
  })

  it("signed in without a profile → the S15 completion step", async () => {
    state.user = { id: "u9", email: "nov@mojljubimac.test" }
    mockMe(null)
    await expect(renderLayout()).rejects.toThrow("redirect /registracija")
  })
})

describe("request interception — Šapa pomoći signed-in prefixes", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const request = (path: string) => new NextRequest(`http://localhost:3000${path}`)

  it.each(["/sapa-pomoci/nova", "/sapa-pomoci/moje", "/sapa-pomoci/f3000000-0000-4000-8000-000000000003/izmeni"])(
    "unauthenticated %s redirects to /prijava",
    async (path) => {
      const { updateSession } = await import("@/lib/supabase/middleware")
      const response = await updateSession(request(path))
      expect(response.headers.get("location")).toBe("http://localhost:3000/prijava")
    },
  )

  it.each([
    "/sapa-pomoci",
    "/sapa-pomoci/f3000000-0000-4000-8000-000000000003",
    "/korisnik/a1000000-0000-4000-8000-000000000002",
    "/sapa-pomoci/izmeni",
  ])("unauthenticated %s stays public", async (path) => {
    const { updateSession } = await import("@/lib/supabase/middleware")
    const response = await updateSession(request(path))
    expect(response.headers.get("location")).toBeNull()
  })
})
