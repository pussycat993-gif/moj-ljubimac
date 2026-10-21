import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const supabase = { current: null as ReturnType<typeof fakeSupabase> | null }

vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "http://localhost:3000" }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }))

const { NewPasswordForm } = await import("@/app/(auth)/prijava/nova-lozinka/new-password-form")
const { default: NewPasswordPage } = await import("@/app/(auth)/prijava/nova-lozinka/page")

// The server client: a session opened by a reset link carries amr "recovery";
// signOut ends it, as the real client does.
function fakeSupabase({ session = "recovery" as "recovery" | "password" | null, updateError = false } = {}) {
  const state = { session }
  const client = {
    state,
    auth: {
      getClaims: vi.fn(async () =>
        state.session
          ? {
              data: { claims: { email: "ivana.petrovic@gmail.com", amr: [{ method: state.session, timestamp: 1 }] } },
              error: null,
            }
          : { data: null, error: null },
      ),
      updateUser: vi.fn(async () =>
        updateError
          ? { data: { user: null }, error: { name: "AuthApiError", status: 500, code: "unexpected_failure", message: "x" } }
          : { data: { user: {} }, error: null },
      ),
      signOut: vi.fn(async () => {
        state.session = null
        return { error: null }
      }),
    },
  }
  supabase.current = client
  return client
}

async function fill(password: string, repeat: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText("Nova lozinka"), password)
  if (repeat) await user.type(screen.getByLabelText("Ponovi lozinku"), repeat)
  await user.click(screen.getByRole("button", { name: "Sačuvaj novu lozinku" }))
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("S28 new password (FR-34, EP-42 updateUser)", () => {
  it("default state names the account of the reset link", async () => {
    fakeSupabase()
    render(await NewPasswordPage())

    expect(screen.getByRole("heading", { name: "Nova lozinka" })).toBeInTheDocument()
    expect(screen.getByText("ivana.petrovic@gmail.com")).toBeInTheDocument()
  })

  it("sets the password once: success state, then the link is spent and shows link-expired", async () => {
    const client = fakeSupabase()
    const { unmount } = render(await NewPasswordPage())

    await fill("lunaimaks2026", "lunaimaks2026")

    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: "lunaimaks2026" })
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(screen.getByRole("status")).toHaveTextContent("Lozinka je promenjena")
    expect(screen.getByRole("link", { name: "Prijavi se" })).toHaveAttribute("href", "/prijava")

    unmount()
    render(await NewPasswordPage())
    expect(screen.getByRole("alert")).toHaveTextContent("Link je istekao")
  })

  it("mismatch shows the inline error and nothing is sent", async () => {
    const client = fakeSupabase()
    render(<NewPasswordForm email="ivana.petrovic@gmail.com" />)

    await fill("lunaimaks2026", "lunaimaks2025")

    expect(screen.getByText("Lozinke se ne poklapaju. Upiši istu lozinku dva puta.")).toBeInTheDocument()
    expect(screen.getByLabelText("Ponovi lozinku")).toHaveAttribute("aria-invalid", "true")
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })

  it("fewer than 8 characters shows the inline error and nothing is sent", async () => {
    const client = fakeSupabase()
    render(<NewPasswordForm email="ivana.petrovic@gmail.com" />)

    await fill("luna", "luna")

    expect(screen.getByText("Lozinka mora imati najmanje 8 znakova.")).toBeInTheDocument()
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })

  it("an empty repeat asks for it", async () => {
    fakeSupabase()
    render(<NewPasswordForm email="ivana.petrovic@gmail.com" />)

    await fill("lunaimaks2026", "")

    expect(screen.getByText("Ponovi novu lozinku.")).toBeInTheDocument()
  })

  it("no recovery session → link-expired state with 'Pošalji novi link' to the reset view", async () => {
    fakeSupabase({ session: null })
    render(await NewPasswordPage())

    expect(screen.getByRole("alert")).toHaveTextContent("Link je istekao")
    expect(screen.getByRole("link", { name: "Pošalji novi link" })).toHaveAttribute("href", "/prijava?view=reset")
  })

  it("an ordinary signed-in session is not a reset link → link-expired", async () => {
    fakeSupabase({ session: "password" })
    render(await NewPasswordPage())

    expect(screen.getByRole("alert")).toHaveTextContent("Link je istekao")
  })

  it("a session that ended before submit → invalid_action_token → link-expired", async () => {
    const client = fakeSupabase()
    render(<NewPasswordForm email="ivana.petrovic@gmail.com" />)
    client.state.session = null

    await fill("lunaimaks2026", "lunaimaks2026")

    expect(client.auth.updateUser).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Link je istekao")
  })

  it("an unexpected failure keeps the form and shows the generic error", async () => {
    fakeSupabase({ updateError: true })
    render(<NewPasswordForm email="ivana.petrovic@gmail.com" />)

    await fill("lunaimaks2026", "lunaimaks2026")

    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    expect(screen.getByLabelText("Nova lozinka")).toBeInTheDocument()
  })
})
