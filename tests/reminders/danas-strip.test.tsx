import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReminderOccurrence } from "@/lib/actions/pets"

vi.mock("server-only", () => ({}))

// S01 "Danas" strip (FR-24 in the product, EP-25 filter=today first 3, EP-26 "Urađeno"): cards on computers
// and rows on phones, the count and "Pogledaj sve" → S10, marking done switches to the done badge with the
// status line, members of a read-only household get no button, nothing due → the empty form.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock("@/lib/actions/files", () => ({ getFileUrls: async () => ({ ok: true, data: [] }) }))
const markOccurrenceDone = vi.fn()
vi.mock("@/lib/actions/reminders", () => ({
  markOccurrenceDone: (...a: unknown[]) => markOccurrenceDone(...a),
  listReminderOccurrences: vi.fn(),
}))

const { PetsHomeClient } = await import("@/app/(app)/ljubimci/pets-home-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en") => ({
  petsHome: dictionaries[locale].petsHome,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
  reminders: dictionaries[locale].reminders,
})

const NOW = "2026-10-19T08:00:00Z"

const luna = {
  id: "c1",
  name: "Luna",
  species: "cat",
  species_other: null,
  breed: "Britanska kratkodlaka",
  sex: "female",
  birth_date: null,
  birth_year: null,
  has_photo: false,
  lifecycle: "active",
  organisation_id: null,
  owner_name: "Ivana Petrović",
  vet_name: null,
  attachment_count: 0,
  moment_count: 0,
  next_reminder: null,
  memorial: null,
  access: { role: "owner", can_edit: true, can_delete: true },
  can_log: true,
} as never

function occurrence(id: string, extra: Partial<ReminderOccurrence> = {}): ReminderOccurrence {
  return {
    id,
    reminder_id: `rem-${id}`,
    type: "treatment_dose",
    title: `Doza ${id}`,
    due_at: "2026-10-19T18:00:00Z",
    status: "pending",
    display_status: "today",
    pet_id: "c1",
    pet_name: "Luna",
    pet_sex: "female",
    pet_species: "cat",
    channels: ["push"],
    sent_at: null,
    done_at: null,
    done_by: null,
    done_by_name: null,
    is_shared: false,
    can_mark_done: true,
    ...extra,
  }
}

const kapi = occurrence("o1", { title: "Kapi za oči" })
const tableta = occurrence("o2", { title: "Tableta protiv krpelja", due_at: "2026-10-19T16:00:00Z" })
const hrana = occurrence("o3", { type: "manual", title: "Kupi hranu u Pet shopu „Šapica”", pet_id: null, pet_name: null, pet_sex: null, pet_species: null, due_at: "2026-10-19T15:00:00Z" })
const cetvrti = occurrence("o4", { title: "Četvrti" })

function renderStrip(today: { items: ReminderOccurrence[]; total: number } | null, locale: "sr" | "en" = "sr") {
  return render(<PetsHomeClient pets={[luna]} today={today} activePetLimit={null} now={NOW} locale={locale} copy={copy(locale)} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("S01 — Danas strip (EP-25 filter=today)", () => {
  it("shows the first 3 of today's reminders, the count and 'Pogledaj sve' → S10", () => {
    renderStrip({ items: [kapi, tableta, hrana, cetvrti], total: 4 })
    const section = screen.getByRole("region", { name: "Danas" })
    expect(within(section).getByText("4 podsetnika ·")).toBeInTheDocument()
    expect(within(section).getByRole("link", { name: /Pogledaj sve/ })).toHaveAttribute("href", "/podsetnici")
    // cards (computers) and rows (phones) both render the same three
    expect(within(section).getAllByText("Kapi za oči")).toHaveLength(2)
    expect(within(section).getAllByText("Tableta protiv krpelja")).toHaveLength(2)
    expect(within(section).queryByText("Četvrti")).not.toBeInTheDocument()
    expect(within(section).getAllByText("Luna · Danas u 20:00")).toHaveLength(1)
    expect(within(section).getAllByText("Za mene · Danas u 17:00")).toHaveLength(1)
    // the manual reminder links to S11 edit
    expect(within(section).getAllByRole("link", { name: "Kupi hranu u Pet shopu „Šapica”" })[0]).toHaveAttribute("href", "/podsetnici/rem-o3")
  })

  it("plural count: 1 podsetnik", () => {
    renderStrip({ items: [kapi], total: 1 })
    expect(screen.getByText("1 podsetnik ·")).toBeInTheDocument()
  })

  it("FR-24: 'Urađeno' → EP-26, the done badge and the status line; the shell badge refreshes", async () => {
    markOccurrenceDone.mockResolvedValue({
      ok: true,
      data: { ...kapi, status: "done", display_status: "done", done_at: "2026-10-19T08:10:00Z", done_by_name: "Ivana Petrović", can_mark_done: false },
    })
    renderStrip({ items: [kapi], total: 1 })
    const user = userEvent.setup()
    const section = screen.getByRole("region", { name: "Danas" })
    await user.click(within(section).getAllByRole("button", { name: "Urađeno" })[0])
    expect(markOccurrenceDone).toHaveBeenCalledWith("o1")
    expect(within(section).queryByRole("button", { name: "Urađeno" })).not.toBeInTheDocument()
    expect(within(section).getAllByText("Urađeno").length).toBeGreaterThan(0)
    expect(screen.getByRole("status")).toHaveTextContent("Označeno kao urađeno: Kapi za oči")
    expect(refresh).toHaveBeenCalled()
  })

  it("an instance the caller may not mark (can_mark_done false) has no 'Urađeno'", () => {
    renderStrip({ items: [occurrence("o9", { title: "Deljeni", can_mark_done: false, is_shared: true })], total: 1 })
    expect(screen.queryByRole("button", { name: "Urađeno" })).not.toBeInTheDocument()
  })

  it("nothing due today, or a failed read → the empty form", () => {
    const { unmount } = renderStrip({ items: [], total: 0 })
    expect(screen.getByText("Danas nema podsetnika.")).toBeInTheDocument()
    expect(screen.queryByText(/podsetnika ·/)).not.toBeInTheDocument()
    unmount()
    renderStrip(null)
    expect(screen.getByText("Danas nema podsetnika.")).toBeInTheDocument()
  })

  it("English", () => {
    renderStrip({ items: [kapi, hrana], total: 2 }, "en")
    expect(screen.getByText("2 reminders ·")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /View all/ })).toBeInTheDocument()
    expect(screen.getAllByText("For me · Today at 17:00")).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Done" }).length).toBeGreaterThan(0)
  })
})
