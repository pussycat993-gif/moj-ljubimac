import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
// Step 17: S01 marks reminders done and refreshes the shell badge (owner-approved exception 3).
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

// S01 Moji ljubimci (FR-01, FR-36, FR-59): the Free limit opens PremiumLock, search filters the
// EP-01 list case- and diacritic-insensitively, no match shows the term, and the states.

const getFileUrls = vi.fn(async (input: { items: { kind: string; id: string }[] }) => ({
  ok: true as const,
  data: input.items.map((i) => ({ ...i, url: `https://r2.test/${i.id}.jpg`, expires_at: "2026-10-23T08:10:00Z", mime_type: null })),
}))
vi.mock("@/lib/actions/files", () => ({ getFileUrls: (input: never) => getFileUrls(input) }))

const { PetsHomeClient, PetsHomeLoading } = await import("@/app/(app)/ljubimci/pets-home-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en") => ({
  petsHome: dictionaries[locale].petsHome,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

const NOW = "2026-10-19T08:00:00Z" // Monday

function pet(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    species: "cat",
    species_other: null,
    breed: "Britanska kratkodlaka",
    sex: "female",
    birth_date: null,
    birth_year: null,
    has_photo: false,
    lifecycle: "active",
    organisation_id: null,
    owner_name: "Marko Jovanović",
    vet_name: null,
    attachment_count: 0,
    moment_count: 0,
    next_reminder: null,
    memorial: null,
    access: { role: "owner", can_edit: true, can_delete: true },
    can_log: true,
    ...extra,
  } as never
}

const luna = pet("c1", "Luna", { birth_date: "2023-04-12" })
const maks = pet("c2", "Maks", { species: "dog", sex: "male", breed: "Mešanac", birth_year: 2022 })
const cupko = pet("c3", "Čupko", { species: "rabbit", sex: "unknown", breed: null })

function renderHome(props: Partial<Parameters<typeof PetsHomeClient>[0]> = {}) {
  return render(
    <PetsHomeClient pets={[luna]} activePetLimit={null} now={NOW} locale="sr" copy={copy("sr")} {...props} />,
  )
}

beforeEach(() => {
  getFileUrls.mockClear()
})

describe("S01 — FR-01 / FR-36: second active pet on Free", () => {
  it("Free with 1 active pet: 'Dodaj ljubimca' opens PremiumLock instead of the form", async () => {
    renderHome({ pets: [luna], activePetLimit: 1 })
    const add = screen.getByRole("link", { name: "Dodaj ljubimca" })
    expect(add).toHaveAttribute("href", "#premium-lock")
    await userEvent.setup().click(add)
    const lock = screen.getByRole("region", { name: "Dodavanje drugog ljubimca" })
    expect(lock).toHaveAttribute("id", "premium-lock")
    expect(within(lock).getByText("Dostupno u Premiumu")).toBeInTheDocument()
    expect(within(lock).getByText(/Na Free planu imaš jednog aktivnog ljubimca/)).toBeInTheDocument()
    expect(within(lock).getByRole("button", { name: "Probaj 7 dana besplatno" })).toBeInTheDocument()
    expect(screen.getByText("Free · 1 / 1 aktivan ljubimac")).toBeInTheDocument()
  })

  it("Free with no active pet: 'Dodaj ljubimca' goes to the form", () => {
    renderHome({ pets: [], activePetLimit: 1 })
    for (const link of screen.getAllByRole("link", { name: "Dodaj ljubimca" })) expect(link).toHaveAttribute("href", "/ljubimci/novi")
    expect(screen.queryByRole("region", { name: "Dodavanje drugog ljubimca" })).not.toBeInTheDocument()
  })

  it("a shared pet (role member) does not count toward the owner's Free slot", () => {
    renderHome({ pets: [pet("s1", "Luna", { access: { role: "member", can_edit: false, can_delete: false } })], activePetLimit: 1 })
    expect(screen.getByRole("link", { name: "Dodaj ljubimca" })).toHaveAttribute("href", "/ljubimci/novi")
  })

  it("Premium: no limit, the Premium badge, 'Dodaj ljubimca' goes to the form", () => {
    renderHome({ pets: [luna, maks], activePetLimit: null })
    expect(screen.getByRole("link", { name: "Dodaj ljubimca" })).toHaveAttribute("href", "/ljubimci/novi")
    expect(screen.getByText("Premium")).toBeInTheDocument()
    expect(screen.queryByText("Dostupno u Premiumu")).not.toBeInTheDocument()
  })
})

describe("S01 — FR-59 search", () => {
  it("'lu' shows only Luna (case-insensitive)", async () => {
    renderHome({ pets: [luna, maks, cupko] })
    await userEvent.setup().type(screen.getByRole("searchbox", { name: "Pretraži ljubimce po imenu" }), "LU")
    expect(screen.getByRole("heading", { name: "Luna" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Maks" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Čupko" })).not.toBeInTheDocument()
  })

  it("diacritic-insensitive: 'cup' matches Čupko and 'č' matches a plain c", async () => {
    const user = userEvent.setup()
    renderHome({ pets: [luna, maks, cupko, pet("c4", "Cica")] })
    const search = screen.getByRole("searchbox")
    await user.type(search, "cup")
    expect(screen.getByRole("heading", { name: "Čupko" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Cica" })).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, "čič")
    expect(screen.getByRole("heading", { name: "Cica" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Čupko" })).not.toBeInTheDocument()
  })

  it("no match: an empty result with the search term, and clearing it brings the list back", async () => {
    const user = userEvent.setup()
    renderHome({ pets: [luna, maks] })
    await user.type(screen.getByRole("searchbox"), "Rex")
    expect(screen.getByRole("heading", { name: "Nema ljubimca sa imenom „Rex“" })).toBeInTheDocument()
    expect(screen.getByText("Proveri kako je ime napisano ili obriši pretragu.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Obriši pretragu" }))
    expect(screen.getByRole("heading", { name: "Luna" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Maks" })).toBeInTheDocument()
  })
})

describe("S01 — states and cards", () => {
  it("loading: skeletons while EP-01 is in flight", () => {
    render(<PetsHomeLoading copy={copy("sr")} />)
    expect(screen.getByLabelText("Učitavanje ljubimaca")).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByRole("link", { name: "Dodaj ljubimca" })).not.toBeInTheDocument()
  })

  it("empty: no active pet shows 'Dodaj svog prvog ljubimca' and no search", () => {
    renderHome({ pets: [] })
    expect(screen.getByRole("heading", { name: "Dodaj svog prvog ljubimca" })).toBeInTheDocument()
    expect(screen.getByText("Ovde će biti kartoni tvojih ljubimaca.")).toBeInTheDocument()
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
  })

  it("error: a failed read shows the error state", () => {
    renderHome({ pets: null })
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
  })

  it("'Danas' with nothing due renders empty, with the weekday and 'Pogledaj sve' (Step 17); the Uspomene link opens S06 (Step 16)", () => {
    renderHome({ pets: [luna] })
    expect(screen.getByRole("heading", { name: "Danas" })).toBeInTheDocument()
    expect(screen.getByText("· Ponedeljak, 19. oktobar")).toBeInTheDocument()
    expect(screen.getByText("Danas nema podsetnika.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Pogledaj sve/ })).toHaveAttribute("href", "/podsetnici")
    expect(screen.getByRole("link", { name: /Uspomene/ })).toHaveAttribute("href", "/uspomene")
  })

  it("pet card: breed, sex chip, age with plurals, next reminder, link to the record", () => {
    renderHome({
      pets: [
        pet("c1", "Luna", {
          birth_date: "2023-04-12",
          next_reminder: {
            id: "o1",
            reminder_id: "r1",
            type: "vaccination",
            title: "Besnilo — Rabisin",
            due_at: "2026-10-26T07:00:00Z",
            display_status: "soon",
          },
        }),
        pet("c2", "Maks", { sex: "male", birth_year: 2022, breed: null, species: "dog" }),
        pet("c3", "Kiki", { sex: "unknown", birth_date: "2026-08-01", breed: null, species: "rabbit" }),
      ],
    })
    const cards = screen.getAllByRole("heading", { level: 3 }).map((h) => h.closest("[data-pet-sex]") as HTMLElement)
    const [lunaCard, maksCard, kikiCard] = cards
    expect(within(lunaCard).getByText("Britanska kratkodlaka")).toBeInTheDocument()
    expect(within(lunaCard).getByText("Ženka")).toBeInTheDocument()
    expect(within(lunaCard).getByText("3 godine")).toBeInTheDocument()
    expect(within(lunaCard).getByText("Besnilo — Rabisin")).toBeInTheDocument()
    expect(within(lunaCard).getByText("26. 10. 2026.")).toBeInTheDocument()
    expect(within(lunaCard).getByRole("link", { name: /^Otvori karton\s*: Luna$/ })).toHaveAttribute("href", "/ljubimci/c1")
    expect(within(maksCard).getByText("Mužjak")).toBeInTheDocument()
    expect(within(maksCard).getByText("Pas")).toBeInTheDocument()
    expect(within(maksCard).getByText("oko 4 godine")).toBeInTheDocument()
    expect(within(maksCard).getByText("Nema zakazanih podsetnika.")).toBeInTheDocument()
    expect(within(kikiCard).queryByText("Ženka")).not.toBeInTheDocument()
    expect(within(kikiCard).queryByText("Mužjak")).not.toBeInTheDocument()
    expect(within(kikiCard).getByText("2 meseca")).toBeInTheDocument()
    expect(screen.queryByText(/Težina/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Karton ažuriran/)).not.toBeInTheDocument()
  })

  it("birthday reminder with no title: 'Rođendan — {pet}'; due today: 'Danas · time' and the Danas badge", () => {
    renderHome({
      pets: [
        pet("c1", "Luna", {
          next_reminder: { id: "o1", reminder_id: "r1", type: "birthday", title: null, due_at: "2026-10-19T07:00:00Z", display_status: "today" },
        }),
      ],
    })
    expect(screen.getByText("Rođendan — Luna")).toBeInTheDocument()
    expect(screen.getByText("Danas · 09:00")).toBeInTheDocument()
  })

  it("pet photos come from EP-15 for pets with has_photo", async () => {
    renderHome({ pets: [pet("c1", "Luna", { has_photo: true }), maks] })
    await vi.waitFor(() => expect(getFileUrls).toHaveBeenCalledWith({ items: [{ kind: "pet_photo", id: "c1" }] }))
  })

  it("English: every string comes from the en dictionary", async () => {
    render(<PetsHomeClient pets={[luna]} activePetLimit={1} now={NOW} locale="en" copy={copy("en")} />)
    expect(screen.getByRole("heading", { name: "My pets" })).toBeInTheDocument()
    expect(screen.getByText("· Monday 19 October")).toBeInTheDocument()
    expect(screen.getByText("Nothing due today.")).toBeInTheDocument()
    expect(screen.getByText("Free · 1 / 1 active pet")).toBeInTheDocument()
    expect(screen.getByText("3 years")).toBeInTheDocument()
    expect(screen.getByText("Female")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Add pet" })).toHaveAttribute("href", "#premium-lock")
    expect(screen.getByText("Available in Premium")).toBeInTheDocument()
    await userEvent.setup().type(screen.getByRole("searchbox", { name: "Search pets by name" }), "Rex")
    expect(screen.getByRole("heading", { name: "No pet named “Rex”" })).toBeInTheDocument()
  })
})
