import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S03 Terapije and Pregledi tabs (Step 15): FR-06 — "Doza data" calls EP-11 (log_dose with the next
// open occurrence) and, after the refresh, the dose appears in the dose log with time and user; members
// keep "Doza data" but see treatments, visits and attachments read-only (FR-28); FR-07 / FR-08 — visits
// with the check-up date, cost and attachment chips that open EP-15 URLs ("Fajl nije dostupan." when
// url = null); chip and row deletes go through EP-14 / EP-10 / EP-12 after the AlertDialog; the Free
// counter "n / 10" (FR-36).

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
vi.mock("@/lib/actions/pets", () => ({ deletePet: vi.fn() }))
vi.mock("@/lib/actions/weights", () => ({
  createWeightEntry: vi.fn(),
  updateWeightEntry: vi.fn(),
  deleteWeightEntry: vi.fn(),
}))
vi.mock("@/lib/actions/vaccinations", () => ({ deleteVaccination: vi.fn() }))
const logDose = vi.fn()
const deleteTreatment = vi.fn()
vi.mock("@/lib/actions/treatments", () => ({
  logDose: (...a: unknown[]) => logDose(...a),
  deleteTreatment: (...a: unknown[]) => deleteTreatment(...a),
}))
const deleteVetVisit = vi.fn()
vi.mock("@/lib/actions/vet-visits", () => ({ deleteVetVisit: (...a: unknown[]) => deleteVetVisit(...a) }))
const deleteAttachment = vi.fn()
vi.mock("@/lib/actions/attachments", () => ({ deleteAttachment: (...a: unknown[]) => deleteAttachment(...a) }))
const getFileUrls = vi.fn()
vi.mock("@/lib/actions/files", () => ({ getFileUrls: (...a: unknown[]) => getFileUrls(...a) }))

const { PetRecordClient } = await import("@/app/(app)/ljubimci/[id]/pet-record-client")
const { dictionaries } = await import("@/lib/i18n")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const IVANA = "a1000000-0000-4000-8000-000000000001"
const JELENA = "a1000000-0000-4000-8000-000000000003"
const OWNER_ACCESS = { role: "owner", can_edit: true, can_delete: true } as const
const MEMBER_ACCESS = { role: "member", can_edit: false, can_delete: false } as const
const NOW = "2026-10-19T10:00:00Z" // 12:00 in Belgrade

const copy = (locale: "sr" | "en") => ({
  petRecord: dictionaries[locale].petRecord,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

const FREE = { limits: { attachments_per_pet: 10 } } as never
const PREMIUM = { limits: { attachments_per_pet: null } } as never

function dose(id: string, given_at: string, by: string, name: string) {
  return { id, treatment_id: "t1", given_at, occurrence_id: null, created_by: by, created_by_name: name, access: OWNER_ACCESS }
}

const tobrex = {
  id: "t1",
  pet_id: LUNA,
  type: "medication",
  name: "Tobrex kapi za oči",
  dose: "1 kap u svako oko",
  interval_value: 12,
  interval_unit: "hours",
  starts_on: "2026-10-15",
  ends_on: "2026-10-25",
  note: null,
  is_active: true,
  next_dose_at: "2026-10-19T18:00:00Z",
  next_dose_occurrence_id: "occ-20h",
  recent_doses: [
    dose("d3", "2026-10-19T06:00:00Z", IVANA, "Ivana Petrović"),
    dose("d2", "2026-10-18T18:05:00Z", JELENA, "Jelena Nikolić"),
  ],
  dose_count: 2,
  created_by: IVANA,
  created_at: "2026-10-15T08:00:00Z",
}

const milbemax = {
  ...tobrex,
  id: "t3",
  type: "deworming",
  name: "Milbemax",
  dose: "1/2 tablete",
  interval_value: null,
  interval_unit: null,
  starts_on: "2026-03-12",
  ends_on: "2026-03-12",
  is_active: false,
  next_dose_at: null,
  next_dose_occurrence_id: null,
  recent_doses: [],
  dose_count: 0,
}

const stronghold = {
  ...tobrex,
  id: "t2",
  type: "flea_tick",
  name: "Stronghold Plus",
  dose: "1 pipeta (0,5 ml)",
  interval_value: 30,
  interval_unit: "days",
  starts_on: "2026-04-01",
  ends_on: null,
  next_dose_at: "2026-11-01T08:00:00Z",
  next_dose_occurrence_id: "occ-nov",
  recent_doses: [],
}

function attachment(id: string, file_name: string, mime_type: string, size_bytes: number) {
  return { id, vet_visit_id: "p1", pet_id: LUNA, file_name, mime_type, size_bytes, created_by: IVANA, created_at: "2026-10-02T08:00:00Z" }
}

const visit = {
  id: "p1",
  pet_id: LUNA,
  visited_on: "2026-10-02",
  clinic: "Veterinarska ambulanta „Dr Vet”",
  reason: "Suzenje levog oka",
  findings: "Blagi konjunktivitis, bez povrede rožnjače.",
  recommendations: "Tobrex kapi 10 dana, kontrola posle terapije.",
  cost: { amount_minor: 299000, currency: "RSD" },
  follow_up_on: "2026-10-30",
  attachments: [
    attachment("a1", "nalaz-oko-02-10-2026.pdf", "application/pdf", 838_861),
    attachment("a2", "luna-oko.jpg", "image/jpeg", 3_565_158),
  ],
  created_by: IVANA,
  created_at: "2026-10-02T08:00:00Z",
  updated_at: "2026-10-02T08:00:00Z",
}

function record({
  access = OWNER_ACCESS as { role: string; can_edit: boolean; can_delete: boolean },
  canLog = true,
  reason = null as string | null,
  treatments = [tobrex, stronghold, milbemax] as unknown[],
  visits = [visit] as unknown[],
  attachmentCount = 2,
} = {}) {
  return {
    pet: {
      id: LUNA,
      owner_id: IVANA,
      organisation_id: null,
      name: "Luna",
      species: "cat",
      species_other: null,
      breed: "Britanska kratkodlaka",
      sex: "female",
      birth_date: "2023-04-12",
      birth_year: null,
      colour_markings: null,
      microchip_number: null,
      passport_number: null,
      neutered: "yes",
      has_photo: false,
      photo_file_name: null,
      vet_name: null,
      vet_phone: null,
      weight_unit: "kg",
      note: null,
      lifecycle: "active",
      shelter_status: null,
      offspring_status: null,
      breeding_status: null,
      litter_id: null,
      price: null,
      public_description: null,
      approx_age_text: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
    access,
    can_log: canLog,
    read_only_reason: reason,
    owner_name: "Ivana Petrović",
    memorial: null,
    upcoming_reminders: [],
    vaccinations: [],
    treatments,
    vet_visits: visits,
    weights: [],
    attachment_count: attachmentCount,
  } as never
}

function renderRecord(rec: never, { entitlements = FREE as never, locale = "sr" as "sr" | "en" } = {}) {
  return render(
    <PetRecordClient record={rec} now={NOW} entitlements={entitlements} locale={locale} copy={copy(locale)} />,
  )
}

async function openTab(name: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole("tab", { name }))
  return user
}

const cardOf = (title: string) => screen.getByRole("heading", { level: 3, name: title }).closest<HTMLElement>("[data-slot=card]")!

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  vi.clearAllMocks()
  getFileUrls.mockImplementation(async ({ items }: { items: { kind: string; id: string }[] }) => ({
    ok: true,
    data: items.map(({ kind, id }) => ({
      kind,
      id,
      url: `https://r2.test/get/${id}?sig=1`,
      expires_at: "2999-01-01T00:00:00Z",
      mime_type: "application/pdf",
    })),
  }))
})

describe("S03 Terapije — the list (FR-06)", () => {
  it("shows each treatment with type, dose · frequency · period, the next dose and the dose log", async () => {
    renderRecord(record())
    await openTab("Terapije")
    const card = cardOf("Tobrex kapi za oči")
    expect(within(card).getByText("Lek")).toBeInTheDocument()
    expect(within(card).getByText("1 kap u svako oko · Svakih 12 sati · 15. 10. 2026. – 25. 10. 2026.")).toBeInTheDocument()
    expect(within(card).getByText("Danas 20:00")).toBeInTheDocument()
    expect(within(card).getByText("Dnevnik doza")).toBeInTheDocument()
    const log = within(card).getAllByRole("listitem")
    expect(log.map((li) => li.textContent)).toEqual(["Danas 08:00Ivana Petrović", "18. 10. 2026. 20:05Jelena Nikolić"])

    const strong = cardOf("Stronghold Plus")
    expect(within(strong).getByText("Zaštita od buva i krpelja")).toBeInTheDocument()
    expect(within(strong).getByText("1 pipeta (0,5 ml) · Svakih 30 dana · Od 1. 4. 2026.")).toBeInTheDocument()
    expect(within(strong).getByText("1. 11. 2026. 09:00")).toBeInTheDocument()

    const done = cardOf("Milbemax")
    expect(within(done).getByText("Završeno")).toBeInTheDocument()
    expect(within(done).getByText("1/2 tablete · Jednokratno · 12. 3. 2026.")).toBeInTheDocument()
    expect(within(done).queryByRole("button", { name: "Doza data" })).not.toBeInTheDocument()
  })

  it("empty: 'Još nema terapija' with the add link for the owner", async () => {
    renderRecord(record({ treatments: [] }))
    await openTab("Terapije")
    expect(screen.getByRole("heading", { name: "Još nema terapija" })).toBeInTheDocument()
    expect(screen.getByText("Upiši lek ili zaštitu od parazita i podsetićemo te na svaku dozu.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Dodaj terapiju" })).toHaveAttribute("href", `/ljubimci/${LUNA}/terapije/nova`)
  })
})

describe("FR-06 — 'Doza data' logs the dose with time and user (EP-11)", () => {
  it("calls log_dose with the next open occurrence, toasts, refreshes, and the dose appears in the log", async () => {
    logDose.mockResolvedValue({
      ok: true,
      data: dose("d4", "2026-10-19T10:00:00Z", IVANA, "Ivana Petrović"),
    })
    const { rerender } = renderRecord(record())
    const user = await openTab("Terapije")
    await user.click(within(cardOf("Tobrex kapi za oči")).getByRole("button", { name: "Doza data" }))

    expect(logDose).toHaveBeenCalledWith({ treatment_id: "t1", occurrence_id: "occ-20h" })
    expect(toast).toHaveBeenCalledWith("Doza je upisana.")
    expect(refresh).toHaveBeenCalled()

    // router.refresh() re-reads EP-02: the new dose leads the log and the next dose advanced.
    const after = {
      ...tobrex,
      next_dose_at: "2026-10-20T06:00:00Z",
      next_dose_occurrence_id: "occ-8h",
      recent_doses: [dose("d4", "2026-10-19T10:00:00Z", IVANA, "Ivana Petrović"), ...tobrex.recent_doses],
      dose_count: 3,
    }
    rerender(
      <PetRecordClient
        record={record({ treatments: [after, stronghold, milbemax] })}
        now={NOW}
        entitlements={FREE}
        locale="sr"
        copy={copy("sr")}
      />,
    )
    const card = cardOf("Tobrex kapi za oči")
    expect(within(card).getAllByRole("listitem")[0]).toHaveTextContent("Danas 12:00Ivana Petrović")
    expect(within(card).getByText("20. 10. 2026. 08:00")).toBeInTheDocument()
  })

  it("a treatment without an open occurrence logs without one", async () => {
    logDose.mockResolvedValue({ ok: true, data: dose("d5", NOW, IVANA, "Ivana Petrović") })
    renderRecord(record({ treatments: [{ ...tobrex, next_dose_at: null, next_dose_occurrence_id: null }] }))
    const user = await openTab("Terapije")
    await user.click(screen.getByRole("button", { name: "Doza data" }))
    expect(logDose).toHaveBeenCalledWith({ treatment_id: "t1", occurrence_id: null })
  })

  it("a failure (e.g. household_read_only) → the error toast and a refresh", async () => {
    logDose.mockResolvedValue({ ok: false, error: { code: "household_read_only", message: "x" } })
    renderRecord(record())
    const user = await openTab("Terapije")
    await user.click(within(cardOf("Tobrex kapi za oči")).getByRole("button", { name: "Doza data" }))
    expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
    expect(refresh).toHaveBeenCalled()
  })

  it("FR-28: a member logs doses but cannot add, edit or delete treatments", async () => {
    logDose.mockResolvedValue({ ok: true, data: dose("d6", NOW, JELENA, "Jelena Nikolić") })
    renderRecord(record({ access: MEMBER_ACCESS, reason: "household_member" }))
    const user = await openTab("Terapije")
    expect(screen.queryByRole("link", { name: "Dodaj terapiju" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Još opcija: / })).not.toBeInTheDocument()
    await user.click(within(cardOf("Tobrex kapi za oči")).getByRole("button", { name: "Doza data" }))
    expect(logDose).toHaveBeenCalledWith({ treatment_id: "t1", occurrence_id: "occ-20h" })
  })

  it("read-only household (can_log = false): 'Doza data' is hidden, not disabled", async () => {
    renderRecord(record({ access: MEMBER_ACCESS, canLog: false, reason: "household_read_only" }))
    await openTab("Terapije")
    expect(screen.queryByRole("button", { name: "Doza data" })).not.toBeInTheDocument()
  })

  it("owner row menu: Izmeni → the edit route; Obriši → AlertDialog → EP-10 delete", async () => {
    deleteTreatment.mockResolvedValue({ ok: true, data: { id: "t1" } })
    renderRecord(record())
    const user = await openTab("Terapije")
    await user.click(screen.getByRole("button", { name: "Još opcija: Tobrex kapi za oči" }))
    expect(await screen.findByRole("menuitem", { name: "Izmeni" })).toHaveAttribute("href", `/ljubimci/${LUNA}/terapije/t1`)
    await user.click(screen.getByRole("menuitem", { name: "Obriši" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Obrisati unos?" })
    await user.click(within(dialog).getByRole("button", { name: "Da, obriši" }))
    expect(deleteTreatment).toHaveBeenCalledWith("t1")
    expect(refresh).toHaveBeenCalled()
  })

  it("English: translated frequency, period and next dose", async () => {
    renderRecord(record(), { locale: "en" })
    await openTab("Treatments")
    const card = cardOf("Tobrex kapi za oči")
    expect(within(card).getByText("1 kap u svako oko · Every 12 hours · 15 Oct 2026 – 25 Oct 2026")).toBeInTheDocument()
    expect(within(card).getByText("Today 20:00")).toBeInTheDocument()
    expect(within(card).getByRole("button", { name: "Dose given" })).toBeInTheDocument()
  })
})

describe("S03 Pregledi — vet visits and attachments (FR-07, FR-08)", () => {
  it("shows the visit with cost, findings, the check-up date and the Free counter", async () => {
    renderRecord(record())
    await openTab("Pregledi")
    expect(screen.getByText("2 / 10 priloga")).toBeInTheDocument()
    const card = cardOf("Suzenje levog oka")
    expect(within(card).getByText("2. 10. 2026. · Veterinarska ambulanta „Dr Vet”")).toBeInTheDocument()
    expect(within(card).getByText("2.990 RSD")).toBeInTheDocument()
    expect(within(card).getByText("Blagi konjunktivitis, bez povrede rožnjače.")).toBeInTheDocument()
    expect(within(card).getByText("Kontrola:")).toBeInTheDocument()
    expect(within(card).getByText("30. 10. 2026.")).toBeInTheDocument()
    expect(within(card).getByText("Uskoro")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Novi pregled" })).toHaveAttribute("href", `/ljubimci/${LUNA}/pregledi/novi`)
  })

  it("Premium: no counter", async () => {
    renderRecord(record(), { entitlements: PREMIUM })
    await openTab("Pregledi")
    expect(screen.queryByText(/priloga$/)).not.toBeInTheDocument()
  })

  it("FR-08: attachment chips open their EP-15 view URLs", async () => {
    renderRecord(record())
    await openTab("Pregledi")
    expect(getFileUrls).toHaveBeenCalledWith({
      items: [
        { kind: "attachment", id: "a1" },
        { kind: "attachment", id: "a2" },
      ],
    })
    const pdf = screen.getByRole("link", { name: /nalaz-oko-02-10-2026\.pdf/ })
    await waitFor(() => expect(pdf).toHaveAttribute("href", "https://r2.test/get/a1?sig=1"))
    expect(pdf).toHaveAttribute("target", "_blank")
    expect(pdf).toHaveTextContent("0,8 MB")
    expect(screen.getByRole("link", { name: /luna-oko\.jpg/ })).toHaveTextContent("3,4 MB")
  })

  it("url = null → 'Fajl nije dostupan.'", async () => {
    getFileUrls.mockResolvedValue({
      ok: true,
      data: [
        { kind: "attachment", id: "a1", url: null, expires_at: null, mime_type: null },
        { kind: "attachment", id: "a2", url: null, expires_at: null, mime_type: null },
      ],
    })
    renderRecord(record())
    const user = await openTab("Pregledi")
    await user.click(screen.getByRole("link", { name: /nalaz-oko-02-10-2026\.pdf/ }))
    expect(toast.error).toHaveBeenCalledWith("Fajl nije dostupan.")
  })

  it("EP-14: the chip's X asks first, then deletes the attachment", async () => {
    deleteAttachment.mockResolvedValue({ ok: true, data: { deleted_attachment_id: "a1" } })
    renderRecord(record())
    const user = await openTab("Pregledi")
    await user.click(screen.getByRole("button", { name: "Ukloni nalaz-oko-02-10-2026.pdf" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Obrisati unos?" })
    expect(within(dialog).getByText("Ovo ne može da se poništi.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Da, obriši" }))
    expect(deleteAttachment).toHaveBeenCalledWith({ attachment_id: "a1" })
    expect(refresh).toHaveBeenCalled()
  })

  it("owner row menu on a visit: Izmeni → the edit route; Obriši → EP-12 delete", async () => {
    deleteVetVisit.mockResolvedValue({ ok: true, data: { id: "p1" } })
    renderRecord(record())
    const user = await openTab("Pregledi")
    await user.click(screen.getByRole("button", { name: "Još opcija: Suzenje levog oka" }))
    expect(await screen.findByRole("menuitem", { name: "Izmeni" })).toHaveAttribute("href", `/ljubimci/${LUNA}/pregledi/p1`)
    await user.click(screen.getByRole("menuitem", { name: "Obriši" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Da, obriši" }))
    expect(deleteVetVisit).toHaveBeenCalledWith("p1")
  })

  it("FR-28: a member opens attachments but has no add, edit, delete or remove controls", async () => {
    renderRecord(record({ access: MEMBER_ACCESS, reason: "household_member" }))
    await openTab("Pregledi")
    expect(screen.getByRole("link", { name: /nalaz-oko-02-10-2026\.pdf/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Ukloni / })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Još opcija: / })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Novi pregled" })).not.toBeInTheDocument()
    expect(screen.queryByText(/priloga$/)).not.toBeInTheDocument()
  })

  it("empty: 'Još nema pregleda' with the S05 link for the owner", async () => {
    renderRecord(record({ visits: [], attachmentCount: 0 }))
    await openTab("Pregledi")
    expect(screen.getByRole("heading", { name: "Još nema pregleda" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Novi pregled" })).toHaveAttribute("href", `/ljubimci/${LUNA}/pregledi/novi`)
  })

  it("Pregled tab: the last visit card links to all vet visits", async () => {
    renderRecord(record())
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Svi pregledi" }))
    expect(screen.getByRole("tab", { name: "Pregledi" })).toHaveAttribute("aria-selected", "true")
  })
})
