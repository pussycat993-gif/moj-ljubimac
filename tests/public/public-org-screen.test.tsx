import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PublicOrgActions, PublicOrgViewer } from "@/app/(public)/o/[slug]/public-org-screen"
import type { PublicAnimal, PublicOrgPage } from "@/lib/server/public-org-page"

// S23 Javna stranica (Step 26) · FR-46, FR-47, FR-49, E-17 · states from EP-62 (API §7.3): default (organisation
// header and the animal grid with public fields only; price for breeders), empty (animals []), error (404 / 5xx).
// Guest vs signed-in comes from the session (the page passes `viewer`), not from EP-62: a guest's request Dialog is
// the sign-in prompt; a signed-in user's Dialog calls EP-63 submitOrgRequest — sent confirmation on ok, the sign-in
// prompt on 401, inline field errors on 422, the rate-limit and "no longer available" messages on 429 / 404.

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const { PublicOrgScreen } = await import("@/app/(public)/o/[slug]/public-org-screen")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en" = "sr") => ({
  publicOrg: dictionaries[locale].publicOrg,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

const ZUCA = "c1000000-0000-4000-8000-000000000004"

function animal(extra: Partial<PublicAnimal> = {}): PublicAnimal {
  return {
    pet_id: ZUCA,
    name: "Žuća",
    species: "dog",
    species_other: null,
    breed: "Mešanac",
    sex: "female",
    approx_age_text: "oko 6 meseci",
    birth_date: null,
    birth_year: null,
    public_description: "Mazna i mirna, voli sunčana mesta.",
    neutered: "yes",
    vaccinated: true,
    price: null,
    photo_url: null,
    ...extra,
  }
}

function shelterPage(animals: PublicAnimal[] = [animal()], total = animals.length): PublicOrgPage {
  return {
    organisation: {
      name: "Azil Šapica",
      type: "shelter",
      slug: "azil-sapica",
      initials: "AŠ",
      city: { id: "c", name_sr: "Bečej", name_en: "Becej", latitude: 0, longitude: 0 },
      description: "Brinemo o napuštenim psima i mačkama.",
      phone: "+381 21 400 500",
      email: "kontakt@azilsapica.rs",
      website: "https://azilsapica.rs",
      logo_url: null,
    },
    animals,
    total,
  }
}

function breederPage(animals: PublicAnimal[]): PublicOrgPage {
  const page = shelterPage(animals)
  return { ...page, organisation: { ...page.organisation, name: "Odgajivačnica Đorđević", type: "breeder", slug: "odgajivacnica-djordjevic", initials: "OĐ" } }
}

const signedIn: PublicOrgViewer = { name: "Marko Jovanović", email: "marko.jovanovic@mojljubimac.test" }

function actions(): PublicOrgActions & { submitOrgRequest: ReturnType<typeof vi.fn> } {
  return {
    submitOrgRequest: vi.fn(async () => ({
      ok: true as const,
      data: { id: "d1", kind: "adoption_request" as const, status: "pending" as const, created_at: "2026-10-23T08:00:00Z" },
    })),
  }
}

function renderScreen(page: PublicOrgPage | null, viewer: PublicOrgViewer = null, a = actions(), locale: "sr" | "en" = "sr") {
  render(
    <PublicOrgScreen
      page={page}
      viewer={viewer}
      locale={locale}
      copy={copy(locale)}
      shellLabels={dictionaries[locale].shell.public}
      actions={a}
    />,
  )
  return a
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("S23 — default (EP-62)", () => {
  it("FR-46: the organisation header and each animal's public fields", () => {
    renderScreen(shelterPage([animal(), animal({ pet_id: "p2", name: "Rocko", sex: "male", neutered: "no", vaccinated: false, public_description: null })]))
    expect(screen.getByRole("heading", { level: 1, name: "Azil Šapica" })).toBeInTheDocument()
    expect(screen.getByText("AŠ")).toBeInTheDocument()
    expect(screen.getByText("Azil · Bečej")).toBeInTheDocument()
    expect(screen.getByText("Brinemo o napuštenim psima i mačkama.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "+381 21 400 500" })).toHaveAttribute("href", "tel:+38121400500")
    expect(screen.getByRole("link", { name: "kontakt@azilsapica.rs" })).toHaveAttribute("href", "mailto:kontakt@azilsapica.rs")
    expect(screen.getByRole("link", { name: "azilsapica.rs" })).toHaveAttribute("href", "https://azilsapica.rs")
    expect(screen.getByRole("heading", { level: 2, name: "Traže dom" })).toBeInTheDocument()

    expect(screen.getByRole("img", { name: "Žuća" })).toBeInTheDocument()
    expect(screen.getByText("Pas, Mešanac · Ženka · oko 6 meseci")).toBeInTheDocument()
    expect(screen.getByText("Mazna i mirna, voli sunčana mesta.")).toBeInTheDocument()
    expect(screen.getByText("Sterilisana")).toBeInTheDocument()
    expect(screen.getByText("Vakcinisana")).toBeInTheDocument()
    expect(screen.getByText("Nije sterilisan")).toBeInTheDocument()
    expect(screen.getByText("Nije vakcinisan")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Pošalji zahtev" })).toHaveLength(2)
    expect(screen.queryByText(/RSD/)).not.toBeInTheDocument()
  })

  it("unknown sex uses the masculine form; the neutered badge is hidden when unknown", () => {
    renderScreen(shelterPage([animal({ sex: "unknown", neutered: "unknown" })]))
    expect(screen.getByText("Pas, Mešanac · oko 6 meseci")).toBeInTheDocument()
    expect(screen.getByText("Vakcinisan")).toBeInTheDocument()
    expect(screen.queryByText(/sterilisan/i)).not.toBeInTheDocument()
  })

  it("FR-49: a breeder page shows the price and the inquiry wording", () => {
    renderScreen(breederPage([animal({ name: "Zlatko", sex: "male", breed: "Zlatni retriver", price: { amount_minor: 12_000_000, currency: "RSD" } })]))
    expect(screen.getByText("Odgajivačnica · Bečej")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Dostupni štenci" })).toBeInTheDocument()
    expect(screen.getByText("120.000 RSD")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pošalji upit" })).toBeInTheDocument()
  })

  it("shows a presigned photo", () => {
    renderScreen(
      shelterPage([animal({ photo_url: { kind: "pet_photo", id: ZUCA, url: "https://r2.test/zuca.jpg", expires_at: null, mime_type: null } })]),
    )
    expect(screen.getByRole("img", { name: "Žuća" })).toHaveAttribute("src", "https://r2.test/zuca.jpg")
  })
})

describe("S23 — empty and error", () => {
  it("empty: animals [] → the shelter / breeder empty state", () => {
    renderScreen(shelterPage([]))
    expect(screen.getByRole("heading", { name: "Trenutno nema životinja za udomljavanje" })).toBeInTheDocument()
  })

  it("empty breeder", () => {
    renderScreen(breederPage([]))
    expect(screen.getByRole("heading", { name: "Trenutno nema dostupnih štenaca" })).toBeInTheDocument()
  })

  it("error: 404 / 5xx → ErrorState", async () => {
    const user = userEvent.setup()
    renderScreen(null)
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    await user.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(refresh).toHaveBeenCalled()
  })
})

describe("S23 — request Dialog", () => {
  it("guest (no session): the sign-in prompt (E-17), no EP-63 call", async () => {
    const user = userEvent.setup()
    const a = renderScreen(shelterPage(), null)
    await user.click(screen.getByRole("button", { name: "Pošalji zahtev" }))
    const dialog = await screen.findByRole("dialog", { name: "Prijavi se da pošalješ zahtev" })
    expect(within(dialog).getByText("Azil odgovara mejlom, zato ti treba nalog. Traje manje od minuta, a Žuća te čeka.")).toBeInTheDocument()
    expect(within(dialog).getByRole("link", { name: "Prijavi se" })).toHaveAttribute("href", "/prijava?next=%2Fo%2Fazil-sapica")
    expect(within(dialog).getByRole("link", { name: "Napravi nalog" })).toHaveAttribute("href", "/registracija")
    expect(a.submitOrgRequest).not.toHaveBeenCalled()
  })

  it("signed in: the form is prefilled from Me, validated, and sent through EP-63 → sent confirmation", async () => {
    const user = userEvent.setup()
    const a = renderScreen(shelterPage(), signedIn)
    await user.click(screen.getByRole("button", { name: "Pošalji zahtev" }))
    const dialog = await screen.findByRole("dialog", { name: "Zahtev za udomljavanje — Žuća" })
    expect(within(dialog).getByLabelText("Ime i prezime *")).toHaveValue("Marko Jovanović")
    expect(within(dialog).getByLabelText("Mejl *")).toHaveValue("marko.jovanovic@mojljubimac.test")

    await user.click(within(dialog).getByRole("button", { name: "Pošalji zahtev" }))
    expect(within(dialog).getByText("Upiši broj telefona.")).toBeInTheDocument()
    expect(a.submitOrgRequest).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText("Telefon *"), "+381 64 123 4567")
    await user.type(within(dialog).getByLabelText("Poruka"), "Imam dvorište.")
    await user.click(within(dialog).getByRole("button", { name: "Pošalji zahtev" }))
    expect(a.submitOrgRequest).toHaveBeenCalledWith({
      pet_id: ZUCA,
      name: "Marko Jovanović",
      phone: "+381 64 123 4567",
      email: "marko.jovanovic@mojljubimac.test",
      message: "Imam dvorište.",
      idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(await screen.findByRole("dialog", { name: "Zahtev je poslat" })).toHaveTextContent(
      "Azil Šapica će ti odgovoriti mejlom na marko.jovanovic@mojljubimac.test. Javićemo ti i ako zahtev bude prihvaćen ili odbijen.",
    )
  })

  it("401 from EP-63 → the sign-in prompt", async () => {
    const user = userEvent.setup()
    const a = actions()
    a.submitOrgRequest.mockResolvedValueOnce({ ok: false, error: { code: "unauthenticated", message: "x" } })
    renderScreen(shelterPage(), signedIn, a)
    await user.click(screen.getByRole("button", { name: "Pošalji zahtev" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Telefon *"), "+381641234567")
    await user.click(within(dialog).getByRole("button", { name: "Pošalji zahtev" }))
    expect(await screen.findByRole("dialog", { name: "Prijavi se da pošalješ zahtev" })).toBeInTheDocument()
  })

  it("422 from EP-63 → inline field errors", async () => {
    const user = userEvent.setup()
    const a = actions()
    a.submitOrgRequest.mockResolvedValueOnce({
      ok: false,
      error: { code: "validation_failed", message: "x", fields: { phone: "invalid", email: "invalid" } },
    })
    renderScreen(shelterPage(), signedIn, a)
    await user.click(screen.getByRole("button", { name: "Pošalji zahtev" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Telefon *"), "12345")
    await user.click(within(dialog).getByRole("button", { name: "Pošalji zahtev" }))
    expect(await within(dialog).findByText("Upiši broj telefona.")).toBeInTheDocument()
    expect(within(dialog).getByText("Upiši ispravnu mejl adresu.")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Telefon *")).toHaveAttribute("aria-invalid", "true")
  })

  it("429 → the rate-limit message; 404 → no longer available", async () => {
    const user = userEvent.setup()
    const a = actions()
    a.submitOrgRequest
      .mockResolvedValueOnce({ ok: false, error: { code: "rate_limited", message: "x", details: { retry_after_s: 1500 } } })
      .mockResolvedValueOnce({ ok: false, error: { code: "not_found", message: "x" } })
    renderScreen(breederPage([animal({ name: "Zlatko", sex: "male" })]), signedIn, a)
    await user.click(screen.getByRole("button", { name: "Pošalji upit" }))
    const dialog = await screen.findByRole("dialog", { name: "Upit — Zlatko" })
    await user.type(within(dialog).getByLabelText("Telefon *"), "+381641234567")
    await user.click(within(dialog).getByRole("button", { name: "Pošalji upit" }))
    expect(await within(dialog).findByText("Previše zahteva za kratko vreme. Pokušaj ponovo za 25 min.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Pošalji upit" }))
    expect(await within(dialog).findByText("Ova životinja više nije dostupna.")).toBeInTheDocument()
  })
})

describe("S23 — paging and English", () => {
  it("Učitaj još loads the next EP-62 page", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(shelterPage([animal({ pet_id: "p3", name: "Mrvica" })], 2)), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderScreen(shelterPage([animal()], 2))
    await user.click(screen.getByRole("button", { name: "Učitaj još" }))
    expect(fetchMock).toHaveBeenCalledWith("/api/public/orgs/azil-sapica?limit=20&offset=1", { cache: "no-store" })
    expect(await screen.findByText("Mrvica")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Učitaj još" })).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it("renders the English dictionary", () => {
    renderScreen(shelterPage(), null, actions(), "en")
    expect(screen.getByText("Shelter · Becej")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Looking for a home" })).toBeInTheDocument()
    expect(screen.getByText("Spayed")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send a request" })).toBeInTheDocument()
  })
})
