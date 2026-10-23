import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// AppShell count badge (Design §5.1, API EP-25 Callers): app/(app)/layout.tsx passes counts.podsetnici = EP-25
// `total` for filter=today (today's pending instances); the badge shows in the sidebar and on the phone bottom
// nav; zero (or a failed read) → no badge.

vi.mock("next/navigation", () => ({
  usePathname: () => "/ljubimci",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`)
  },
}))
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }))

const rpc = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "ivana.petrovic@mojljubimac.test" } } }) },
    rpc: (...a: unknown[]) => rpc(...a),
  }),
}))

const { default: AppLayout } = await import("@/app/(app)/layout")

const me = { full_name: "Ivana Petrović", email: "ivana.petrovic@mojljubimac.test", locale: "sr-Latn", organisation: null }

function mockRpc(today: { data: unknown; error: unknown }) {
  rpc.mockImplementation(async (name: string) => (name === "get_me" ? { data: me, error: null } : today))
}

async function renderLayout() {
  render(await AppLayout({ children: <h1>Moji ljubimci</h1> }))
  const [sidebar, bottom] = screen.getAllByRole("navigation", { name: "Glavna navigacija" })
  return { sidebar, bottom }
}

beforeEach(() => {
  rpc.mockReset()
})

describe("Podsetnici count badge (EP-25 filter=today)", () => {
  it("counts.podsetnici equals EP-25 total for today, in the sidebar and the bottom nav", async () => {
    mockRpc({ data: { items: [], total: 3, counts: { today: 3, upcoming: 0, missed: 0, done: 0 } }, error: null })
    const { sidebar, bottom } = await renderLayout()
    expect(rpc).toHaveBeenCalledWith("list_reminder_occurrences", { p_filter: "today" })
    expect(within(sidebar).getByRole("link", { name: /Podsetnici/ })).toHaveTextContent("Podsetnici3 novih")
    expect(within(bottom).getByRole("link", { name: /Podsetnici/ })).toHaveTextContent(/3/)
  })

  it("zero → no badge", async () => {
    mockRpc({ data: { items: [], total: 0, counts: { today: 0, upcoming: 0, missed: 0, done: 0 } }, error: null })
    const { sidebar, bottom } = await renderLayout()
    expect(within(sidebar).getByRole("link", { name: /Podsetnici/ })).toHaveTextContent(/^Podsetnici$/)
    expect(within(bottom).getByRole("link", { name: /Podsetnici/ })).not.toHaveTextContent(/\d/)
  })

  it("a failed read → no badge", async () => {
    mockRpc({ data: null, error: { message: "boom" } })
    const { sidebar } = await renderLayout()
    expect(within(sidebar).getByRole("link", { name: /Podsetnici/ })).toHaveTextContent(/^Podsetnici$/)
  })
})
