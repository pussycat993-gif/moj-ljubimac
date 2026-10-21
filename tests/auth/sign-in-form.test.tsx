import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

type Row = Record<string, unknown>

const USER_ID = "00000000-0000-0000-0000-000000000001"
const push = vi.fn()
const supabase = { current: null as ReturnType<typeof fakeSupabase> | null }

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "http://localhost:3000" }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }))

const { SignInForm } = await import("@/app/(auth)/prijava/sign-in-form")

// The server client behind lib/actions/auth.ts (the form calls the real actions).
function fakeSupabase({
  signIn = "ok" as "ok" | "invalid_credentials" | "email_not_confirmed" | "over_request_rate_limit",
  profile = { id: USER_ID, deletion_requested_at: null } as Row | null,
  resetError = false,
} = {}) {
  const tables: Record<string, Row[]> = { profiles: profile ? [profile] : [], organisation_memberships: [] }
  const client = {
    auth: {
      signInWithPassword: vi.fn(async () =>
        signIn === "ok"
          ? { data: { user: { id: USER_ID }, session: {} }, error: null }
          : {
              data: { user: null, session: null },
              error: { name: "AuthApiError", code: signIn, status: signIn === "over_request_rate_limit" ? 429 : 400, message: signIn },
            },
      ),
      signInWithOAuth: vi.fn(async () => ({
        data: { provider: "google", url: "https://accounts.google.example/o/oauth2/auth?x=1" },
        error: null,
      })),
      resetPasswordForEmail: vi.fn(async () =>
        resetError
          ? { data: null, error: { name: "AuthApiError", status: 429, code: "over_email_send_rate_limit", message: "x" } }
          : { data: {}, error: null },
      ),
      resend: vi.fn(async () => ({ data: {}, error: null })),
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      const matching = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: matching(), error: null }),
      }
      return builder
    },
  }
  supabase.current = client
  return client
}

async function signIn(email = "ivana.petrovic@gmail.com", password = "lunaimaks2026") {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText("Mejl adresa"), email)
  if (password) await user.type(screen.getByLabelText("Lozinka"), password)
  await user.click(screen.getByRole("button", { name: "Prijavi se" }))
  return user
}

beforeEach(() => {
  push.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("S16 sign-in (FR-34, EP-42)", () => {
  it("success signs in on the server and navigates to /ljubimci", async () => {
    const client = fakeSupabase()
    render(<SignInForm initialView="sign-in" next={null} />)

    await signIn()

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "ivana.petrovic@gmail.com",
      password: "lunaimaks2026",
    })
    expect(push).toHaveBeenCalledWith("/ljubimci")
  })

  it("success navigates to next when one is given", async () => {
    fakeSupabase()
    render(<SignInForm initialView="sign-in" next="/poziv/hh_abc" />)

    await signIn()

    expect(push).toHaveBeenCalledWith("/poziv/hh_abc")
  })

  it("401 wrong credentials shows the error state", async () => {
    fakeSupabase({ signIn: "invalid_credentials" })
    render(<SignInForm initialView="sign-in" next={null} />)

    await signIn()

    expect(screen.getByRole("alert")).toHaveTextContent("Pogrešan mejl ili lozinka.")
    expect(screen.getByLabelText("Lozinka")).toHaveAttribute("aria-invalid", "true")
    expect(push).not.toHaveBeenCalled()
  })

  it("an invalid email is an inline error and nothing is sent", async () => {
    const client = fakeSupabase()
    render(<SignInForm initialView="sign-in" next={null} />)

    await signIn("ivana", "lunaimaks2026")

    expect(screen.getByText("Upiši ispravnu mejl adresu.")).toBeInTheDocument()
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it("403 email_not_verified shows the error with resend, and resend calls the EP-41 resend", async () => {
    const client = fakeSupabase({ signIn: "email_not_confirmed" })
    render(<SignInForm initialView="sign-in" next={null} />)

    const user = await signIn()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mejl adresa još nije potvrđena. Otvori link iz mejla koji smo ti poslali.",
    )
    await user.click(screen.getByRole("button", { name: "Pošalji link ponovo" }))

    expect(client.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "ivana.petrovic@gmail.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    })
    expect(screen.getByRole("status")).toHaveTextContent(
      "Poslali smo novi link za potvrdu na ivana.petrovic@gmail.com.",
    )
    expect(screen.queryByRole("button", { name: "Pošalji link ponovo" })).not.toBeInTheDocument()
  })

  it("other failures (e.g. 429) show the generic error, not wrong credentials", async () => {
    fakeSupabase({ signIn: "over_request_rate_limit" })
    render(<SignInForm initialView="sign-in" next={null} />)

    await signIn()

    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
  })

  it("Google starts OAuth on the server with redirectTo /auth/callback and goes to the provider", async () => {
    const client = fakeSupabase()
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } })
    render(<SignInForm initialView="sign-in" next={null} />)

    await userEvent.setup().click(screen.getByRole("button", { name: "Nastavi sa Google-om" }))

    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback", skipBrowserRedirect: true },
    })
    expect(assign).toHaveBeenCalledWith("https://accounts.google.example/o/oauth2/auth?x=1")
    Object.defineProperty(window, "location", { configurable: true, value: original })
  })
})

describe("S16 reset view (FR-34, EP-42 resetPasswordForEmail)", () => {
  it("'Zaboravljena lozinka?' opens the reset view with the email carried over", async () => {
    fakeSupabase()
    render(<SignInForm initialView="sign-in" next={null} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Mejl adresa"), "ivana.petrovic@gmail.com")

    await user.click(screen.getByRole("link", { name: "Zaboravljena lozinka?" }))

    expect(screen.getByRole("heading", { name: "Nova lozinka" })).toBeInTheDocument()
    expect(screen.getByLabelText("Mejl adresa")).toHaveValue("ivana.petrovic@gmail.com")
    expect(screen.getByRole("link", { name: "Nazad na prijavu" })).toHaveAttribute("href", "/prijava")
  })

  it("a reset request sends the link to /auth/callback?next=/prijava/nova-lozinka and shows the sent state", async () => {
    const client = fakeSupabase()
    render(<SignInForm initialView="reset" next={null} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Mejl adresa"), "ivana.petrovic@gmail.com")
    await user.click(screen.getByRole("button", { name: "Pošalji link" }))

    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("ivana.petrovic@gmail.com", {
      redirectTo: "http://localhost:3000/auth/callback?next=%2Fprijava%2Fnova-lozinka",
    })
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ako nalog sa adresom ivana.petrovic@gmail.com postoji, poslali smo link za novu lozinku. Proveri i spam folder.",
    )
  })

  it("a reset request always shows success, even when Supabase refuses (no account enumeration)", async () => {
    fakeSupabase({ resetError: true })
    render(<SignInForm initialView="reset" next={null} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Mejl adresa"), "nepoznat@example.com")
    await user.click(screen.getByRole("button", { name: "Pošalji link" }))

    expect(screen.getByRole("status")).toHaveTextContent("Ako nalog sa adresom nepoznat@example.com postoji")
  })

  it("an invalid email in the reset view is an inline error and nothing is sent", async () => {
    const client = fakeSupabase()
    render(<SignInForm initialView="reset" next={null} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Pošalji link" }))

    expect(screen.getByText("Upiši ispravnu mejl adresu.")).toBeInTheDocument()
    expect(client.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })
})
