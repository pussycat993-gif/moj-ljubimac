import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { HouseholdActions } from "@/app/(app)/domacinstvo/household-screen"
import type { Household, HouseholdView } from "@/lib/actions/household"

// S13 Domaćinstvo (Step 22) · states from EP-34 (API EP-34 "States", §7.3): FR-26 #3 household = null and
// no Premium → PremiumLock (G); E with Premium; D; FR-32 read_only → ReadOnlyBanner with the controls hidden;
// member view (M) with the FR-29 opt-in Switch and "Napusti domaćinstvo" (→ /ljubimci). The invite Dialog
// (EP-35): "email sent" status, the link with "Kopiraj", inline 409 household_full (FR-26 #4) and
// rate_limited, 403 premium_required → G, the household name on the first invitation. EP-36 remove /
// revoke, EP-37 shared-pets Switch.

const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const { HouseholdScreen } = await import("@/app/(app)/domacinstvo/household-screen")
const { dictionaries } = await import("@/lib/i18n")

const IVANA = "a1000000-0000-4000-8000-000000000001"
const JELENA = "a1000000-0000-4000-8000-000000000003"
const HH = "b1000000-0000-4000-8000-000000000001"
const LUNA = "c1000000-0000-4000-8000-000000000001"
const MAKS = "c1000000-0000-4000-8000-000000000002"

const copy = (locale: "sr" | "en") => ({
  household: dictionaries[locale].household,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

function household(extra: Partial<Household> = {}): Household {
  return {
    id: HH,
    name: "Domaćinstvo Petrović",
    owner_id: IVANA,
    owner_name: "Ivana Petrović",
    owner_premium_until: "2026-10-05T10:00:00Z",
    read_only: false,
    my_role: "owner",
    my_reminders_enabled: null,
    members: [
      { user_id: IVANA, full_name: "Ivana Petrović", email: "ivana@mojljubimac.test", role: "owner", joined_at: "2026-03-12T10:00:00Z", reminders_enabled: null, is_me: true },
      { user_id: JELENA, full_name: "Jelena Nikolić", email: "jelena@mojljubimac.test", role: "member", joined_at: "2026-04-15T10:00:00Z", reminders_enabled: false, is_me: false },
    ],
    member_count: 2,
    member_limit: 6,
    pets: [
      { pet_id: LUNA, name: "Luna", sex: "female", species: "cat", breed: null, lifecycle: "active", shared: true },
      { pet_id: MAKS, name: "Maks", sex: "male", species: "dog", breed: null, lifecycle: "active", shared: false },
    ],
    pending_invitations: [],
    access: { role: "owner", can_edit: true, can_delete: false },
    ...extra,
  }
}

const memberView = (extra: Partial<Household> = {}) =>
  household({
    my_role: "member",
    my_reminders_enabled: false,
    access: { role: "member", can_edit: false, can_delete: false },
    pets: [{ pet_id: LUNA, name: "Luna", sex: "female", species: "cat", breed: null, lifecycle: "active", shared: true }],
    members: household().members.map((m) => ({ ...m, is_me: m.user_id === JELENA })),
    ...extra,
  })

const getHousehold = vi.fn()
const createHouseholdInvitation = vi.fn()
const changeHouseholdMembership = vi.fn()
const setSharedPet = vi.fn()
const setMyReminderOptIn = vi.fn()
const actions: HouseholdActions = {
  getHousehold: (...a) => getHousehold(...a),
  createHouseholdInvitation: (...a) => createHouseholdInvitation(...a),
  changeHouseholdMembership: (...a) => changeHouseholdMembership(...a),
  setSharedPet: (...a) => setSharedPet(...a),
  setMyReminderOptIn: (...a) => setMyReminderOptIn(...a),
}

function renderScreen(h: Household | null, opts: { premium?: boolean; locale?: "sr" | "en" } = {}) {
  const view: HouseholdView = { household: h, my_households: [] }
  return render(
    <HouseholdScreen
      initial={view}
      premium={opts.premium ?? true}
      me={{ id: IVANA, name: "Ivana Petrović", email: "ivana@mojljubimac.test" }}
      locale={opts.locale ?? "sr"}
      copy={copy(opts.locale ?? "sr")}
      actions={actions}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getHousehold.mockResolvedValue({ ok: true, data: { household: household(), my_households: [] } })
  Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: vi.fn(async () => {}) }, configurable: true })
})

describe("S13 states", () => {
  it("FR-26 #3: household = null and no Premium → PremiumLock (G); its CTA opens /premium", async () => {
    renderScreen(null, { premium: false })
    expect(screen.getByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
    expect(
      screen.getByText("Pozovi do 5 ukućana da zajedno beležite obroke, doze i trenutke. Deljenje je deo Premiuma."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Pozovi člana" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Probaj 7 dana besplatno" }))
    expect(push).toHaveBeenCalledWith("/premium")
  })

  it("E: household = null with Premium → empty state that invites; the first invitation asks for the household name", async () => {
    renderScreen(null)
    expect(screen.getByText("Još nema članova")).toBeInTheDocument()
    expect(screen.getByText("1 / 6 članova")).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole("button", { name: "Pozovi člana" })[0])
    const dialog = screen.getByRole("dialog")
    await userEvent.click(within(dialog).getByRole("tab", { name: "Linkom" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Napravi link" }))
    expect(within(dialog).getByText("Upiši naziv domaćinstva.")).toBeInTheDocument()
    expect(createHouseholdInvitation).not.toHaveBeenCalled()

    createHouseholdInvitation.mockResolvedValue({
      ok: true,
      data: { invitation: { household_id: HH }, invite_url: "https://mojljubimac.rs/poziv/hh_abc.def" },
    })
    await userEvent.type(within(dialog).getByLabelText("Naziv domaćinstva"), "Kuća Ilić")
    await userEvent.click(within(dialog).getByRole("button", { name: "Napravi link" }))
    expect(createHouseholdInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ email: null, household_name: "Kuća Ilić", idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    )
    expect(await within(dialog).findByDisplayValue("https://mojljubimac.rs/poziv/hh_abc.def")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Kopiraj" }))
    expect(within(dialog).getByText("Link je kopiran")).toBeInTheDocument()
    expect(getHousehold).toHaveBeenCalledWith({ household_id: HH })
  })

  it("E: a household with only the owner shows the empty state", () => {
    renderScreen(household({ members: [household().members[0]], member_count: 1 }))
    expect(screen.getByText("Još nema članova")).toBeInTheDocument()
  })

  it("D: members with roles and joined dates, the counter, shared-pets Switches", () => {
    renderScreen(household())
    expect(screen.getByText("2 / 6 članova")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "2 od 6 članova" })).toBeInTheDocument()
    expect(screen.getByText("Pridružen/a 15. 4. 2026.")).toBeInTheDocument()
    expect(screen.getByText("Vlasnik")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Luna" })).toBeChecked()
    expect(screen.getByRole("switch", { name: "Maks" })).not.toBeChecked()
    expect(screen.getByText("Pas · nije deljen/a")).toBeInTheDocument()
  })

  it("FR-32: read_only → ReadOnlyBanner with the date and Obnovi Premium; controls hidden", () => {
    renderScreen(household({ read_only: true, access: { role: "owner", can_edit: false, can_delete: false } }))
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tvoj Premium je istekao 5. 10. 2026. Članovi i dalje vide deljene ljubimce, ali niko ne može ništa da menja dok ne obnoviš Premium.",
    )
    expect(screen.getByRole("link", { name: "Obnovi Premium" })).toHaveAttribute("href", "/premium")
    expect(screen.queryByRole("button", { name: "Pozovi člana" })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Ukloni člana/ })).not.toBeInTheDocument()
    expect(screen.getByText("Jelena Nikolić")).toBeInTheDocument()
  })

  it("member view: subtitle, own opt-in Switch (EP-38), no owner controls, leave → /ljubimci", async () => {
    setMyReminderOptIn.mockResolvedValue({ ok: true, data: { household_id: HH, reminders_enabled: true } })
    changeHouseholdMembership.mockResolvedValue({ ok: true, data: { left: true } })
    renderScreen(memberView())
    expect(screen.getByText("Domaćinstvo Petrović · vlasnik: Ivana Petrović")).toBeInTheDocument()
    expect(screen.getByText("Jelena Nikolić (ti)")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Pozovi člana" })).not.toBeInTheDocument()
    expect(screen.getByText("Ivana deli sa tobom ove ljubimce. Možeš da beležiš obroke, stolicu, težinu, doze i trenutke.")).toBeInTheDocument()
    expect(screen.queryByText("Maks")).not.toBeInTheDocument()

    expect(screen.getByText("Podsetnici su isključeni.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("switch", { name: "Moji podsetnici za deljene ljubimce" }))
    expect(setMyReminderOptIn).toHaveBeenCalledWith({ household_id: HH, reminders_enabled: true })
    expect(await screen.findByText("Podsetnici su uključeni.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Napusti domaćinstvo" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Više nećeš videti kartone deljenih ljubimaca (Luna).")
    await userEvent.click(screen.getByRole("button", { name: "Da, napusti" }))
    expect(changeHouseholdMembership).toHaveBeenCalledWith({ op: "leave", household_id: HH })
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ljubimci"))
  })

  it("member view of a read-only household shows the member banner", () => {
    renderScreen(memberView({ read_only: true }))
    expect(
      screen.getByText("Vlasniku domaćinstva je istekao Premium. Deljene ljubimce vidiš, ali ne možeš ništa da menjaš dok ga ne obnovi."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Obnovi Premium" })).not.toBeInTheDocument()
  })

  it("English", () => {
    renderScreen(household(), { locale: "en" })
    expect(screen.getByRole("heading", { level: 1, name: "Household" })).toBeInTheDocument()
    expect(screen.getByText("2 / 6 members")).toBeInTheDocument()
    expect(screen.getByText("Joined 15 Apr 2026")).toBeInTheDocument()
  })
})

describe("S13 invite Dialog (EP-35)", () => {
  async function openEmailTab() {
    await userEvent.click(screen.getByRole("button", { name: "Pozovi člana" }))
    return screen.getByRole("dialog")
  }

  it("FR-26 #1: email invitation → 'Poziv je poslat na …'", async () => {
    createHouseholdInvitation.mockResolvedValue({
      ok: true,
      data: { invitation: { household_id: HH }, invite_url: "https://mojljubimac.rs/poziv/hh_x.y" },
    })
    renderScreen(household())
    const dialog = await openEmailTab()
    expect(within(dialog).queryByLabelText("Naziv domaćinstva")).not.toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText("Mejl adresa"), "Sara@MojLjubimac.test")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji poziv" }))
    expect(createHouseholdInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ email: "sara@mojljubimac.test", household_name: null }),
    )
    expect(await within(dialog).findByRole("status", { name: "" })).toBeInTheDocument()
    expect(within(dialog).getByText("Poziv je poslat na sara@mojljubimac.test.")).toBeInTheDocument()
  })

  it("client checks: invalid email and an existing member, without a request", async () => {
    renderScreen(household())
    const dialog = await openEmailTab()
    await userEvent.type(within(dialog).getByLabelText("Mejl adresa"), "nije-mejl")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji poziv" }))
    expect(within(dialog).getByText("Unesi ispravnu mejl adresu.")).toBeInTheDocument()
    await userEvent.clear(within(dialog).getByLabelText("Mejl adresa"))
    await userEvent.type(within(dialog).getByLabelText("Mejl adresa"), "jelena@mojljubimac.test")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji poziv" }))
    expect(within(dialog).getByText("Ova osoba je već član domaćinstva.")).toBeInTheDocument()
    expect(createHouseholdInvitation).not.toHaveBeenCalled()
  })

  it("FR-26 #4: 409 household_full shows the inline message in the Dialog", async () => {
    createHouseholdInvitation.mockResolvedValue({ ok: false, error: { code: "household_full", message: "household_full" } })
    renderScreen(household())
    const dialog = await openEmailTab()
    await userEvent.type(within(dialog).getByLabelText("Mejl adresa"), "sara@mojljubimac.test")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji poziv" }))
    expect(
      await within(dialog).findByText("Domaćinstvo ima najviše 6 članova. Ukloni nekog da pozoveš novog."),
    ).toBeInTheDocument()
  })

  it("429 rate_limited shows the inline message", async () => {
    createHouseholdInvitation.mockResolvedValue({ ok: false, error: { code: "rate_limited", message: "x", details: { retry_after_s: 60 } } })
    renderScreen(household())
    const dialog = await openEmailTab()
    await userEvent.click(within(dialog).getByRole("tab", { name: "Linkom" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Napravi link" }))
    expect(await within(dialog).findByText("Danas si poslao/la previše poziva. Pokušaj sutra.")).toBeInTheDocument()
  })

  it("FR-26 #3: 403 premium_required → the PremiumLock (G)", async () => {
    createHouseholdInvitation.mockResolvedValue({
      ok: false,
      error: { code: "premium_required", message: "premium_required:household", details: { limit: "household" } },
    })
    renderScreen(household())
    const dialog = await openEmailTab()
    await userEvent.type(within(dialog).getByLabelText("Mejl adresa"), "sara@mojljubimac.test")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji poziv" }))
    expect(await screen.findByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
  })

  it("a full household hides the invite button and shows the limit", () => {
    const members = Array.from({ length: 6 }, (_, i) => ({
      ...household().members[1],
      user_id: `u${i}`,
      full_name: `Član ${i}`,
      role: i === 0 ? ("owner" as const) : ("member" as const),
    }))
    renderScreen(household({ members, member_count: 6 }))
    expect(screen.queryByRole("button", { name: "Pozovi člana" })).not.toBeInTheDocument()
    expect(screen.getByText("Domaćinstvo ima najviše 6 članova. Ukloni nekog da pozoveš novog.")).toBeInTheDocument()
  })
})

describe("S13 EP-36 / EP-37", () => {
  it("remove a member through the AlertDialog", async () => {
    changeHouseholdMembership.mockResolvedValue({ ok: true, data: household({ members: [household().members[0]] }) })
    renderScreen(household())
    await userEvent.click(screen.getByRole("button", { name: "Ukloni člana Jelena Nikolić" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Jelena više neće videti deljene ljubimce.")
    await userEvent.click(screen.getByRole("button", { name: "Da, ukloni" }))
    expect(changeHouseholdMembership).toHaveBeenCalledWith({ op: "remove_member", household_id: HH, user_id: JELENA })
    await waitFor(() => expect(screen.queryByText("Jelena Nikolić")).not.toBeInTheDocument())
  })

  it("sent invitations are listed and can be revoked", async () => {
    const pending = [
      { id: "i1", household_id: HH, kind: "email" as const, email: "sara@mojljubimac.test", status: "pending" as const, created_at: "2026-10-23T08:00:00Z", expires_at: "2026-10-30T08:00:00Z", decided_at: null, accepted_by: null },
      { id: "i2", household_id: HH, kind: "link" as const, email: null, status: "pending" as const, created_at: "2026-10-22T08:00:00Z", expires_at: "2026-10-29T08:00:00Z", decided_at: null, accepted_by: null },
    ]
    changeHouseholdMembership.mockResolvedValue({ ok: true, data: household({ pending_invitations: [pending[1]] }) })
    renderScreen(household({ pending_invitations: pending }))
    expect(screen.getByText("Poslati pozivi")).toBeInTheDocument()
    expect(screen.getByText("Poziv linkom")).toBeInTheDocument()
    expect(screen.getByText("važi do 30. 10. 2026.")).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole("button", { name: "Opozovi" })[0])
    expect(changeHouseholdMembership).toHaveBeenCalledWith({ op: "revoke_invitation", invitation_id: "i1" })
    await waitFor(() => expect(screen.queryByText("sara@mojljubimac.test")).not.toBeInTheDocument())
    expect(toast).toHaveBeenCalledWith("Poziv je opozvan.")
  })

  it("FR-27: the shared-pets Switch calls EP-37 and reverts on an error", async () => {
    setSharedPet.mockResolvedValueOnce({ ok: true, data: { household_id: HH, pet_id: MAKS, shared: true } })
    renderScreen(household())
    await userEvent.click(screen.getByRole("switch", { name: "Maks" }))
    expect(setSharedPet).toHaveBeenCalledWith({ household_id: HH, pet_id: MAKS, shared: true })
    expect(screen.getByRole("switch", { name: "Maks" })).toBeChecked()

    setSharedPet.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "x" } })
    await userEvent.click(screen.getByRole("switch", { name: "Luna" }))
    await waitFor(() => expect(screen.getByRole("switch", { name: "Luna" })).toBeChecked())
    expect(toast).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
  })
})
