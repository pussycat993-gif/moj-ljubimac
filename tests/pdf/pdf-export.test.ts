import { createElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// FR-10 / FR-36 — PDF export. EP-16 get_pdf_export_bundle for the Premium seed user (Ivana) returns the
// whole record (vaccinations, treatments with every dose log, vet visits, weights oldest first, image
// attachment URLs, the photo, memorial, owner name), and the react-pdf Document built from it in the
// browser contains every section (the test reads the Document element tree, not PDF bytes — owner
// decision, Step 16). A Free owner → premium_required (limit pdf_export) and S03 shows PremiumLock
// (E-25); members → forbidden_role; no relation → not_found.

const IVANA = "a1000000-0000-4000-8000-000000000001"
const JELENA = "a1000000-0000-4000-8000-000000000003"
const MARKO = "a1000000-0000-4000-8000-000000000002"
const LUNA = "c1000000-0000-4000-8000-000000000001"
const TOBREX = "c2000000-0000-4000-8000-000000000001"
const VISIT = "c3000000-0000-4000-8000-000000000001"
const IMAGE = "d1000000-0000-4000-8000-000000000001"
const PDF = "d1000000-0000-4000-8000-000000000002"

const OWNER = { role: "owner", can_edit: true, can_delete: true }

function dose(id: string, givenAt: string, by: string, name: string | null) {
  return { id, treatment_id: TOBREX, given_at: givenAt, occurrence_id: null, created_by: by, created_by_name: name, access: OWNER }
}

/** EP-02 PetRecord of Luna as rpc:get_pet_record returns it (entries newest first). */
function lunaRecord(access = OWNER) {
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
      colour_markings: "Plavo-siva, bela mrlja na grudima",
      microchip_number: "688038000123456",
      passport_number: "RS-NS-0451-23",
      neutered: "yes",
      has_photo: true,
      photo_file_name: "luna.jpg",
      vet_name: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
      vet_phone: "021 456 789",
      weight_unit: "kg",
      note: "Ne voli transporter — staviti ćebe unutra.",
      lifecycle: "memorial",
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
    can_log: true,
    read_only_reason: access.role === "owner" ? null : "household_member",
    owner_name: "Ivana Petrović",
    memorial: { id: "m1", pet_id: LUNA, date: "2026-10-20", reason: "rehomed", note: "Živi sa Markom u Beogradu.", created_at: "2026-10-20T10:00:00Z" },
    upcoming_reminders: [],
    vaccinations: [
      { id: "v2", pet_id: LUNA, name: "Trovalentna — Purevax RCP", given_on: "2026-03-12", next_due_on: "2027-03-12", days_until_due: 140, clinic: "Veterinarska ambulanta „Dr Vet”", batch_number: "PX-26-1142", note: null, created_by: IVANA, created_at: "2026-03-12T08:00:00Z", updated_at: "2026-03-12T08:00:00Z" },
      { id: "v1", pet_id: LUNA, name: "Besnilo — Rabisin", given_on: "2025-10-26", next_due_on: null, days_until_due: null, clinic: null, batch_number: "RB-24-0917", note: null, created_by: IVANA, created_at: "2025-10-26T08:00:00Z", updated_at: "2025-10-26T08:00:00Z" },
    ],
    treatments: [
      {
        id: TOBREX, pet_id: LUNA, type: "medication", name: "Tobrex kapi za oči", dose: "1 kap u svako oko",
        interval_value: 12, interval_unit: "hours", starts_on: "2026-10-15", ends_on: "2026-10-25", note: null,
        is_active: false, next_dose_at: null, next_dose_occurrence_id: null,
        // EP-02: the latest 4 doses, newest first; the fifth (oldest) is only in dose_logs.
        recent_doses: [
          dose("d5", "2026-10-20T06:00:00Z", IVANA, "Ivana Petrović"),
          dose("d4", "2026-10-19T18:00:00Z", JELENA, "Jelena Nikolić"),
          dose("d3", "2026-10-19T06:00:00Z", IVANA, "Ivana Petrović"),
          dose("d2", "2026-10-18T18:05:00Z", JELENA, "Jelena Nikolić"),
        ],
        dose_count: 5, created_by: IVANA, created_at: "2026-10-15T08:00:00Z",
      },
    ],
    vet_visits: [
      {
        id: VISIT, pet_id: LUNA, visited_on: "2026-10-02", clinic: "Veterinarska ambulanta „Dr Vet”", reason: "Suzenje levog oka",
        findings: "Blagi konjunktivitis, bez povrede rožnjače.", recommendations: "Tobrex kapi 10 dana, kontrola posle terapije.",
        cost: { amount_minor: 299000, currency: "RSD" }, follow_up_on: "2026-10-30",
        attachments: [
          { id: IMAGE, vet_visit_id: VISIT, pet_id: LUNA, file_name: "oko-levo.jpg", mime_type: "image/jpeg", size_bytes: 820000, created_by: IVANA, created_at: "2026-10-02T10:00:00Z" },
          { id: PDF, vet_visit_id: VISIT, pet_id: LUNA, file_name: "nalaz.pdf", mime_type: "application/pdf", size_bytes: 120000, created_by: IVANA, created_at: "2026-10-02T10:00:00Z" },
        ],
        created_by: IVANA, created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:00:00Z",
      },
    ],
    weights: [
      { id: "w2", pet_id: LUNA, measured_on: "2026-10-19", value: 4.2, weight_unit: "kg", note: null, created_by: JELENA, created_by_name: "Jelena Nikolić", created_at: "2026-10-19T08:00:00Z", access: OWNER },
      { id: "w1", pet_id: LUNA, measured_on: "2026-04-17", value: 3.8, weight_unit: "kg", note: "Izmereno kod „Dr Vet”", created_by: IVANA, created_by_name: "Ivana Petrović", created_at: "2026-04-17T08:00:00Z", access: OWNER },
    ],
    attachment_count: 2,
  }
}

const DOSE_ROWS = [
  { id: "d1", treatment_id: TOBREX, given_at: "2026-10-18T06:10:00Z", occurrence_id: null, created_by: JELENA },
  { id: "d2", treatment_id: TOBREX, given_at: "2026-10-18T18:05:00Z", occurrence_id: null, created_by: JELENA },
  { id: "d3", treatment_id: TOBREX, given_at: "2026-10-19T06:00:00Z", occurrence_id: null, created_by: IVANA },
  { id: "d4", treatment_id: TOBREX, given_at: "2026-10-19T18:00:00Z", occurrence_id: null, created_by: JELENA },
  { id: "d5", treatment_id: TOBREX, given_at: "2026-10-20T06:00:00Z", occurrence_id: null, created_by: IVANA },
]

type Session = { userId: string; record: unknown; recordError?: { code: string; message: string }; pdfExport: boolean }
const state = {
  session: null as Session | null,
  doseQuery: null as null | { column: string; ids: string[]; order: string },
  rpcCalls: [] as string[],
}

/** The server client as EP-16 sees it: gates (profiles, memberships), get_pet_record, get_me, dose_logs. */
function fakeSupabase(session: Session) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: session.userId, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    rpc: async (name: string) => {
      state.rpcCalls.push(name)
      if (name === "get_pet_record") {
        return session.recordError ? { data: null, error: session.recordError } : { data: session.record, error: null }
      }
      if (name === "get_me") {
        return { data: { id: session.userId, entitlements: { pdf_export: session.pdfExport } }, error: null }
      }
      throw new Error(`unexpected rpc ${name}`)
    },
    from(table: string) {
      const query = { column: "", ids: [] as string[], order: "" }
      const run = () => {
        if (table === "profiles") return { data: { id: session.userId, deletion_requested_at: null }, error: null }
        if (table === "organisation_memberships") return { data: [], error: null }
        if (table === "dose_logs") {
          state.doseQuery = query
          return { data: DOSE_ROWS.filter((r) => query.ids.includes(r.treatment_id)), error: null }
        }
        throw new Error(`unexpected table ${table}`)
      }
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: (column: string, ids: string[]) => ((query.column = column), (query.ids = ids), builder),
        order: (column: string) => ((query.order = column), builder),
        maybeSingle: async () => run(),
        then: (resolve: (v: unknown) => void) => resolve(run()),
      }
      return builder
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeSupabase(state.session!) }))
const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const getFileUrls = vi.fn()
vi.mock("@/lib/actions/files", () => ({ getFileUrls: (...a: unknown[]) => getFileUrls(...a) }))

const { getPdfExportBundle } = await import("@/lib/actions/pdf-export")
const { buildPetRecordDocument, petRecordPdfFileName } = await import("@/app/(app)/ljubimci/[id]/pdf-export-client")
const reactPdf = await import("@react-pdf/renderer")
const { dictionaries } = await import("@/lib/i18n")
const { PetRecordClient } = await import("@/app/(app)/ljubimci/[id]/pet-record-client")

const pdfCopy = { petRecord: dictionaries.sr.petRecord, pet: dictionaries.sr.pet, petForm: dictionaries.sr.petForm }

/** Every element of a React element tree, depth first. */
function elements(node: ReactNode): ReactElement<{ children?: ReactNode; src?: string }>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [node as ReactElement<{ children?: ReactNode; src?: string }>, ...elements(node.props.children)]
}

/** The text of every Text element (its string children joined). */
function texts(doc: ReactElement): string[] {
  const flat = (node: ReactNode): string =>
    Array.isArray(node) ? node.map(flat).join("") : typeof node === "string" || typeof node === "number" ? String(node) : ""
  return elements(doc)
    .filter((e) => e.type === reactPdf.Text)
    .map((e) => flat(e.props.children))
}

beforeEach(() => {
  vi.clearAllMocks()
  state.doseQuery = null
  state.rpcCalls = []
  getFileUrls.mockImplementation(async ({ items }: { items: { kind: string; id: string }[] }) => ({
    ok: true,
    data: items.map((i) => ({
      kind: i.kind,
      id: i.id,
      url: `https://r2.test/${i.kind}/${i.id}`,
      expires_at: "2026-10-23T10:10:00Z",
      mime_type: i.kind === "attachment" ? "image/jpeg" : null,
    })),
  }))
})

describe("EP-16 get_pdf_export_bundle", () => {
  it("FR-10: returns the whole record for the Premium seed user", async () => {
    state.session = { userId: IVANA, record: lunaRecord(), pdfExport: true }
    const result = await getPdfExportBundle({ pet_id: LUNA })
    if (!result.ok) throw new Error(result.error.code)
    const bundle = result.data

    expect(bundle.pet.name).toBe("Luna")
    expect(bundle.owner_name).toBe("Ivana Petrović")
    expect(bundle.memorial).toMatchObject({ reason: "rehomed", date: "2026-10-20" })
    expect(Date.parse(bundle.generated_at)).not.toBeNaN()
    // Oldest first (PdfExportBundle order).
    expect(bundle.vaccinations.map((v) => v.id)).toEqual(["v1", "v2"])
    expect(bundle.vet_visits.map((v) => v.id)).toEqual([VISIT])
    expect(bundle.weights.map((w) => w.id)).toEqual(["w1", "w2"])
    // Every dose log, not just the latest 4, oldest first, with the author's name.
    expect(state.doseQuery).toEqual({ column: "treatment_id", ids: [TOBREX], order: "given_at" })
    expect(bundle.treatments[0].doses.map((d) => [d.id, d.created_by_name])).toEqual([
      ["d1", "Jelena Nikolić"],
      ["d2", "Jelena Nikolić"],
      ["d3", "Ivana Petrović"],
      ["d4", "Jelena Nikolić"],
      ["d5", "Ivana Petrović"],
    ])
    // EP-15 URLs for the photo and the image attachment only; the PDF attachment is listed by name.
    expect(getFileUrls).toHaveBeenCalledWith({
      items: [
        { kind: "pet_photo", id: LUNA },
        { kind: "attachment", id: IMAGE },
      ],
    })
    expect(bundle.attachment_files.map((f) => f.id)).toEqual([IMAGE])
    expect(bundle.photo).toMatchObject({ kind: "pet_photo", id: LUNA, url: `https://r2.test/pet_photo/${LUNA}` })
  })

  it("FR-10 / FR-36: a Free owner is blocked with premium_required (limit pdf_export)", async () => {
    state.session = { userId: MARKO, record: lunaRecord(), pdfExport: false }
    const result = await getPdfExportBundle({ pet_id: LUNA })
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "premium_required", details: { limit: "pdf_export" } }),
    })
    expect(getFileUrls).not.toHaveBeenCalled()
  })

  it("a household member → forbidden_role", async () => {
    state.session = {
      userId: JELENA,
      record: lunaRecord({ role: "member", can_edit: false, can_delete: false }),
      pdfExport: true,
    }
    const result = await getPdfExportBundle({ pet_id: LUNA })
    expect(result.ok === false && result.error.code).toBe("forbidden_role")
  })

  it("no relation → not_found", async () => {
    state.session = { userId: MARKO, record: null, recordError: { code: "P0001", message: "not_found" }, pdfExport: true }
    const result = await getPdfExportBundle({ pet_id: LUNA })
    expect(result.ok === false && result.error.code).toBe("not_found")
  })
})

describe("the PDF document (react-pdf, browser)", () => {
  it("FR-10: contains every section of PdfExportBundle", async () => {
    state.session = { userId: IVANA, record: lunaRecord(), pdfExport: true }
    const result = await getPdfExportBundle({ pet_id: LUNA })
    if (!result.ok) throw new Error(result.error.code)
    const images = { photo: "data:image/jpeg;base64,UEhPVE8=", [IMAGE]: "data:image/jpeg;base64,T0tP" }
    const doc = buildPetRecordDocument(reactPdf, result.data, images, pdfCopy, "sr")

    expect(doc.type).toBe(reactPdf.Document)
    expect(elements(doc).filter((e) => e.type === reactPdf.Page)).toHaveLength(1)
    const lines = texts(doc)
    const has = (text: string) => expect(lines, text).toContain(text)

    // Title, owner and the footer with the generation date.
    has("Karton ljubimca — Luna")
    has("Vlasnik: Ivana Petrović")
    expect(lines.some((l) => /^Moj Ljubimac · \d{1,2}\. \d{1,2}\. \d{4}\.$/.test(l))).toBe(true)
    // Sections: the S03 labels plus "Prilozi".
    for (const heading of ["Osnovni podaci", "Moj veterinar", "Uspomene", "Vakcine", "Terapije", "Pregledi", "Težina", "Prilozi"]) {
      has(heading)
    }
    // Pet basics and vet.
    has("688038000123456")
    has("RS-NS-0451-23")
    has("12. 4. 2023.")
    has("Veterinarska ambulanta „Dr Vet”, Novi Sad")
    has("021 456 789")
    // Memorial.
    has("20. 10. 2026.")
    has("Udomljena kod drugih")
    has("Živi sa Markom u Beogradu.")
    // Vaccinations, oldest first.
    expect(lines.indexOf("Besnilo — Rabisin")).toBeLessThan(lines.indexOf("Trovalentna — Purevax RCP"))
    has("Data 12. 3. 2026. · Veterinarska ambulanta „Dr Vet” · Serija PX-26-1142")
    has("Sledeća 12. 3. 2027.")
    has("Bez sledeće doze")
    // Treatment with all five doses.
    has("Tobrex kapi za oči · Lek · Završeno")
    has("1 kap u svako oko · Svakih 12 sati · 15. 10. 2026. – 25. 10. 2026.")
    has("Dnevnik doza")
    has("18. 10. 2026. 08:10 · Jelena Nikolić")
    has("20. 10. 2026. 08:00 · Ivana Petrović")
    expect(lines.filter((l) => / · (Jelena Nikolić|Ivana Petrović)$/.test(l))).toHaveLength(5)
    // Vet visit.
    has("Suzenje levog oka")
    has("2. 10. 2026. · Veterinarska ambulanta „Dr Vet” · 2.990 RSD")
    has("Blagi konjunktivitis, bez povrede rožnjače.")
    has("Tobrex kapi 10 dana, kontrola posle terapije.")
    has("30. 10. 2026.")
    // Weights, oldest first.
    has("3,8 kg · Izmereno kod „Dr Vet”")
    has("4,2 kg")
    // Attachments: the image embedded, the PDF listed by name.
    has("oko-levo.jpg")
    has("nalaz.pdf")
    const sources = elements(doc)
      .filter((e) => e.type === reactPdf.Image)
      .map((e) => e.props.src)
    expect(sources).toEqual(["data:image/jpeg;base64,UEhPVE8=", "data:image/jpeg;base64,T0tP"])
    expect(petRecordPdfFileName("Luna")).toBe("Luna-karton.pdf")
  })

  it("an image that failed to load is listed by name only", async () => {
    state.session = { userId: IVANA, record: lunaRecord(), pdfExport: true }
    const result = await getPdfExportBundle({ pet_id: LUNA })
    if (!result.ok) throw new Error(result.error.code)
    const enCopy = { petRecord: dictionaries.en.petRecord, pet: dictionaries.en.pet, petForm: dictionaries.en.petForm }
    const doc = buildPetRecordDocument(reactPdf, result.data, {}, enCopy, "en")
    expect(elements(doc).filter((e) => e.type === reactPdf.Image)).toHaveLength(0)
    const lines = texts(doc)
    expect(lines).toContain("oko-levo.jpg")
    expect(lines).toContain("Pet record — Luna")
    expect(lines).toContain("Attachments")
  })
})

describe("S03 — Izvezi PDF", () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.scrollIntoView ??= () => {}
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  /** S03 for Luna with Me.entitlements.pdf_export as given (the EP-43 value the page passes). */
  function renderRecord(pdfExport: boolean) {
    const copy = { ...pdfCopy, common: dictionaries.sr.common }
    const record = { ...lunaRecord(), pet: { ...lunaRecord().pet, has_photo: false, lifecycle: "active" }, memorial: null }
    render(
      createElement(PetRecordClient, {
        record: record as never,
        now: "2026-10-19T10:00:00Z",
        entitlements: { pdf_export: pdfExport, limits: { attachments_per_pet: pdfExport ? null : 10 } } as never,
        locale: "sr",
        copy,
      }),
    )
  }

  it("FR-10 / FR-36: on Free the button carries the Premium badge and opens PremiumLock without EP-16", async () => {
    state.session = { userId: MARKO, record: lunaRecord(), pdfExport: false }
    renderRecord(false)
    const button = screen.getByRole("button", { name: /Izvezi PDF/ })
    expect(button).toHaveTextContent("Premium")
    expect(screen.queryByRole("region", { name: "Izvoz kartona u PDF" })).not.toBeInTheDocument()
    await userEvent.setup().click(button)

    const lock = screen.getByRole("region", { name: "Izvoz kartona u PDF" })
    expect(lock).toHaveTextContent("Dostupno u Premiumu")
    expect(lock).toHaveTextContent("Izvezi ceo karton u PDF — za veterinara, groomera ili granicu.")
    expect(lock).toHaveTextContent("Probaj 7 dana besplatno")
    expect(lock).toHaveTextContent("Karton ljubimca — Luna")
    expect(state.rpcCalls).toEqual([])
  })

  it("premium_required from EP-16 (limit pdf_export) also shows the PremiumLock", async () => {
    // The page said Premium, but the subscription has ended since: EP-16 refuses.
    state.session = { userId: IVANA, record: lunaRecord(), pdfExport: false }
    renderRecord(true)
    const button = screen.getByRole("button", { name: /Izvezi PDF/ })
    expect(button).not.toHaveTextContent("Premium")
    await userEvent.setup().click(button)

    expect(state.rpcCalls).toEqual(["get_pet_record", "get_me"])
    expect(await screen.findByRole("region", { name: "Izvoz kartona u PDF" })).toHaveTextContent("Dostupno u Premiumu")
    expect(toast).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
