import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ReminderPreference,
  ReminderSettings,
  ReminderSettingsActions,
} from "@/app/(app)/podesavanja/podsetnici/reminder-settings-client"

// S12 Podešavanja podsetnika (Step 18): FR-22 lead-time chips and delivery time saved per type card,
// doses and meals at the exact time; FR-23 email and push for everyone, several channels stored per type,
// WhatsApp / Viber Premium-only on Free (FR-36), Viber absent while viber_enabled = false (BR-14b); the
// "WhatsApp uskoro" state for Premium users until Step 29 (CR-13); premium_required on save → G state;
// error state when the EP-28 read fails.

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
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
  return {
    type,
    lead_minutes: type === "vaccination" ? [10080, 0] : type === "vet_follow_up" ? [1440, 0] : [0],
    delivery_time: fixed ? null : "09:00",
    channels: ["email", "push"],
    fixed_time: fixed,
    is_default: false,
    updated_at: "2026-10-20T08:00:00Z",
    ...extra,
  }
}

function settings(extra: Partial<ReminderSettings> = {}, prefs: Partial<Record<string, Partial<ReminderPreference>>> = {}) {
  const types = ["vaccination", "treatment_dose", "vet_follow_up", "meal", "birthday", "manual"] as const
  return {
    preferences: types.map((t) => pref(t, prefs[t])),
    viber_enabled: false,
    whatsapp: { channel: "whatsapp", status: "not_connected", phone: null, connected_at: null },
    ...extra,
  } as ReminderSettings
}

const savePreference = vi.fn()
const actions: ReminderSettingsActions = {
  savePreference: (...a) => savePreference(...a),
  registerPush: vi.fn(),
  checkPush: vi.fn(),
  unregisterPush: vi.fn(),
}

function renderScreen(
  props: { settings?: ReminderSettings | null; premium?: boolean; locale?: "sr" | "en" } = {},
) {
  return render(
    <ReminderSettingsClient
      settings={props.settings === undefined ? settings() : props.settings}
      email="ivana.petrovic@mojljubimac.test"
      premium={props.premium ?? false}
      vapidPublicKey=""
      copy={copy(props.locale ?? "sr")}
      actions={actions}
    />,
  )
}

function card(name: string) {
  return screen.getByRole("heading", { level: 3, name }).closest('[data-slot="card"]') as HTMLElement
}

beforeEach(() => {
  savePreference.mockReset()
  savePreference.mockImplementation(async (input: ReminderPreference) => ({
    ok: true,
    data: { ...input, fixed_time: input.type === "treatment_dose" || input.type === "meal", is_default: false, updated_at: "2026-10-23T10:00:00Z" },
  }))
  toast.error.mockReset()
  refresh.mockReset()
})

describe("S12 — FR-22 lead times and delivery time", () => {
  it("renders one card per type from EP-28 with the stored lead-time chips and time", () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "Podešavanja podsetnika" })).toBeInTheDocument()
    expect(screen.getByText("Mejl stiže uvek na ivana.petrovic@mojljubimac.test. Ovde uključuješ push i povezuješ WhatsApp.")).toBeInTheDocument()
    for (const name of ["Vakcine", "Terapije i doze", "Kontrole", "Obroci", "Rođendani", "Moji podsetnici"]) {
      expect(card(name)).toBeInTheDocument()
    }
    const vakcine = within(card("Vakcine"))
    expect(vakcine.getByRole("button", { name: "7 dana pre" })).toHaveAttribute("aria-pressed", "true")
    expect(vakcine.getByRole("button", { name: "Na dan" })).toHaveAttribute("aria-pressed", "true")
    expect(vakcine.getByRole("button", { name: "1 dan pre" })).toHaveAttribute("aria-pressed", "false")
    expect(vakcine.getByLabelText("Vreme slanja")).toHaveValue("09:00")
  })

  it("saves the changed card's lead times (minutes) and delivery time through EP-28 — one call per changed card", async () => {
    const user = userEvent.setup()
    renderScreen()
    const vakcine = within(card("Vakcine"))
    await user.click(vakcine.getByRole("button", { name: "7 dana pre" }))
    await user.click(vakcine.getByRole("button", { name: "14 dana pre" }))
    fireEvent.change(vakcine.getByLabelText("Vreme slanja"), { target: { value: "08:30" } })
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Podešavanja su sačuvana."))
    expect(savePreference).toHaveBeenCalledTimes(1)
    expect(savePreference).toHaveBeenCalledWith({
      type: "vaccination",
      lead_minutes: [20160, 0],
      delivery_time: "08:30",
      channels: ["email", "push"],
    })
  })

  it("sends 7 days before and on the day as {10080, 0}", async () => {
    const user = userEvent.setup()
    renderScreen({ settings: settings({}, { vet_follow_up: { lead_minutes: [0] } }) })
    const kontrole = within(card("Kontrole"))
    await user.click(kontrole.getByRole("button", { name: "7 dana pre" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    await waitFor(() => expect(savePreference).toHaveBeenCalledTimes(1))
    expect(savePreference.mock.calls[0][0]).toMatchObject({ type: "vet_follow_up", lead_minutes: [10080, 0], delivery_time: "09:00" })
  })

  it("needs at least one lead time and a delivery time before saving", async () => {
    const user = userEvent.setup()
    renderScreen()
    const rodjendani = within(card("Rođendani"))
    await user.click(rodjendani.getByRole("button", { name: "Na dan" }))
    expect(rodjendani.getByText("Izaberi bar jedno vreme podsećanja.")).toBeInTheDocument()
    const moji = within(card("Moji podsetnici"))
    fireEvent.change(moji.getByLabelText("Vreme slanja"), { target: { value: "" } })
    expect(moji.getByText("Upiši vreme slanja.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    expect(savePreference).not.toHaveBeenCalled()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("doses and meals show 'Stižu tačno u zadato vreme.' with no lead-time chips or time, and save as {0} / null", async () => {
    const user = userEvent.setup()
    renderScreen()
    for (const name of ["Terapije i doze", "Obroci"]) {
      const c = within(card(name))
      expect(c.getByText("Stižu tačno u zadato vreme.")).toBeInTheDocument()
      expect(c.queryByRole("button", { name: "Na dan" })).not.toBeInTheDocument()
      expect(c.queryByText("Koliko ranije")).not.toBeInTheDocument()
      expect(c.queryByLabelText("Vreme slanja")).not.toBeInTheDocument()
    }
    await user.click(within(card("Obroci")).getByRole("checkbox", { name: "Mejl" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    await waitFor(() => expect(savePreference).toHaveBeenCalledTimes(1))
    expect(savePreference).toHaveBeenCalledWith({ type: "meal", lead_minutes: [0], delivery_time: null, channels: ["push"] })
  })
})

describe("S12 — FR-23 channels", () => {
  it("email and push are available on every type card", () => {
    renderScreen()
    expect(screen.getAllByRole("checkbox", { name: "Mejl" })).toHaveLength(6)
    expect(screen.getAllByRole("checkbox", { name: "Push" })).toHaveLength(6)
    for (const box of [...screen.getAllByRole("checkbox", { name: "Mejl" }), ...screen.getAllByRole("checkbox", { name: "Push" })]) {
      expect(box).toBeEnabled()
      expect(box).toBeChecked()
    }
  })

  it("needs at least one channel per type", async () => {
    const user = userEvent.setup()
    renderScreen()
    const vakcine = within(card("Vakcine"))
    await user.click(vakcine.getByRole("checkbox", { name: "Mejl" }))
    await user.click(vakcine.getByRole("checkbox", { name: "Push" }))
    expect(vakcine.getByText("Izaberi bar jedan kanal.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    expect(savePreference).not.toHaveBeenCalled()
  })

  it("Free user: WhatsApp is Premium-locked (checkbox disabled with the Premium badge, Kanali form inside PremiumLock)", () => {
    renderScreen({ settings: settings({}, { vaccination: { channels: ["email", "push", "whatsapp"] } }) })
    const boxes = screen.getAllByRole("checkbox", { name: "WhatsApp" })
    expect(boxes).toHaveLength(6)
    for (const box of boxes) {
      expect(box).toBeDisabled()
      expect(box).not.toBeChecked()
      const row = box.parentElement as HTMLElement
      expect(within(row).getByText("Premium")).toBeInTheDocument()
      expect(within(row).getByText("Dostupno u Premiumu")).toHaveClass("sr-only")
      expect(box).toHaveAccessibleDescription("Dostupno u Premiumu")
    }

    const wa = screen.getByRole("heading", { level: 3, name: "WhatsApp" }).closest("section") as HTMLElement
    const lock = within(wa).getByRole("heading", { level: 2, name: "Dostupno u Premiumu" })
    expect(lock).toBeInTheDocument()
    expect(within(wa).getByText("Poveži broj telefona i primaj važne podsetnike i na WhatsApp-u, pored mejla i push obaveštenja.")).toBeInTheDocument()
    const number = wa.querySelector("#wa-number") as HTMLInputElement
    expect(number).toBeDisabled()
    expect(number.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(within(wa).queryByText("Uskoro dostupno")).not.toBeInTheDocument()
  })

  it("Viber is absent while viber_enabled = false, and Premium-only on Free when switched on", () => {
    const { unmount } = renderScreen()
    expect(screen.queryByRole("checkbox", { name: "Viber" })).not.toBeInTheDocument()
    expect(screen.queryByText("Viber")).not.toBeInTheDocument()
    unmount()

    renderScreen({ settings: settings({ viber_enabled: true }) })
    const vibers = screen.getAllByRole("checkbox", { name: "Viber" })
    expect(vibers).toHaveLength(6)
    for (const box of vibers) expect(box).toBeDisabled()
  })

  it("several channels are stored per type (email, push and Viber for a Premium user)", async () => {
    const user = userEvent.setup()
    renderScreen({ premium: true, settings: settings({ viber_enabled: true }) })
    await user.click(within(card("Vakcine")).getByRole("checkbox", { name: "Viber" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    await waitFor(() => expect(savePreference).toHaveBeenCalledTimes(1))
    expect(savePreference.mock.calls[0][0].channels).toEqual(["email", "push", "viber"])
  })

  it("403 premium_required on save → premium_locked state", async () => {
    const user = userEvent.setup()
    savePreference.mockResolvedValueOnce({ ok: false, error: { code: "premium_required", message: "premium_required:whatsapp", details: { limit: "whatsapp" } } })
    renderScreen({ premium: true, settings: settings({ viber_enabled: true }) })
    await user.click(within(card("Vakcine")).getByRole("checkbox", { name: "Viber" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Dostupno u Premiumu" })).toBeInTheDocument())
    for (const box of screen.getAllByRole("checkbox", { name: "WhatsApp" })) expect(box).toBeDisabled()
    expect(screen.queryByText("Podešavanja su sačuvana.")).not.toBeInTheDocument()
  })

  it("a failed save shows the error toast", async () => {
    const user = userEvent.setup()
    savePreference.mockResolvedValueOnce({ ok: false, error: { code: "internal_error", message: "boom" } })
    renderScreen()
    await user.click(within(card("Vakcine")).getByRole("button", { name: "1 dan pre" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
    expect(screen.queryByText("Podešavanja su sačuvana.")).not.toBeInTheDocument()
  })
})

describe("S12 — WhatsApp uskoro (Premium, until Step 29)", () => {
  it("shows the 'Uskoro dostupno' badge and line instead of the number form; WhatsApp checkboxes disabled and unchecked; no counter card", async () => {
    const user = userEvent.setup()
    renderScreen({ premium: true, settings: settings({}, { vaccination: { channels: ["email", "push", "whatsapp"] } }) })
    const wa = screen.getByRole("heading", { level: 3, name: "WhatsApp" }).closest("section") as HTMLElement
    expect(within(wa).getByText("Uskoro dostupno")).toBeInTheDocument()
    expect(
      within(wa).getByText(
        "WhatsApp podsetnici stižu uskoro. Javićemo ti mejlom kad budeš mogao/la da povežeš broj — do tada podsetnici stižu mejlom i push-om.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("Broj telefona za WhatsApp")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Pošalji kod" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Dostupno u Premiumu" })).not.toBeInTheDocument()

    const boxes = screen.getAllByRole("checkbox", { name: "WhatsApp" })
    expect(boxes).toHaveLength(6)
    for (const box of boxes) {
      expect(box).toBeDisabled()
      expect(box).not.toBeChecked()
      expect(box).toHaveAccessibleDescription("Uskoro dostupno")
    }
    expect(screen.queryByText(/poruka ovog meseca/)).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "WhatsApp poruke" })).not.toBeInTheDocument()

    // A stored WhatsApp choice is not sent while the channel is not live.
    await user.click(within(card("Vakcine")).getByRole("button", { name: "1 dan pre" }))
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    await waitFor(() => expect(savePreference).toHaveBeenCalledTimes(1))
    expect(savePreference.mock.calls[0][0].channels).toEqual(["email", "push"])
  })
})

describe("S12 — states and locale", () => {
  it("a failed EP-28 read shows the error state; retry refreshes", async () => {
    const user = userEvent.setup()
    renderScreen({ settings: null })
    expect(screen.getByRole("alert")).toHaveTextContent("Nešto nije u redu. Pokušaj ponovo.")
    await user.click(screen.getByRole("button", { name: "Pokušaj ponovo" }))
    expect(refresh).toHaveBeenCalled()
  })

  it("renders in English from en.ts", () => {
    renderScreen({ locale: "en", premium: true })
    expect(screen.getByRole("heading", { level: 1, name: "Reminder settings" })).toBeInTheDocument()
    expect(card("Vaccinations")).toBeInTheDocument()
    expect(within(card("Meals")).getByText("They arrive exactly at the set time.")).toBeInTheDocument()
    expect(screen.getAllByRole("checkbox", { name: "Email" })).toHaveLength(6)
    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument()
  })
})
