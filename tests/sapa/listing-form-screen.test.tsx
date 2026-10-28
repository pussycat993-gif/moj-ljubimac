import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Listing, MarketplaceStatus } from "@/lib/actions/listings"
import type { City } from "@/lib/actions/registration"

vi.mock("server-only", () => ({}))

// S34 Novi / izmeni oglas (FR-63, FR-64, OQ-17 d) — the client with fake EP-75 / EP-77 / EP-13 actions.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => "/sapa-pomoci/nova",
}))

const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { ListingFormClient } = await import("@/app/(sapa)/sapa-pomoci/nova/listing-form-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en") => ({
  form: dictionaries[locale].sapa.form,
  common: dictionaries[locale].sapa.common,
  app: dictionaries[locale].common,
})

const LISTING_ID = "d1000000-0000-4000-8000-000000000001"
const NOVI_SAD = "b1000000-0000-4000-8000-000000000001"
const BEOGRAD = "b1000000-0000-4000-8000-000000000002"
const cities: City[] = [
  { id: BEOGRAD, name_sr: "Beograd", name_en: "Belgrade", latitude: 44.8, longitude: 20.46 },
  { id: NOVI_SAD, name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.25, longitude: 19.84 },
]

const owner: MarketplaceStatus = {
  suspended_at: null,
  active_listings: 1,
  active_listing_limit: 3,
  can_post_need: false,
  need_organisation: null,
  unread_conversations: 0,
}
const shelter: MarketplaceStatus = {
  ...owner,
  active_listing_limit: null,
  can_post_need: true,
  need_organisation: { id: "e1000000-0000-4000-8000-000000000001", name: "Azil „Druga šansa“" },
}

function photo(n: number) {
  return {
    id: `f100000${n}-0000-4000-8000-000000000001`,
    listing_id: LISTING_ID,
    position: n,
    file_name: `transporter-${n}.jpg`,
    url: null,
  }
}

const carrier: Listing = {
  id: LISTING_ID,
  type: "selling",
  title: "Prodajem transporter za psa",
  description: "Plastični transporter za pse do 12 kg. Preuzimanje na Limanu.",
  category: "carriers",
  species: "dog",
  city: cities[1],
  price: { amount_minor: 250000, currency: "RSD" },
  price_negotiable: false,
  status: "active",
  resolved_outcome: null,
  resolved_at: null,
  published_at: "2026-10-19T10:00:00Z",
  expires_at: "2026-11-18T10:00:00Z",
  days_left: 20,
  photos: [photo(1), photo(2), photo(3), photo(4)],
  author: {
    kind: "user",
    user_id: "a1000000-0000-4000-8000-000000000001",
    display_name: "Marko",
    initials: "M",
    city: cities[1],
    member_since: "2026-09-01T00:00:00Z",
    active_listing_count: 1,
    organisation_id: null,
    organisation_slug: null,
  },
  has_donation_info: false,
  viewer: { signed_in: true, is_author: true, my_conversation_id: null, can_message: false, conversation_count: 0 },
  created_at: "2026-10-19T10:00:00Z",
  updated_at: "2026-10-19T10:00:00Z",
}

const saveListing = vi.fn()
const changeListing = vi.fn()
const requestUpload = vi.fn()
const confirmUpload = vi.fn()
const actions = { saveListing, changeListing, requestUpload, confirmUpload } as unknown as Parameters<
  typeof ListingFormClient
>[0]["actions"]

function renderForm(props: { marketplace?: MarketplaceStatus; listing?: Listing | null; locale?: "sr" | "en" } = {}) {
  const locale = props.locale ?? "sr"
  return render(
    <ListingFormClient
      listing={props.listing ?? null}
      marketplace={props.marketplace ?? owner}
      defaultCityId={NOVI_SAD}
      cities={cities}
      locale={locale}
      copy={copy(locale)}
      actions={actions}
    />,
  )
}

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
  push.mockClear()
  refresh.mockClear()
  toast.mockClear()
  toast.error.mockClear()
  saveListing.mockReset()
  changeListing.mockReset()
  requestUpload.mockReset()
  confirmUpload.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type User = ReturnType<typeof userEvent.setup>

async function choose(user: User, field: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: field }))
  await user.click(await screen.findByRole("option", { name: option }))
}

async function fillBasics(user: User, title = "Poklanjam grebalicu za mačke") {
  await user.type(screen.getByLabelText("Naslov *"), title)
  await user.type(screen.getByLabelText("Opis *"), "Malo korišćena, preuzimanje na Limanu.")
  await choose(user, "Kategorija *", "Oprema i igračke")
  await choose(user, "Za koga *", "Mačke")
}

function categoryOptions() {
  return screen.getAllByRole("option").map((o) => o.textContent)
}

describe("S34 type tiles — FR-63 #2", () => {
  it("an owner without shelter membership is not offered Potreba and sees the shelter-only note", () => {
    renderForm()
    expect(screen.getByRole("heading", { level: 1, name: "Novi oglas" })).toBeInTheDocument()
    expect(screen.getByText("Aktivni oglasi: 1 / 3 na Free planu")).toBeInTheDocument()
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([
      "Poklanjam",
      "Prodajem",
      "Tražim",
    ])
    expect(screen.queryByRole("radio", { name: "Potreba" })).not.toBeInTheDocument()
    expect(screen.getByText("Potrebe sa dugmetom „Doniraj“ objavljuju samo odobreni azili.")).toBeInTheDocument()
  })

  it("a shelter member gets Potreba preselected; saving sends type need, then toast and redirect to S33", async () => {
    saveListing.mockResolvedValue({ ok: true, data: { ...carrier, type: "need", price: null, photos: [] } })
    const user = userEvent.setup()
    renderForm({ marketplace: shelter })
    expect(screen.getByText("Azil „Druga šansa“ · bez ograničenja broja oglasa")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Potreba" })).toBeChecked()
    expect(screen.queryByText("Potrebe sa dugmetom „Doniraj“ objavljuju samo odobreni azili.")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Proveri podatke za donacije" })).toHaveAttribute("href", "/organizacija/profil")
    await user.type(screen.getByLabelText("Naslov *"), "Potrebno 20 kg granula za odrasle pse")
    await user.type(screen.getByLabelText("Opis *"), "Granule za odrasle pse, bilo koji brend.")
    await choose(user, "Kategorija *", "Hrana")
    await choose(user, "Za koga *", "Psi")
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/sapa-pomoci/${LISTING_ID}`))
    expect(saveListing).toHaveBeenCalledWith({
      type: "need",
      title: "Potrebno 20 kg granula za odrasle pse",
      description: "Granule za odrasle pse, bilo koji brend.",
      category: "food",
      species: "dog",
      city_id: NOVI_SAD,
      price: null,
      price_negotiable: false,
    })
    expect(toast).toHaveBeenCalledWith("Oglas je objavljen i aktivan je do 18. 11. 2026.")
  })
})

describe("S34 categories — FR-63 #3", () => {
  it("Lekovi i nega is offered only for Potreba; switching away clears it", async () => {
    const user = userEvent.setup()
    renderForm({ marketplace: shelter })
    expect(screen.getByText("„Lekovi i nega“ je dostupno samo za potrebe azila.")).toBeInTheDocument()
    await user.click(screen.getByRole("combobox", { name: "Kategorija *" }))
    expect(categoryOptions()).toContain("Lekovi i nega")
    await user.click(screen.getByRole("option", { name: "Lekovi i nega" }))
    expect(screen.getByRole("combobox", { name: "Kategorija *" })).toHaveTextContent("Lekovi i nega")
    await user.click(screen.getByRole("radio", { name: "Poklanjam" }))
    expect(screen.getByRole("combobox", { name: "Kategorija *" })).toHaveTextContent("Izaberi")
    await user.click(screen.getByRole("combobox", { name: "Kategorija *" }))
    expect(categoryOptions()).not.toContain("Lekovi i nega")
  })

  it("category_not_allowed from EP-75 shows under Kategorija", async () => {
    saveListing.mockResolvedValue({
      ok: false,
      error: { code: "category_not_allowed", message: "x", fields: { category: "not_allowed" } },
    })
    const user = userEvent.setup()
    renderForm()
    await fillBasics(user)
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    const message = await screen.findByText("Lekovi i nega mogu da budu samo potreba azila.")
    expect(message).toHaveAttribute("id", "l-category-error")
    expect(screen.getByRole("combobox", { name: "Kategorija *" })).toHaveAttribute("aria-invalid", "true")
    expect(push).not.toHaveBeenCalled()
  })
})

describe("S34 price — FR-63 #4", () => {
  it("selling without an amount and without Po dogovoru → inline error, no save", async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole("radio", { name: "Prodajem" }))
    await fillBasics(user)
    expect(screen.getByLabelText("Cena u dinarima *")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    expect(screen.getByText("Upiši cenu u dinarima ili označi „Po dogovoru“.")).toBeInTheDocument()
    expect(saveListing).not.toHaveBeenCalled()
  })

  it("an amount is sent as Money in para (whole RSD × 100)", async () => {
    saveListing.mockResolvedValue({ ok: true, data: carrier })
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole("radio", { name: "Prodajem" }))
    await fillBasics(user)
    await user.type(screen.getByLabelText("Cena u dinarima *"), "2.500")
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    await vi.waitFor(() => expect(saveListing).toHaveBeenCalledTimes(1))
    expect(saveListing.mock.calls[0][0]).toMatchObject({
      type: "selling",
      price: { amount_minor: 250000, currency: "RSD" },
      price_negotiable: false,
    })
  })

  it("Po dogovoru disables the amount and sends price null with price_negotiable", async () => {
    saveListing.mockResolvedValue({ ok: true, data: carrier })
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole("radio", { name: "Prodajem" }))
    await fillBasics(user)
    await user.click(screen.getByRole("checkbox", { name: "Po dogovoru" }))
    expect(screen.getByLabelText("Cena u dinarima")).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    await vi.waitFor(() => expect(saveListing).toHaveBeenCalledTimes(1))
    expect(saveListing.mock.calls[0][0]).toMatchObject({ type: "selling", price: null, price_negotiable: true })
  })
})

describe("S34 photos — FR-63 #5", () => {
  it("new photos are uploaded through EP-13 after EP-75 created the listing", async () => {
    saveListing.mockResolvedValue({ ok: true, data: { ...carrier, type: "giving", price: null, photos: [] } })
    requestUpload.mockResolvedValue({
      ok: true,
      data: {
        upload_token: "up_1",
        put_url: "https://r2.test/put",
        method: "PUT",
        headers: { "Content-Type": "image/png", "Content-Length": "4" },
        expires_at: "2026-10-29T10:00:00Z",
        file_name: "grebalica.png",
        position: 1,
      },
    })
    confirmUpload.mockResolvedValue({ ok: true, data: { ...photo(1), file_name: "grebalica.png" } })
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderForm()
    const file = new File(["abcd"], "grebalica.png", { type: "image/png" })
    await user.upload(screen.getByTestId("listing-photo-input"), file)
    expect(screen.getByTestId("photo-count")).toHaveTextContent("1 / 5")
    expect(screen.getByText("Naslovna")).toBeInTheDocument()
    await fillBasics(user)
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/sapa-pomoci/${LISTING_ID}`))
    expect(saveListing.mock.calls[0][0]).not.toHaveProperty("photo_ids")
    expect(requestUpload).toHaveBeenCalledWith({
      purpose: "listing_photo",
      target_id: LISTING_ID,
      file_name: "grebalica.png",
      mime_type: "image/png",
      size_bytes: 4,
    })
    expect(fetchMock).toHaveBeenCalledWith("https://r2.test/put", expect.objectContaining({ method: "PUT", body: file }))
    expect(confirmUpload).toHaveBeenCalledWith({ upload_token: "up_1" })
  })

  it("with 5 photos the counter shows 5 / 5 and the Dodaj tile is gone", async () => {
    const user = userEvent.setup()
    renderForm({ listing: carrier })
    expect(screen.getByTestId("photo-count")).toHaveTextContent("4 / 5")
    expect(screen.getByRole("button", { name: "Dodaj" })).toBeInTheDocument()
    await user.upload(screen.getByTestId("listing-photo-input"), [
      new File(["a"], "peta.jpg", { type: "image/jpeg" }),
      new File(["b"], "sesta.jpg", { type: "image/jpeg" }),
    ])
    expect(screen.getByTestId("photo-count")).toHaveTextContent("5 / 5")
    expect(screen.queryByRole("button", { name: "Dodaj" })).not.toBeInTheDocument()
    expect(screen.getByTestId("listing-photo-input")).toBeDisabled()
    expect(screen.queryByText("sesta.jpg")).not.toBeInTheDocument()
  })

  it("too_many_photos from the ticket shows the inline photo error and keeps the form open", async () => {
    saveListing.mockResolvedValue({ ok: true, data: carrier })
    requestUpload.mockResolvedValue({ ok: false, error: { code: "too_many_photos", message: "x" } })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderForm({ listing: carrier })
    await user.upload(screen.getByTestId("listing-photo-input"), new File(["a"], "peta.jpg", { type: "image/jpeg" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj izmene" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Do 5 fotografija, JPG ili PNG do 10 MB. Prva je naslovna.")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByText("peta.jpg")).toBeInTheDocument()
  })
})

describe("S34 Free limit — FR-63 #6", () => {
  it("premium_required (limit listings) from EP-75 → PremiumLock over the form", async () => {
    saveListing.mockResolvedValue({
      ok: false,
      error: { code: "premium_required", message: "x", details: { limit: "listings" } },
    })
    const user = userEvent.setup()
    renderForm()
    await fillBasics(user)
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    expect(await screen.findByText("Dostupno u Premiumu")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Na Free planu možeš imati 3 aktivna oglasa. Sa Premiumom objavljuješ koliko god želiš — ili označi neki oglas kao rešen.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("Aktivni oglasi: 3 / 3 na Free planu")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Probaj 7 dana besplatno" }))
    expect(push).toHaveBeenCalledWith("/premium")
  })

  it("a Free owner at the limit sees the lock straight away", () => {
    renderForm({ marketplace: { ...owner, active_listings: 3 } })
    expect(screen.getByText("Dostupno u Premiumu")).toBeInTheDocument()
  })

  it("a suspended user sees the S card instead of the form", () => {
    renderForm({ marketplace: { ...owner, suspended_at: "2026-10-20T10:00:00Z" } })
    expect(screen.getByRole("heading", { name: "Ne možeš da objavljuješ oglase" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Objavi oglas" })).not.toBeInTheDocument()
  })
})

describe("S34 limits — OQ-17 (d)", () => {
  it("description counter is N / 2000 and 2001 characters → inline error", async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.getByText("0 / 2000")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Opis *"), { target: { value: "a".repeat(2001) } })
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    expect(screen.getByText("Opis može imati najviše 2000 znakova.")).toBeInTheDocument()
    expect(saveListing).not.toHaveBeenCalled()
  })

  it("a title under 5 characters → inline error, no save", async () => {
    const user = userEvent.setup()
    renderForm()
    await fillBasics(user, "Kav")
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    expect(screen.getByText("Naslov ima bar 5 znakova, npr. „Poklanjam grebalicu za mačke“.")).toBeInTheDocument()
    expect(screen.getByLabelText("Naslov *")).toHaveAttribute("aria-invalid", "true")
    expect(saveListing).not.toHaveBeenCalled()
  })

  it("server 422 fields map to inline errors; a 5xx shows the X alert and keeps the text", async () => {
    saveListing.mockResolvedValueOnce({
      ok: false,
      error: { code: "validation_failed", message: "x", fields: { description: "too_long" } },
    })
    saveListing.mockResolvedValueOnce({ ok: false, error: { code: "internal", message: "boom" } })
    const user = userEvent.setup()
    renderForm()
    await fillBasics(user)
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    expect(await screen.findByText("Opis može imati najviše 2000 znakova.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Objavi oglas" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Oglas nije sačuvan — veza je prekinuta. Tvoj tekst je i dalje ovde, pokušaj ponovo.",
    )
    expect(screen.getByLabelText("Naslov *")).toHaveValue("Poklanjam grebalicu za mačke")
  })
})

describe("S34 edit — FR-64", () => {
  it("preloads the listing; Sačuvaj izmene sends the id and the kept photo ids, then toast and S33", async () => {
    saveListing.mockResolvedValue({ ok: true, data: carrier })
    const user = userEvent.setup()
    renderForm({ listing: carrier })
    expect(screen.getByRole("heading", { level: 1, name: "Izmeni oglas" })).toBeInTheDocument()
    expect(screen.getByLabelText("Naslov *")).toHaveValue("Prodajem transporter za psa")
    expect(screen.getByLabelText("Opis *")).toHaveValue(carrier.description)
    expect(screen.getByRole("radio", { name: "Prodajem" })).toBeChecked()
    expect(screen.queryByRole("radio", { name: "Potreba" })).not.toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Kategorija *" })).toHaveTextContent("Transporteri")
    expect(screen.getByRole("combobox", { name: "Za koga *" })).toHaveTextContent("Psi")
    expect(screen.getByRole("combobox", { name: "Grad *" })).toHaveTextContent("Novi Sad")
    expect(screen.getByLabelText("Cena u dinarima *")).toHaveValue("2500")
    expect(screen.queryByRole("button", { name: "Objavi oglas" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Ukloni fotografiju 2" }))
    expect(screen.getByTestId("photo-count")).toHaveTextContent("3 / 5")
    await user.click(screen.getByRole("button", { name: "Sačuvaj izmene" }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/sapa-pomoci/${LISTING_ID}`))
    expect(saveListing).toHaveBeenCalledWith(
      expect.objectContaining({
        id: LISTING_ID,
        type: "selling",
        price: { amount_minor: 250000, currency: "RSD" },
        photo_ids: [photo(1).id, photo(3).id, photo(4).id],
      }),
    )
    expect(toast).toHaveBeenCalledWith("Izmene su sačuvane.")
  })

  it("a need listing cannot change type; Obriši oglas → Da, obriši → EP-77 delete and S35", async () => {
    changeListing.mockResolvedValue({ ok: true, data: { deleted_listing_id: LISTING_ID } })
    const user = userEvent.setup()
    renderForm({ listing: { ...carrier, type: "need", price: null, category: "food" }, marketplace: shelter })
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Potreba"])
    await user.click(screen.getByRole("button", { name: "Obriši oglas" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Obrisati oglas?")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Da, obriši" }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/sapa-pomoci/moje"))
    expect(changeListing).toHaveBeenCalledWith({ listing_id: LISTING_ID, op: "delete", confirm: true })
  })

  it("renders in English with the en dictionary", () => {
    renderForm({ listing: carrier, locale: "en" })
    expect(screen.getByRole("heading", { level: 1, name: "Edit listing" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Category *" })).toHaveTextContent("Carriers")
  })
})
