import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ListingSummary, PublicProfile } from "@/lib/actions/listings"

// S37 Profil korisnika (Step 28b) · FR-67 #1, FR-67 #2 and the API §7.3 states from EP-79
// (GET /api/public/users/:id): loading → default (display name, initials, city, "Član od <mesec> <godina>.", active
// count, Aktivni oglasi grid) for signed-in and signed-out viewers; empty (listings_total 0); unavailable (404);
// error (5xx, retry). Email and phone are never rendered.

const { UserProfileClient } = await import("@/app/(sapa)/korisnik/[id]/user-profile-client")
const { dictionaries } = await import("@/lib/i18n")

const USER = "a0000000-0000-4000-8000-000000000007"
const NOVI_SAD = { id: "c1", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.25, longitude: 19.84 }

const copy = (locale: "sr" | "en" = "sr") => ({
  common: dictionaries[locale].common,
  sapa: dictionaries[locale].sapa.common,
  profile: dictionaries[locale].sapa.profile,
})

function summary(extra: Partial<ListingSummary>): ListingSummary {
  return {
    id: "l3",
    type: "selling",
    title: "Prodajem transporter za psa",
    category: "carriers",
    species: "dog",
    city: NOVI_SAD,
    price: { amount_minor: 250000, currency: "RSD" },
    price_negotiable: false,
    published_at: "2026-10-18T09:00:00Z",
    photo_count: 4,
    cover_photo: null,
    author: { kind: "user", display_name: "Marko J." },
    ...extra,
  } as ListingSummary
}

function profile(extra: Partial<PublicProfile> = {}): PublicProfile {
  const listings = [
    summary({}),
    summary({ id: "l14", type: "giving", title: "Poklanjam četku za dugodlake pse", price: null, photo_count: 1 }),
    summary({ id: "l15", type: "seeking", title: "Tražim rampu za psa za auto", price: null, photo_count: 0 }),
  ]
  return {
    user_id: USER,
    display_name: "Marko J.",
    initials: "MJ",
    city: NOVI_SAD,
    member_since: "2026-09-14T10:00:00Z",
    active_listing_count: listings.length,
    listings,
    listings_total: listings.length,
    viewer: { signed_in: true, is_me: false, i_blocked: false },
    ...extra,
  }
}

const fetchMock = vi.fn()
const respond = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status }))

function renderScreen(locale: "sr" | "en" = "sr") {
  return render(<UserProfileClient userId={USER} locale={locale} copy={copy(locale)} />)
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("S37 Profil korisnika", () => {
  it.each([
    ["signed in", true],
    ["signed out", false],
  ])("FR-67 #1 (%s): display name, city, member since and the active listings", async (_label, signedIn) => {
    fetchMock.mockImplementation(() =>
      respond(profile({ viewer: { signed_in: signedIn, is_me: false, i_blocked: false } })),
    )
    renderScreen()

    expect(screen.getByLabelText("Učitavanje")).toHaveAttribute("aria-busy", "true")
    expect(await screen.findByRole("heading", { level: 1, name: "Marko J." })).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[0][0])).toMatch(new RegExp(`^/api/public/users/${USER}\\?`))

    expect(screen.getByText("MJ")).toBeInTheDocument()
    expect(screen.getAllByText("Novi Sad").length).toBeGreaterThan(0)
    expect(screen.getByText("Član od septembra 2026.")).toBeInTheDocument()
    expect(screen.getByText("Aktivnih oglasa: 3")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Aktivni oglasi" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Prodajem transporter za psa" })).toHaveAttribute("href", "/sapa-pomoci/l3")
    expect(screen.getByRole("link", { name: "Poklanjam četku za dugodlake pse" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Tražim rampu za psa za auto" })).toBeInTheDocument()
    expect(screen.getByText("2.500 RSD")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Šapa pomoći" })).toHaveAttribute("href", "/sapa-pomoci")
    // Step 28c builds the ⋯ menu; nothing else is offered here.
    expect(screen.queryByRole("button", { name: "Više radnji" })).not.toBeInTheDocument()
  })

  it("FR-67 #1: no display name → the full-name fallback 'Korisnik' and derived initials", async () => {
    fetchMock.mockImplementation(() => respond(profile({ display_name: null, initials: null, city: null })))
    renderScreen()

    expect(await screen.findByRole("heading", { level: 1, name: "Korisnik" })).toBeInTheDocument()
    expect(screen.getByText("K")).toBeInTheDocument()
  })

  it("FR-67 #2: email and phone are never rendered", async () => {
    const leaky = {
      ...profile(),
      email: "marko.jovanovic@mojljubimac.test",
      phone: "+381 64 123 4567",
    }
    fetchMock.mockImplementation(() => respond(leaky))
    const { container } = renderScreen()

    await screen.findByRole("heading", { level: 1, name: "Marko J." })
    expect(container.textContent).not.toMatch(/@mojljubimac\.test/)
    expect(container.textContent).not.toMatch(/\+381/)
    expect(container.querySelector('a[href^="mailto:"], a[href^="tel:"]')).toBeNull()
    expect(screen.getByText("Mejl i telefon se ne prikazuju. Javi se porukom iz nekog od oglasa.")).toBeInTheDocument()
  })

  it("empty: listings_total 0 shows Trenutno nema aktivnih oglasa", async () => {
    fetchMock.mockImplementation(() =>
      respond(profile({ listings: [], listings_total: 0, active_listing_count: 0 })),
    )
    renderScreen()

    expect(await screen.findByText("Trenutno nema aktivnih oglasa")).toBeInTheDocument()
    expect(
      screen.getByText("Marko J. sada nema aktivnih oglasa. Pogledaj ostale oglase u Šapi pomoći."),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Pogledaj oglase" })).toHaveAttribute("href", "/sapa-pomoci")
    expect(screen.getByText("Aktivnih oglasa: 0")).toBeInTheDocument()
  })

  it("unavailable: 404 shows Profil nije dostupan with the way back", async () => {
    fetchMock.mockImplementation(() => respond({ code: "not_found" }, 404))
    renderScreen()

    expect(await screen.findByText("Ovaj korisnik više nije u Šapi pomoći ili je nalog obrisan.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Profil nije dostupan" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Nazad na Šapu pomoći" })).toHaveAttribute("href", "/sapa-pomoci")
  })

  it("error: 5xx shows the error state and Pokušaj ponovo reloads", async () => {
    fetchMock.mockImplementationOnce(() => respond({ code: "internal_error" }, 500))
    renderScreen()

    expect(await screen.findByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    fetchMock.mockImplementation(() => respond(profile()))
    await userEvent.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Marko J." })).toBeInTheDocument()
  })

  it("English: member since month and year", async () => {
    fetchMock.mockImplementation(() => respond(profile()))
    renderScreen("en")

    expect(await screen.findByText("Member since September 2026")).toBeInTheDocument()
    expect(screen.getByText("Active listings: 3")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Active listings" })).toBeInTheDocument()
  })
})
