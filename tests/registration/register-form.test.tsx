import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const USER_ID = "00000000-0000-0000-0000-000000000015"
const CITY = { id: "11111111-1111-4111-8111-111111111111", name_sr: "Bečej", name_en: "Becej", latitude: 45.6, longitude: 20 }
const push = vi.fn()
const supabase = { current: null as ReturnType<typeof fakeSupabase> | null }
const cookieJar = new Map<string, string>()

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
  }),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }))

const { RegisterClient } = await import("@/app/(auth)/registracija/register-client")
const { dictionaries } = await import("@/lib/i18n")
const { TERMS_VERSION } = await import("@/lib/legal")

const copy = {
  sr: { register: dictionaries.sr.register, common: dictionaries.sr.common },
  en: { register: dictionaries.en.register, common: dictionaries.en.common },
}

// The server client behind lib/actions/registration.ts and lib/actions/auth.ts.
function fakeSupabase({ taken = false, signedIn = false } = {}) {
  const inserts: { table: string; row: Record<string, unknown> }[] = []
  const client = {
    inserts,
    auth: {
      signUp: vi.fn(async () => ({
        data: { user: { id: USER_ID, identities: taken ? [] : [{}] }, session: null },
        error: null,
      })),
      signInWithOAuth: vi.fn(async () => ({ data: { provider: "google", url: "https://accounts.google.example/o" }, error: null })),
      resend: vi.fn(async () => ({ data: {}, error: null })),
      getUser: vi.fn(async () => ({
        data: { user: signedIn ? { id: USER_ID, email: "google@gmail.com", email_confirmed_at: "2026-10-22T10:00:00Z" } : null },
        error: null,
      })),
    },
    rpc: vi.fn(async () => ({ data: { id: USER_ID, organisation: null }, error: null })),
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => ({ data: table === "cities" ? { id: CITY.id } : null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        insert: async (row: Record<string, unknown>) => (inserts.push({ table, row }), { error: null }),
      }
      return builder
    },
  }
  supabase.current = client
  return client
}

beforeAll(() => {
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  push.mockReset()
  cookieJar.clear()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

function renderForm(completion: { email: string } | null = null) {
  return render(<RegisterClient initialLocale="sr" copy={copy} cities={[CITY]} completion={completion} />)
}

async function fillOwner(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Mejl adresa"), "ivana.petrovic@gmail.com")
  await user.type(screen.getByLabelText("Lozinka"), "dugalozinka")
  await user.click(screen.getByRole("checkbox"))
}

describe("S15 Registracija (FR-33)", () => {
  it("offers the three account types and sends the chosen one", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    renderForm()
    const group = screen.getByRole("radiogroup")
    expect(within(group).getAllByRole("radio")).toHaveLength(3)
    expect(screen.getByText("Vlasnik")).toBeInTheDocument()
    expect(screen.getByText("Azil")).toBeInTheDocument()
    expect(screen.getByText("Odgajivačnica")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /Vlasnik/ })).toBeChecked()

    await fillOwner(user)
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }))
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ data: expect.objectContaining({ account_type: "owner" }) }) }),
    )
  })

  it("sign-up sends terms_version = TERMS_VERSION and the UI language, then shows Proveri mejl", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    renderForm()
    await fillOwner(user)
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }))
    const call = client.auth.signUp.mock.calls[0] as unknown as [{ options: { data: Record<string, unknown> } }]
    expect(call[0].options.data).toMatchObject({ terms_version: TERMS_VERSION, locale: "sr-Latn" })
    expect(await screen.findByRole("heading", { name: "Proveri mejl" })).toBeInTheDocument()
    expect(screen.getByText("ivana.petrovic@gmail.com")).toBeInTheDocument()
  })

  it("the terms label links to /uslovi and /privatnost", () => {
    fakeSupabase()
    renderForm()
    expect(screen.getByRole("link", { name: "uslove korišćenja" })).toHaveAttribute("href", "/uslovi")
    expect(screen.getByRole("link", { name: "politiku privatnosti" })).toHaveAttribute("href", "/privatnost")
  })

  it("inline errors on submit; nothing is sent", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    renderForm()
    await user.type(screen.getByLabelText("Mejl adresa"), "marko@gmail")
    await user.type(screen.getByLabelText("Lozinka"), "maks")
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }))
    expect(screen.getByText("Upiši ispravnu mejl adresu, npr. ivana@gmail.com.")).toBeInTheDocument()
    expect(screen.getByText("Lozinka mora imati najmanje 8 znakova.")).toBeInTheDocument()
    expect(screen.getByText("Potrebno je da prihvatiš uslove.")).toBeInTheDocument()
    expect(client.auth.signUp).not.toHaveBeenCalled()
  })

  it.each([
    ["Azil", "shelter"],
    ["Odgajivačnica", "breeder"],
  ])("%s requires the organisation name and city", async (label, type) => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    renderForm()
    await user.click(screen.getByRole("radio", { name: new RegExp(label) }))
    await fillOwner(user)
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }))
    expect(screen.getByText("Upiši naziv organizacije.")).toBeInTheDocument()
    expect(screen.getByText("Izaberi grad.")).toBeInTheDocument()
    expect(client.auth.signUp).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText("Naziv organizacije *"), "Udruženje Druga šansa")
    await user.click(screen.getByRole("combobox", { name: "Grad *" }))
    await user.click(await screen.findByRole("option", { name: "Bečej" }))
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }))
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({ account_type: type, org_name: "Udruženje Druga šansa", city_id: CITY.id }),
        }),
      }),
    )
  })

  it("an email that already has an account → the taken error inline", async () => {
    const user = userEvent.setup()
    fakeSupabase({ taken: true })
    renderForm()
    await fillOwner(user)
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }))
    expect(await screen.findByText("Ovaj mejl već ima nalog. Prijavi se ili resetuj lozinku.")).toBeInTheDocument()
  })

  it("Proveri mejl: resend calls the EP-41 resend", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    renderForm()
    await fillOwner(user)
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }))
    await user.click(await screen.findByRole("button", { name: "Pošalji link ponovo" }))
    expect(client.auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "ivana.petrovic@gmail.com" }))
    expect(await screen.findByRole("status")).toHaveTextContent("Poslali smo novi link za potvrdu na ivana.petrovic@gmail.com.")
  })

  it("Google starts OAuth with redirectTo /auth/callback", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    const assign = vi.fn()
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, configurable: true })
    renderForm()
    await user.click(screen.getByRole("button", { name: "Nastavi sa Google-om" }))
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: expect.objectContaining({ redirectTo: "http://localhost:3000/auth/callback" }),
    })
    expect(assign).toHaveBeenCalledWith("https://accounts.google.example/o")
  })

  it("Google completion step: chooses the account type (no email/password) and completes the registration", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase({ signedIn: true })
    renderForm({ email: "google@gmail.com" })
    expect(screen.queryByLabelText("Lozinka")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nastavi sa Google-om" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("radio")).toHaveLength(3)

    await user.click(screen.getByRole("radio", { name: /Azil/ }))
    await user.type(screen.getByLabelText("Naziv organizacije *"), "Azil Nada")
    await user.click(screen.getByRole("combobox", { name: "Grad *" }))
    await user.click(await screen.findByRole("option", { name: "Bečej" }))
    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }))

    expect(client.inserts.find((i) => i.table === "profiles")?.row).toMatchObject({
      account_type: "shelter",
      terms_version: TERMS_VERSION,
    })
    expect(client.inserts.find((i) => i.table === "organisations")?.row).toMatchObject({ type: "shelter", name: "Azil Nada" })
    expect(push).toHaveBeenCalledWith("/ljubimci")
  })
})
