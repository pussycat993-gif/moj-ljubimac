import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ListingSummary } from "@/lib/actions/listings"
import type { City } from "@/lib/actions/registration"
import type { SapaFilters } from "@/app/(sapa)/sapa-pomoci/sapa-pomoci-client"

// S32 Šapa pomoći (Step 28b) · FR-61 #5 and the API §7.3 states from EP-73 (GET /api/public/listings, limit 18):
// loading → default (cards, result line, pagination); total 0 → empty (with filters "Nema oglasa za ove filtere" +
// Poništi filtere clearing every filter; without filters "Još nema oglasa"); 5xx → error with retry; signed_out →
// the sign-in prompt linking to /prijava?next=<current path>; suspended → the Me.marketplace notice, no actions.

const { SapaPomociClient } = await import("@/app/(sapa)/sapa-pomoci/sapa-pomoci-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en" = "sr") => ({
  common: dictionaries[locale].common,
  sapa: dictionaries[locale].sapa.common,
  list: dictionaries[locale].sapa.list,
})

const NOVI_SAD: City = { id: "c0000000-0000-4000-8000-000000000001", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.25, longitude: 19.84 }
const BECEJ: City = { id: "c0000000-0000-4000-8000-000000000002", name_sr: "Bečej", name_en: "Becej", latitude: 45.61, longitude: 20.04 }

function summary(extra: Partial<ListingSummary> = {}): ListingSummary {
  return {
    id: "l0000000-0000-4000-8000-000000000003",
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

const items: ListingSummary[] = [
  summary({
    id: "l1",
    type: "need",
    title: "Potrebno 20 kg granula za odrasle pse",
    category: "food",
    price: null,
    photo_count: 1,
    published_at: "2026-10-19T09:00:00Z",
    author: { kind: "shelter", display_name: "Azil „Druga šansa“" },
  }),
  summary({
    id: "l2",
    type: "giving",
    title: "Poklanjam grebalicu za mačke, Bečej",
    city: BECEJ,
    category: "furniture",
    species: "cat",
    price: null,
    photo_count: 3,
    author: { kind: "user", display_name: null },
  }),
  summary({ id: "l3" }),
]

const fetchMock = vi.fn()

function respond(body: unknown, status = 200) {
  return Promise.resolve(Response.json(body, { status }))
}

function lastUrl() {
  const call = fetchMock.mock.calls.at(-1)
  return new URL(String(call?.[0]), "http://localhost")
}

function renderScreen(
  props: Partial<{ signedIn: boolean; suspended: boolean; initialFilters: SapaFilters; locale: "sr" | "en" }> = {},
) {
  const locale = props.locale ?? "sr"
  return render(
    <SapaPomociClient
      signedIn={props.signedIn ?? true}
      suspended={props.suspended ?? false}
      locale={locale}
      cities={[BECEJ, NOVI_SAD]}
      initialFilters={props.initialFilters}
      copy={copy(locale)}
    />,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  window.history.replaceState(null, "", "/sapa-pomoci")
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("S32 Šapa pomoći", () => {
  it("default: loads EP-73 with limit 18 and renders the cards, the result line and the pagination", async () => {
    fetchMock.mockImplementation(() => respond({ items, total: 48 }))
    renderScreen()

    expect(screen.getByLabelText("Učitavanje")).toHaveAttribute("aria-busy", "true")
    expect(await screen.findByText("Potrebno 20 kg granula za odrasle pse")).toBeInTheDocument()

    const url = lastUrl()
    expect(url.pathname).toBe("/api/public/listings")
    expect(url.searchParams.get("limit")).toBe("18")
    expect(url.searchParams.get("offset")).toBe("0")
    expect(url.searchParams.has("type")).toBe(false)

    expect(screen.getByText("48 oglasa · najnoviji prvo")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Prodajem transporter za psa" })).toHaveAttribute(
      "href",
      "/sapa-pomoci/l3",
    )
    expect(screen.getByText("2.500 RSD")).toBeInTheDocument()
    expect(screen.getByText("Besplatno")).toBeInTheDocument()
    // display_name null → "Korisnik"; dates as "19. 10. 2026."
    expect(screen.getByText(/Korisnik · 18\. 10\. 2026\./)).toBeInTheDocument()
    expect(screen.getByText(/Azil „Druga šansa“ · 19\. 10\. 2026\./)).toBeInTheDocument()
    expect(screen.getByText("Bečej · Nameštaj za ljubimce · Mačke")).toBeInTheDocument()
    expect(screen.getByText("3 fotografije")).toBeInTheDocument()

    expect(screen.getByText("Strana 1 od 3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Prethodna" })).toBeDisabled()
    expect(screen.getByRole("link", { name: "Novi oglas" })).toHaveAttribute("href", "/sapa-pomoci/nova")
    expect(screen.getByRole("link", { name: "Moji oglasi" })).toHaveAttribute("href", "/sapa-pomoci/moje")
    expect(screen.queryByRole("link", { name: "Prijavi se" })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Sledeća" }))
    await waitFor(() => expect(lastUrl().searchParams.get("offset")).toBe("18"))
    expect(await screen.findByText("Strana 2 od 3")).toBeInTheDocument()
  })

  it("a type chip filters through EP-73 and resets the page", async () => {
    fetchMock.mockImplementation(() => respond({ items, total: 3 }))
    renderScreen()
    await screen.findByText("3 oglasa · najnoviji prvo")

    await userEvent.click(screen.getByRole("button", { name: "Poklanjam" }))
    await waitFor(() => expect(lastUrl().searchParams.get("type")).toBe("giving"))
    expect(screen.getByRole("button", { name: "Poklanjam" })).toHaveAttribute("aria-pressed", "true")
    expect(window.location.search).toBe("?type=giving")
  })

  it("FR-61 #5: empty with filters shows Poništi filtere, which clears every filter", async () => {
    fetchMock.mockImplementation((input: string) => {
      const url = new URL(input, "http://localhost")
      return url.searchParams.has("type") ? respond({ items: [], total: 0 }) : respond({ items, total: 3 })
    })
    renderScreen({ initialFilters: { type: "seeking", category: "furniture", species: "cat", city: BECEJ.id } })

    expect(await screen.findByText("Nema oglasa za ove filtere")).toBeInTheDocument()
    const first = lastUrl()
    expect(first.searchParams.get("type")).toBe("seeking")
    expect(first.searchParams.get("category")).toBe("furniture")
    expect(first.searchParams.get("species")).toBe("cat")
    expect(first.searchParams.get("city_id")).toBe(BECEJ.id)

    await userEvent.click(screen.getByRole("button", { name: "Poništi filtere" }))

    await screen.findByText("3 oglasa · najnoviji prvo")
    const next = lastUrl()
    for (const key of ["type", "category", "species", "city_id"]) expect(next.searchParams.has(key)).toBe(false)
    expect(next.searchParams.get("offset")).toBe("0")
    expect(screen.getByRole("button", { name: "Sve" })).toHaveAttribute("aria-pressed", "true")
    expect(window.location.search).toBe("")
  })

  it("FR-61 #5: empty without filters shows Još nema oglasa (Novi oglas for a signed-in user)", async () => {
    fetchMock.mockImplementation(() => respond({ items: [], total: 0 }))
    renderScreen()

    expect(await screen.findByText("Još nema oglasa")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Poništi filtere" })).not.toBeInTheDocument()
    const empty = screen.getByText("Još nema oglasa").closest("[data-slot=card]") as HTMLElement
    expect(within(empty).getByRole("link", { name: "Novi oglas" })).toHaveAttribute("href", "/sapa-pomoci/nova")
  })

  it("error: 5xx shows the error state and Pokušaj ponovo reloads", async () => {
    fetchMock.mockImplementationOnce(() => respond({ code: "internal_error" }, 500))
    renderScreen()

    expect(await screen.findByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    fetchMock.mockImplementation(() => respond({ items, total: 3 }))
    await userEvent.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(await screen.findByText("Prodajem transporter za psa")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("signed out: same list, the sign-in prompt links to /prijava?next=<current path>, no account actions", async () => {
    fetchMock.mockImplementation(() => respond({ items, total: 3 }))
    renderScreen({ signedIn: false, initialFilters: { type: "giving", category: "all", species: "all", city: "all" } })

    expect(await screen.findByText("Prodajem transporter za psa")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Prijavi se" })).toHaveAttribute(
      "href",
      `/prijava?next=${encodeURIComponent("/sapa-pomoci?type=giving")}`,
    )
    expect(screen.queryByRole("link", { name: "Novi oglas" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Moji oglasi" })).not.toBeInTheDocument()
  })

  it("suspended: the Šapa pomoći notice and no Novi oglas / Moji oglasi", async () => {
    fetchMock.mockImplementation(() => respond({ items, total: 3 }))
    renderScreen({ suspended: true })

    expect(await screen.findByRole("status")).toHaveTextContent(/isključen iz Šape pomoći/)
    expect(screen.queryByRole("link", { name: "Novi oglas" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Moji oglasi" })).not.toBeInTheDocument()
  })

  it("English: dictionary copy, English city names and prices", async () => {
    fetchMock.mockImplementation(() => respond({ items, total: 1 }))
    renderScreen({ locale: "en" })

    expect(await screen.findByText("1 listing · newest first")).toBeInTheDocument()
    expect(screen.getByText("2,500 RSD")).toBeInTheDocument()
    expect(screen.getByText("Free")).toBeInTheDocument()
    expect(screen.getByText(/User · 18 Oct 2026/)).toBeInTheDocument()
    expect(screen.getByText("Becej · Pet furniture · Cats")).toBeInTheDocument()
  })
})
