import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CareLogActions, CareLogPet, MealSchedule } from "@/app/(app)/ljubimci/[id]/dnevnik/care-log-client"

// S07 "Podsetnici za obroke" card (Step 20) · FR-15 meal times on every day or chosen weekdays, saved with
// EP-19 set (rpc:set_meal_schedule) so a meal reminder goes out at each time on each selected day; empty
// times remove the schedule (owner decision). EP-19 get: the card shows times and weekday chips; a member
// sees them without any edit control (Member 👁).

const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { CareLogClient } = await import("@/app/(app)/ljubimci/[id]/dnevnik/care-log-client")
const { dictionaries } = await import("@/lib/i18n")

const LUNA = "c1000000-0000-4000-8000-000000000001"
const REMINDER = "d1000000-0000-4000-8000-000000000001"

const copy = (locale: "sr" | "en") => ({
  careLog: dictionaries[locale].careLog,
  pet: dictionaries[locale].pet,
  petForm: dictionaries[locale].petForm,
  common: dictionaries[locale].common,
})

const OWNER_PET: CareLogPet = {
  id: LUNA,
  name: "Luna",
  sex: "female",
  species: "cat",
  species_other: null,
  breed: null,
  lifecycle: "active",
  access: { role: "owner", can_edit: true, can_delete: true },
  can_log: true,
}
const MEMBER_PET: CareLogPet = { ...OWNER_PET, access: { role: "member", can_edit: false, can_delete: false } }

function schedule(meal_times: string[], meal_weekdays: number[]): MealSchedule {
  return {
    pet_id: LUNA,
    reminder_id: REMINDER,
    meal_times,
    meal_weekdays,
    every_day: meal_weekdays.length === 7,
    active: true,
  }
}

const setMealSchedule = vi.fn()
const actions: CareLogActions = {
  listEntries: vi.fn(),
  createFeeding: vi.fn(),
  updateFeeding: vi.fn(),
  createStool: vi.fn(),
  updateStool: vi.fn(),
  deleteEntry: vi.fn(),
  setMealSchedule: (...a) => setMealSchedule(...a),
}

function renderCard(pet: CareLogPet, value: MealSchedule | null, locale: "sr" | "en" = "sr") {
  render(
    <CareLogClient
      pet={pet}
      feeding={{ items: [], total: 0 }}
      stool={{ items: [], total: 0 }}
      schedule={value}
      now="2026-10-19T10:00:00Z"
      locale={locale}
      copy={copy(locale)}
      actions={actions}
    />,
  )
  return screen.getByRole("complementary", { name: dictionaries[locale].careLog.mealTitle })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("S07 Podsetnici za obroke — owner (FR-15, EP-19)", () => {
  it("shows the saved times and the chosen weekday chips", () => {
    const card = renderCard(OWNER_PET, schedule(["08:00", "18:00"], [1, 3, 5]))
    expect(within(card).getByText("Stižu tačno u zadato vreme.")).toBeInTheDocument()
    const times = within(card).getByRole("list", { name: "Vremena obroka" })
    expect(within(times).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["08:00", "18:00"])
    expect(within(card).getByRole("switch", { name: "Svaki dan" })).not.toBeChecked()
    const pressed = within(card)
      .getAllByRole("button", { pressed: true })
      .map((b) => b.getAttribute("aria-label"))
    expect(pressed).toEqual(["ponedeljak", "sreda", "petak"])
    expect(within(card).getByRole("button", { name: "utorak" })).toHaveAttribute("aria-pressed", "false")
    expect(within(card).getByRole("button", { name: "ponedeljak" })).toHaveTextContent("Pon")
  })

  it("adds a time, changes the days and saves 08:00 / 13:00 / 18:00 on chosen weekdays through EP-19", async () => {
    const user = userEvent.setup()
    const card = renderCard(OWNER_PET, schedule(["08:00", "18:00"], [1, 3, 5]))
    fireEvent.change(within(card).getByLabelText("Dodaj vreme obroka"), { target: { value: "13:00" } })
    await user.click(within(card).getByRole("button", { name: "Dodaj" }))
    await user.click(within(card).getByRole("button", { name: "sreda" }))
    await user.click(within(card).getByRole("button", { name: "subota" }))

    setMealSchedule.mockResolvedValueOnce({ ok: true, data: schedule(["08:00", "13:00", "18:00"], [1, 5, 6]) })
    await user.click(within(card).getByRole("button", { name: "Sačuvaj podsetnike" }))
    expect(setMealSchedule).toHaveBeenCalledWith({
      pet_id: LUNA,
      meal_times: ["08:00", "13:00", "18:00"],
      meal_weekdays: [1, 5, 6],
    })
    expect(await within(card).findByRole("status")).toHaveTextContent("Podsetnici za obroke su sačuvani.")
    expect(within(card).getByRole("button", { name: "Ukloni obrok u 13:00" })).toBeInTheDocument()
  })

  it("“Svaki dan” sends all seven weekdays", async () => {
    const user = userEvent.setup()
    const card = renderCard(OWNER_PET, null)
    expect(within(card).getByText("Nema zadatih obroka.")).toBeInTheDocument()
    expect(within(card).getByRole("switch", { name: "Svaki dan" })).toBeChecked()
    expect(within(card).getByRole("button", { name: "Sačuvaj podsetnike" })).toBeDisabled()

    fireEvent.change(within(card).getByLabelText("Dodaj vreme obroka"), { target: { value: "08:00" } })
    await user.click(within(card).getByRole("button", { name: "Dodaj" }))
    setMealSchedule.mockResolvedValueOnce({ ok: true, data: schedule(["08:00"], [1, 2, 3, 4, 5, 6, 7]) })
    await user.click(within(card).getByRole("button", { name: "Sačuvaj podsetnike" }))
    expect(setMealSchedule).toHaveBeenCalledWith({ pet_id: LUNA, meal_times: ["08:00"], meal_weekdays: [1, 2, 3, 4, 5, 6, 7] })
  })

  it("needs at least one day when “Svaki dan” is off", async () => {
    const user = userEvent.setup()
    const card = renderCard(OWNER_PET, schedule(["08:00"], [2]))
    await user.click(within(card).getByRole("button", { name: "utorak" }))
    expect(within(card).getByText("Izaberi bar jedan dan.")).toBeInTheDocument()
    expect(within(card).getByRole("button", { name: "Sačuvaj podsetnike" })).toBeDisabled()
  })

  it("removing every time of an existing schedule saves empty arrays and removes it", async () => {
    const user = userEvent.setup()
    const card = renderCard(OWNER_PET, schedule(["08:00"], [1, 2, 3, 4, 5, 6, 7]))
    await user.click(within(card).getByRole("button", { name: "Ukloni obrok u 08:00" }))
    expect(within(card).getByText("Nema zadatih obroka.")).toBeInTheDocument()
    setMealSchedule.mockResolvedValueOnce({
      ok: true,
      data: { pet_id: LUNA, reminder_id: null, meal_times: [], meal_weekdays: [], every_day: false, active: false },
    })
    await user.click(within(card).getByRole("button", { name: "Sačuvaj podsetnike" }))
    expect(setMealSchedule).toHaveBeenCalledWith({ pet_id: LUNA, meal_times: [], meal_weekdays: [] })
    expect(await within(card).findByRole("status")).toHaveTextContent("Podsetnici za obroke su sačuvani.")
    // Without a schedule there is nothing left to remove.
    expect(within(card).getByRole("button", { name: "Sačuvaj podsetnike" })).toBeDisabled()
  })

  it("a failed save shows the error toast", async () => {
    const user = userEvent.setup()
    const card = renderCard(OWNER_PET, schedule(["08:00"], [1]))
    setMealSchedule.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "x" } })
    await user.click(within(card).getByRole("button", { name: "Sačuvaj podsetnike" }))
    expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo.")
    expect(within(card).queryByRole("status")).not.toBeInTheDocument()
  })

  it("English labels", () => {
    const card = renderCard(OWNER_PET, schedule(["08:00"], [1, 3]), "en")
    expect(within(card).getByRole("heading", { name: "Meal reminders" })).toBeInTheDocument()
    expect(within(card).getByRole("button", { name: "Monday" })).toHaveTextContent("Mon")
    expect(within(card).getByRole("button", { name: "Save reminders" })).toBeEnabled()
  })
})

describe("S07 Podsetnici za obroke — member (EP-19 get, 👁)", () => {
  it("sees the times and weekday chips but no edit controls", () => {
    const card = renderCard(MEMBER_PET, schedule(["08:00", "18:00"], [1, 3, 5]))
    const times = within(card).getByRole("list", { name: "Vremena obroka" })
    expect(within(times).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["08:00", "18:00"])
    const chips = within(card).getByRole("list", { name: "Izabrani dani" })
    expect(within(chips).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Pon", "Sre", "Pet"])
    expect(within(card).queryByRole("button")).not.toBeInTheDocument()
    expect(within(card).queryByRole("switch")).not.toBeInTheDocument()
    expect(within(card).queryByLabelText("Dodaj vreme obroka")).not.toBeInTheDocument()
  })

  it("an every-day schedule reads “Svaki dan”; no schedule reads “Nema zadatih obroka.”", () => {
    const card = renderCard(MEMBER_PET, schedule(["07:30"], [1, 2, 3, 4, 5, 6, 7]))
    expect(within(card).getByText("Svaki dan")).toBeInTheDocument()
    expect(within(card).queryByRole("button")).not.toBeInTheDocument()
  })

  it("no schedule", () => {
    const card = renderCard(MEMBER_PET, null)
    expect(within(card).getByText("Nema zadatih obroka.")).toBeInTheDocument()
    expect(within(card).queryByRole("button")).not.toBeInTheDocument()
  })

  it("the owner of a memorial pet gets no edit controls either (BR-17)", () => {
    const card = renderCard({ ...OWNER_PET, lifecycle: "memorial" }, null)
    expect(within(card).queryByRole("button", { name: "Sačuvaj podsetnike" })).not.toBeInTheDocument()
  })
})
