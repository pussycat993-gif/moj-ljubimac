import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ListingSummary, PublicProfile } from "@/lib/actions/listings"
import type { UserProfileActions } from "@/app/(sapa)/korisnik/[id]/user-profile-client"

// S37 Profil korisnika — report and block (Step 28c, FR-70 #1, #3, #5; EP-84, EP-85, EP-79): the ⋯ menu (signed in,
// not one's own profile) with Prijavi korisnika (ReportDialog) and Blokiraj (BlockDialog, "Da, blokiraj"); after the
// block the profile is read again and shows the blocked state B (ReadOnlyBanner "Blokirao/la si ovog korisnika…",
// listings hidden, "Aktivnih oglasa: —") with Odblokiraj, which unblocks and brings the listings back.

const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { UserProfileClient } = await import("@/app/(sapa)/korisnik/[id]/user-profile-client")
const { dictionaries } = await import("@/lib/i18n")

const USER = "a0000000-0000-4000-8000-000000000007"
const NOVI_SAD = { id: "c1", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.25, longitude: 19.84 }

const copy = (locale: "sr" | "en" = "sr") => ({
  common: dictionaries[locale].common,
  sapa: dictionaries[locale].sapa.common,
  profile: dictionaries[locale].sapa.profile,
})

const listingSummary = {
  id: "l3",
  type: "selling",
  title: "Prodajem transporter za psa",
  category: "carriers",
  species: "dog",
  city: NOVI_SAD,
  price: { amount_minor: 250000, currency: "RSD" },
  price_negotiable: false,
  published_at: "2026-10-18T09:00:00Z",
  photo_count: 1,
  cover_photo: null,
  author: { kind: "user", display_name: "Marko J." },
} as ListingSummary

function profile(viewer: Partial<PublicProfile["viewer"]> = {}): PublicProfile {
  const blocked = viewer.i_blocked ?? false
  return {
    user_id: USER,
    display_name: "Marko J.",
    initials: "MJ",
    city: NOVI_SAD,
    member_since: "2026-09-14T10:00:00Z",
    active_listing_count: blocked ? 0 : 1,
    listings: blocked ? [] : [listingSummary],
    listings_total: blocked ? 0 : 1,
    viewer: { signed_in: true, is_me: false, i_blocked: false, ...viewer },
  }
}

const fetchMock = vi.fn()
const respond = (body: unknown) => Promise.resolve(Response.json(body, { status: 200 }))

const actions = {
  submitReport: vi.fn<UserProfileActions["submitReport"]>(async () => ({
    ok: true as const,
    data: { already_submitted: false, report: {} as never },
  })),
  blockUser: vi.fn<UserProfileActions["blockUser"]>(async () => ({
    ok: true as const,
    data: { blocker_id: "me", blocked_id: USER, created_at: "" },
  })),
  unblockUser: vi.fn<UserProfileActions["unblockUser"]>(async () => ({ ok: true as const, data: null })),
}

function renderScreen() {
  return render(<UserProfileClient userId={USER} locale="sr" copy={copy()} actions={actions} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("S37 ⋯ menu", () => {
  it("is hidden signed out and on one's own profile", async () => {
    fetchMock.mockImplementation(() => respond(profile({ signed_in: false })))
    const { unmount } = renderScreen()
    expect(await screen.findByRole("heading", { level: 1, name: "Marko J." })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Više radnji" })).not.toBeInTheDocument()
    unmount()

    fetchMock.mockImplementation(() => respond(profile({ is_me: true })))
    renderScreen()
    expect(await screen.findByRole("heading", { level: 1, name: "Marko J." })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Više radnji" })).not.toBeInTheDocument()
  })

  it("FR-70 #1: Prijavi korisnika reports the user", async () => {
    fetchMock.mockImplementation(() => respond(profile()))
    renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Više radnji" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Prijavi korisnika" }))
    const dialog = screen.getByRole("dialog", { name: "Prijavi korisnika" })
    expect(within(dialog).getByText("Korisnik: Marko J.")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByLabelText("Drugo"))
    await userEvent.type(within(dialog).getByLabelText("Napomena *"), "Traži novac unapred.")
    await userEvent.click(within(dialog).getByRole("button", { name: "Pošalji prijavu" }))
    expect(actions.submitReport).toHaveBeenCalledWith({ user_id: USER, reason: "other", note: "Traži novac unapred." })
    expect(await screen.findByRole("heading", { name: "Prijava je poslata" })).toBeInTheDocument()
  })

  it("FR-70 #2: already reported", async () => {
    fetchMock.mockImplementation(() => respond(profile()))
    actions.submitReport.mockResolvedValueOnce({ ok: true, data: { already_submitted: true, report: {} as never } })
    renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Više radnji" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Prijavi korisnika" }))
    await userEvent.click(screen.getByLabelText("Prevara"))
    await userEvent.click(screen.getByRole("button", { name: "Pošalji prijavu" }))
    expect(await screen.findByText("Već si prijavio/la ovog korisnika.")).toBeInTheDocument()
  })
})

describe("FR-70 #3, #5 — block and unblock", () => {
  it("#3: Blokiraj → Da, blokiraj → the blocked state: banner, no listings, Odblokiraj", async () => {
    fetchMock.mockImplementationOnce(() => respond(profile()))
    renderScreen()
    expect(await screen.findByRole("heading", { name: "Aktivni oglasi" })).toBeInTheDocument()
    fetchMock.mockImplementation(() => respond(profile({ i_blocked: true })))
    await userEvent.click(screen.getByRole("button", { name: "Više radnji" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Blokiraj" }))
    expect(screen.getByRole("alertdialog", { name: "Blokirati korisnika Marko J.?" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Da, blokiraj" }))
    expect(actions.blockUser).toHaveBeenCalledWith(USER)

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Blokirao/la si ovog korisnika. Ne može da ti šalje poruke, a ti ne vidiš oglase te osobe.",
    )
    expect(screen.getByText("Aktivnih oglasa: —")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Aktivni oglasi" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Odblokiraj" })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledWith("Korisnik Marko J. je blokiran.")

    await userEvent.click(screen.getByRole("button", { name: "Više radnji" }))
    expect(screen.queryByRole("menuitem", { name: "Blokiraj" })).not.toBeInTheDocument()
  })

  it("#5: Odblokiraj → the listings return", async () => {
    fetchMock.mockImplementationOnce(() => respond(profile({ i_blocked: true })))
    renderScreen()
    const unblock = await screen.findByRole("button", { name: "Odblokiraj" })
    fetchMock.mockImplementation(() => respond(profile()))
    await userEvent.click(unblock)
    expect(actions.unblockUser).toHaveBeenCalledWith(USER)
    expect(await screen.findByRole("heading", { name: "Aktivni oglasi" })).toBeInTheDocument()
    expect(screen.getByText("Prodajem transporter za psa")).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith("Korisnik Marko J. je odblokiran.")
  })

  it("a failed block shows the error toast", async () => {
    fetchMock.mockImplementation(() => respond(profile()))
    actions.blockUser.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "x" } })
    renderScreen()
    await userEvent.click(await screen.findByRole("button", { name: "Više radnji" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Blokiraj" }))
    await userEvent.click(screen.getByRole("button", { name: "Da, blokiraj" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
    expect(screen.getByRole("heading", { name: "Aktivni oglasi" })).toBeInTheDocument()
  })
})
