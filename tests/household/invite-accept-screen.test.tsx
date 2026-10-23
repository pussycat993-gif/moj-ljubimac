import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { InvitationActions } from "@/app/(auth)/poziv/[token]/invite-accept-screen"
import type { InvitationView } from "@/lib/actions/invitations"
import type { ActionResult } from "@/lib/server/result"

// S14 Prihvati poziv — household variant (Step 22) · variants from EP-39 / EP-40 (API §7.3): household
// invitation with the shared pets and "Prihvati poziv" / "Odbij"; FR-26 #2 sign-in prompt when
// is_signed_in = false (links to /registracija and /prijava?next=/poziv/<token>); accepted; declined
// (invitation_declined); expired (410); error (404 and og_ / tr_ tokens); loading; EP-40 409 / 403 inline.

const { InviteAcceptScreen, InvitationLoading } = await import("@/app/(auth)/poziv/[token]/invite-accept-screen")
const { dictionaries } = await import("@/lib/i18n")

const TOKEN = "hh_abc.def"
const HH = "b1000000-0000-4000-8000-000000000001"

const copy = (locale: "sr" | "en") => ({
  invitation: dictionaries[locale].invitation,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

function view(extra: Partial<InvitationView> = {}): InvitationView {
  return {
    kind: "household",
    status: "pending",
    expires_at: "2026-10-30T08:00:00Z",
    household_name: "Domaćinstvo Petrović",
    organisation_name: null,
    organisation_type: null,
    role: null,
    inviter_name: "Ivana Petrović",
    inviter_city: null,
    shared_pets: [
      { name: "Luna", sex: "female", species: "cat", breed: "Britanska kratkodlaka" },
      { name: "Maks", sex: "male", species: "dog", breed: null },
    ],
    member_count: 3,
    member_limit: 6,
    is_signed_in: true,
    already_member: false,
    ...extra,
  }
}

const visitor = () =>
  view({ is_signed_in: false, shared_pets: null, member_count: null, member_limit: null, already_member: null })

const decide = vi.fn()
const actions: InvitationActions = { decideHouseholdInvitation: (...a) => decide(...a) }

function renderScreen(initial: ActionResult<InvitationView>, opts: { locale?: "sr" | "en"; signedIn?: boolean } = {}) {
  return render(
    <InviteAcceptScreen
      token={TOKEN}
      initial={initial}
      user={opts.signedIn === false ? null : { name: "Marko Jovanović", email: "marko@mojljubimac.test" }}
      locale={opts.locale ?? "sr"}
      copy={copy(opts.locale ?? "sr")}
      actions={actions}
    />,
  )
}

beforeEach(() => vi.clearAllMocks())

describe("S14 household invitation", () => {
  it("shows the household, inviter, shared pets, counter and what a member can do", () => {
    renderScreen({ ok: true, data: view() })
    expect(screen.getByText("Poziv u domaćinstvo")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Domaćinstvo Petrović" })).toBeInTheDocument()
    expect(screen.getByText("Poziva te: Ivana Petrović")).toBeInTheDocument()
    expect(screen.getByText("Mačka · Britanska kratkodlaka")).toBeInTheDocument()
    expect(screen.getByText("Pas")).toBeInTheDocument()
    expect(screen.getByText("3 / 6 članova")).toBeInTheDocument()
    expect(screen.getByText("Vakcine, terapije, preglede i priloge vidiš, ali ih menja samo Ivana.")).toBeInTheDocument()
    expect(screen.getByText("Marko Jovanović")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Nisi ti?" })).toHaveAttribute("href", "/prijava")
  })

  it("FR-26 #1: Prihvati poziv → EP-40 accept → accepted variant with the pets and a link to S01", async () => {
    decide.mockResolvedValue({ ok: true, data: { kind: "household", status: "accepted", household_id: HH, organisation_id: null } })
    renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Prihvati poziv" }))
    expect(decide).toHaveBeenCalledWith({ token: TOKEN, decision: "accept" })
    expect(await screen.findByRole("heading", { name: "Sada si član: Domaćinstvo Petrović" })).toBeInTheDocument()
    expect(screen.getByText("Luna i Maks su na tvojoj listi ljubimaca. Uključi podsetnike kad ti odgovara.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Idi na ljubimce" })).toHaveAttribute("href", "/ljubimci")
  })

  it("one shared pet uses the singular verb", async () => {
    decide.mockResolvedValue({ ok: true, data: { kind: "household", status: "accepted", household_id: HH, organisation_id: null } })
    renderScreen({ ok: true, data: view({ shared_pets: [{ name: "Luna", sex: "female", species: "cat", breed: null }] }) })
    await userEvent.click(screen.getByRole("button", { name: "Prihvati poziv" }))
    expect(await screen.findByText("Luna je na tvojoj listi ljubimaca. Uključi podsetnike kad ti odgovara.")).toBeInTheDocument()
  })

  it("Odbij → EP-40 decline → invitation_declined", async () => {
    decide.mockResolvedValue({ ok: true, data: { kind: "household", status: "declined", household_id: HH, organisation_id: null } })
    renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Odbij" }))
    expect(decide).toHaveBeenCalledWith({ token: TOKEN, decision: "decline" })
    expect(await screen.findByRole("heading", { name: "Poziv je odbijen" })).toBeInTheDocument()
    expect(
      screen.getByText("Javili smo da ne prihvataš poziv u „Domaćinstvo Petrović”. Link više ne važi; ako se predomisliš, zamoli za novi poziv."),
    ).toBeInTheDocument()
  })

  it.each([
    ["household_full", "Domaćinstvo je popunjeno (najviše 6 članova)."],
    ["already_member", "Već si član ovog domaćinstva."],
    ["invitation_used", "Ovaj poziv je već iskorišćen."],
    ["household_read_only", "Domaćinstvo je trenutno samo za čitanje, pa ne možeš da se pridružiš."],
    ["internal_error", "Nešto nije u redu. Pokušaj ponovo."],
  ])("EP-40 %s → inline message", async (code, message) => {
    decide.mockResolvedValue({ ok: false, error: { code, message: code } })
    renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Prihvati poziv" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(message)
  })

  it("EP-40 410 → expired; 401 → sign-in prompt", async () => {
    decide.mockResolvedValueOnce({ ok: false, error: { code: "invitation_expired", message: "x" } })
    const { unmount } = renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Prihvati poziv" }))
    expect(await screen.findByRole("heading", { name: "Ovaj poziv je istekao" })).toBeInTheDocument()
    unmount()

    decide.mockResolvedValueOnce({ ok: false, error: { code: "unauthenticated", message: "x" } })
    renderScreen({ ok: true, data: view() })
    await userEvent.click(screen.getByRole("button", { name: "Prihvati poziv" }))
    expect(await screen.findByRole("heading", { name: "Poziv: Domaćinstvo Petrović" })).toBeInTheDocument()
  })
})

describe("S14 variants from EP-39", () => {
  it("FR-26 #2: is_signed_in = false → sign-in / register prompt; sign-in returns to the invitation", () => {
    renderScreen({ ok: true, data: visitor() }, { signedIn: false })
    expect(screen.getByRole("heading", { level: 1, name: "Poziv: Domaćinstvo Petrović" })).toBeInTheDocument()
    expect(screen.getByText("Da prihvatiš poziv, prijavi se ili napravi besplatan nalog. Poziv te čeka ovde.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Napravi nalog" })).toHaveAttribute("href", "/registracija")
    expect(screen.getByRole("link", { name: "Već imam nalog — prijavi me" })).toHaveAttribute(
      "href",
      `/prijava?next=${encodeURIComponent(`/poziv/${TOKEN}`)}`,
    )
    expect(screen.queryByRole("button", { name: "Prihvati poziv" })).not.toBeInTheDocument()
  })

  it("status declined → invitation_declined", () => {
    renderScreen({ ok: true, data: view({ status: "declined" }) })
    expect(screen.getByRole("heading", { name: "Poziv je odbijen" })).toBeInTheDocument()
  })

  it("status accepted: the new member sees the accepted variant, anyone else 'already used'", () => {
    const { unmount } = renderScreen({ ok: true, data: view({ status: "accepted", already_member: true }) })
    expect(screen.getByRole("heading", { name: "Sada si član: Domaćinstvo Petrović" })).toBeInTheDocument()
    unmount()
    renderScreen({ ok: true, data: view({ status: "accepted", already_member: false }) })
    expect(screen.getByRole("alert")).toHaveTextContent("Ovaj poziv je već iskorišćen.")
    expect(screen.queryByRole("button", { name: "Prihvati poziv" })).not.toBeInTheDocument()
  })

  it("a pending invitation for a current member shows the inline message and no buttons", () => {
    renderScreen({ ok: true, data: view({ already_member: true }) })
    expect(screen.getByRole("alert")).toHaveTextContent("Već si član ovog domaćinstva.")
    expect(screen.queryByRole("button", { name: "Prihvati poziv" })).not.toBeInTheDocument()
  })

  it("410 invitation_expired → expired variant (7 days)", () => {
    renderScreen({ ok: false, error: { code: "invitation_expired", message: "x" } })
    expect(screen.getByRole("heading", { name: "Ovaj poziv je istekao" })).toBeInTheDocument()
    expect(screen.getByText("Pozivi u domaćinstvo važe 7 dana. Zamoli osobu koja te je pozvala za novi.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Idi na početnu" })).toHaveAttribute("href", "/ljubimci")
  })

  it("404 / 5xx (and og_ / tr_ tokens) → error variant", () => {
    renderScreen({ ok: false, error: { code: "not_found", message: "x" } })
    expect(screen.getByRole("heading", { name: "Poziv nije pronađen" })).toBeInTheDocument()
    expect(screen.getByText("Proveri da li si otvorio/la ceo link.")).toBeInTheDocument()
  })

  it("loading variant", () => {
    render(<InvitationLoading label="Učitavanje poziva" />)
    expect(screen.getByLabelText("Učitavanje poziva")).toHaveAttribute("aria-busy", "true")
  })

  it("English", () => {
    renderScreen({ ok: true, data: view() }, { locale: "en" })
    expect(screen.getByText("Household invitation")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeInTheDocument()
    expect(screen.getByText("Cat · Britanska kratkodlaka")).toBeInTheDocument()
  })
})
