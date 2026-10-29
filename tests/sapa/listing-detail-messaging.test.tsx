import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ListingDetailActions } from "@/app/(sapa)/sapa-pomoci/[id]/listing-detail-client"
import type { Listing } from "@/lib/actions/listings"
import type { DonationInfo } from "@/lib/actions/organisation"

// S33 Oglas — messaging, report and block (Step 28c): FR-68 #1 the Pošalji poruku Dialog sends the first message
// through EP-82 (listing_id) → "Poruka je poslata…" + Otvori razgovor (/poruke/<id>); FR-68 #2 an existing
// conversation (viewer.my_conversation_id) opens /poruke/<id> instead (BR-61); FR-68 #3 / FR-62 #4 the author has no
// message action; FR-68 #4 signed out → /prijava?next=/sapa-pomoci/<id>; FR-66 #3 "Pošalji poruku azilu" in the
// Doniraj Dialog opens the message Dialog; FR-70 the ⋯ menu — Prijavi oglas (ReportDialog, EP-84) and Blokiraj
// korisnika (BlockDialog, EP-85; not on shelter needs) after which the listing is unavailable.

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const toast = { success: vi.fn(), error: vi.fn() }
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { ListingDetailClient } = await import("@/app/(sapa)/sapa-pomoci/[id]/listing-detail-client")
const { dictionaries } = await import("@/lib/i18n")

const ID = "a1000000-0000-4000-8000-000000000001"
const MARKO = "b1000000-0000-4000-8000-000000000002"
const CONVERSATION = "c1000000-0000-4000-8000-000000000009"
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
    photos: [],
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

function needListing(viewer: Partial<Listing["viewer"]> = {}): Listing {
  return listing(
    {
      type: "need",
      title: "Potrebno 20 kg granula za odrasle pse",
      category: "food",
      price: null,
      has_donation_info: true,
      author: {
        kind: "shelter",
        user_id: "b2",
        display_name: "Azil „Druga šansa“",
        initials: "AD",
        city: NOVI_SAD,
        member_since: "2026-03-01T10:00:00Z",
        active_listing_count: 4,
        organisation_id: "o1",
        organisation_slug: "druga-sansa",
      },
    },
    viewer,
  )
}

const noDonationInfo: DonationInfo = {
  organisation_id: "o1",
  organisation_name: "Azil „Druga šansa“",
  city: NOVI_SAD,
  bank_account: null,
  payment_url: null,
  dropoff_address: null,
  dropoff_hours: null,
  payment_purpose: null,
  has_any: false,
}

function mockFetch(body: Listing) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
}

function fakeActions() {
  return {
    changeListing: vi.fn<ListingDetailActions["changeListing"]>(),
    getDonationInfo: vi.fn<ListingDetailActions["getDonationInfo"]>(async () => ({ ok: true as const, data: noDonationInfo })),
    sendMessage: vi.fn<NonNullable<ListingDetailActions["sendMessage"]>>(async (input) => ({
      ok: true as const,
      data: {
        conversation: { id: CONVERSATION } as never,
        message: { id: "m1", conversation_id: CONVERSATION, sender_id: "me", from_me: true, body: input.body, created_at: "", read_at: null },
        created_conversation: true,
      },
    })),
    submitReport: vi.fn<NonNullable<ListingDetailActions["submitReport"]>>(async () => ({
      ok: true as const,
      data: { already_submitted: false, report: {} as never },
    })),
    blockUser: vi.fn<NonNullable<ListingDetailActions["blockUser"]>>(async () => ({
      ok: true as const,
      data: { blocker_id: "me", blocked_id: MARKO, created_at: "" },
    })),
  }
}

function renderScreen(a = fakeActions()) {
  render(<ListingDetailClient listingId={ID} locale="sr" suspended={false} copy={copy()} actions={a} />)
  return a
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe("FR-68 #1 — Pošalji poruku", () => {
  it("sends the first message through EP-82 and confirms with Otvori razgovor", async () => {
    mockFetch(listing())
    const a = renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Pošalji poruku" }))
    const dialog = screen.getByRole("dialog", { name: "Poruka za: Marko J." })
    expect(within(dialog).getByText("Oglas: Prodajem transporter za psa")).toBeInTheDocument()
    const box = within(dialog).getByLabelText("Tvoja poruka")
    expect(box).toHaveValue("Zdravo! Da li je oglas još aktuelan?")
    expect(box).toHaveAttribute("maxLength", "2000")
    expect(within(dialog).getByText("36 / 2000")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji" }))

    expect(a.sendMessage).toHaveBeenCalledWith({
      listing_id: ID,
      body: "Zdravo! Da li je oglas još aktuelan?",
      idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      "Poruka je poslata. Odgovor stiže u Poruke, a javićemo ti i mejlom.",
    )
    expect(within(dialog).getByRole("link", { name: "Otvori razgovor" })).toHaveAttribute("href", `/poruke/${CONVERSATION}`)
  })

  it("an empty message cannot be sent", async () => {
    mockFetch(listing())
    const a = renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Pošalji poruku" }))
    const dialog = screen.getByRole("dialog")
    await userEvent.clear(within(dialog).getByLabelText("Tvoja poruka"))
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji" }))
    expect(within(dialog).getByText("Napiši poruku pre slanja.")).toBeInTheDocument()
    expect(a.sendMessage).not.toHaveBeenCalled()
  })

  it("user_blocked and rate_limited show inline in the Dialog", async () => {
    mockFetch(listing())
    const a = fakeActions()
    a.sendMessage.mockResolvedValueOnce({ ok: false, error: { code: "user_blocked", message: "user_blocked" } })
    a.sendMessage.mockResolvedValueOnce({ ok: false, error: { code: "rate_limited", message: "x", details: { retry_after_s: 120 } } })
    renderScreen(a)
    await userEvent.click(await screen.findByRole("button", { name: "Pošalji poruku" }))
    const dialog = screen.getByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji" }))
    expect(await within(dialog).findByText("Ovoj osobi trenutno ne možeš da pišeš.")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji" }))
    expect(
      await within(dialog).findByText("Poslao/la si mnogo poruka za kratko vreme. Pokušaj ponovo za 2 min."),
    ).toBeInTheDocument()
    // The same intent keeps its idempotency key.
    expect(a.sendMessage.mock.calls[0][0].idempotency_key).toBe(a.sendMessage.mock.calls[1][0].idempotency_key)
  })
})

describe("FR-68 #2 — an existing conversation opens", () => {
  it("viewer.my_conversation_id → /poruke/<id> instead of the Dialog (BR-61)", async () => {
    mockFetch(listing({}, { my_conversation_id: CONVERSATION }))
    const a = renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Pošalji poruku" }))
    expect(push).toHaveBeenCalledWith(`/poruke/${CONVERSATION}`)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(a.sendMessage).not.toHaveBeenCalled()
  })
})

describe("FR-68 #3, FR-62 #4 — the author", () => {
  it("sees no message action and no ⋯ menu", async () => {
    mockFetch(listing({}, { is_author: true, can_message: false, conversation_count: 2 }))
    renderScreen()
    expect(await screen.findByRole("heading", { name: "Ovo je tvoj oglas" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Pošalji poruku" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Više radnji" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Izmeni oglas" })).toBeInTheDocument()
  })
})

describe("FR-68 #4 — signed out", () => {
  it("Pošalji poruku asks to sign in and returns to the listing", async () => {
    mockFetch(listing({}, { signed_in: false, can_message: false }))
    renderScreen()
    expect(await screen.findByRole("link", { name: "Prijavi se da pošalješ poruku" })).toHaveAttribute(
      "href",
      `/prijava?next=${encodeURIComponent(`/sapa-pomoci/${ID}`)}`,
    )
    expect(screen.queryByRole("button", { name: "Više radnji" })).not.toBeInTheDocument()
  })
})

describe("FR-66 #3 — Pošalji poruku azilu", () => {
  it("from the action card and from the Doniraj Dialog without donation info, opens the message Dialog", async () => {
    mockFetch(needListing())
    const a = renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Doniraj" }))
    const donate = await screen.findByRole("dialog", { name: "Doniraj: Azil „Druga šansa“" })
    expect(within(donate).getByText("Azil još nije dodao podatke za donacije")).toBeInTheDocument()
    await userEvent.click(within(donate).getByRole("button", { name: "Pošalji poruku azilu" }))
    const message = await screen.findByRole("dialog", { name: "Poruka za: Azil „Druga šansa“" })
    await userEvent.click(within(message).getByRole("button", { name: "Pošalji" }))
    expect(a.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ listing_id: ID }))
  })

  it("the action card button opens the Dialog too", async () => {
    mockFetch(needListing())
    renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Pošalji poruku azilu" }))
    expect(screen.getByRole("dialog", { name: "Poruka za: Azil „Druga šansa“" })).toBeInTheDocument()
  })
})

describe("FR-70 — ⋯ menu", () => {
  it("#1: Prijavi oglas reports the listing", async () => {
    mockFetch(listing())
    const a = renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Više radnji" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Prijavi oglas" }))
    const dialog = screen.getByRole("dialog", { name: "Prijavi oglas" })
    await userEvent.click(within(dialog).getByLabelText("Prevara"))
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji prijavu" }))
    expect(a.submitReport).toHaveBeenCalledWith({ listing_id: ID, reason: "scam", note: null })
    expect(await screen.findByRole("heading", { name: "Prijava je poslata" })).toBeInTheDocument()
  })

  it("#2: an open earlier report shows as already submitted", async () => {
    mockFetch(listing())
    const a = fakeActions()
    a.submitReport.mockResolvedValue({ ok: true, data: { already_submitted: true, report: {} as never } })
    renderScreen(a)
    await userEvent.click(await screen.findByRole("button", { name: "Više radnji" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Prijavi oglas" }))
    await userEvent.click(screen.getByLabelText("Spam ili reklama"))
    await userEvent.click(screen.getByRole("button", { name: "Pošalji prijavu" }))
    expect(await screen.findByText("Već si prijavio/la ovaj oglas.")).toBeInTheDocument()
  })

  it("#3: Blokiraj korisnika → BlockDialog → the listing becomes unavailable", async () => {
    mockFetch(listing())
    const a = renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Više radnji" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Blokiraj korisnika" }))
    await userEvent.click(screen.getByRole("button", { name: "Da, blokiraj" }))
    expect(a.blockUser).toHaveBeenCalledWith(MARKO)
    expect(await screen.findByRole("heading", { level: 2, name: "Oglas nije dostupan" })).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith("Korisnik Marko J. je blokiran.")
  })

  it("no Blokiraj korisnika on a shelter need", async () => {
    mockFetch(needListing())
    renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Više radnji" }))
    expect(await screen.findByRole("menuitem", { name: "Prijavi oglas" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Blokiraj korisnika" })).not.toBeInTheDocument()
  })

  it("a failed block shows the error toast and keeps the listing", async () => {
    mockFetch(listing())
    const a = fakeActions()
    a.blockUser.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "x" } })
    renderScreen(a)
    await userEvent.click(await screen.findByRole("button", { name: "Više radnji" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Blokiraj korisnika" }))
    await userEvent.click(screen.getByRole("button", { name: "Da, blokiraj" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
    expect(screen.getByRole("heading", { level: 1, name: "Prodajem transporter za psa" })).toBeInTheDocument()
  })
})
