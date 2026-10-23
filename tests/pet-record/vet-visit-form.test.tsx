import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S05 Novi pregled: FR-07 (the check-up date is sent; the trigger creates the reminder — asserted in
// supabase/tests/vet_visit_followup_reminder.test.sql), FR-08 (images/PDF ≤ 10 MB uploaded after the
// visit is saved, one EP-13 ticket per file; other types and sizes rejected inline, in the browser and
// from the server), FR-08 / FR-36 (counter "n / 10" from Me.usage + Entitlements; the 11th → PremiumLock;
// Premium has no counter or limit). Also the edit route (owner decision, Step 15) and EP-14 from S05.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const createVetVisit = vi.fn()
const updateVetVisit = vi.fn()
vi.mock("@/lib/actions/vet-visits", () => ({
  createVetVisit: (...a: unknown[]) => createVetVisit(...a),
  updateVetVisit: (...a: unknown[]) => updateVetVisit(...a),
}))
const requestUpload = vi.fn()
const confirmUpload = vi.fn()
vi.mock("@/lib/actions/uploads", () => ({
  requestUpload: (...a: unknown[]) => requestUpload(...a),
  confirmUpload: (...a: unknown[]) => confirmUpload(...a),
}))
const deleteAttachment = vi.fn()
vi.mock("@/lib/actions/attachments", () => ({ deleteAttachment: (...a: unknown[]) => deleteAttachment(...a) }))

const { VetVisitFormClient } = await import("@/app/(app)/ljubimci/[id]/pregledi/novi/vet-visit-form-client")
const { dictionaries } = await import("@/lib/i18n")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const IVANA = "a1000000-0000-4000-8000-000000000001"
const VISIT = "c3000000-0000-4000-8000-000000000009"

const copy = (locale: "sr" | "en") => ({
  vetVisitForm: dictionaries[locale].vetVisitForm,
  petRecord: dictionaries[locale].petRecord,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

const luna = {
  id: LUNA,
  name: "Luna",
  sex: "female",
  species: "cat",
  species_other: null,
  breed: "Britanska kratkodlaka",
  vet_name: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
} as const

function savedVisit(extra: Record<string, unknown> = {}) {
  return {
    id: VISIT,
    pet_id: LUNA,
    visited_on: "2026-10-19",
    clinic: luna.vet_name,
    reason: "Kontrola očiju",
    findings: null,
    recommendations: null,
    cost: null,
    follow_up_on: null,
    attachments: [],
    created_by: IVANA,
    created_at: "2026-10-19T08:00:00Z",
    updated_at: "2026-10-19T08:00:00Z",
    ...extra,
  }
}

function attachment(id: string, file_name: string, mime_type: string, size_bytes: number) {
  return { id, vet_visit_id: VISIT, pet_id: LUNA, file_name, mime_type, size_bytes, created_by: IVANA, created_at: "2026-10-19T08:00:00Z" }
}

function file(name: string, type: string, size = 1024) {
  const f = new File(["x"], name, { type })
  Object.defineProperty(f, "size", { value: size })
  return f
}

const fetchMock = vi.fn()

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 19, 10, 0))
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  vi.stubGlobal("fetch", fetchMock)
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue({ ok: true, status: 200 })
  let n = 0
  requestUpload.mockImplementation(async (input: { file_name: string; mime_type: string; size_bytes: number }) => ({
    ok: true,
    data: {
      upload_token: `up_token-${++n}`,
      put_url: `https://r2.test/put/${input.file_name}`,
      method: "PUT",
      headers: { "Content-Type": input.mime_type, "Content-Length": String(input.size_bytes) },
      expires_at: "2026-10-19T08:10:00Z",
      file_name: input.file_name,
      position: null,
    },
  }))
  confirmUpload.mockImplementation(async ({ upload_token }: { upload_token: string }) => ({
    ok: true,
    data: attachment(`a-${upload_token}`, "f", "application/pdf", 1024),
  }))
})

function renderNew({ limit = 10 as number | null, count = 5, locale = "sr" as "sr" | "en" } = {}) {
  return render(
    <VetVisitFormClient pet={luna} attachmentLimit={limit} attachmentCount={count} locale={locale} copy={copy(locale)} />,
  )
}

async function pickDay(user: ReturnType<typeof userEvent.setup>, fieldLabel: string, day: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(`^${fieldLabel}`) }))
  const popover = await screen.findByRole("dialog")
  const cell = popover.querySelector<HTMLElement>(`[data-day="${day}"] button`)
  if (!cell) throw new Error(`no calendar day ${day}`)
  await user.click(cell)
}

const picker = () => document.getElementById("prilozi") as HTMLInputElement

describe("S05 — new vet visit", () => {
  it("shows the header, the prefilled clinic, the check-up helper and the Free counter", () => {
    renderNew()
    expect(screen.getByRole("heading", { level: 1, name: "Novi pregled" })).toBeInTheDocument()
    expect(screen.getByLabelText("Ambulanta ili veterinar")).toHaveValue("Veterinarska ambulanta „Dr Vet”, Novi Sad")
    expect(screen.getByRole("button", { name: /^Datum kontrole/ })).toHaveAccessibleDescription("Napravićemo podsetnik.")
    expect(screen.getByText("5 / 10 priloga")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Iskorišćeno 5 od 10 priloga" })).toBeInTheDocument()
    expect(screen.getByText("Free plan: do 10 priloga po ljubimcu. Luna već ima 5 na drugim pregledima.")).toBeInTheDocument()
    expect(screen.getByText("JPG, PNG ili PDF, do 10 MB po fajlu.")).toBeInTheDocument()
  })

  it("FR-07: sends follow_up_on and the cost in para, toasts the check-up date and returns to S03", async () => {
    createVetVisit.mockResolvedValue({ ok: true, data: savedVisit({ follow_up_on: "2026-10-30" }) })
    renderNew()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Razlog *"), "Kontrola očiju")
    await user.type(screen.getByLabelText("Nalaz i dijagnoza"), "Konjunktivitis se povukao.")
    await user.type(screen.getByLabelText("Cena (RSD)"), "2.990")
    await pickDay(user, "Datum kontrole", "2026-10-30")
    await user.click(screen.getByRole("button", { name: "Sačuvaj pregled" }))

    expect(createVetVisit).toHaveBeenCalledWith({
      pet_id: LUNA,
      visited_on: "2026-10-19",
      clinic: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
      reason: "Kontrola očiju",
      findings: "Konjunktivitis se povukao.",
      recommendations: null,
      cost_minor: 299000,
      follow_up_on: "2026-10-30",
    })
    expect(requestUpload).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith("Pregled sačuvan. Podsetićemo te na kontrolu 30. 10. 2026.")
    expect(push).toHaveBeenCalledWith(`/ljubimci/${LUNA}`)
  })

  it("FR-08: each image or PDF ≤ 10 MB is uploaded after the visit is saved — ticket, PUT, confirm", async () => {
    createVetVisit.mockResolvedValue({ ok: true, data: savedVisit() })
    renderNew()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Razlog *"), "Kontrola očiju")
    const pdf = file("nalaz-kontrola-oka.pdf", "application/pdf", 860_000)
    const jpg = file("luna-levo-oko.jpg", "image/jpeg", 2_400_000)
    await user.upload(picker(), [pdf, jpg])

    const list = screen.getByRole("list", { name: "Dodati prilozi" })
    expect(within(list).getByText("nalaz-kontrola-oka.pdf")).toBeInTheDocument()
    expect(within(list).getByText("0,8 MB")).toBeInTheDocument()
    expect(within(list).getByText("2,3 MB")).toBeInTheDocument()
    expect(screen.getByText("7 / 10 priloga")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Sačuvaj pregled" }))
    expect(requestUpload.mock.calls.map((c) => c[0])).toEqual([
      { purpose: "attachment", target_id: VISIT, file_name: "nalaz-kontrola-oka.pdf", mime_type: "application/pdf", size_bytes: 860_000 },
      { purpose: "attachment", target_id: VISIT, file_name: "luna-levo-oko.jpg", mime_type: "image/jpeg", size_bytes: 2_400_000 },
    ])
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://r2.test/put/nalaz-kontrola-oka.pdf", {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "Content-Length": "860000" },
      body: pdf,
    })
    expect(confirmUpload.mock.calls.map((c) => c[0])).toEqual([{ upload_token: "up_token-1" }, { upload_token: "up_token-2" }])
    expect(toast).toHaveBeenCalledWith("Pregled sačuvan.")
    expect(push).toHaveBeenCalledWith(`/ljubimci/${LUNA}`)
  })

  it("FR-08: another type or a file over 10 MB is rejected inline in the browser and not added", async () => {
    renderNew()
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(picker(), file("luna-video.mp4", "video/mp4"))
    expect(screen.getByText("luna-video.mp4 nije podržan. Dodaj sliku (JPG, PNG) ili PDF do 10 MB.")).toBeInTheDocument()
    expect(picker()).toHaveAttribute("aria-invalid", "true")
    await user.upload(picker(), file("snimak.jpg", "image/jpeg", 11 * 1024 * 1024))
    expect(screen.getByText("snimak.jpg ima 11,0 MB. Najveća dozvoljena veličina je 10 MB.")).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Dodati prilozi" })).not.toBeInTheDocument()
    expect(screen.getByText("5 / 10 priloga")).toBeInTheDocument()
  })

  it("FR-08: file_type_not_allowed / file_too_large from the server → the same inline message; the visit is kept", async () => {
    createVetVisit.mockResolvedValue({ ok: true, data: savedVisit() })
    updateVetVisit.mockResolvedValue({ ok: true, data: savedVisit() })
    renderNew()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Razlog *"), "Kontrola")
    await user.upload(picker(), file("nalaz.heic", "image/heic", 3000))
    confirmUpload.mockResolvedValueOnce({ ok: false, error: { code: "file_type_not_allowed", message: "x" } })
    await user.click(screen.getByRole("button", { name: "Sačuvaj pregled" }))
    expect(screen.getByText("nalaz.heic nije podržan. Dodaj sliku (JPG, PNG) ili PDF do 10 MB.")).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()

    // Saving again updates the same visit instead of creating a second one.
    await user.click(screen.getByRole("button", { name: `Ukloni nalaz.heic` }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj pregled" }))
    expect(createVetVisit).toHaveBeenCalledTimes(1)
    expect(updateVetVisit).toHaveBeenCalledWith(VISIT, expect.objectContaining({ reason: "Kontrola" }))
    expect(push).toHaveBeenCalledWith(`/ljubimci/${LUNA}`)
  })

  it("FR-08 / FR-36: on Free with 9 attachments the 11th is blocked and the Premium offer is shown", async () => {
    renderNew({ count: 9 })
    const user = userEvent.setup()
    await user.upload(picker(), [file("deseti.pdf", "application/pdf"), file("jedanaesti.pdf", "application/pdf")])
    expect(screen.getByText("10 / 10 priloga")).toBeInTheDocument()
    expect(screen.getByText("deseti.pdf")).toBeInTheDocument()
    expect(screen.queryByText("jedanaesti.pdf")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
    expect(
      screen.getByText("Na Free planu možeš da sačuvaš 10 priloga po ljubimcu. Premium nema ograničenje — čuvaj sve nalaze i snimke."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Probaj 7 dana besplatno" })).toBeInTheDocument()
    expect(picker()).toBeNull()

    // Removing a file frees the slot and brings the picker back.
    await user.click(screen.getByRole("button", { name: "Ukloni deseti.pdf" }))
    expect(screen.getByText("9 / 10 priloga")).toBeInTheDocument()
    expect(picker()).not.toBeNull()
  })

  it("FR-08: premium_required from EP-13 → PremiumLock; nothing navigates", async () => {
    createVetVisit.mockResolvedValue({ ok: true, data: savedVisit() })
    requestUpload.mockResolvedValueOnce({ ok: false, error: { code: "premium_required", message: "x", details: { limit: "attachments" } } })
    renderNew({ count: 3 })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Razlog *"), "Kontrola")
    await user.upload(picker(), file("nalaz.pdf", "application/pdf"))
    await user.click(screen.getByRole("button", { name: "Sačuvaj pregled" }))
    expect(screen.getByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it("an upload that fails for another reason after the visit is saved → '{file} nije sačuvan. Pokušaj ponovo.'", async () => {
    createVetVisit.mockResolvedValue({ ok: true, data: savedVisit() })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 })
    renderNew()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Razlog *"), "Kontrola")
    await user.upload(picker(), file("nalaz.pdf", "application/pdf"))
    await user.click(screen.getByRole("button", { name: "Sačuvaj pregled" }))
    expect(toast.error).toHaveBeenCalledWith("nalaz.pdf nije sačuvan. Pokušaj ponovo.")
    expect(confirmUpload).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it("FR-08: Premium has no counter and no per-pet limit", async () => {
    renderNew({ limit: null, count: 25 })
    expect(screen.queryByText(/priloga$/)).not.toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    const user = userEvent.setup()
    await user.upload(
      picker(),
      Array.from({ length: 12 }, (_, i) => file(`nalaz-${i + 1}.pdf`, "application/pdf")),
    )
    expect(within(screen.getByRole("list", { name: "Dodati prilozi" })).getAllByRole("listitem")).toHaveLength(12)
    expect(screen.queryByRole("heading", { name: "Dostupno u Premiumu" })).not.toBeInTheDocument()
  })

  it("validates inline and sends nothing: reason and the amount format", async () => {
    renderNew()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Cena (RSD)"), "1500 dinara")
    await user.click(screen.getByRole("button", { name: "Sačuvaj pregled" }))
    expect(screen.getByText("Upiši razlog pregleda.")).toBeInTheDocument()
    expect(screen.getByText("Upiši samo iznos u dinarima, npr. 2.990.")).toBeInTheDocument()
    expect(createVetVisit).not.toHaveBeenCalled()
  })

  it("422 before_start → inline; a 5xx → the X error state", async () => {
    renderNew()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Razlog *"), "Kontrola")
    createVetVisit.mockResolvedValueOnce({
      ok: false,
      error: { code: "validation_failed", message: "x", fields: { follow_up_on: "before_start" } },
    })
    await user.click(screen.getByRole("button", { name: "Sačuvaj pregled" }))
    expect(screen.getByText("Kontrola mora biti posle datuma pregleda.")).toBeInTheDocument()
    createVetVisit.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "x" } })
    await user.click(screen.getByRole("button", { name: "Sačuvaj pregled" }))
    expect(screen.getByText("Nismo uspeli da sačuvamo pregled. Proveri označena polja i pokušaj ponovo.")).toBeInTheDocument()
  })

  it("English: en-GB amount format is parsed and the copy is translated", async () => {
    createVetVisit.mockResolvedValue({ ok: true, data: savedVisit() })
    renderNew({ locale: "en" })
    expect(screen.getByText("5 / 10 attachments")).toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Reason *"), "Eye check")
    await user.type(screen.getByLabelText("Cost (RSD)"), "2,990.50")
    await user.click(screen.getByRole("button", { name: "Save vet visit" }))
    expect(createVetVisit).toHaveBeenCalledWith(expect.objectContaining({ cost_minor: 299050 }))
    expect(toast).toHaveBeenCalledWith("Vet visit saved.")
  })
})

describe("Izmeni pregled — edit route (owner decision, Step 15)", () => {
  const visit = savedVisit({
    cost: { amount_minor: 299000, currency: "RSD" },
    follow_up_on: "2026-10-30",
    attachments: [attachment("a1", "nalaz-oko.pdf", "application/pdf", 860_000)],
  })

  it("preloads the visit and its saved attachments; the counter counts other visits separately", () => {
    render(<VetVisitFormClient pet={luna} visit={visit} attachmentLimit={10} attachmentCount={3} locale="sr" copy={copy("sr")} />)
    expect(screen.getByRole("heading", { level: 1, name: "Izmeni pregled" })).toBeInTheDocument()
    expect(screen.getByLabelText("Razlog *")).toHaveValue("Kontrola očiju")
    expect(screen.getByLabelText("Cena (RSD)")).toHaveValue("2.990")
    expect(screen.getByRole("button", { name: /^Datum kontrole/ })).toHaveTextContent("30. 10. 2026.")
    expect(screen.getByText("nalaz-oko.pdf")).toBeInTheDocument()
    expect(screen.getByText("3 / 10 priloga")).toBeInTheDocument()
    expect(screen.getByText("Free plan: do 10 priloga po ljubimcu. Luna već ima 2 na drugim pregledima.")).toBeInTheDocument()
  })

  it("EP-14 from S05: removing a saved file asks first, then deletes it and the counter decreases", async () => {
    deleteAttachment.mockResolvedValue({ ok: true, data: { deleted_attachment_id: "a1" } })
    render(<VetVisitFormClient pet={luna} visit={visit} attachmentLimit={10} attachmentCount={3} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Ukloni nalaz-oko.pdf" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Obrisati unos?" })
    await user.click(within(dialog).getByRole("button", { name: "Da, obriši" }))
    expect(deleteAttachment).toHaveBeenCalledWith({ attachment_id: "a1" })
    expect(screen.queryByText("nalaz-oko.pdf")).not.toBeInTheDocument()
    expect(screen.getByText("2 / 10 priloga")).toBeInTheDocument()
  })

  it("saves with EP-12 update", async () => {
    updateVetVisit.mockResolvedValue({ ok: true, data: visit })
    render(<VetVisitFormClient pet={luna} visit={visit} attachmentLimit={10} attachmentCount={3} locale="sr" copy={copy("sr")} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Sačuvaj izmene" }))
    expect(updateVetVisit).toHaveBeenCalledWith(VISIT, expect.objectContaining({ cost_minor: 299000, follow_up_on: "2026-10-30" }))
    expect(createVetVisit).not.toHaveBeenCalled()
  })
})
