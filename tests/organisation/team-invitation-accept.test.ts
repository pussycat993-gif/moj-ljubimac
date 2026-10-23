import { createElement } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { InvitationActions } from "@/app/(auth)/poziv/[token]/invite-accept-screen"
import type { InvitationView } from "@/lib/actions/invitations"
import type { ActionResult } from "@/lib/server/result"

vi.mock("server-only", () => ({}))

// EP-39 / EP-40 og_ (Step 24, CR-18) — lib/actions/invitations.ts over a fake server client that models
// rpc:get_organisation_invitation / rpc:decide_organisation_invitation: EP-39 returns InvitationView with
// kind = organisation; the invitee accepts → an organisation_memberships row with the invited role and status
// accepted; the invitee's profiles.account_type is unchanged (BR-53). Then S14 renders the team variant for
// Volonter and Admin, declined and expired (Design §12 S14; invite-accept.tsx team / teamAdmin views).

type Row = Record<string, unknown>

const MARKO = "a1000000-0000-4000-8000-000000000002"
const ORG = "b2000000-0000-4000-8000-000000000001"
const OG_TOKEN = "og_ZXhhbXBsZS10b2tlbg.c2lnbmF0dXJl"

const db = {
  user: MARKO as string | null,
  invitation: null as null | { hash: string; status: string; role: "admin" | "volunteer"; expires_at: string },
  memberships: [] as { organisation_id: string; user_id: string; role: string }[],
  profiles: { [MARKO]: { account_type: "owner" } } as Record<string, { account_type: string }>,
  rpcCalls: [] as { name: string; args: Row }[],
}

const raise = (message: string) => ({ data: null, error: { code: "P0001", message, details: null } })

function rpc(name: string, args: Row) {
  db.rpcCalls.push({ name, args })
  const inv = db.invitation
  if (name === "get_organisation_invitation") {
    if (!inv || inv.hash !== args.p_token_hash) return raise("not_found")
    if (inv.status === "expired" || Date.parse(inv.expires_at) < Date.now()) return raise("invitation_expired")
    const signedIn = db.user !== null
    return {
      data: {
        kind: "organisation",
        status: inv.status,
        expires_at: inv.expires_at,
        household_name: null,
        organisation_name: "Azil Šapica",
        organisation_type: "shelter",
        role: inv.role,
        inviter_name: "Milica Stojanović",
        inviter_city: signedIn ? { id: "c", name_sr: "Bečej", name_en: "Becej", latitude: 0, longitude: 0 } : null,
        shared_pets: null,
        member_count: signedIn ? db.memberships.length : null,
        member_limit: signedIn ? 20 : null,
        is_signed_in: signedIn,
        already_member: signedIn ? db.memberships.some((m) => m.user_id === db.user) : null,
      },
      error: null,
    }
  }
  if (name === "decide_organisation_invitation") {
    if (!inv || inv.hash !== args.p_token_hash) return raise("not_found")
    if (inv.status === "accepted" || inv.status === "declined") return raise("invitation_used")
    if (inv.status === "expired" || Date.parse(inv.expires_at) < Date.now()) return raise("invitation_expired")
    if (args.p_decision === "decline") {
      inv.status = "declined"
      return { data: { kind: "organisation", status: "declined", household_id: null, organisation_id: ORG }, error: null }
    }
    if (db.memberships.some((m) => m.user_id === db.user)) return raise("already_member")
    if (db.memberships.length >= 20) return raise("team_full")
    db.memberships.push({ organisation_id: ORG, user_id: db.user!, role: inv.role })
    inv.status = "accepted"
    return { data: { kind: "organisation", status: "accepted", household_id: null, organisation_id: ORG }, error: null }
  }
  throw new Error(`unexpected rpc ${name}`)
}

function client() {
  const table = (rows: Row[]) => {
    const api = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    }
    return api
  }
  return {
    auth: {
      getUser: async () => ({
        data: { user: db.user ? { id: db.user, email: "marko@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } : null },
        error: null,
      }),
    },
    from: (name: string) => table(name === "profiles" && db.user ? [{ id: db.user, deletion_requested_at: null }] : []),
    rpc: async (name: string, args: Row) => rpc(name, args),
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }))

const { getHouseholdInvitation, decideHouseholdInvitation } = await import("@/lib/actions/invitations")
const { hashToken } = await import("@/lib/server/action-tokens")
const { InviteAcceptScreen } = await import("@/app/(auth)/poziv/[token]/invite-accept-screen")
const { dictionaries } = await import("@/lib/i18n")

beforeEach(async () => {
  Object.assign(db, {
    user: MARKO,
    invitation: {
      hash: await hashToken(OG_TOKEN),
      status: "pending",
      role: "volunteer",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    memberships: [
      { organisation_id: ORG, user_id: "a1000000-0000-4000-8000-000000000004", role: "admin" },
      { organisation_id: ORG, user_id: "a1000000-0000-4000-8000-000000000003", role: "volunteer" },
    ],
    profiles: { [MARKO]: { account_type: "owner" } },
    rpcCalls: [],
  })
})

describe("EP-39 / EP-40 og_ (lib/actions/invitations.ts)", () => {
  it("EP-39 returns InvitationView with kind = organisation; only the token hash reaches the database", async () => {
    const result = await getHouseholdInvitation({ token: OG_TOKEN })
    expect(result.ok && result.data).toMatchObject({
      kind: "organisation",
      status: "pending",
      organisation_name: "Azil Šapica",
      organisation_type: "shelter",
      role: "volunteer",
      household_name: null,
      member_count: 2,
      member_limit: 20,
      is_signed_in: true,
      already_member: false,
    })
    expect(db.rpcCalls[0]).toEqual({ name: "get_organisation_invitation", args: { p_token_hash: await hashToken(OG_TOKEN) } })
  })

  it("a Visitor gets the limited fields", async () => {
    db.user = null
    const result = await getHouseholdInvitation({ token: OG_TOKEN })
    expect(result.ok && result.data).toMatchObject({ is_signed_in: false, member_count: null, already_member: null })
  })

  it("accept → organisation_memberships with the invited role, status accepted; account_type unchanged (BR-53)", async () => {
    db.invitation!.role = "admin"
    const result = await decideHouseholdInvitation({ token: OG_TOKEN, decision: "accept" })
    expect(result).toEqual({
      ok: true,
      data: { kind: "organisation", status: "accepted", household_id: null, organisation_id: ORG },
    })
    expect(db.rpcCalls[0]).toEqual({
      name: "decide_organisation_invitation",
      args: { p_token_hash: await hashToken(OG_TOKEN), p_decision: "accept" },
    })
    expect(db.memberships.find((m) => m.user_id === MARKO)).toEqual({ organisation_id: ORG, user_id: MARKO, role: "admin" })
    expect(db.invitation!.status).toBe("accepted")
    expect(db.profiles[MARKO].account_type).toBe("owner")
    const view = await getHouseholdInvitation({ token: OG_TOKEN })
    expect(view.ok && view.data).toMatchObject({ status: "accepted", already_member: true })
  })

  it("decline; then invitation_used; expired → invitation_expired; a Visitor → 401", async () => {
    expect((await decideHouseholdInvitation({ token: OG_TOKEN, decision: "decline" })).ok).toBe(true)
    expect(await decideHouseholdInvitation({ token: OG_TOKEN, decision: "accept" })).toMatchObject({
      ok: false,
      error: { code: "invitation_used" },
    })
    db.invitation!.status = "expired"
    expect(await getHouseholdInvitation({ token: OG_TOKEN })).toMatchObject({ ok: false, error: { code: "invitation_expired" } })
    db.user = null
    expect(await decideHouseholdInvitation({ token: OG_TOKEN, decision: "accept" })).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    })
  })

  it("tr_ tokens are not handled yet (Step 25) → not_found without a database call", async () => {
    expect(await getHouseholdInvitation({ token: "tr_abc.def" })).toMatchObject({ ok: false, error: { code: "not_found" } })
    expect(db.rpcCalls).toHaveLength(0)
  })
})

const copy = (locale: "sr" | "en") => ({
  invitation: dictionaries[locale].invitation,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

function teamView(extra: Partial<InvitationView> = {}): InvitationView {
  return {
    kind: "organisation",
    status: "pending",
    expires_at: "2026-10-26T10:00:00Z",
    household_name: null,
    organisation_name: "Azil Šapica",
    organisation_type: "shelter",
    role: "volunteer",
    inviter_name: "Milica Stojanović",
    inviter_city: { id: "c", name_sr: "Bečej", name_en: "Becej", latitude: 0, longitude: 0 },
    shared_pets: null,
    member_count: 6,
    member_limit: 20,
    is_signed_in: true,
    already_member: false,
    ...extra,
  }
}

const decide = vi.fn()
const actions: InvitationActions = { decideHouseholdInvitation: (...a) => decide(...a) }

function renderScreen(initial: ActionResult<InvitationView>, locale: "sr" | "en" = "sr", signedIn = true) {
  return render(
    // The table names a .ts file, so the screen is created without JSX.
    createElement(InviteAcceptScreen, {
      token: OG_TOKEN,
      initial,
      user: signedIn ? { name: "Marko Jovanović", email: "marko@mojljubimac.test" } : null,
      locale,
      copy: copy(locale),
      actions,
    }),
  )
}

describe("S14 team variant", () => {
  beforeEach(() => decide.mockReset())

  it("Volonter: organisation, type · city · inviter, role tile, counter, what a volunteer can do, validity, buttons", () => {
    renderScreen({ ok: true, data: teamView() })
    expect(screen.getByText("Poziv u tim organizacije")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Azil Šapica" })).toBeInTheDocument()
    expect(screen.getByText("Azil · Bečej · Poziva te: Milica Stojanović")).toBeInTheDocument()
    expect(screen.getByText("Tvoja uloga")).toBeInTheDocument()
    expect(screen.getByText("Volonter")).toBeInTheDocument()
    expect(screen.getByText("6 / 20 članova")).toBeInTheDocument()
    expect(screen.getByText("Kao volonter možeš")).toBeInTheDocument()
    expect(screen.getByText("da dodaješ nove životinje na prijemu")).toBeInTheDocument()
    expect(screen.getByText("Zahteve za udomljavanje vidiš, ali ih prihvata ili odbija samo Admin.")).toBeInTheDocument()
    expect(screen.getByText("Tvoj nalog ostaje kakav je — i dalje vodiš i svoje ljubimce.")).toBeInTheDocument()
    expect(screen.getByText("Poziv važi do 26. 10. 2026.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pridruži se timu" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Odbij" })).toBeInTheDocument()
  })

  it("Admin: the admin role and its lines", () => {
    renderScreen({ ok: true, data: teamView({ role: "admin" }) })
    expect(screen.getByText("Admin")).toBeInTheDocument()
    expect(screen.getByText("Kao admin možeš")).toBeInTheDocument()
    expect(screen.getByText("da pozivaš članove tima i menjaš javni profil")).toBeInTheDocument()
    expect(screen.getByText("Pretplatu i brisanje organizacije menja samo vlasnik naloga organizacije.")).toBeInTheDocument()
  })

  it("Pridruži se timu → EP-40 accept → accepted with the role and a link to S20", async () => {
    decide.mockResolvedValue({ ok: true, data: { kind: "organisation", status: "accepted", household_id: null, organisation_id: ORG } })
    renderScreen({ ok: true, data: teamView() })
    await userEvent.click(screen.getByRole("button", { name: "Pridruži se timu" }))
    expect(decide).toHaveBeenCalledWith({ token: OG_TOKEN, decision: "accept" })
    expect(await screen.findByRole("heading", { name: "Dobro došao/la u tim: Azil Šapica" })).toBeInTheDocument()
    expect(
      screen.getByText("Uloga: Volonter. Organizaciju otvaraš iz menija, a tvoji ljubimci ostaju gde su bili."),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Idi u organizaciju" })).toHaveAttribute("href", "/organizacija")
  })

  it("Odbij → EP-40 decline → declined (team copy)", async () => {
    decide.mockResolvedValue({ ok: true, data: { kind: "organisation", status: "declined", household_id: null, organisation_id: ORG } })
    renderScreen({ ok: true, data: teamView() })
    await userEvent.click(screen.getByRole("button", { name: "Odbij" }))
    expect(await screen.findByRole("heading", { name: "Poziv je odbijen" })).toBeInTheDocument()
    expect(
      screen.getByText("Javili smo da ne prihvataš poziv u tim: Azil Šapica. Ako se predomisliš, zamoli za novi poziv."),
    ).toBeInTheDocument()
  })

  it("status declined from EP-39 → declined", () => {
    renderScreen({ ok: true, data: teamView({ status: "declined" }) })
    expect(screen.getByRole("heading", { name: "Poziv je odbijen" })).toBeInTheDocument()
  })

  it("410 for an og_ token → expired with the link copy (owner decision)", () => {
    renderScreen({ ok: false, error: { code: "invitation_expired", message: "x" } })
    expect(screen.getByRole("heading", { name: "Ovaj poziv je istekao" })).toBeInTheDocument()
    expect(screen.getByText("Link više ne važi. Zamoli pošiljaoca da ti pošalje novi poziv.")).toBeInTheDocument()
  })

  it("a Visitor → sign-in prompt titled “Poziv u tim: …”", () => {
    renderScreen(
      { ok: true, data: teamView({ is_signed_in: false, inviter_city: null, member_count: null, member_limit: null, already_member: null }) },
      "sr",
      false,
    )
    expect(screen.getByRole("heading", { level: 1, name: "Poziv u tim: Azil Šapica" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Već imam nalog — prijavi me" })).toHaveAttribute(
      "href",
      `/prijava?next=${encodeURIComponent(`/poziv/${OG_TOKEN}`)}`,
    )
  })

  it("a current member, or EP-40 already_member → no buttons, a link to S20; invitation_used inline", async () => {
    const { unmount } = renderScreen({ ok: true, data: teamView({ already_member: true }) })
    expect(screen.queryByRole("button", { name: "Pridruži se timu" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Idi u organizaciju" })).toBeInTheDocument()
    unmount()
    decide.mockResolvedValue({ ok: false, error: { code: "invitation_used", message: "x" } })
    renderScreen({ ok: true, data: teamView() })
    await userEvent.click(screen.getByRole("button", { name: "Pridruži se timu" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ovaj poziv je već iskorišćen.")
  })

  it("English", () => {
    renderScreen({ ok: true, data: teamView() }, "en")
    expect(screen.getByText("Organisation team invitation")).toBeInTheDocument()
    expect(screen.getByText("Shelter · Becej · Invited by: Milica Stojanović")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Join the team" })).toBeInTheDocument()
    expect(screen.getByText("The invitation is valid until 26 Oct 2026")).toBeInTheDocument()
  })
})
