import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MomentsActions, MomentsPet } from "@/app/(app)/ljubimci/[id]/trenuci/moments-client"
import type { Moment } from "@/lib/actions/moments"

// S08 Trenuci (Step 21) · FR-17 new-moment Dialog through EP-21 (at most 5 photos with an inline message;
// per-photo upload, then confirm), the Free counter "n / 5" and the PremiumLock in place of "Novi trenutak"
// at 5 moments (FR-36), no counter or limit on Premium; FR-18 "Podeli kao sliku" with the "Ukloni logo"
// Switch locked for Free (disabled, Premium badge, "Dostupno u Premiumu", trial link — owner decision) and
// working on Premium; FR-19 "Javni link" through EP-23; EP-22 delete through the card menu.

const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { MomentsClient } = await import("@/app/(app)/ljubimci/[id]/trenuci/moments-client")
const { dictionaries } = await import("@/lib/i18n")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const IVANA = "a1000000-0000-4000-8000-000000000001"
const OWNER = { role: "owner", can_edit: true, can_delete: true } as const
const MEMBER_OTHER = { role: "member", can_edit: false, can_delete: false } as const

const copy = (locale: "sr" | "en") => ({
  moments: dictionaries[locale].moments,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

const PET: MomentsPet = {
  id: LUNA,
  name: "Luna",
  sex: "female",
  species: "cat",
  species_other: null,
  breed: "Britanska kratkodlaka",
  lifecycle: "active",
  access: OWNER,
  can_log: true,
}

function moment(i: number, extra: Partial<Moment> = {}): Moment {
  return {
    id: `m${i}`,
    pet_id: LUNA,
    moment_date: `2026-10-${String(20 - i).padStart(2, "0")}`,
    text: `Trenutak ${i}`,
    photos: [{ id: `p${i}`, moment_id: `m${i}`, position: 1 }],
    photo_count: 1,
    public_link: null,
    created_by: IVANA,
    created_by_name: "Ivana Petrović",
    created_at: "2026-10-19T08:00:00Z",
    access: OWNER,
    ...extra,
  }
}

const listMoments = vi.fn()
const prepareMoment = vi.fn()
const confirmMoment = vi.fn()
const deleteMoment = vi.fn()
const setMomentPublicLink = vi.fn()
const getFileUrls = vi.fn()
const actions: MomentsActions = {
  listMoments: (...a) => listMoments(...a),
  prepareMoment: (...a) => prepareMoment(...a),
  confirmMoment: (...a) => confirmMoment(...a),
  deleteMoment: (...a) => deleteMoment(...a),
  setMomentPublicLink: (...a) => setMomentPublicLink(...a),
  getFileUrls: (...a) => getFileUrls(...a),
}
const upload = vi.fn()

function renderMoments(
  opts: { items?: Moment[]; total?: number; premium?: boolean; logoRemoval?: boolean; pet?: MomentsPet } = {},
) {
  const { items = [moment(1), moment(2), moment(3)], premium = false, pet = PET } = opts
  const total = opts.total ?? items.length
  const logoRemoval = opts.logoRemoval ?? premium
  return render(
    <MomentsClient
      pet={pet}
      moments={{ items, total }}
      photoUrls={{}}
      entitlements={{ premium, logo_removal: logoRemoval }}
      today="2026-10-19"
      locale="sr"
      copy={copy("sr")}
      actions={actions}
      upload={upload}
    />,
  )
}

const jpeg = (name: string, size = 1000) => new File([new Uint8Array(size)], name, { type: "image/jpeg" })

function addPhotos(files: File[]) {
  fireEvent.change(screen.getByTestId("moment-photo-input"), { target: { files } })
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  URL.createObjectURL ??= () => "blob:preview"
  URL.revokeObjectURL ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
  getFileUrls.mockResolvedValue({ ok: true, data: [] })
})

describe("S08 Free counter and limit (FR-17, FR-36)", () => {
  it("shows the Free counter n / 5 and the new-moment button below the limit", () => {
    renderMoments()
    expect(screen.getByText("Free plan")).toBeInTheDocument()
    expect(screen.getByText("3 / 5 trenutaka")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "3 od 5 trenutaka" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Novi trenutak" })).toBeInTheDocument()
    expect(screen.queryByText("Dostupno u Premiumu")).not.toBeInTheDocument()
  })

  it("replaces 'Novi trenutak' with the PremiumLock at 5 moments on Free (E-08)", () => {
    renderMoments({ items: [1, 2, 3, 4, 5].map((i) => moment(i)) })
    expect(screen.getByText("5 / 5 trenutaka")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Novi trenutak" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
    expect(
      screen.getByText("Na Free planu čuvaš do 5 trenutaka po ljubimcu. Uz Premium ih beležiš bez ograničenja."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Probaj 7 dana besplatno" })).toBeInTheDocument()
  })

  it("has no counter and no limit on Premium", () => {
    renderMoments({ items: [1, 2, 3, 4, 5, 6].map((i) => moment(i)), premium: true })
    expect(screen.queryByText("Free plan")).not.toBeInTheDocument()
    expect(screen.queryByText("Dostupno u Premiumu")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Novi trenutak" })).toBeInTheDocument()
  })

  it("shows the PremiumLock when step 1 answers premium_required", async () => {
    const user = userEvent.setup()
    prepareMoment.mockResolvedValue({ ok: false, error: { code: "premium_required", message: "x", details: { limit: "moments" } } })
    renderMoments()
    await user.click(screen.getByRole("button", { name: "Novi trenutak" }))
    await user.type(screen.getByLabelText("Tekst"), "Igra")
    await user.click(screen.getByRole("button", { name: "Sačuvaj trenutak" }))
    expect(await screen.findByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Novi trenutak" })).not.toBeInTheDocument()
  })

  it("shows the empty state with the gendered sentence when there are no moments", () => {
    renderMoments({ items: [] })
    expect(screen.getByRole("heading", { name: "Još nema trenutaka" })).toBeInTheDocument()
    expect(screen.getByText("Sačuvaj prvu fotografiju i par reči o tome šta je Luna danas radila.")).toBeInTheDocument()
    expect(screen.queryByText("Free plan")).not.toBeInTheDocument()
  })
})

describe("S08 new moment (FR-17, EP-21)", () => {
  it("blocks a 6th photo with an inline message in the Dialog", async () => {
    const user = userEvent.setup()
    renderMoments()
    await user.click(screen.getByRole("button", { name: "Novi trenutak" }))
    const dialog = screen.getByRole("dialog")
    addPhotos([1, 2, 3, 4, 5, 6].map((i) => jpeg(`foto-${i}.jpg`)))
    expect(within(dialog).getByText("Trenutak može imati najviše 5 fotografija.")).toBeInTheDocument()
    expect(within(dialog).getByText("5 / 5 fotografija")).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Dodaj" })).not.toBeInTheDocument()
    expect(prepareMoment).not.toHaveBeenCalled()
  })

  it("shows too_many_photos from the server inline as well", async () => {
    const user = userEvent.setup()
    prepareMoment.mockResolvedValue({ ok: false, error: { code: "too_many_photos", message: "x" } })
    renderMoments()
    await user.click(screen.getByRole("button", { name: "Novi trenutak" }))
    addPhotos([jpeg("a.jpg")])
    await user.click(screen.getByRole("button", { name: "Sačuvaj trenutak" }))
    expect(await within(screen.getByRole("dialog")).findByText("Trenutak može imati najviše 5 fotografija.")).toBeInTheDocument()
  })

  it("rejects other file types and photos over 10 MB, and needs a photo or text", async () => {
    const user = userEvent.setup()
    renderMoments()
    await user.click(screen.getByRole("button", { name: "Novi trenutak" }))
    addPhotos([new File(["x"], "a.gif", { type: "image/gif" })])
    expect(screen.getByText("Dozvoljene su JPG, PNG, WEBP i HEIC fotografije.")).toBeInTheDocument()
    addPhotos([jpeg("big.jpg", 10_485_761)])
    expect(screen.getByText("Fotografija je veća od 10 MB.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sačuvaj trenutak" }))
    expect(screen.getByText("Dodaj fotografiju ili tekst.")).toBeInTheDocument()
    expect(prepareMoment).not.toHaveBeenCalled()
  })

  it("prepares, uploads each photo with progress, confirms, then shows the new moment and a toast", async () => {
    const user = userEvent.setup()
    const tickets = [1, 2].map((n) => ({
      upload_token: "md_x.y",
      put_url: `https://r2.test/put/${n}`,
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": "1000" },
      expires_at: "2026-10-19T08:10:00Z",
      file_name: `foto-${n}.jpg`,
      position: n,
    }))
    prepareMoment.mockResolvedValue({ ok: true, data: { draft_token: "md_x.y", tickets } })
    upload.mockImplementation(async (_t, _f, onProgress: (p: number) => void) => {
      onProgress(50)
      return true
    })
    const saved = moment(9, { moment_date: "2026-10-19", text: "Prvi sneg", photo_count: 2 })
    confirmMoment.mockResolvedValue({ ok: true, data: saved })
    renderMoments()

    await user.click(screen.getByRole("button", { name: "Novi trenutak" }))
    addPhotos([jpeg("foto-1.jpg"), jpeg("foto-2.jpg")])
    expect(screen.getByText("2 / 5 fotografija")).toBeInTheDocument()
    await user.type(screen.getByLabelText("Tekst"), "Prvi sneg")
    expect(screen.getByText("9 / 280")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sačuvaj trenutak" }))

    await waitFor(() => expect(toast).toHaveBeenCalledWith("Trenutak sačuvan"))
    expect(prepareMoment).toHaveBeenCalledWith({
      pet_id: LUNA,
      moment_date: "2026-10-19",
      text: "Prvi sneg",
      photos: [
        { file_name: "foto-1.jpg", mime_type: "image/jpeg", size_bytes: 1000 },
        { file_name: "foto-2.jpg", mime_type: "image/jpeg", size_bytes: 1000 },
      ],
    })
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls.map((c) => [c[0].put_url, (c[1] as File).name])).toEqual([
      ["https://r2.test/put/1", "foto-1.jpg"],
      ["https://r2.test/put/2", "foto-2.jpg"],
    ])
    expect(confirmMoment).toHaveBeenCalledWith({ draft_token: "md_x.y" })
    expect(screen.getByText("Prvi sneg")).toBeInTheDocument()
    expect(screen.getByText("4 / 5 trenutaka")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

describe("S08 share as image (FR-18)", () => {
  it("keeps the 'Ukloni logo' Switch locked for Free: disabled, Premium badge, 'Dostupno u Premiumu', trial link", async () => {
    const user = userEvent.setup()
    renderMoments()
    await user.click(screen.getAllByRole("button", { name: "Podeli kao sliku" })[0])
    const dialog = screen.getByRole("dialog")
    const lock = within(dialog).getByRole("switch", { name: "Ukloni logo" })
    expect(lock).toBeDisabled()
    expect(lock).toHaveAccessibleDescription("Dostupno u Premiumu")
    expect(within(dialog).getByText("Premium")).toBeInTheDocument()
    expect(within(dialog).getByText("Uklanjanje logoa je deo Premiuma.")).toBeInTheDocument()
    expect(within(dialog).getByRole("link", { name: "Probaj 7 dana besplatno" })).toHaveAttribute("href", "/premium")
    const card = within(dialog).getByTestId("share-card")
    expect(within(card).getByText("Luna")).toBeInTheDocument()
    expect(within(card).getByText("19. 10. 2026.")).toBeInTheDocument()
    expect(within(card).getByRole("img", { name: "Moj Ljubimac" })).toBeInTheDocument()
  })

  it("lets a Premium user with logo_removal switch the logo off in the preview", async () => {
    const user = userEvent.setup()
    renderMoments({ premium: true })
    await user.click(screen.getAllByRole("button", { name: "Podeli kao sliku" })[0])
    const dialog = screen.getByRole("dialog")
    const card = within(dialog).getByTestId("share-card")
    expect(within(card).getByRole("img", { name: "Moj Ljubimac" })).toBeInTheDocument()
    expect(within(dialog).queryByText("Uklanjanje logoa je deo Premiuma.")).not.toBeInTheDocument()
    const toggle = within(dialog).getByRole("switch", { name: "Ukloni logo" })
    expect(toggle).toBeEnabled()
    await user.click(toggle)
    expect(within(card).queryByRole("img", { name: "Moj Ljubimac" })).not.toBeInTheDocument()
  })
})

describe("S08 public link (FR-19, EP-23) and delete (EP-22)", () => {
  it("turns the public link on through EP-23 and shows the address to copy", async () => {
    const user = userEvent.setup()
    setMomentPublicLink.mockResolvedValue({
      ok: true,
      data: { slug: "Ab3dEf6hIj9kLm2nOp5qRs", active: true, url: "https://mojljubimac.rs/t/Ab3dEf6hIj9kLm2nOp5qRs" },
    })
    renderMoments()
    await user.click(screen.getAllByRole("button", { name: "Javni link" })[0])
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Kad isključiš link, ko god ga otvori videće poruku da trenutak više nije javan.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("switch", { name: "Link je isključen" }))
    expect(setMomentPublicLink).toHaveBeenCalledWith({ moment_id: "m1", active: true })
    expect(await within(dialog).findByLabelText("Adresa")).toHaveValue("https://mojljubimac.rs/t/Ab3dEf6hIj9kLm2nOp5qRs")
    expect(within(dialog).getByRole("switch", { name: "Link je uključen" })).toBeChecked()
    await user.click(within(dialog).getByRole("button", { name: "Gotovo" }))
    expect(screen.getByText("Javni link je uključen")).toBeInTheDocument()
  })

  it("deletes a moment through the card menu and the AlertDialog", async () => {
    const user = userEvent.setup()
    deleteMoment.mockResolvedValue({ ok: true, data: { deleted_moment_id: "m1" } })
    renderMoments()
    await user.click(screen.getAllByRole("button", { name: "Još opcija" })[0])
    await user.click(await screen.findByRole("menuitem", { name: "Obriši" }))
    const alert = screen.getByRole("alertdialog")
    expect(within(alert).getByText("Obrisati trenutak?")).toBeInTheDocument()
    expect(within(alert).getByText("Brišu se fotografije i javni link. Ovo ne može da se poništi.")).toBeInTheDocument()
    await user.click(within(alert).getByRole("button", { name: "Da, obriši" }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Trenutak obrisan"))
    expect(deleteMoment).toHaveBeenCalledWith({ moment_id: "m1" })
    expect(screen.queryByText("Trenutak 1")).not.toBeInTheDocument()
    expect(screen.getByText("2 / 5 trenutaka")).toBeInTheDocument()
  })

  it("hides the menu and the public-link button on a moment the member did not create (BR-23)", () => {
    renderMoments({ items: [moment(1, { access: MEMBER_OTHER })], pet: { ...PET, access: { role: "member", can_edit: false, can_delete: false } } })
    expect(screen.queryByRole("button", { name: "Još opcija" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Javni link" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Podeli kao sliku" })).toBeInTheDocument()
  })
})
