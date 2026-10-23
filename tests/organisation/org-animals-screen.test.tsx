import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { OrgAnimalsActions } from "@/app/(org)/organizacija/org-animals-screen"
import type { MyOrganisation, OrgAnimalRow, OrgAnimalsPage } from "@/lib/actions/organisation"

// S20 Životinje i tim (Step 24) · states from EP-53 / EP-54 (API §7.3): default (table + cards, status chips
// with counts), FR-42 #1 pending_approval (banner, everything read-only), FR-59 #2 empty search result with the
// term, empty (no animals), error, the breeder-plan banner; EP-55 intake Dialog and status submenu; the Tim tab
// with members and pending invitations (EP-56).

const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const { OrgAnimalsScreen, OrgAnimalsLoading } = await import("@/app/(org)/organizacija/org-animals-screen")
const { dictionaries } = await import("@/lib/i18n")

const ORG = "b2000000-0000-4000-8000-000000000001"
const MILICA = "a1000000-0000-4000-8000-000000000004"
const TODAY = "2026-10-23"

const copy = (locale: "sr" | "en") => ({
  orgAnimals: dictionaries[locale].orgAnimals,
  orgProfile: dictionaries[locale].orgProfile,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

function org(extra: { approval?: "pending" | "approved"; type?: "shelter" | "breeder"; role?: "org_admin" | "volunteer"; plan?: boolean } = {}): MyOrganisation {
  const approval = extra.approval ?? "approved"
  const type = extra.type ?? "shelter"
  const role = extra.role ?? "org_admin"
  const plan = extra.plan ?? false
  const canEdit = approval === "approved" && (type === "shelter" || plan)
  return {
    organisation: {
      id: ORG,
      type,
      name: "Azil Šapica",
      slug: "azil-sapica",
      public_path: "/o/azil-sapica",
      city: { id: "c", name_sr: "Bečej", name_en: "Becej", latitude: 0, longitude: 0 },
      approval_status: approval,
      rejection_reason: null,
      tax_id: null,
      registration_note: null,
      description: null,
      phone: null,
      email: null,
      website: null,
      logo_url: null,
      donation: null,
      member_count: 2,
      member_limit: 20,
      created_at: "2026-10-01T00:00:00Z",
    },
    team: [
      { user_id: MILICA, full_name: "Milica Stojanović", email: "milica@mojljubimac.test", role: "admin", joined_at: "2026-03-03T10:00:00Z", is_me: role === "org_admin" },
      { user_id: "a1000000-0000-4000-8000-000000000003", full_name: "Jelena Nikolić", email: "jelena@mojljubimac.test", role: "volunteer", joined_at: "2026-05-12T10:00:00Z", is_me: role === "volunteer" },
    ],
    pending_invitations:
      role === "org_admin"
        ? [{ id: "e1", email: "novi@mojljubimac.test", role: "volunteer", status: "pending", expires_at: "2026-10-30T10:00:00Z", created_at: "2026-10-23T10:00:00Z" }]
        : [],
    breeder_plan_active: plan,
    access: { role, can_edit: canEdit, can_delete: canEdit && role === "org_admin" },
  }
}

function row(extra: Partial<OrgAnimalRow>): OrgAnimalRow {
  return {
    pet_id: "c1000000-0000-4000-8000-000000000004",
    name: "Žuća",
    species: "dog",
    species_other: null,
    breed: "mešanac",
    sex: "female",
    approx_age_text: "oko 6 meseci",
    birth_date: null,
    birth_year: null,
    status_kind: "shelter",
    status: "available",
    since_date: "2026-10-18",
    is_mother: false,
    lifecycle: "active",
    transferred: false,
    ...extra,
  }
}

const shelterCounts = { intake: 1, in_care: 0, available: 1, reserved: 0, adopted: 0, deceased: 0, returned_to_owner: 0 }

function animals(items: OrgAnimalRow[] = [row({}), row({ pet_id: "c2", name: "Lúna", species: "cat", breed: null, status: "intake", since_date: "2026-10-20" })], counts: Record<string, number> = shelterCounts): OrgAnimalsPage {
  return { items, total: items.length, status_counts: counts }
}

const actions = {
  getMyOrganisation: vi.fn(),
  listOrgAnimals: vi.fn(),
  createIntake: vi.fn(),
  changeAnimalStatus: vi.fn(),
  deletePet: vi.fn(),
  inviteTeamMember: vi.fn(),
  revokeInvitation: vi.fn(),
  removeMember: vi.fn(),
  changeMemberRole: vi.fn(),
} satisfies Record<keyof OrgAnimalsActions, unknown>

function renderScreen(
  o: MyOrganisation = org(),
  page: OrgAnimalsPage = animals(),
  opts: { locale?: "sr" | "en"; tab?: "zivotinje" | "tim" } = {},
) {
  return render(
    <OrgAnimalsScreen
      initialOrg={{ ok: true, data: o }}
      initialAnimals={{ ok: true, data: page }}
      initialTab={opts.tab ?? "zivotinje"}
      today={TODAY}
      locale={opts.locale ?? "sr"}
      copy={copy(opts.locale ?? "sr")}
      actions={actions as unknown as OrgAnimalsActions}
    />,
  )
}

beforeAll(() => {
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
  actions.listOrgAnimals.mockResolvedValue({ ok: true, data: animals() })
  actions.getMyOrganisation.mockResolvedValue({ ok: true, data: org() })
})

describe("S20 default", () => {
  it("lists the animals in the table with species, sex, age, status and intake date; chips with counts", () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "Životinje" })).toBeInTheDocument()
    expect(screen.getByText("Azil Šapica, Bečej")).toBeInTheDocument()
    const table = screen.getByRole("table")
    const zuca = within(table).getByRole("row", { name: /Žuća/ })
    expect(within(zuca).getByText("Pas, mešanac")).toBeInTheDocument()
    expect(within(zuca).getByText("Ženka")).toBeInTheDocument()
    expect(within(zuca).getByText("oko 6 meseci")).toBeInTheDocument()
    expect(within(zuca).getByText("Za udomljavanje")).toBeInTheDocument()
    expect(within(zuca).getByText("18. 10. 2026.")).toBeInTheDocument()
    expect(within(table).getByRole("link", { name: /Žuća/ })).toHaveAttribute("href", "/ljubimci/c1000000-0000-4000-8000-000000000004")

    const chips = screen.getByRole("group", { name: "Filter po statusu" })
    expect(within(chips).getByRole("button", { name: "Sve · 2" })).toHaveAttribute("aria-pressed", "true")
    expect(within(chips).getByRole("button", { name: "Prijem · 1" })).toBeInTheDocument()
    expect(within(chips).getByRole("button", { name: "Udomljen · 0" })).toBeInTheDocument()
    // Uginuo / Vraćen vlasniku only when their count > 0 (owner decision).
    expect(within(chips).queryByRole("button", { name: /Uginuo/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Novi prijem" })).toBeInTheDocument()
  })

  it("an exit status with animals gets its chip", () => {
    renderScreen(org(), animals(undefined, { ...shelterCounts, deceased: 1 }))
    expect(screen.getByRole("button", { name: "Uginuo · 1" })).toBeInTheDocument()
  })

  it("a status chip filters through EP-54", async () => {
    renderScreen()
    await userEvent.click(screen.getByRole("button", { name: "Prijem · 1" }))
    expect(actions.listOrgAnimals).toHaveBeenCalledWith({ q: null, status: "intake", limit: 50, offset: 0 })
  })

  it("FR-59: typing searches through EP-54 (p_q)", async () => {
    renderScreen()
    await userEvent.type(screen.getByRole("searchbox", { name: "Pretraži životinje po imenu" }), "sapa")
    await waitFor(() =>
      expect(actions.listOrgAnimals).toHaveBeenLastCalledWith({ q: "sapa", status: null, limit: 50, offset: 0 }),
    )
  })

  it("FR-59 #2: no match → the empty state with the search term; Obriši pretragu reloads", async () => {
    actions.listOrgAnimals.mockResolvedValue({ ok: true, data: { items: [], total: 0, status_counts: shelterCounts } })
    renderScreen()
    await userEvent.type(screen.getByRole("searchbox", { name: "Pretraži životinje po imenu" }), "xyz")
    expect(await screen.findByRole("heading", { name: "Nema životinje sa imenom „xyz“" })).toBeInTheDocument()
    expect(screen.getByText("Proveri kako je ime napisano ili obriši pretragu.")).toBeInTheDocument()
    actions.listOrgAnimals.mockResolvedValue({ ok: true, data: animals() })
    await userEvent.click(screen.getByRole("button", { name: "Obriši pretragu" }))
    expect(await screen.findByRole("table")).toBeInTheDocument()
  })

  it("EP-55: the status submenu changes a shelter status and reloads", async () => {
    actions.changeAnimalStatus.mockResolvedValue({ ok: true, data: { pet_id: "c2", status_kind: "shelter", status: "in_care" } })
    renderScreen()
    const table = screen.getByRole("table")
    await userEvent.click(within(table).getByRole("button", { name: "Radnje za Lúna" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Promeni status" }))
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Na brizi" }))
    expect(actions.changeAnimalStatus).toHaveBeenCalledWith({ pet_id: "c2", shelter_status: "in_care" })
    await waitFor(() => expect(actions.listOrgAnimals).toHaveBeenCalled())
  })

  it("EP-55: the intake Dialog checks required fields, then calls createIntake", async () => {
    actions.createIntake.mockResolvedValue({ ok: true, data: {} })
    renderScreen()
    await userEvent.click(screen.getByRole("button", { name: "Novi prijem" }))
    const dialog = await screen.findByRole("dialog", { name: "Novi prijem" })
    await userEvent.click(within(dialog).getByRole("button", { name: "Sačuvaj prijem" }))
    expect(within(dialog).getByText("Upiši ime ili privremeni nadimak.")).toBeInTheDocument()
    expect(within(dialog).getByText("Izaberi kako je životinja stigla.")).toBeInTheDocument()
    expect(actions.createIntake).not.toHaveBeenCalled()

    await userEvent.type(within(dialog).getByLabelText("Ime ili nadimak *"), "Bobi")
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Način dolaska *" }))
    await userEvent.click(await screen.findByRole("option", { name: "Pronađen" }))
    await userEvent.type(within(dialog).getByLabelText("Mesto pronalaska"), "Liman 3")
    await userEvent.click(within(dialog).getByRole("button", { name: "Sačuvaj prijem" }))
    expect(actions.createIntake).toHaveBeenCalledWith({
      name: "Bobi",
      species: "dog",
      species_other: null,
      sex: "unknown",
      intake_on: TODAY,
      arrival_type: "found",
      place_found: "Liman 3",
      note: "",
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(actions.listOrgAnimals).toHaveBeenCalled()
  })

  it("phones and tablets: cards without weight or 'Karton ažuriran' (owner decision)", () => {
    renderScreen()
    expect(screen.getAllByRole("link", { name: /Otvori karton: Žuća/ })).toHaveLength(1)
    expect(screen.queryByText(/Težina/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Karton ažuriran/)).not.toBeInTheDocument()
  })
})

describe("S20 states", () => {
  it("FR-42 #1: a pending shelter → the pending-approval banner and everything read-only", async () => {
    renderScreen(org({ approval: "pending" }))
    expect(
      screen.getByText("Tvoj azil čeka odobrenje. Obično odobravamo u roku od 2 dana — do tada sve možeš samo da pregledaš."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Novi prijem" })).not.toBeInTheDocument()
    // Reads stay: the list is there; the row menu offers only "Otvori karton".
    const table = screen.getByRole("table")
    await userEvent.click(within(table).getByRole("button", { name: "Radnje za Žuća" }))
    expect(await screen.findByRole("menuitem", { name: "Otvori karton" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Promeni status" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Obriši životinju" })).not.toBeInTheDocument()
  })

  it("FR-42 #1: the Tim tab of a pending shelter has no invite or member actions", async () => {
    renderScreen(org({ approval: "pending" }), animals(), { tab: "tim" })
    expect(screen.queryByRole("button", { name: "Pozovi člana" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Radnje za Jelena Nikolić" })).not.toBeInTheDocument()
  })

  it("a breeder without a plan → the breeder-plan banner, read-only", () => {
    renderScreen(org({ type: "breeder" }), animals([row({ status_kind: "offspring", status: "available", since_date: "2026-08-15" })], { available: 1, reserved: 0, sold: 0, breeding_active: 0, breeding_retired: 0 }))
    expect(screen.getByText("Odgajivački plan nije aktivan — sve možeš samo da pregledaš.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Novo leglo" })).not.toBeInTheDocument()
    expect(screen.getAllByText("Leglo 15. 8. 2026.").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Dostupno · 1" })).toBeInTheDocument()
  })

  it("no animals at all → the empty state with Novi prijem", () => {
    renderScreen(org(), animals([], { ...shelterCounts, intake: 0, available: 0 }))
    expect(screen.getByRole("heading", { name: "Još nema životinja" })).toBeInTheDocument()
    expect(screen.getByText("Upiši prvi prijem i vodi karton od prvog dana.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Novi prijem" })).toBeInTheDocument()
  })

  it("a failed EP-53 / EP-54 read → the error state; retry refreshes", async () => {
    render(
      <OrgAnimalsScreen
        initialOrg={{ ok: false, error: { code: "internal_error", message: "x" } }}
        initialAnimals={{ ok: true, data: animals() }}
        initialTab="zivotinje"
        today={TODAY}
        locale="sr"
        copy={copy("sr")}
        actions={actions as unknown as OrgAnimalsActions}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    await userEvent.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(refresh).toHaveBeenCalled()
  })

  it("loading variant", () => {
    render(<OrgAnimalsLoading label="Učitavanje" />)
    expect(screen.getByLabelText("Učitavanje")).toHaveAttribute("aria-busy", "true")
  })
})

describe("S20 Tim", () => {
  it("members with Admin / Volonter, the counter and a pending invitation; an Admin invites", async () => {
    actions.inviteTeamMember.mockResolvedValue({ ok: true, data: {} })
    renderScreen(org(), animals(), { tab: "tim" })
    expect(screen.getByRole("heading", { level: 1, name: "Tim" })).toBeInTheDocument()
    expect(screen.getByText("2 / 20 članova")).toBeInTheDocument()
    expect(screen.getByText("milica@mojljubimac.test · od 3. 3. 2026.")).toBeInTheDocument()
    expect(screen.getByText("novi@mojljubimac.test · Čeka odgovor · važi do 30. 10. 2026.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Pozovi člana" }))
    const dialog = await screen.findByRole("dialog", { name: "Pozovi člana tima" })
    const send = within(dialog).getByRole("button", { name: "Pošalji poziv" })
    expect(send).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText("Mejl *"), "marko@mojljubimac.test")
    await userEvent.click(within(dialog).getByLabelText("Admin"))
    await userEvent.click(send)
    expect(actions.inviteTeamMember).toHaveBeenCalledWith(
      expect.objectContaining({ email: "marko@mojljubimac.test", role: "admin", idempotency_key: expect.any(String) }),
    )
    await waitFor(() => expect(actions.getMyOrganisation).toHaveBeenCalled())
  })

  it("EP-56 409 team_full → the inline error in the Dialog", async () => {
    actions.inviteTeamMember.mockResolvedValue({ ok: false, error: { code: "team_full", message: "x" } })
    renderScreen(org(), animals(), { tab: "tim" })
    await userEvent.click(screen.getByRole("button", { name: "Pozovi člana" }))
    const dialog = await screen.findByRole("dialog", { name: "Pozovi člana tima" })
    await userEvent.type(within(dialog).getByLabelText("Mejl *"), "marko@mojljubimac.test")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji poziv" }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
  })

  it("member menu: Postavi za admina / Ukloni iz tima; invitation menu: Opozovi poziv", async () => {
    actions.changeMemberRole.mockResolvedValue({ ok: true, data: {} })
    actions.revokeInvitation.mockResolvedValue({ ok: true, data: null })
    renderScreen(org(), animals(), { tab: "tim" })
    await userEvent.click(screen.getByRole("button", { name: "Radnje za Jelena Nikolić" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Postavi za admina" }))
    expect(actions.changeMemberRole).toHaveBeenCalledWith({ user_id: "a1000000-0000-4000-8000-000000000003", role: "admin" })
    await userEvent.click(screen.getByRole("button", { name: "Radnje za novi@mojljubimac.test" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Opozovi poziv" }))
    expect(actions.revokeInvitation).toHaveBeenCalledWith({ invitation_id: "e1" })
  })

  it("a Volunteer sees the team read-only", () => {
    renderScreen(org({ role: "volunteer" }), animals(), { tab: "tim" })
    expect(screen.queryByRole("button", { name: "Pozovi člana" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Radnje za/ })).not.toBeInTheDocument()
  })

  it("English", () => {
    renderScreen(org(), animals(), { locale: "en" })
    expect(screen.getByRole("heading", { level: 1, name: "Animals" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "All · 2" })).toBeInTheDocument()
    expect(screen.getAllByText("Available for adoption").length).toBeGreaterThan(0)
  })
})
