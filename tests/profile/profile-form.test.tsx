import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const USER_ID = "a1000000-0000-4000-8000-000000000002"
const NOVI_SAD = { id: "11111111-1111-4111-8111-000000000001", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.25, longitude: 19.84 }
const BECEJ = { id: "11111111-1111-4111-8111-000000000002", name_sr: "Bečej", name_en: "Becej", latitude: 45.6, longitude: 20.0 }
const refresh = vi.fn()
const redirect = vi.fn()
const supabase = { current: null as ReturnType<typeof fakeSupabase> | null }
const cookieJar = new Map<string, string>()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => "/profil",
  redirect: (url: string) => redirect(url),
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
  }),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }))

const { ProfileClient } = await import("@/app/(app)/profil/profile-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = {
  sr: { profile: dictionaries.sr.profile, common: dictionaries.sr.common },
  en: { profile: dictionaries.en.profile, common: dictionaries.en.common },
}

function me(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: "marko.jovanovic@mojljubimac.test",
    full_name: "Marko Jovanović",
    account_type: "owner",
    locale: "sr-Latn",
    city: NOVI_SAD,
    organisation: null,
    ...overrides,
  } as never
}

// The server client behind lib/actions/registration.ts (updateMe) and lib/actions/auth.ts (signOut).
function fakeSupabase({ knownCities = [NOVI_SAD.id, BECEJ.id] } = {}) {
  const state = { profile: { id: USER_ID, full_name: "Marko Jovanović", city_id: NOVI_SAD.id, locale: "sr-Latn", deletion_requested_at: null } as Record<string, unknown> }
  const client = {
    state,
    updates: [] as Record<string, unknown>[],
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: USER_ID, email: "marko.jovanovic@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async () => ({
      data: me({ full_name: state.profile.full_name, locale: state.profile.locale }),
      error: null,
    })),
    from(table: string) {
      let id: unknown
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (_c: string, v: unknown) => ((id = v), builder),
        update: (patch: Record<string, unknown>) => {
          client.updates.push(patch)
          Object.assign(state.profile, patch)
          return builder
        },
        maybeSingle: async () => ({
          data: table === "profiles" ? state.profile : table === "cities" ? (knownCities.includes(id as string) ? { id } : null) : null,
          error: null,
        }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      }
      return builder
    },
  }
  supabase.current = client
  return client
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  refresh.mockReset()
  redirect.mockReset()
  cookieJar.clear()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("S18 Profil — name, city, language (EP-43, EP-67)", () => {
  it("shows the EP-43 values; the city is a Select of the EP-67 cities", async () => {
    const user = userEvent.setup()
    fakeSupabase()
    render(<ProfileClient me={me()} cities={[NOVI_SAD, BECEJ]} copy={copy} />)
    expect(screen.getByLabelText("Ime i prezime")).toHaveValue("Marko Jovanović")
    expect(screen.getByLabelText("Mejl adresa")).toHaveValue("marko.jovanovic@mojljubimac.test")
    const city = screen.getByRole("combobox", { name: "Grad" })
    expect(city).toHaveTextContent("Novi Sad")
    await user.click(city)
    const options = await screen.findAllByRole("option")
    expect(options.map((o) => o.textContent)).toEqual(["Novi Sad", "Bečej"])
  })

  it("saves name and city with the EP-43 update", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    render(<ProfileClient me={me()} cities={[NOVI_SAD, BECEJ]} copy={copy} />)
    await user.clear(screen.getByLabelText("Ime i prezime"))
    await user.type(screen.getByLabelText("Ime i prezime"), "Marko J.")
    await user.click(screen.getByRole("combobox", { name: "Grad" }))
    await user.click(await screen.findByRole("option", { name: "Bečej" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj" }))
    expect(client.updates).toEqual([{ full_name: "Marko J.", city_id: BECEJ.id, locale: "sr-Latn" }])
    expect(refresh).toHaveBeenCalled()
  })

  it("a 422 field code renders inline under its field", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase({ knownCities: [NOVI_SAD.id] })
    render(<ProfileClient me={me()} cities={[NOVI_SAD, BECEJ]} copy={copy} />)
    await user.click(screen.getByRole("combobox", { name: "Grad" }))
    await user.click(await screen.findByRole("option", { name: "Bečej" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj" }))
    const error = await screen.findByText("Izaberi grad.")
    expect(error).toHaveAttribute("id", "profile-city-error")
    expect(screen.getByRole("combobox", { name: "Grad" })).toHaveAttribute("aria-invalid", "true")
    expect(client.updates).toHaveLength(0)
  })

  it("renders the links to reminder settings and S19", () => {
    fakeSupabase()
    render(<ProfileClient me={me()} cities={[NOVI_SAD]} copy={copy} />)
    expect(screen.getByRole("link", { name: /Podešavanja podsetnika/ })).toHaveAttribute("href", "/podesavanja/podsetnici")
    expect(screen.getByRole("link", { name: /Moji podaci i brisanje naloga/ })).toHaveAttribute("href", "/profil/podaci")
  })

  it("Odjavi se signs out (EP-42) and goes to /prijava", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    render(<ProfileClient me={me()} cities={[NOVI_SAD]} copy={copy} />)
    await user.click(screen.getByRole("button", { name: "Odjavi se" }))
    expect(client.auth.signOut).toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith("/prijava")
  })

  it("a failed EP-43 read shows the error state", () => {
    fakeSupabase()
    render(<ProfileClient me={null} cities={[]} copy={copy} />)
    expect(within(screen.getByRole("alert")).getByText("Nešto nije u redu. Pokušaj ponovo.")).toBeInTheDocument()
  })
})
