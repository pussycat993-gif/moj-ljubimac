import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const USER_ID = "a1000000-0000-4000-8000-000000000002"
const CITY = { id: "11111111-1111-4111-8111-000000000001", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.25, longitude: 19.84 }
const supabase = { current: null as ReturnType<typeof fakeSupabase> | null }
const cookieJar = new Map<string, { value: string; options: Record<string, unknown> }>()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/profil",
  redirect: vi.fn(),
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)!.value } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => void cookieJar.set(name, { value, options }),
  }),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }))

const { RegisterClient } = await import("@/app/(auth)/registracija/register-client")
const { ProfileClient } = await import("@/app/(app)/profil/profile-client")
const { dictionaries } = await import("@/lib/i18n")
const { sr, en } = dictionaries

function fakeSupabase() {
  const profile: Record<string, unknown> = { id: USER_ID, locale: "sr-Latn", deletion_requested_at: null }
  const client = {
    updates: [] as Record<string, unknown>[],
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID, email: "m@x.test", email_confirmed_at: "2026-10-01T00:00:00Z" } }, error: null })),
    },
    rpc: vi.fn(async () => ({
      data: { id: USER_ID, email: "m@x.test", full_name: "Marko", locale: profile.locale, city: CITY, organisation: null },
      error: null,
    })),
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        update: (patch: Record<string, unknown>) => (client.updates.push(patch), Object.assign(profile, patch), builder),
        maybeSingle: async () => ({ data: profile, error: null }),
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
  cookieJar.clear()
})

/** Every string the screen shows in its default state, from one dictionary section. */
function expectVisible(strings: string[]) {
  for (const s of strings) expect(screen.getAllByText(s, { exact: true }).length).toBeGreaterThan(0)
}
function expectGone(strings: string[]) {
  for (const s of strings) expect(screen.queryByText(s, { exact: true })).not.toBeInTheDocument()
}

function registerStrings(r: typeof sr.register) {
  return [
    r.title,
    r.subtitle,
    r.accountType,
    r.types.owner.label,
    r.types.owner.desc,
    r.types.shelter.label,
    r.types.shelter.desc,
    r.types.breeder.label,
    r.types.breeder.desc,
    r.google,
    r.or,
    r.email,
    r.password,
    r.passwordHint,
    r.termsLink,
    r.privacyLink,
    r.submit,
    r.haveAccount,
    r.signIn,
  ]
}

function profileStrings(p: typeof sr.profile) {
  return [p.title, p.personal, p.name, p.city, p.email, p.language, p.save, p.reminderSettings, p.reminderSettingsHint, p.myData, p.myDataHint, p.signOut]
}

describe("FR-35 — switching the language shows all product text in it", () => {
  it("S15: the SR/EN switch re-renders every visible string and remembers it in ml_locale", async () => {
    const user = userEvent.setup()
    fakeSupabase()
    render(
      <RegisterClient
        initialLocale="sr"
        copy={{ sr: { register: sr.register, common: sr.common }, en: { register: en.register, common: en.common } }}
        cities={[CITY]}
      />,
    )
    expectVisible(registerStrings(sr.register).filter((s) => s !== sr.register.submit && s !== sr.register.title))
    expect(screen.getByRole("heading", { name: sr.register.title })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "EN" }))
    expectVisible(registerStrings(en.register))
    expectGone(registerStrings(sr.register).filter((s) => !registerStrings(en.register).includes(s)))
    expect(screen.getByRole("group", { name: en.register.language })).toBeInTheDocument()
    await vi.waitFor(() => expect(cookieJar.get("ml_locale")?.value).toBe("en"))
    expect(cookieJar.get("ml_locale")?.options).toEqual({ path: "/", maxAge: 31536000, sameSite: "lax", httpOnly: true })

    await user.click(screen.getByRole("button", { name: "SR" }))
    expect(screen.getByRole("heading", { name: sr.register.title })).toBeInTheDocument()
    await vi.waitFor(() => expect(cookieJar.get("ml_locale")?.value).toBe("sr"))
  })

  it("S15: sign-up sends the chosen language as locale (EP-41)", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    const signUp = vi.fn(async () => ({ data: { user: { id: USER_ID, identities: [{}] }, session: null }, error: null }))
    Object.assign(client.auth, { signUp })
    render(
      <RegisterClient
        initialLocale="en"
        copy={{ sr: { register: sr.register, common: sr.common }, en: { register: en.register, common: en.common } }}
        cities={[CITY]}
      />,
    )
    await user.type(screen.getByLabelText(en.register.email), "marko@gmail.com")
    await user.type(screen.getByLabelText(en.register.password), "dugalozinka")
    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByRole("button", { name: en.register.submit }))
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ data: expect.objectContaining({ locale: "en" }) }) }),
    )
    expect(await screen.findByRole("heading", { name: en.register.checkTitle })).toBeInTheDocument()
  })

  it("S18: saving English persists locale with the EP-43 update, sets ml_locale and re-renders in English", async () => {
    const user = userEvent.setup()
    const client = fakeSupabase()
    render(
      <ProfileClient
        me={{ id: USER_ID, email: "m@x.test", full_name: "Marko", locale: "sr-Latn", city: CITY, organisation: null } as never}
        cities={[CITY]}
        copy={{ sr: { profile: sr.profile, common: sr.common }, en: { profile: en.profile, common: en.common } }}
      />,
    )
    expectVisible(profileStrings(sr.profile))

    await user.click(screen.getByRole("combobox", { name: sr.profile.language }))
    await user.click(await screen.findByRole("option", { name: "English" }))
    await user.click(screen.getByRole("button", { name: sr.profile.save }))

    expect(client.updates).toEqual([expect.objectContaining({ locale: "en" })])
    expect(cookieJar.get("ml_locale")?.value).toBe("en")
    expect(await screen.findByRole("heading", { name: en.profile.title })).toBeInTheDocument()
    expectVisible(profileStrings(en.profile))
    expectGone(profileStrings(sr.profile).filter((s) => !profileStrings(en.profile).includes(s)))
  })
})
