import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Partner } from "@/lib/actions/partners"

// S24 Partneri u blizini (Step 27) · EP-64 through lib/actions/partners.ts listPartnersNearby: the first read is the
// profile city (EP-43); type chips → p_type; "Koristi moju lokaciju" → the Geolocation API → p_lat / p_lng, and a
// denied permission keeps the profile city (FR-53, E-22). Featured section, then "Po udaljenosti" (FR-52). Quick
// actions only where the partner has the data (E-24); "Poruka" opens message_channel + message_number (BR-44); each
// tap calls EP-66 recordPartnerClick and a failure never blocks the link (FR-55). The vet-suggestion banner names an
// active EP-01 pet with vet_name = null and lists vets only (FR-56). States: default / loading / empty / error.

const list = vi.fn()
const click = vi.fn()
vi.mock("@/lib/actions/partners", () => ({
  listPartnersNearby: (...a: unknown[]) => list(...a),
  recordPartnerClick: (...a: unknown[]) => click(...a),
}))

const { PartnersScreen } = await import("@/app/(app)/partneri/partners-screen")
const { dictionaries } = await import("@/lib/i18n")

const NOVI_SAD = { id: "c0000000-0000-4000-8000-000000000026", name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.255134, longitude: 19.845176 }
const copy = (locale: "sr" | "en" = "sr") => ({ partners: dictionaries[locale].partners, common: dictionaries[locale].common })
const MAKS = { id: "c1000000-0000-4000-8000-000000000002", name: "Maks", sex: "male" as const, species: "dog" as const }

function partner(id: string, overrides: Partial<Partner> = {}): Partner {
  return {
    id,
    type: "vet",
    name: "Veterinarska ambulanta „Dr Vet“",
    initials: "DV",
    address: "Bulevar oslobođenja 45, Novi Sad",
    city: NOVI_SAD,
    phone: "+381 21 455 100",
    message_channel: "none",
    message_number: null,
    email: null,
    website: null,
    instagram: null,
    description: null,
    logo_url: null,
    latitude: 45.2541,
    longitude: 19.8425,
    featured: false,
    paid_until: "2027-12-31",
    active: true,
    distance_km: 1.2,
    hours: [],
    today_hours: null,
    ...overrides,
  }
}

const drVet = partner("e1000000-0000-4000-8000-000000000001", {
  featured: true,
  message_channel: "whatsapp",
  message_number: "+381 64 455 1000",
  email: "kontakt@drvet.rs",
  website: "drvet.rs",
  today_hours: { weekday: 1, opens: "08:00", closes: "20:00" },
})
const sapica = partner("e1000000-0000-4000-8000-000000000002", {
  type: "pet_shop",
  name: "Pet shop „Šapica“",
  initials: "Š",
  distance_km: 0.6,
  website: "https://sapica.rs",
})
const cupko = partner("e1000000-0000-4000-8000-000000000003", {
  type: "grooming",
  name: "Grooming salon „Čupko“",
  initials: "Č",
  distance_km: 2.0,
  message_channel: "viber",
  message_number: "+381 64 633 8180",
})
const zdravaSapa = partner("e1000000-0000-4000-8000-000000000005", {
  name: "Veterinarska stanica „Zdrava šapa“",
  initials: "ZŠ",
  distance_km: 2.4,
})

function renderScreen(props: Partial<Parameters<typeof PartnersScreen>[0]> = {}) {
  return render(
    <PartnersScreen
      initialPartners={[drVet, sapica, cupko]}
      city={NOVI_SAD}
      vetPet={null}
      locale="sr"
      copy={copy()}
      {...props}
    />,
  )
}

type Geo = { success?: { coords: { latitude: number; longitude: number } }; deny?: boolean }
function mockGeolocation({ success, deny }: Geo) {
  const getCurrentPosition = vi.fn((ok: (p: unknown) => void, err: (e: unknown) => void) => {
    if (deny) err({ code: 1, message: "User denied Geolocation" })
    else if (success) ok(success)
  })
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}

/** Records whether the link's default action (opening it) was blocked, then stops jsdom navigating. */
let blocked: boolean[] = []
const onWindowClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest("a")) {
    blocked.push(e.defaultPrevented)
    e.preventDefault()
  }
}

beforeEach(() => {
  list.mockReset()
  click.mockReset()
  click.mockResolvedValue({ ok: true, data: null })
  blocked = []
  window.addEventListener("click", onWindowClick)
})
afterEach(() => {
  window.removeEventListener("click", onWindowClick)
})

describe("S24 default (FR-52)", () => {
  it("featured partners in Istaknuto, then the others in Po udaljenosti, with type, distance and today's hours", () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "Partneri u blizini" })).toBeInTheDocument()
    const featured = screen.getByRole("region", { name: "Istaknuto" })
    expect(within(featured).getByRole("link", { name: "Veterinarska ambulanta „Dr Vet“" })).toHaveAttribute(
      "href",
      "/partneri/e1000000-0000-4000-8000-000000000001",
    )
    expect(within(featured).getByText("1,2 km")).toBeInTheDocument()
    expect(within(featured).getByText("Danas 08:00 – 20:00")).toBeInTheDocument()
    const nearby = screen.getByRole("region", { name: "Po udaljenosti" })
    const names = within(nearby).getAllByRole("link", { name: /Pet shop|Grooming salon/ }).map((a) => a.textContent)
    expect(names).toEqual(["Pet shop „Šapica“", "Grooming salon „Čupko“"])
    expect(within(nearby).getAllByText("Danas zatvoreno")).toHaveLength(2)
  })
})

describe("S24 location (FR-53, E-22)", () => {
  it("measures from the profile city until the user allows location; then from the coordinates", async () => {
    const user = userEvent.setup()
    list.mockResolvedValue({ ok: true, data: [zdravaSapa] })
    mockGeolocation({ success: { coords: { latitude: 45.25, longitude: 19.84 } } })
    renderScreen()
    expect(screen.getByText("Udaljenost od grada iz profila: Novi Sad")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Koristi moju lokaciju" }))

    expect(list).toHaveBeenCalledWith({ lat: 45.25, lng: 19.84, type: null })
    expect(await screen.findByText("Udaljenost od tvoje trenutne lokacije")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Koristi moju lokaciju" })).not.toBeInTheDocument()
    // S25 gets the coordinates too (owner decision, Step 27).
    expect(screen.getByRole("link", { name: "Veterinarska stanica „Zdrava šapa“" })).toHaveAttribute(
      "href",
      "/partneri/e1000000-0000-4000-8000-000000000005?lat=45.25&lng=19.84",
    )
  })

  it("E-22: a denied permission keeps the profile city and makes no new request", async () => {
    const user = userEvent.setup()
    const geo = mockGeolocation({ deny: true })
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Koristi moju lokaciju" }))
    expect(geo).toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
    expect(screen.getByText("Udaljenost od grada iz profila: Novi Sad")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Istaknuto" })).toBeInTheDocument()
  })

  it("no profile city and no location → Dodaj grad u profil with a link to /profil", () => {
    renderScreen({ city: null, initialPartners: [] })
    expect(screen.getByRole("heading", { name: "Dodaj grad u profil" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Otvori profil" })).toHaveAttribute("href", "/profil")
    expect(screen.getByRole("button", { name: "Koristi moju lokaciju" })).toBeInTheDocument()
  })
})

describe("S24 type chips → p_type", () => {
  it("re-reads EP-64 with the chosen type, showing the loading state while it runs", async () => {
    const user = userEvent.setup()
    let resolve!: (v: unknown) => void
    list.mockReturnValue(new Promise((r) => (resolve = r)))
    renderScreen()

    await user.click(screen.getByRole("button", { name: "Pet shopovi" }))
    expect(list).toHaveBeenCalledWith({ city_id: NOVI_SAD.id, type: "pet_shop" })
    expect(screen.getByRole("button", { name: "Pet shopovi" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByLabelText("Učitavanje")).toHaveAttribute("aria-busy", "true")

    await act(async () => resolve({ ok: true, data: [sapica] }))
    expect(screen.getAllByTestId("partner-card")).toHaveLength(1)
  })

  it("empty on [] and error on a failed read (Pokušaj ponovo re-reads)", async () => {
    const user = userEvent.setup()
    list.mockResolvedValueOnce({ ok: true, data: [] })
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Pet hoteli" }))
    expect(await screen.findByRole("heading", { name: "Još nema partnera u tvom gradu" })).toBeInTheDocument()

    list.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "x" } })
    await user.click(screen.getByRole("button", { name: "Grooming" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")

    list.mockResolvedValueOnce({ ok: true, data: [cupko] })
    await user.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(list).toHaveBeenLastCalledWith({ city_id: NOVI_SAD.id, type: "grooming" })
    expect(await screen.findByRole("link", { name: "Grooming salon „Čupko“" })).toBeInTheDocument()
  })

  it("error state when the first read failed", () => {
    renderScreen({ initialPartners: null })
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })
})

describe("S24 quick actions (FR-55, E-24, BR-44)", () => {
  it("renders only the actions the partner has data for", () => {
    renderScreen()
    const cards = screen.getAllByTestId("partner-card")
    const labels = (card: HTMLElement) => within(card).getAllByRole("link").slice(1).map((a) => a.textContent)
    expect(labels(cards[0])).toEqual(["Pozovi", "Poruka", "Mejl", "Sajt"])
    expect(labels(cards[1])).toEqual(["Pozovi", "Sajt"])
    expect(labels(cards[2])).toEqual(["Pozovi", "Poruka"])
  })

  it("Poruka uses message_channel + message_number; links are tel:, mailto:, https:", () => {
    renderScreen()
    const [dr, sap, cup] = screen.getAllByTestId("partner-card")
    expect(within(dr).getByRole("link", { name: "Poruka preko: WhatsApp" })).toHaveAttribute("href", "https://wa.me/381644551000")
    expect(within(cup).getByRole("link", { name: "Poruka preko: Viber" })).toHaveAttribute(
      "href",
      "viber://chat?number=%2B381646338180",
    )
    expect(within(dr).getByRole("link", { name: "Pozovi" })).toHaveAttribute("href", "tel:+38121455100")
    expect(within(dr).getByRole("link", { name: "Mejl" })).toHaveAttribute("href", "mailto:kontakt@drvet.rs")
    expect(within(dr).getByRole("link", { name: "Sajt" })).toHaveAttribute("href", "https://drvet.rs")
    // https:// is not doubled when the stored website already has a scheme.
    expect(within(sap).getByRole("link", { name: "Sajt" })).toHaveAttribute("href", "https://sapica.rs")
  })

  it("each tap calls EP-66 with the action, and a failing call does not block the link", () => {
    renderScreen()
    const dr = screen.getAllByTestId("partner-card")[0]
    fireEvent.click(within(dr).getByRole("link", { name: "Pozovi" }))
    fireEvent.click(within(dr).getByRole("link", { name: "Poruka preko: WhatsApp" }))
    expect(click.mock.calls).toEqual([
      [drVet.id, "call"],
      [drVet.id, "message"],
    ])

    click.mockRejectedValue(new Error("network"))
    fireEvent.click(within(dr).getByRole("link", { name: "Mejl" }))
    click.mockImplementation(() => {
      throw new Error("boom")
    })
    fireEvent.click(within(dr).getByRole("link", { name: "Sajt" }))
    expect(click.mock.calls.slice(2)).toEqual([
      [drVet.id, "email"],
      [drVet.id, "website"],
    ])
    expect(blocked).toEqual([false, false, false, false])
  })
})

describe("S24 vet-suggestion banner (FR-56, BR-43)", () => {
  it("names the active pet without a vet and lists vets only (p_type = vet)", async () => {
    const user = userEvent.setup()
    list.mockResolvedValue({ ok: true, data: [drVet, zdravaSapa] })
    renderScreen({ vetPet: MAKS })

    expect(screen.getByText("Maks nema upisanog veterinara")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Pogledaj veterinare" }))

    expect(list).toHaveBeenCalledWith({ city_id: NOVI_SAD.id, type: "vet" })
    expect(screen.queryByText("Maks nema upisanog veterinara")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Veterinari" })).toHaveAttribute("aria-pressed", "true")
    const cards = await screen.findAllByTestId("partner-card")
    expect(cards).toHaveLength(2)
    for (const card of cards) expect(within(card).getByText("Veterinar")).toBeInTheDocument()
    expect(screen.queryByText("Pet shop „Šapica“")).not.toBeInTheDocument()
    expect(screen.queryByText("Grooming salon „Čupko“")).not.toBeInTheDocument()
  })

  it("Ne sada hides it; no banner when every active pet has a vet", async () => {
    const user = userEvent.setup()
    const { unmount } = renderScreen({ vetPet: MAKS })
    await user.click(screen.getByRole("button", { name: "Ne sada" }))
    expect(screen.queryByText("Maks nema upisanog veterinara")).not.toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
    unmount()

    renderScreen({ vetPet: null })
    expect(screen.queryByRole("button", { name: "Pogledaj veterinare" })).not.toBeInTheDocument()
  })
})

describe("S24 English", () => {
  it("renders the English dictionary", () => {
    render(<PartnersScreen initialPartners={[drVet]} city={NOVI_SAD} vetPet={MAKS} locale="en" copy={copy("en")} />)
    expect(screen.getByRole("heading", { level: 1, name: "Partners nearby" })).toBeInTheDocument()
    expect(screen.getByText("Distance from your profile city: Novi Sad")).toBeInTheDocument()
    expect(screen.getByText("Maks has no vet on record")).toBeInTheDocument()
    expect(screen.getByText("1.2 km")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Message via: WhatsApp" })).toBeInTheDocument()
  })
})
