import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// S06 Uspomene (FR-11, FR-12): memorial cards from EP-01 (lifecycle = memorial), the Free counter
// "n / 2", "Vrati među aktivne" → EP-07 restore_pet_from_memorial({ pet_id, reenable_reminders: true })
// → the card leaves the list with the toast (FR-12); on Free with the active slot taken → PremiumLock
// naming Me.usage.free_slot_pet (FR-12, E-03), before the call or on premium_required.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const restorePetFromMemorial = vi.fn()
vi.mock("@/lib/actions/memorial", () => ({
  restorePetFromMemorial: (...a: unknown[]) => restorePetFromMemorial(...a),
}))
const getFileUrls = vi.fn()
vi.mock("@/lib/actions/files", () => ({ getFileUrls: (...a: unknown[]) => getFileUrls(...a) }))

const { MemorialsClient } = await import("@/app/(app)/uspomene/memorials-client")
const { dictionaries } = await import("@/lib/i18n")

const KIKI = "c1000000-0000-4000-8000-000000000003"
const ZUCA = "c1000000-0000-4000-8000-000000000005"

const copy = (locale: "sr" | "en" = "sr") => ({
  memorials: dictionaries[locale].memorials,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

function memorialPet(overrides: Record<string, unknown> = {}, memorial: Record<string, unknown> = {}) {
  const id = (overrides.id as string) ?? KIKI
  return {
    id,
    name: "Kiki",
    species: "rabbit",
    species_other: null,
    breed: "Holandski patuljasti",
    sex: "female",
    birth_date: null,
    birth_year: 2022,
    has_photo: false,
    lifecycle: "memorial",
    organisation_id: null,
    owner_name: "Marko Jovanović",
    vet_name: null,
    attachment_count: 0,
    moment_count: 0,
    next_reminder: null,
    access: { role: "owner", can_edit: true, can_delete: true },
    can_log: true,
    ...overrides,
    memorial: {
      id: `m-${id}`,
      pet_id: id,
      date: "2026-06-14",
      reason: "lost",
      note: "Pobegla iz dvorišta u Bečeju.",
      created_at: "2026-06-14T10:00:00Z",
      ...memorial,
    },
  }
}

const kiki = memorialPet()
const zuca = memorialPet(
  { id: ZUCA, name: "Žuća", species: "dog", breed: "Mešanac", birth_date: "2010-03-01", birth_year: null },
  { date: "2025-02-03", reason: "passed_away", note: "Petnaest godina šetnji po Dunavskom parku." },
)

type Props = Partial<Parameters<typeof MemorialsClient>[0]>

function renderScreen(props: Props = {}) {
  return render(
    <MemorialsClient
      pets={[kiki, zuca] as never}
      memorialLimit={2}
      activePetLimit={1}
      activePets={0}
      slotPetName={null}
      locale="sr"
      copy={copy()}
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getFileUrls.mockResolvedValue({ ok: true, data: [] })
})

describe("S06 — Uspomene", () => {
  it("shows the memorial cards with species, years, reason and date, and the Free counter", () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "Uspomene" })).toBeInTheDocument()
    expect(screen.getByText("Kartoni ljubimaca koji više nisu s tobom. Čuvamo ih dok god imaš nalog.")).toBeInTheDocument()
    expect(screen.getByText("Free · 2 / 2 uspomene")).toBeInTheDocument()
    const [first, second] = screen.getAllByTestId("memorial-card")
    expect(first).toHaveTextContent("Kiki")
    expect(first).toHaveTextContent("Zec · Holandski patuljasti")
    expect(first).toHaveTextContent("2022 – 2026")
    expect(within(first).getByText("Izgubljena")).toBeInTheDocument()
    expect(first).toHaveTextContent("14. 6. 2026.")
    expect(first).toHaveTextContent("Pobegla iz dvorišta u Bečeju.")
    expect(within(first).getByRole("link", { name: "Pogledaj karton" })).toHaveAttribute("href", `/ljubimci/${KIKI}`)
    expect(second).toHaveTextContent("2010 – 2025")
    expect(within(second).getByText("Preminula")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Nazad na ljubimce" })).toHaveAttribute("href", "/ljubimci")
  })

  it("Premium shows the unlimited badge instead of the counter", () => {
    renderScreen({ memorialLimit: null, activePetLimit: null })
    expect(screen.getByText("Premium · bez ograničenja")).toBeInTheDocument()
    expect(screen.queryByText(/Free ·/)).not.toBeInTheDocument()
  })

  it("hides the years line without a birth and the reason badge without a reason; male forms otherwise", () => {
    renderScreen({
      pets: [
        memorialPet({ name: "Maks", sex: "male", birth_year: null }, { reason: null }),
        memorialPet({ id: ZUCA, name: "Bruno", sex: "unknown" }, { reason: "rehomed" }),
      ] as never,
    })
    const [maks, bruno] = screen.getAllByTestId("memorial-card")
    expect(maks).not.toHaveTextContent("–")
    expect(within(maks).queryByText(/Izgubljen|Preminu|Udomljen/)).not.toBeInTheDocument()
    expect(within(bruno).getByText("Udomljen kod drugih")).toBeInTheDocument()
  })

  it("FR-12: restore with a free slot re-enables reminders, the card leaves the list and a toast confirms", async () => {
    restorePetFromMemorial.mockResolvedValue({ ok: true, data: { id: KIKI, lifecycle: "active" } })
    renderScreen()
    const user = userEvent.setup()
    const [first] = screen.getAllByTestId("memorial-card")
    await user.click(within(first).getByRole("button", { name: "Vrati među aktivne" }))

    expect(restorePetFromMemorial).toHaveBeenCalledWith({ pet_id: KIKI, reenable_reminders: true })
    expect(screen.getAllByTestId("memorial-card")).toHaveLength(1)
    expect(screen.queryByText("Kiki")).not.toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith("Kiki je ponovo među aktivnim ljubimcima.")
    expect(refresh).toHaveBeenCalled()
  })

  it("restoring the last memorial leaves the empty state", async () => {
    restorePetFromMemorial.mockResolvedValue({ ok: true, data: { id: KIKI, lifecycle: "active" } })
    renderScreen({ pets: [kiki] as never })
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Vrati među aktivne" }))
    expect(screen.getByRole("heading", { name: "Ovde još nema uspomena" })).toBeInTheDocument()
  })

  it("FR-12: on Free with the active slot taken, PremiumLock names usage.free_slot_pet and EP-07 is not called", async () => {
    renderScreen({ activePets: 1, slotPetName: "Luna" })
    const user = userEvent.setup()
    const [first] = screen.getAllByTestId("memorial-card")
    await user.click(within(first).getByRole("button", { name: "Vrati među aktivne" }))

    const lock = screen.getByRole("region", { name: "Vraćanje ljubimca među aktivne" })
    expect(within(lock).getByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
    expect(lock).toHaveTextContent(
      "Na Free planu imaš jednog aktivnog ljubimca, a to mesto zauzima Luna. Uz Premium možeš da vratiš i ovog ljubimca (Kiki).",
    )
    expect(restorePetFromMemorial).not.toHaveBeenCalled()
    expect(screen.getAllByTestId("memorial-card")).toHaveLength(2)
  })

  it("FR-12: premium_required from EP-07 (limit pets) shows the same PremiumLock", async () => {
    restorePetFromMemorial.mockResolvedValue({
      ok: false,
      error: { code: "premium_required", message: "premium_required:pets", details: { limit: "pets" } },
    })
    renderScreen({ slotPetName: "Luna" })
    const user = userEvent.setup()
    const [, second] = screen.getAllByTestId("memorial-card")
    await user.click(within(second).getByRole("button", { name: "Vrati među aktivne" }))

    expect(screen.getByRole("region", { name: "Vraćanje ljubimca među aktivne" })).toHaveTextContent(
      "a to mesto zauzima Luna. Uz Premium možeš da vratiš i ovog ljubimca (Žuća).",
    )
    expect(screen.getAllByTestId("memorial-card")).toHaveLength(2)
    expect(toast).not.toHaveBeenCalled()
  })

  it("a 5xx keeps the card and shows the error toast", async () => {
    restorePetFromMemorial.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "boom" } })
    renderScreen()
    const user = userEvent.setup()
    await user.click(within(screen.getAllByTestId("memorial-card")[0]).getByRole("button", { name: "Vrati među aktivne" }))
    expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
    expect(screen.getAllByTestId("memorial-card")).toHaveLength(2)
  })

  it("empty: no memorial rows", () => {
    renderScreen({ pets: [] })
    expect(screen.getByRole("heading", { name: "Ovde još nema uspomena" })).toBeInTheDocument()
    expect(
      screen.getByText("Kada ljubimac premine, bude udomljen ili se izgubi, njegov karton možeš da sačuvaš ovde."),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Free ·/)).not.toBeInTheDocument()
  })

  it("error: a failed read shows the error state", () => {
    renderScreen({ pets: null })
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
  })

  it("renders in English", () => {
    renderScreen({ locale: "en", copy: copy("en") })
    expect(screen.getByRole("heading", { level: 1, name: "Memorials" })).toBeInTheDocument()
    expect(screen.getByText("Free · 2 / 2 memorials")).toBeInTheDocument()
    expect(screen.getAllByTestId("memorial-card")[0]).toHaveTextContent("14 Jun 2026")
    expect(screen.getAllByRole("button", { name: "Restore to active" })).toHaveLength(2)
  })
})
