import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { OrgRequestsActions } from "@/app/(org)/organizacija/zahtevi/org-requests-screen"
import type { MyOrganisation } from "@/lib/actions/organisation"
import type { OrgRequest, OrgRequestsPage } from "@/lib/actions/org-requests"

// S21 Zahtevi i upiti (Step 25) · states from EP-57 (API §7.3): default (cards with filters and counts, Prihvati /
// Odbij for the Admin, "Pošalji karton" on accepted rows), empty (no requests), read_only (Volunteer:
// access.can_edit = false → banner, no controls), error; EP-58 accept / reject (AlertDialog) with the status
// notice; the EP-59 transfer Dialog (validation, send, re-send); "Učitaj još" offset paging; breeder wording.

const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const { OrgRequestsScreen, OrgRequestsLoading } = await import("@/app/(org)/organizacija/zahtevi/org-requests-screen")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en" = "sr") => ({
  orgRequests: dictionaries[locale].orgRequests,
  orgAnimals: dictionaries[locale].orgAnimals,
  orgProfile: dictionaries[locale].orgProfile,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

function org(type: "shelter" | "breeder" = "shelter", role: "org_admin" | "volunteer" = "org_admin"): MyOrganisation {
  return {
    organisation: {
      id: "b2000000-0000-4000-8000-000000000001",
      type,
      name: type === "shelter" ? "Azil Šapica" : "Odgajivačnica Đorđević",
      slug: "azil-sapica",
      public_path: "/o/azil-sapica",
      city: { id: "c", name_sr: "Bečej", name_en: "Becej", latitude: 0, longitude: 0 },
      approval_status: "approved",
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
    team: [],
    pending_invitations: [],
    breeder_plan_active: true,
    access: { role, can_edit: true, can_delete: role === "org_admin" },
  }
}

function request(extra: Partial<OrgRequest> = {}): OrgRequest {
  return {
    id: "d1000000-0000-4000-8000-000000000001",
    status: "pending",
    requester_id: "a1000000-0000-4000-8000-000000000001",
    name: "Ivana Petrović",
    phone: "+381 64 123 4567",
    email: "ivana.petrovic@primer.rs",
    message: "Imam iskustva sa psima.",
    created_at: "2026-10-18T08:00:00Z",
    decided_at: null,
    decided_by_name: null,
    pet: {
      pet_id: "c1000000-0000-4000-8000-000000000004",
      name: "Žuća",
      species: "dog",
      species_other: null,
      breed: "Mešanac",
      sex: "female",
      approx_age_text: "oko 6 meseci",
      birth_date: null,
      birth_year: null,
    },
    transfer: null,
    ...extra,
  }
}

function page(items: OrgRequest[], extra: Partial<OrgRequestsPage> = {}): OrgRequestsPage {
  const count = (s: string) => items.filter((r) => r.status === s).length
  return {
    kind: "adoption_request",
    items,
    total: items.length,
    status_counts: { pending: count("pending"), accepted: count("accepted"), rejected: count("rejected") },
    access: { role: "org_admin", can_edit: true, can_delete: true },
    ...extra,
  }
}

const list = vi.fn()
const decide = vi.fn()
const send = vi.fn()
const resend = vi.fn()
const actions: OrgRequestsActions = {
  listOrgRequests: (...a) => list(...a),
  decideRequest: (...a) => decide(...a),
  sendRecordTransfer: (...a) => send(...a),
  resendRecordTransfer: (...a) => resend(...a),
}

function renderScreen(initial: OrgRequestsPage, organisation: MyOrganisation = org(), locale: "sr" | "en" = "sr") {
  return render(
    <OrgRequestsScreen
      initialOrg={{ ok: true, data: organisation }}
      initialRequests={{ ok: true, data: initial }}
      locale={locale}
      copy={copy(locale)}
      actions={actions}
    />,
  )
}

const transfer = (extra: Partial<NonNullable<OrgRequest["transfer"]>> = {}) => ({
  id: "f9260000-0000-4000-8000-0000000000b1",
  pet_id: "c1000000-0000-4000-8000-000000000004",
  status: "pending" as const,
  recipient_email: "ivana.petrovic@primer.rs",
  sent_at: "2026-10-19T08:00:00Z",
  expires_at: "2026-11-18T08:00:00Z",
  is_expired: false,
  accepted_at: null,
  ...extra,
})

beforeEach(() => {
  list.mockReset()
  decide.mockReset()
  send.mockReset()
  resend.mockReset()
  toast.error.mockReset()
})

describe("S21 default (Admin)", () => {
  it("shows the heading, the organisation, filter chips with counts and the request card", () => {
    renderScreen(page([request(), request({ id: "r2", status: "accepted", name: "Marko Jovanović" }), request({ id: "r3", status: "rejected" })]))
    expect(screen.getByRole("heading", { level: 1, name: "Zahtevi" })).toBeInTheDocument()
    expect(screen.getByText("Azil Šapica, Bečej")).toBeInTheDocument()
    const filters = screen.getByRole("group", { name: "Filter po statusu" })
    expect(within(filters).getByRole("button", { name: "Svi · 3" })).toHaveAttribute("aria-pressed", "true")
    expect(within(filters).getByRole("button", { name: "Novi · 1" })).toBeInTheDocument()
    expect(within(filters).getByRole("button", { name: "Prihvaćeni · 1" })).toBeInTheDocument()
    expect(within(filters).getByRole("button", { name: "Odbijeni · 1" })).toBeInTheDocument()
    expect(screen.getAllByText("Pas, Mešanac · Ženka · oko 6 meseci")).toHaveLength(3)
    expect(screen.getAllByRole("link", { name: "+381 64 123 4567" })[0]).toHaveAttribute("href", "tel:+381641234567")
    expect(screen.getAllByText("„Imam iskustva sa psima.“")).toHaveLength(3)
    expect(screen.getByRole("button", { name: "Prihvati" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Odbij" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pošalji karton" })).toBeInTheDocument()
  })

  it("Prihvati (EP-58) shows the status notice and reloads the list", async () => {
    decide.mockResolvedValue({ ok: true, data: request({ status: "accepted" }) })
    list.mockResolvedValue({ ok: true, data: page([request({ status: "accepted" })]) })
    renderScreen(page([request()]))
    await userEvent.click(screen.getByRole("button", { name: "Prihvati" }))
    expect(decide).toHaveBeenCalledWith({ kind: "adoption_request", id: "d1000000-0000-4000-8000-000000000001", decision: "accept" })
    expect(await screen.findByRole("status")).toHaveTextContent("Žuća — status: Rezervisan. Poslali smo mejl: Ivana Petrović.")
    expect(list).toHaveBeenCalledWith({ status: null, limit: 20, offset: 0 })
    expect(await screen.findByRole("button", { name: "Pošalji karton" })).toBeInTheDocument()
  })

  it("Odbij opens the AlertDialog; confirming rejects and shows the notice", async () => {
    decide.mockResolvedValue({ ok: true, data: request({ status: "rejected" }) })
    list.mockResolvedValue({ ok: true, data: page([request({ status: "rejected" })]) })
    renderScreen(page([request()]))
    await userEvent.click(screen.getByRole("button", { name: "Odbij" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Odbiti zahtev?")).toBeInTheDocument()
    expect(within(dialog).getByText("Ivana Petrović će dobiti mejl da zahtev nije prihvaćen (ljubimac: Žuća).")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Da, odbij" }))
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ decision: "reject" }))
    expect(await screen.findByRole("status")).toHaveTextContent("Odbijeno. Poslali smo mejl osobi Ivana Petrović.")
  })

  it("already_decided → error toast and a reload", async () => {
    decide.mockResolvedValue({ ok: false, error: { code: "already_decided", message: "x" } })
    list.mockResolvedValue({ ok: true, data: page([request({ status: "accepted" })]) })
    renderScreen(page([request()]))
    await userEvent.click(screen.getByRole("button", { name: "Prihvati" }))
    expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
    expect(list).toHaveBeenCalled()
  })

  it("a filter chip loads that status (EP-57 p_status)", async () => {
    list.mockResolvedValue({ ok: true, data: page([request({ status: "accepted" })]) })
    renderScreen(page([request(), request({ id: "r2", status: "accepted" })]))
    await userEvent.click(screen.getByRole("button", { name: "Prihvaćeni · 1" }))
    expect(list).toHaveBeenCalledWith({ status: "accepted", limit: 20, offset: 0 })
  })

  it("Učitaj još pages with the offset (API §3.4)", async () => {
    list.mockResolvedValue({ ok: true, data: page([request({ id: "r21", name: "Nikola Stanković" })], { total: 2 }) })
    renderScreen(page([request()], { total: 2 }))
    await userEvent.click(screen.getByRole("button", { name: "Učitaj još" }))
    expect(list).toHaveBeenCalledWith({ status: null, limit: 20, offset: 1 })
    expect(await screen.findByText("Nikola Stanković")).toBeInTheDocument()
  })
})

describe("S21 transfer Dialog (EP-59)", () => {
  it("prefills the applicant's email, validates it and sends the record", async () => {
    send.mockResolvedValue({ ok: true, data: transfer({ recipient_email: "novi@primer.rs" }) })
    list.mockResolvedValue({ ok: true, data: page([request({ status: "accepted", transfer: transfer({ recipient_email: "novi@primer.rs" }) })]) })
    renderScreen(page([request({ status: "accepted" })]))
    await userEvent.click(screen.getByRole("button", { name: "Pošalji karton" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Pošalji karton — Žuća")).toBeInTheDocument()
    expect(within(dialog).getByText(/a status postaje: Udomljen\./)).toBeInTheDocument()
    const email = within(dialog).getByLabelText("Mejl novog vlasnika *")
    expect(email).toHaveValue("ivana.petrovic@primer.rs")
    expect(within(dialog).getByText(/^Poziv važi 30 dana \(do /)).toBeInTheDocument()

    await userEvent.clear(email)
    await userEvent.type(email, "nije-mejl")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji poziv" }))
    expect(within(dialog).getByText("Upiši ispravnu mejl adresu.")).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()

    await userEvent.clear(email)
    await userEvent.type(email, "novi@primer.rs")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji poziv" }))
    expect(send).toHaveBeenCalledWith({
      pet_id: "c1000000-0000-4000-8000-000000000004",
      recipient_email: "novi@primer.rs",
      idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(await screen.findByRole("status")).toHaveTextContent("Karton za Žuća je poslat na novi@primer.rs.")
    expect(await screen.findByText(/^Karton poslat .* na novi@primer\.rs · važi do /)).toBeInTheDocument()
  })

  it("an expired transfer shows the expiry line and re-sends to the same address (EP-59 re-send)", async () => {
    resend.mockResolvedValue({ ok: true, data: transfer({ id: "new" }) })
    list.mockResolvedValue({ ok: true, data: page([request({ status: "accepted", transfer: transfer({ id: "new" }) })]) })
    renderScreen(page([request({ status: "accepted", transfer: transfer({ status: "expired", is_expired: true }) })]))
    expect(screen.getByText(/^Poziv za karton je istekao .* — nije prihvaćen\.$/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Pošalji ponovo" }))
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Pošalji poziv" }))
    expect(resend).toHaveBeenCalledWith({ transfer_id: "f9260000-0000-4000-8000-0000000000b1", idempotency_key: expect.any(String) })
    expect(send).not.toHaveBeenCalled()
  })

  it("declined and accepted transfers have their own lines; an accepted one cannot be sent again", () => {
    renderScreen(
      page([
        request({ id: "a", status: "accepted", transfer: transfer({ status: "declined" }) }),
        request({ id: "b", status: "accepted", transfer: transfer({ status: "accepted", accepted_at: "2026-10-21T08:00:00Z" }) }),
      ]),
    )
    expect(screen.getByText("Karton je odbijen — možeš da ga pošalješ ponovo.")).toBeInTheDocument()
    expect(screen.getByText("Karton je prihvaćen 21. 10. 2026.")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Pošalji ponovo" })).toHaveLength(1)
  })

  it("a failed send keeps the Dialog open with the generic error", async () => {
    send.mockResolvedValue({ ok: false, error: { code: "invitation_used", message: "x" } })
    renderScreen(page([request({ status: "accepted" })]))
    await userEvent.click(screen.getByRole("button", { name: "Pošalji karton" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji poziv" }))
    expect(within(dialog).getByText("Nešto nije u redu. Pokušaj ponovo.")).toBeInTheDocument()
  })
})

describe("S21 empty", () => {
  it("shelter: Još nema zahteva", () => {
    renderScreen(page([]))
    expect(screen.getByRole("heading", { name: "Još nema zahteva" })).toBeInTheDocument()
    expect(screen.getByText("Kad neko zatraži udomljavanje sa tvoje javne stranice, zahtev stiže ovde.")).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Filter po statusu" })).not.toBeInTheDocument()
  })

  it("breeder: Upiti / Još nema upita", () => {
    renderScreen(page([], { kind: "breeder_inquiry" }), org("breeder"))
    expect(screen.getByRole("heading", { level: 1, name: "Upiti" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Još nema upita" })).toBeInTheDocument()
  })

  it("a filter with no rows shows the in-filter empty line", () => {
    renderScreen(page([], { total: 0, status_counts: { pending: 0, accepted: 2, rejected: 0 } }))
    expect(screen.getByText("Nema stavki u ovom filteru.")).toBeInTheDocument()
  })
})

describe("S21 read_only (Volunteer)", () => {
  it("shows the volunteer banner and hides every decision and transfer control", () => {
    renderScreen(
      page([request(), request({ id: "r2", status: "accepted" })], { access: { role: "volunteer", can_edit: false, can_delete: false } }),
      org("shelter", "volunteer"),
    )
    expect(screen.getByRole("status")).toHaveTextContent("Kao volonter vidiš zahteve, ali o njima odlučuje administrator.")
    expect(screen.getAllByText("Ivana Petrović")).toHaveLength(2)
    expect(screen.queryByRole("button", { name: "Prihvati" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Odbij" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Pošalji karton" })).not.toBeInTheDocument()
  })

  it("breeder volunteer wording", () => {
    renderScreen(
      page([request()], { kind: "breeder_inquiry", access: { role: "volunteer", can_edit: false, can_delete: false } }),
      org("breeder", "volunteer"),
    )
    expect(screen.getByRole("status")).toHaveTextContent("Kao volonter vidiš upite, ali o njima odlučuje administrator.")
  })
})

describe("S21 error and loading", () => {
  it("a failed EP-57 read → ErrorState with retry", async () => {
    render(
      <OrgRequestsScreen
        initialOrg={{ ok: true, data: org() }}
        initialRequests={{ ok: false, error: { code: "internal_error", message: "x" } }}
        locale="sr"
        copy={copy()}
        actions={actions}
      />,
    )
    expect(screen.getByText("Nešto nije u redu. Pokušaj ponovo.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(refresh).toHaveBeenCalled()
  })

  it("loading skeleton is labelled", () => {
    render(<OrgRequestsLoading label="Učitavanje" />)
    expect(screen.getByLabelText("Učitavanje")).toHaveAttribute("aria-busy", "true")
  })

  it("English copy", () => {
    renderScreen(page([request()]), org(), "en")
    expect(screen.getByRole("heading", { level: 1, name: "Requests" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument()
    expect(screen.getByText("Dog, Mešanac · Female · oko 6 meseci")).toBeInTheDocument()
  })

  it("English transfer lines keep the whole date", () => {
    renderScreen(
      page([request({ status: "accepted", transfer: transfer({ status: "accepted", accepted_at: "2026-10-21T08:00:00Z" }) })]),
      org(),
      "en",
    )
    expect(screen.getByText("Record accepted on 21 Oct 2026.")).toBeInTheDocument()
  })
})
