import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ListingDetailActions } from "@/app/(sapa)/sapa-pomoci/[id]/listing-detail-client"
import type { Listing } from "@/lib/actions/listings"
import type { DonationInfo } from "@/lib/actions/organisation"

// S33 Oglas (Step 28b) · FR-62, FR-66, FR-67 #3, OQ-17 · states from EP-74 (API §7.3): default / need, signed_out
// (viewer.signed_in), own (viewer.is_author), the author's resolved variant, unavailable (404), error (5xx).
// GET /api/public/listings/:id is a mocked global fetch; EP-77 changeListing and EP-78 getDonationInfo are fakes.

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const toast = { success: vi.fn(), error: vi.fn() }
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { ListingDetailClient } = await import("@/app/(sapa)/sapa-pomoci/[id]/listing-detail-client")
const { dictionaries } = await import("@/lib/i18n")

const ID = "a1000000-0000-4000-8000-000000000001"
const MARKO = "b1000000-0000-4000-8000-000000000002"
const NOVI_SAD = { id: "c1", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 0, longitude: 0 }

const copy = (locale: "sr" | "en" = "sr") => ({
  detail: dictionaries[locale].sapa.detail,
  sapa: dictionaries[locale].sapa.common,
  common: dictionaries[locale].common,
})

function listing(extra: Partial<Listing> = {}, viewer: Partial<Listing["viewer"]> = {}): Listing {
  return {
    id: ID,
    type: "selling",
    title: "Prodajem transporter za psa",
    description: "Plastični transporter za pse do 12 kg.",
    category: "carriers",
    species: "dog",
    city: NOVI_SAD,
    price: { amount_minor: 250_000, currency: "RSD" },
    price_negotiable: false,
    status: "active",
    resolved_outcome: null,
    resolved_at: null,
    published_at: "2026-10-18T10:00:00Z",
    expires_at: "2026-11-17T10:00:00Z",
    days_left: 19,
    photos: [
      { id: "p2", listing_id: ID, position: 2, file_name: "b.jpg", url: { kind: "listing_photo", id: "p2", url: "https://r2.test/b.jpg", expires_at: null, mime_type: null } },
      { id: "p1", listing_id: ID, position: 1, file_name: "a.jpg", url: { kind: "listing_photo", id: "p1", url: "https://r2.test/a.jpg", expires_at: null, mime_type: null } },
    ],
    author: {
      kind: "user",
      user_id: MARKO,
      display_name: "Marko J.",
      initials: "MJ",
      city: NOVI_SAD,
      member_since: "2026-09-10T10:00:00Z",
      active_listing_count: 3,
      organisation_id: null,
      organisation_slug: null,
    },
    has_donation_info: false,
    viewer: { signed_in: true, is_author: false, my_conversation_id: null, can_message: true, conversation_count: null, ...viewer },
    created_at: "2026-10-18T10:00:00Z",
    updated_at: "2026-10-18T10:00:00Z",
    ...extra,
  }
}

function needListing(extra: Partial<Listing> = {}, viewer: Partial<Listing["viewer"]> = {}): Listing {
  return listing(
    {
      type: "need",
      title: "Potrebno 20 kg granula za odrasle pse",
      category: "food",
      price: null,
      photos: [],
      has_donation_info: true,
      author: {
        kind: "shelter",
        user_id: "b2",
        display_name: "Azil „Druga šansa“",
        initials: "DŠ",
        city: NOVI_SAD,
        member_since: "2026-03-01T10:00:00Z",
        active_listing_count: 4,
        organisation_id: "o1",
        organisation_slug: "druga-sansa",
      },
      ...extra,
    },
    viewer,
  )
}

const donation: DonationInfo = {
  organisation_id: "o1",
  organisation_name: "Azil „Druga šansa“",
  city: NOVI_SAD,
  bank_account: "160-0000012345678-90",
  payment_url: "https://drugasansa.rs/doniraj",
  dropoff_address: "Temerinski put 120, Novi Sad",
  dropoff_hours: "Subota 10:00 – 14:00",
  payment_purpose: "Donacija — Potrebno 20 kg granula za odrasle pse",
  has_any: true,
}

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body ?? { code: "not_found" }), { status }))
  vi.stubGlobal("fetch", fn)
  return fn
}

function fakeActions(info: DonationInfo = donation) {
  return {
    changeListing: vi.fn<ListingDetailActions["changeListing"]>(),
    getDonationInfo: vi.fn<ListingDetailActions["getDonationInfo"]>(async () => ({ ok: true as const, data: info })),
  }
}

function renderScreen(a = fakeActions(), { suspended = false, locale = "sr" as "sr" | "en" } = {}) {
  render(<ListingDetailClient listingId={ID} locale={locale} suspended={suspended} copy={copy(locale)} actions={a} />)
  return a
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("S33 — default (EP-74)", () => {
  it("FR-62 #1: gallery, tags, price, dates and the author card linking to S37", async () => {
    const fetchMock = mockFetch(200, listing())
    renderScreen()
    expect(await screen.findByRole("heading", { level: 1, name: "Prodajem transporter za psa" })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`/api/public/listings/${ID}`, { cache: "no-store" })

    // Gallery by position: photo 1 first, thumbnails switch the main photo.
    expect(screen.getByRole("img", { name: "Fotografija 1 od 2: Prodajem transporter za psa" })).toHaveAttribute("src", "https://r2.test/a.jpg")
    await userEvent.click(screen.getByRole("button", { name: "Prikaži fotografiju 2" }))
    expect(screen.getByRole("img", { name: "Fotografija 2 od 2: Prodajem transporter za psa" })).toHaveAttribute("src", "https://r2.test/b.jpg")

    expect(screen.getByText("Prodajem")).toBeInTheDocument()
    expect(screen.getByText("Transporteri")).toBeInTheDocument()
    expect(screen.getByText("Psi")).toBeInTheDocument()
    expect(screen.getByText("2.500 RSD")).toBeInTheDocument()
    expect(screen.getByText("Plastični transporter za pse do 12 kg.")).toBeInTheDocument()
    expect(screen.getByText("Objavljeno 18. 10. 2026.")).toBeInTheDocument()
    expect(screen.getByText("Aktivan do 17. 11. 2026.")).toBeInTheDocument()

    expect(screen.getByText("Marko J.")).toBeInTheDocument()
    expect(screen.getByText("Novi Sad · član od septembra 2026.")).toBeInTheDocument()
    expect(screen.getByText("Aktivnih oglasa: 3")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Pogledaj profil" })).toHaveAttribute("href", `/korisnik/${MARKO}`)
    expect(screen.getByRole("button", { name: "Pošalji poruku" })).toBeInTheDocument()
    expect(screen.getByText(/Stvari razmenjuj uživo/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Doniraj" })).not.toBeInTheDocument()
  })

  it("FR-62 #1: negotiable price → Po dogovoru; no photos → placeholder", async () => {
    mockFetch(200, listing({ price: null, price_negotiable: true, photos: [] }))
    renderScreen()
    expect(await screen.findByText("Po dogovoru")).toBeInTheDocument()
    expect(screen.getByText("Fotografija 1 od 1: Prodajem transporter za psa")).toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })

  it("giving shows Besplatno; English formats dates and prices", async () => {
    mockFetch(200, listing({ type: "giving", price: null }))
    renderScreen(fakeActions(), { locale: "en" })
    expect(await screen.findByText("Free")).toBeInTheDocument()
    expect(screen.getByText("Posted 18 Oct 2026")).toBeInTheDocument()
    expect(screen.getByText("Novi Sad · member since September 2026")).toBeInTheDocument()
  })

  it("FR-62 #2 / FR-67 #3: a need with donation info shows Doniraj; the shelter card links to /o/<slug>", async () => {
    mockFetch(200, needListing())
    renderScreen()
    expect(await screen.findByRole("button", { name: "Doniraj" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Pomozi azilu" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pošalji poruku azilu" })).toBeInTheDocument()
    expect(screen.getByText("Objavio azil")).toBeInTheDocument()
    expect(screen.getByText("Azil „Druga šansa“")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Javna stranica azila" })).toHaveAttribute("href", "/o/druga-sansa")
    expect(screen.queryByText(/RSD|Po dogovoru|Besplatno/)).not.toBeInTheDocument()
  })

  it("a need without donation info has no Doniraj", async () => {
    mockFetch(200, needListing({ has_donation_info: false }))
    renderScreen()
    await screen.findByRole("heading", { level: 1 })
    expect(screen.queryByRole("button", { name: "Doniraj" })).not.toBeInTheDocument()
  })
})

describe("S33 — unavailable, error, loading", () => {
  it("FR-62 #3: 404 → Oglas nije dostupan", async () => {
    mockFetch(404)
    renderScreen()
    expect(await screen.findByRole("heading", { name: "Oglas nije dostupan", level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/Oglas je istekao, uklonjen/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Nazad na Šapu pomoći" })).toHaveAttribute("href", "/sapa-pomoci")
  })

  it("5xx → error with retry, which reloads", async () => {
    const fetchMock = mockFetch(500, { code: "internal_error" })
    renderScreen()
    expect(screen.getByLabelText("Učitavanje")).toBeInTheDocument()
    await userEvent.click(await screen.findByRole("button", { name: "Pokušaj ponovo" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})

describe("S33 — signed out", () => {
  it("message → sign-in prompt with next back to the listing", async () => {
    mockFetch(200, listing({}, { signed_in: false, can_message: false }))
    renderScreen()
    const link = await screen.findByRole("link", { name: "Prijavi se da pošalješ poruku" })
    expect(link).toHaveAttribute("href", `/prijava?next=${encodeURIComponent(`/sapa-pomoci/${ID}`)}`)
    expect(screen.getByRole("link", { name: "Napravi nalog" })).toHaveAttribute("href", "/registracija")
    expect(screen.queryByRole("button", { name: "Pošalji poruku" })).not.toBeInTheDocument()
  })

  it("FR-66 #2: Doniraj → sign-in with next back to the listing; EP-78 is not called", async () => {
    mockFetch(200, needListing({}, { signed_in: false, can_message: false }))
    const a = renderScreen()
    const link = await screen.findByRole("link", { name: "Doniraj" })
    expect(link).toHaveAttribute("href", `/prijava?next=${encodeURIComponent(`/sapa-pomoci/${ID}`)}`)
    expect(a.getDonationInfo).not.toHaveBeenCalled()
  })
})

describe("S33 — Doniraj Dialog (EP-78)", () => {
  it("FR-66 #1 / OQ-17: the blocks, recipient and purpose; Kopiraj copies the account", async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
    mockFetch(200, needListing())
    const a = renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Doniraj" }))
    const dialog = await screen.findByRole("dialog")
    expect(a.getDonationInfo).toHaveBeenCalledWith({ listing_id: ID })
    expect(within(dialog).getByRole("heading", { name: "Doniraj: Azil „Druga šansa“" })).toBeInTheDocument()
    expect(within(dialog).getByText("Uplata na račun")).toBeInTheDocument()
    expect(within(dialog).getByText("160-0000012345678-90")).toBeInTheDocument()
    expect(within(dialog).getByText("Primalac: Azil „Druga šansa“")).toBeInTheDocument()
    expect(within(dialog).getByText("Svrha: Donacija — Potrebno 20 kg granula za odrasle pse")).toBeInTheDocument()
    expect(within(dialog).getByText("Online uplata")).toBeInTheDocument()
    expect(within(dialog).getByText("Donošenje u azil")).toBeInTheDocument()
    expect(within(dialog).getByText("Temerinski put 120, Novi Sad")).toBeInTheDocument()
    expect(within(dialog).getByText("Subota 10:00 – 14:00")).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole("button", { name: "Kopiraj broj računa" }))
    expect(writeText).toHaveBeenCalledWith("160-0000012345678-90")
    expect(await within(dialog).findByText("Kopirano")).toBeInTheDocument()
  })

  it("FR-66 #1: omits each block whose field is null", async () => {
    mockFetch(200, needListing())
    renderScreen(fakeActions({ ...donation, bank_account: null, dropoff_address: null, dropoff_hours: null }))
    await userEvent.click(await screen.findByRole("button", { name: "Doniraj" }))
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByText("Online uplata")).toBeInTheDocument()
    expect(within(dialog).queryByText("Uplata na račun")).not.toBeInTheDocument()
    expect(within(dialog).queryByText("Donošenje u azil")).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Kopiraj broj računa" })).not.toBeInTheDocument()
  })

  it("FR-66 #3: has_any = false → the no-donation-info message and Pošalji poruku azilu", async () => {
    mockFetch(200, needListing())
    renderScreen(
      fakeActions({ ...donation, bank_account: null, payment_url: null, dropoff_address: null, dropoff_hours: null, has_any: false }),
    )
    await userEvent.click(await screen.findByRole("button", { name: "Doniraj" }))
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByText("Azil još nije dodao podatke za donacije")).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Pošalji poruku azilu" })).toBeInTheDocument()
    expect(within(dialog).queryByText("Online uplata")).not.toBeInTheDocument()
  })

  it("FR-66 #4: no input or amount field; the only outbound link is payment_url", async () => {
    mockFetch(200, needListing())
    renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Doniraj" }))
    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByText("Uplata na račun")
    expect(dialog.querySelectorAll("input, textarea, select, form")).toHaveLength(0)
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("spinbutton")).not.toBeInTheDocument()
    const links = within(dialog).getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "https://drugasansa.rs/doniraj")
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("401 → sign-in prompt inside the Dialog; 5xx → error toast", async () => {
    mockFetch(200, needListing())
    const a = fakeActions()
    a.getDonationInfo.mockResolvedValueOnce({ ok: false, error: { code: "unauthenticated", message: "" } })
    renderScreen(a)
    await userEvent.click(await screen.findByRole("button", { name: "Doniraj" }))
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByRole("link", { name: "Prijavi se" })).toHaveAttribute(
      "href",
      `/prijava?next=${encodeURIComponent(`/sapa-pomoci/${ID}`)}`,
    )
    await userEvent.click(within(dialog).getByRole("button", { name: "Zatvori" }))

    a.getDonationInfo.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "" } })
    await userEvent.click(screen.getByRole("button", { name: "Doniraj" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
  })
})

describe("S33 — own listing (EP-77)", () => {
  const own = (extra: Partial<Listing> = {}) =>
    listing({ type: "giving", price: null, title: "Poklanjam grebalicu", ...extra }, { is_author: true, can_message: false, conversation_count: 2 })

  it("FR-62 #4: own-listing card with edit, extend, resolve, delete and no message button", async () => {
    mockFetch(200, own())
    renderScreen()
    expect(await screen.findByRole("heading", { level: 2, name: "Ovo je tvoj oglas" })).toBeInTheDocument()
    expect(screen.getByText("Aktivan do 17. 11. 2026.", { selector: "p" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "2 razgovora o oglasu" })).toHaveAttribute("href", "/poruke")
    expect(screen.getByRole("link", { name: "Izmeni oglas" })).toHaveAttribute("href", `/sapa-pomoci/${ID}/izmeni`)
    expect(screen.getByRole("button", { name: "Produži 30 dana" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Označi kao rešeno" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Obriši oglas" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Pošalji poruku/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Stvari razmenjuj uživo/)).not.toBeInTheDocument()
  })

  it("extend → toast with the new date", async () => {
    mockFetch(200, own())
    const a = fakeActions()
    a.changeListing.mockResolvedValueOnce({ ok: true, data: own({ expires_at: "2026-11-28T10:00:00Z" }) })
    renderScreen(a)
    await userEvent.click(await screen.findByRole("button", { name: "Produži 30 dana" }))
    expect(a.changeListing).toHaveBeenCalledWith({ listing_id: ID, op: "extend" })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Oglas je produžen do 28. 11. 2026."))
  })

  it("resolve AlertDialog → toast and the author's resolved variant", async () => {
    mockFetch(200, own())
    const a = fakeActions()
    a.changeListing.mockResolvedValueOnce({
      ok: true,
      data: own({ status: "resolved", resolved_outcome: "given", resolved_at: "2026-10-19T10:00:00Z", days_left: null }),
    })
    renderScreen(a)
    await userEvent.click(await screen.findByRole("button", { name: "Označi kao rešeno" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Označiti kao rešeno — Poklonjeno?")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Da, rešeno je" }))
    expect(a.changeListing).toHaveBeenCalledWith({ listing_id: ID, op: "resolve" })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Oglas je označen kao rešen — Poklonjeno."))
    expect(await screen.findByText("Rešeno — Poklonjeno")).toBeInTheDocument()
    expect(screen.getByText("Rešeno 19. 10. 2026.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Oglas više nije aktivan" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Produži 30 dana" })).not.toBeInTheDocument()
  })

  it("OQ-17 (a): resolved date comes from resolved_at", async () => {
    mockFetch(200, own({ status: "resolved", resolved_outcome: "given", resolved_at: "2026-09-28T10:00:00Z", days_left: null }))
    renderScreen()
    expect(await screen.findByText("Rešeno 28. 9. 2026.")).toBeInTheDocument()
  })

  it("delete AlertDialog → redirect to Moji oglasi", async () => {
    mockFetch(200, own())
    const a = fakeActions()
    a.changeListing.mockResolvedValueOnce({ ok: true, data: { deleted_listing_id: ID } })
    renderScreen(a)
    await userEvent.click(await screen.findByRole("button", { name: "Obriši oglas" }))
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Da, obriši" }))
    expect(a.changeListing).toHaveBeenCalledWith({ listing_id: ID, op: "delete", confirm: true })
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sapa-pomoci/moje"))
  })

  it("errors: premium_required, marketplace_suspended, listing_not_active → error toasts", async () => {
    mockFetch(200, own())
    const a = fakeActions()
    a.changeListing
      .mockResolvedValueOnce({ ok: false, error: { code: "premium_required", message: "", details: { limit: "listings" } } })
      .mockResolvedValueOnce({ ok: false, error: { code: "marketplace_suspended", message: "" } })
      .mockResolvedValueOnce({ ok: false, error: { code: "listing_not_active", message: "" } })
    renderScreen(a)
    const extend = await screen.findByRole("button", { name: "Produži 30 dana" })
    await userEvent.click(extend)
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith(dictionaries.sr.sapa.detail.premiumLimit))
    await userEvent.click(extend)
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith(dictionaries.sr.sapa.detail.suspendedOwnText))
    await userEvent.click(extend)
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith("Nešto nije u redu. Pokušaj ponovo."))
  })
})

describe("S33 — suspended (Me.marketplace.suspended_at)", () => {
  it("a suspended viewer sees Poruke nisu dostupne and no message button", async () => {
    mockFetch(200, listing({}, { can_message: false }))
    renderScreen(fakeActions(), { suspended: true })
    expect(await screen.findByRole("heading", { level: 2, name: "Poruke nisu dostupne" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Pošalji poruku" })).not.toBeInTheDocument()
  })
})
