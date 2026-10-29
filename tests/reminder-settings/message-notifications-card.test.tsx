import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ReminderPreference,
  ReminderSettings,
  ReminderSettingsActions,
} from "@/app/(app)/podesavanja/podsetnici/reminder-settings-client"

// S12 "Šapa pomoći" → "Poruke" card (Step 28c, FR-69 #2, #3; EP-28 type message): EP-28 now returns seven rows; the
// six reminder-type cards stay as they were and the message row becomes the Poruke card with Mejl and Push Switches
// (no lead time, no delivery time, never WhatsApp / Viber), saved by "Sačuvaj podešavanja" through the EP-28 upsert
// with type message (saveMessagePreference); the push hint while browser push is not on; both off → the
// "only in the app" line.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { ReminderSettingsClient } = await import("@/app/(app)/podesavanja/podsetnici/reminder-settings-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = (locale: "sr" | "en") => ({
  reminderSettings: dictionaries[locale].reminderSettings,
  common: dictionaries[locale].common,
})

function pref(type: ReminderPreference["type"], extra: Partial<ReminderPreference> = {}): ReminderPreference {
  const fixed = type === "treatment_dose" || type === "meal"
  const noTime = fixed || type === "message"
  return {
    type,
    lead_minutes: type === "vaccination" ? [10080, 0] : [0],
    delivery_time: noTime ? null : "09:00",
    channels: ["email", "push"],
    fixed_time: fixed,
    is_default: false,
    updated_at: "2026-10-20T08:00:00Z",
    ...extra,
  }
}

/** The seven-row EP-28 response (Step 28c). */
function settings(message: Partial<ReminderPreference> = {}): ReminderSettings {
  const types = ["vaccination", "treatment_dose", "vet_follow_up", "meal", "birthday", "manual"] as const
  return {
    preferences: [...types.map((t) => pref(t)), pref("message", message)],
    viber_enabled: false,
    whatsapp: { channel: "whatsapp", status: "not_connected", phone: null, connected_at: null },
  }
}

const savePreference = vi.fn()
const saveMessagePreference = vi.fn()
const actions: ReminderSettingsActions = {
  savePreference: (...a) => savePreference(...a),
  saveMessagePreference: (...a) => saveMessagePreference(...a),
  registerPush: vi.fn(),
  checkPush: vi.fn(),
  unregisterPush: vi.fn(),
}

function renderScreen(s: ReminderSettings = settings(), locale: "sr" | "en" = "sr") {
  return render(
    <ReminderSettingsClient
      settings={s}
      email="ivana.petrovic@mojljubimac.test"
      premium={false}
      vapidPublicKey=""
      copy={copy(locale)}
      actions={actions}
    />,
  )
}

const card = () => screen.getByRole("heading", { level: 3, name: "Poruke" }).closest('[data-slot="card"]') as HTMLElement

beforeEach(() => {
  savePreference.mockReset()
  saveMessagePreference.mockReset()
  saveMessagePreference.mockImplementation(async (input: { channels: string[] }) => ({ ok: true, data: input }))
  toast.error.mockReset()
})

describe("S12 Poruke card", () => {
  it("FR-69 #3: a new user's message row shows both switches on; the six type cards are unchanged", () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 2, name: "Šapa pomoći" })).toBeInTheDocument()
    const poruke = within(card())
    expect(poruke.getByText("Kad ti neko piše povodom oglasa. Stižu odmah.")).toBeInTheDocument()
    expect(poruke.getByRole("switch", { name: "Mejl" })).toBeChecked()
    expect(poruke.getByRole("switch", { name: "Push" })).toBeChecked()
    // No lead time, delivery time, or WhatsApp / Viber for messages.
    expect(poruke.queryByText("Koliko ranije")).not.toBeInTheDocument()
    expect(poruke.queryByLabelText("Vreme slanja")).not.toBeInTheDocument()
    expect(poruke.queryByText("WhatsApp")).not.toBeInTheDocument()
    const typeCards = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    expect(typeCards).toEqual(
      expect.arrayContaining(["Vakcine", "Terapije i doze", "Kontrole", "Obroci", "Rođendani", "Moji podsetnici", "Poruke"]),
    )
    expect(screen.getAllByRole("checkbox", { name: "Mejl" })).toHaveLength(6)
  })

  it("while browser push is not on, the push hint shows", () => {
    renderScreen()
    expect(within(card()).getByText("Push stiže tek kad uključiš obaveštenja u kartici „Kanali“ iznad.")).toBeInTheDocument()
  })

  it("FR-69 #2: switching email off saves {push} through EP-28 type message", async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(card()).getByRole("switch", { name: "Mejl" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    expect(saveMessagePreference).toHaveBeenCalledWith({ channels: ["push"] })
    expect(savePreference).not.toHaveBeenCalled()
    expect(await screen.findByRole("status", { name: "" })).toHaveTextContent("Podešavanja su sačuvana.")
  })

  it("both off → the in-app-only line, and {} is saved", async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(card()).getByRole("switch", { name: "Mejl" }))
    await user.click(within(card()).getByRole("switch", { name: "Push" }))
    expect(within(card()).getByText("Nove poruke ćeš videti samo u aplikaciji, u Porukama.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    expect(saveMessagePreference).toHaveBeenCalledWith({ channels: [] })
  })

  it("a stored {} row shows both switches off", () => {
    renderScreen(settings({ channels: [] }))
    expect(within(card()).getByRole("switch", { name: "Mejl" })).not.toBeChecked()
    expect(within(card()).getByRole("switch", { name: "Push" })).not.toBeChecked()
    expect(within(card()).getByText("Nove poruke ćeš videti samo u aplikaciji, u Porukama.")).toBeInTheDocument()
  })

  it("an unchanged card is not saved", async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    expect(saveMessagePreference).not.toHaveBeenCalled()
  })

  it("a failed save shows the error toast", async () => {
    saveMessagePreference.mockResolvedValue({ ok: false, error: { code: "validation_failed", message: "x", fields: { channels: "invalid" } } })
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(card()).getByRole("switch", { name: "Push" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
  })

  it("English copy", () => {
    renderScreen(settings(), "en")
    expect(screen.getByRole("heading", { level: 3, name: "Messages" })).toBeInTheDocument()
    expect(screen.getByText("When someone writes to you about a listing. They arrive right away.")).toBeInTheDocument()
  })
})
