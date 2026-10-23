import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReminderOccurrence } from "@/lib/actions/pets"

vi.mock("server-only", () => ({}))

// S10 Podsetnici (FR-20 display, FR-24 in the product, CR-12): EP-25 tabs and counts, "Urađeno" → EP-26
// moves the row to Urađeno with time and first name, manual rows link to S11 edit at
// /podsetnici/[reminder_id] while generated rows (vaccination, dose, follow-up, meal, birthday) do not,
// "Učitaj još" pages, members without can_mark_done get no button, empty / error states.

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const listReminderOccurrences = vi.fn()
const markOccurrenceDone = vi.fn()
vi.mock("@/lib/actions/reminders", () => ({
  listReminderOccurrences: (...a: unknown[]) => listReminderOccurrences(...a),
  markOccurrenceDone: (...a: unknown[]) => markOccurrenceDone(...a),
}))

const { RemindersClient, RemindersLoading } = await import("@/app/(app)/podsetnici/reminders-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en") => ({
  reminders: dictionaries[locale].reminders,
  pet: dictionaries[locale].pet,
  common: dictionaries[locale].common,
})

function occurrence(id: string, extra: Partial<ReminderOccurrence> = {}): ReminderOccurrence {
  return {
    id,
    reminder_id: `rem-${id}`,
    type: "manual",
    title: `Podsetnik ${id}`,
    due_at: "2026-10-19T10:00:00Z",
    status: "pending",
    display_status: "today",
    pet_id: "c1",
    pet_name: "Luna",
    pet_sex: "female",
    pet_species: "cat",
    channels: ["email", "push"],
    sent_at: null,
    done_at: null,
    done_by: null,
    done_by_name: null,
    is_shared: false,
    can_mark_done: true,
    ...extra,
  }
}
const list = (items: ReminderOccurrence[], total = items.length) => ({
  items,
  total,
  counts: { today: 0, upcoming: 0, missed: 0, done: 0 },
})

const kupi = occurrence("o1", { title: "Kupi seno za Kiki", pet_id: null, pet_name: null, pet_sex: null, pet_species: null, due_at: "2026-10-19T15:30:00Z", channels: ["email"] })
const obrok = occurrence("o2", { type: "meal", title: null, due_at: "2026-10-19T06:00:00Z", channels: ["push"] })
const vakcina = occurrence("o3", { type: "vaccination", title: "Vakcina protiv besnila", display_status: "soon", due_at: "2026-10-26T08:00:00Z", pet_name: "Maks", pet_sex: "male", channels: ["email", "push", "whatsapp"] })
const doza = occurrence("o4", { type: "treatment_dose", title: "Sirup protiv kašlja, 5 ml", display_status: "soon", due_at: "2026-10-27T10:00:00Z" })
const kontrola = occurrence("o5", { type: "vet_follow_up", title: "Kontrola kod Dr Vet", display_status: "soon", due_at: "2026-11-03T09:30:00Z" })
const rodjendan = occurrence("o6", { type: "birthday", title: null, display_status: "soon", due_at: "2026-11-15T08:00:00Z", pet_name: "Kiki" })
const sisanje = occurrence("o7", { title: "Šišanje u salonu „Čupko“", display_status: "soon", due_at: "2026-11-08T10:00:00Z", pet_name: "Maks", pet_sex: "male" })
const propusteno = occurrence("o8", { type: "treatment_dose", title: "Tableta protiv glista", status: "missed", display_status: "missed", due_at: "2026-10-17T18:00:00Z" })
const uradjeno = occurrence("o9", { title: "Plati račun u Šapici", status: "done", display_status: "done", done_at: "2026-10-16T17:40:00Z", done_by: "u1", done_by_name: "Ivana Petrović", can_mark_done: false, pet_id: null, pet_name: null, pet_sex: null, pet_species: null })

function lists(extra: Partial<Record<"today" | "upcoming" | "missed" | "done", ReturnType<typeof list>>> = {}) {
  return {
    today: list([obrok, kupi]),
    upcoming: list([vakcina, doza, kontrola, sisanje, rodjendan]),
    missed: list([propusteno]),
    done: list([uradjeno]),
    ...extra,
  }
}

function renderScreen(props: Partial<Parameters<typeof RemindersClient>[0]> = {}) {
  return render(<RemindersClient lists={lists()} petNames={["Luna", "Maks", "Kiki"]} locale="sr" copy={copy("sr")} {...props} />)
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  vi.useRealTimers()
})

describe("S10 — tabs (EP-25)", () => {
  it("header, subtitle with the pet names, the four tabs with their counts", () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "Podsetnici" })).toBeInTheDocument()
    expect(screen.getByText("Ljubimci: Luna, Maks, Kiki — i podsetnici za tebe.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Podešavanja" })).toHaveAttribute("href", "/podesavanja/podsetnici")
    expect(screen.getByRole("link", { name: "Novi podsetnik" })).toHaveAttribute("href", "/podsetnici/novi")
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent)
    expect(tabs).toEqual(["Danas2", "Uskoro5", "Propušteno1", "Urađeno1"])
  })

  it("Danas rows: time in Belgrade, 'Za mene' without a pet, the meal title built from the pet", () => {
    renderScreen()
    const panel = screen.getByRole("tabpanel")
    expect(within(panel).getByText("Kupi seno za Kiki")).toBeInTheDocument()
    expect(within(panel).getByText("Za mene")).toBeInTheDocument()
    expect(within(panel).getByText("Danas u 17:30")).toBeInTheDocument()
    expect(within(panel).getByText("Obrok — Luna")).toBeInTheDocument()
    expect(within(panel).getByText("Danas u 08:00")).toBeInTheDocument()
    expect(within(panel).getByLabelText("Mejl")).toBeInTheDocument()
  })

  it("Uskoro rows show date and time; Propušteno shows the note", async () => {
    renderScreen()
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /Uskoro/ }))
    expect(screen.getByText("26. 10. 2026. u 09:00")).toBeInTheDocument()
    expect(screen.getByText("Rođendan — Kiki")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: /Propušteno/ }))
    expect(screen.getByText(/Ove podsetnike smo poslali dva puta/)).toBeInTheDocument()
    expect(screen.getByText("17. 10. 2026. u 20:00")).toBeInTheDocument()
  })
})

describe("S10 — CR-12 edit link", () => {
  it("manual rows link to /podsetnici/[reminder_id]; generated rows have no link", async () => {
    renderScreen()
    const user = userEvent.setup()
    expect(screen.getByRole("link", { name: "Kupi seno za Kiki" })).toHaveAttribute("href", "/podsetnici/rem-o1")
    expect(screen.queryByRole("link", { name: "Obrok — Luna" })).not.toBeInTheDocument()
    expect(screen.getByText("Obrok — Luna").tagName).toBe("P")

    await user.click(screen.getByRole("tab", { name: /Uskoro/ }))
    expect(screen.getByRole("link", { name: "Šišanje u salonu „Čupko“" })).toHaveAttribute("href", "/podsetnici/rem-o7")
    for (const title of ["Vakcina protiv besnila", "Sirup protiv kašlja, 5 ml", "Kontrola kod Dr Vet", "Rođendan — Kiki"]) {
      expect(screen.queryByRole("link", { name: title })).not.toBeInTheDocument()
      expect(screen.getByText(title)).toBeInTheDocument()
    }
  })

  it("a shared manual reminder (member view) has no edit link", () => {
    renderScreen({ lists: lists({ today: list([occurrence("o20", { title: "Vlasnikov podsetnik", is_shared: true })]) }) })
    expect(screen.queryByRole("link", { name: "Vlasnikov podsetnik" })).not.toBeInTheDocument()
  })
})

describe("S10 — FR-24 mark done (EP-26)", () => {
  it("'Urađeno' moves the row to Urađeno with time and first name and refreshes the badge", async () => {
    markOccurrenceDone.mockResolvedValue({
      ok: true,
      data: { ...kupi, status: "done", display_status: "done", done_at: "2026-10-19T08:15:00Z", done_by: "u1", done_by_name: "Ivana Petrović", can_mark_done: false },
    })
    renderScreen()
    const user = userEvent.setup()
    const row = screen.getByRole("link", { name: "Kupi seno za Kiki" }).closest("li")!
    await user.click(within(row).getByRole("button", { name: "Urađeno" }))
    expect(markOccurrenceDone).toHaveBeenCalledWith("o1")
    expect(screen.queryByRole("link", { name: "Kupi seno za Kiki" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Danas1", "Uskoro5", "Propušteno1", "Urađeno2"])
    expect(refresh).toHaveBeenCalled()

    await user.click(screen.getByRole("tab", { name: /Urađeno/ }))
    const done = screen.getByRole("link", { name: "Kupi seno za Kiki" }).closest("li")!
    expect(within(done).getByText("19. 10. 2026. u 10:15 · Ivana")).toBeInTheDocument()
    expect(within(done).queryByRole("button", { name: "Urađeno" })).not.toBeInTheDocument()
  })

  it("rows the caller may not mark (can_mark_done false) show no button", () => {
    renderScreen({ lists: lists({ today: list([occurrence("o21", { title: "Samo za čitanje", can_mark_done: false })]) }) })
    expect(screen.queryByRole("button", { name: "Urađeno" })).not.toBeInTheDocument()
  })

  it("household_read_only → no toast, the screen reloads; other failures → the error toast", async () => {
    markOccurrenceDone.mockResolvedValueOnce({ ok: false, error: { code: "household_read_only", message: "" } })
    renderScreen()
    const user = userEvent.setup()
    await user.click(screen.getAllByRole("button", { name: "Urađeno" })[0])
    expect(toast.error).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    markOccurrenceDone.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "" } })
    await user.click(screen.getAllByRole("button", { name: "Urađeno" })[0])
    expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
  })
})

describe("S10 — paging, empty, loading, error", () => {
  it("'Učitaj još' loads the next page of a paged tab (API §3.4)", async () => {
    listReminderOccurrences.mockResolvedValue({ ok: true, data: list([kontrola], 2) })
    renderScreen({ lists: lists({ upcoming: list([vakcina], 2) }) })
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: /Uskoro/ }))
    await user.click(screen.getByRole("button", { name: "Učitaj još" }))
    expect(listReminderOccurrences).toHaveBeenCalledWith({ filter: "upcoming", limit: 20, offset: 1 })
    expect(screen.getByText("Kontrola kod Dr Vet")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Učitaj još" })).not.toBeInTheDocument()
  })

  it("empty tabs show their copy; Danas and Uskoro offer 'Novi podsetnik'", async () => {
    renderScreen({ lists: { today: list([]), upcoming: list([]), missed: list([]), done: list([]) } })
    const user = userEvent.setup()
    expect(screen.getByRole("heading", { name: "Danas nema podsetnika" })).toBeInTheDocument()
    expect(within(screen.getByRole("tabpanel")).getByRole("link", { name: "Novi podsetnik" })).toHaveAttribute("href", "/podsetnici/novi")
    await user.click(screen.getByRole("tab", { name: /Urađeno/ }))
    expect(screen.getByRole("heading", { name: "Još ništa nije urađeno" })).toBeInTheDocument()
    expect(within(screen.getByRole("tabpanel")).queryByRole("link", { name: "Novi podsetnik" })).not.toBeInTheDocument()
  })

  it("loading shows the skeleton rows; a failed read shows the error state", async () => {
    const { unmount } = render(<RemindersLoading copy={copy("sr")} />)
    expect(screen.getByLabelText("Učitavanje podsetnika")).toHaveAttribute("aria-busy", "true")
    unmount()
    renderScreen({ lists: null })
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    await userEvent.setup().click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(refresh).toHaveBeenCalled()
  })

  it("English: strings and dates come from the en dictionary", () => {
    renderScreen({ locale: "en", copy: copy("en") })
    expect(screen.getByRole("heading", { level: 1, name: "Reminders" })).toBeInTheDocument()
    expect(screen.getByText("Pets: Luna, Maks, Kiki — and reminders for you.")).toBeInTheDocument()
    expect(screen.getByText("Today at 17:30")).toBeInTheDocument()
    expect(screen.getByText("For me")).toBeInTheDocument()
    expect(screen.getByText("Meal — Luna")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Done" })).toHaveLength(2)
  })
})
