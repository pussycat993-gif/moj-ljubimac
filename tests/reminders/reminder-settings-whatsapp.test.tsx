import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ChannelUsage,
  ReminderPreference,
  ReminderSettings,
  ReminderSettingsActions,
} from "@/app/(app)/podesavanja/podsetnici/reminder-settings-client"

// S12 WhatsApp parts (Step 29): the Kanali card connection through EP-30 (number → "Pošalji kod" → code →
// "Povezano" → "Prekini vezu"; inline errors for 422 / 429), the WhatsApp checkbox per type and the
// "n / 30 poruka ovog meseca" counter card from EP-31 for Premium. FR-23 #2: a connected Premium user can
// save whatsapp in a type's channels; Viber is absent while viber_enabled = false; a save answered 409
// whatsapp_not_connected keeps the card unsaved and shows the error. FR-23 #3: on Free the Kanali WhatsApp
// form sits inside PremiumLock and every WhatsApp checkbox is disabled with the Premium badge; no counter.

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
  return {
    type,
    lead_minutes: fixed ? [0] : [1440, 0],
    delivery_time: fixed ? null : "09:00",
    channels: ["email", "push"],
    fixed_time: fixed,
    is_default: false,
    updated_at: "2026-10-20T08:00:00Z",
    ...extra,
  }
}

const CONNECTED = { channel: "whatsapp", status: "connected", phone: "+381641234567", connected_at: "2026-10-20T08:00:00Z" } as const
const NOT_CONNECTED = { channel: "whatsapp", status: "not_connected", phone: null, connected_at: null } as const

function settings(
  whatsapp: ReminderSettings["whatsapp"] = NOT_CONNECTED,
  prefs: Partial<Record<string, Partial<ReminderPreference>>> = {},
  viberEnabled = false,
): ReminderSettings {
  const types = ["vaccination", "treatment_dose", "vet_follow_up", "meal", "birthday", "manual"] as const
  return { preferences: types.map((t) => pref(t, prefs[t])), viber_enabled: viberEnabled, whatsapp }
}

const USAGE: ChannelUsage = { month: "2026-10", used: 12, used_whatsapp: 12, used_viber: 0, cap: 30, remaining: 18, resets_on: "2026-11-01" }

const savePreference = vi.fn()
const whatsappConnection = vi.fn()
const actions: ReminderSettingsActions = {
  savePreference: (...a) => savePreference(...a),
  registerPush: vi.fn(),
  checkPush: vi.fn(),
  unregisterPush: vi.fn(),
  whatsappConnection: (...a) => whatsappConnection(...a),
}

function renderScreen(
  props: { settings?: ReminderSettings; premium?: boolean; usage?: ChannelUsage | null; locale?: "sr" | "en" } = {},
) {
  const locale = props.locale ?? "sr"
  return render(
    <ReminderSettingsClient
      settings={props.settings ?? settings()}
      email="ivana.petrovic@mojljubimac.test"
      premium={props.premium ?? true}
      vapidPublicKey=""
      copy={copy(locale)}
      actions={actions}
      usage={props.usage === undefined ? USAGE : props.usage}
      locale={locale}
    />,
  )
}

const waSection = () => screen.getByRole("heading", { level: 3, name: "WhatsApp" }).closest("section") as HTMLElement
const card = (name: string) => screen.getByRole("heading", { level: 3, name }).closest('[data-slot="card"]') as HTMLElement

async function enterNumber(user: ReturnType<typeof userEvent.setup>, value = "+381641234567") {
  const number = within(waSection()).getByLabelText("Broj telefona za WhatsApp")
  await user.clear(number)
  await user.type(number, value)
}

const CODE_SENT = {
  phone: "+381641234567",
  expires_at: "2026-10-29T08:10:00Z",
  resend_available_at: "2000-01-01T00:00:00Z",
  verification_token: "wv_token.sig",
}

beforeEach(() => {
  savePreference.mockReset()
  savePreference.mockImplementation(async (input: ReminderPreference) => ({
    ok: true,
    data: { ...input, fixed_time: false, is_default: false, updated_at: "2026-10-29T08:00:00Z" },
  }))
  whatsappConnection.mockReset()
  toast.error.mockReset()
})

describe("EP-30 — Kanali card connection", () => {
  it("number → 'Pošalji kod' (E.164, idempotency key) → code → 'Potvrdi' → 'Povezano: …' → 'Prekini vezu'", async () => {
    const user = userEvent.setup()
    renderScreen()
    whatsappConnection.mockResolvedValueOnce({ ok: true, data: CODE_SENT })
    const number = within(waSection()).getByLabelText("Broj telefona za WhatsApp")
    await user.clear(number)
    await user.type(number, "064 123 4567")
    await user.click(within(waSection()).getByRole("button", { name: "Pošalji kod" }))

    expect(whatsappConnection).toHaveBeenCalledWith({
      op: "send_code",
      phone: "+381641234567",
      idempotency_key: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    })
    expect(await within(waSection()).findByText("+381 64 123 4567")).toBeInTheDocument()
    expect(within(waSection()).getByText(/Poslali smo kod na/)).toBeInTheDocument()

    whatsappConnection.mockResolvedValueOnce({ ok: true, data: { ...CONNECTED } })
    await user.type(within(waSection()).getByLabelText("Kod iz poruke"), "042917")
    await user.click(within(waSection()).getByRole("button", { name: "Potvrdi" }))
    expect(whatsappConnection).toHaveBeenLastCalledWith({ op: "verify_code", verification_token: "wv_token.sig", code: "042917" })
    expect(await within(waSection()).findByRole("status")).toHaveTextContent("Povezano: +381 64 123 4567")
    // Connected: the "Broj nije povezan" note disappears from the type cards.
    expect(screen.queryByText("Broj nije povezan")).not.toBeInTheDocument()

    whatsappConnection.mockResolvedValueOnce({ ok: true, data: { ...NOT_CONNECTED } })
    await user.click(within(waSection()).getByRole("button", { name: "Prekini vezu" }))
    expect(whatsappConnection).toHaveBeenLastCalledWith({ op: "disconnect" })
    expect(await within(waSection()).findByLabelText("Broj telefona za WhatsApp")).toBeInTheDocument()
  })

  it("a connected number shows 'Povezano'; disconnect removes WhatsApp from the cards (a card left empty → email + push)", async () => {
    const user = userEvent.setup()
    renderScreen({ settings: settings(CONNECTED, { vaccination: { channels: ["whatsapp"] }, birthday: { channels: ["email", "whatsapp"] } }) })
    expect(within(waSection()).getByRole("status")).toHaveTextContent("Povezano: +381 64 123 4567")
    expect(within(card("Vakcine")).getByRole("checkbox", { name: "WhatsApp" })).toBeChecked()

    whatsappConnection.mockResolvedValueOnce({ ok: true, data: { ...NOT_CONNECTED } })
    await user.click(within(waSection()).getByRole("button", { name: "Prekini vezu" }))
    await waitFor(() => expect(within(card("Vakcine")).getByRole("checkbox", { name: "WhatsApp" })).not.toBeChecked())
    expect(within(card("Vakcine")).getByRole("checkbox", { name: "Mejl" })).toBeChecked()
    expect(within(card("Vakcine")).getByRole("checkbox", { name: "Push" })).toBeChecked()
    expect(within(card("Rođendani")).getByRole("checkbox", { name: "Push" })).not.toBeChecked()
  })

  it("an invalid number is refused before any call; 422 / 429 answers show the inline errors", async () => {
    const user = userEvent.setup()
    renderScreen()
    const number = within(waSection()).getByLabelText("Broj telefona za WhatsApp")
    await user.clear(number)
    await user.type(number, "12")
    await user.click(within(waSection()).getByRole("button", { name: "Pošalji kod" }))
    expect(whatsappConnection).not.toHaveBeenCalled()
    expect(within(waSection()).getByText("Upiši broj mobilnog telefona, npr. +381 64 123 4567.")).toBeInTheDocument()
    expect(number).toHaveAttribute("aria-invalid", "true")

    whatsappConnection.mockResolvedValueOnce({
      ok: false,
      error: { code: "validation_failed", message: "", fields: { phone: "undeliverable" } },
    })
    await user.clear(number)
    await user.type(number, "+381641234567")
    await user.click(within(waSection()).getByRole("button", { name: "Pošalji kod" }))
    expect(await within(waSection()).findByText("Na ovaj broj ne možemo da pošaljemo WhatsApp poruku.")).toBeInTheDocument()

    whatsappConnection.mockResolvedValueOnce({ ok: false, error: { code: "rate_limited", message: "", details: { retry_after_s: 1500 } } })
    await user.click(within(waSection()).getByRole("button", { name: "Pošalji kod" }))
    expect(await within(waSection()).findByText("Previše pokušaja. Pokušaj ponovo za 25 min.")).toBeInTheDocument()
  })

  it("a wrong code → 'Kod nije tačan ili je istekao.'; a short code is refused locally", async () => {
    const user = userEvent.setup()
    renderScreen()
    whatsappConnection.mockResolvedValueOnce({ ok: true, data: CODE_SENT })
    await enterNumber(user)
    await user.click(within(waSection()).getByRole("button", { name: "Pošalji kod" }))
    const code = await within(waSection()).findByLabelText("Kod iz poruke")

    await user.type(code, "123")
    await user.click(within(waSection()).getByRole("button", { name: "Potvrdi" }))
    expect(within(waSection()).getByText("Kod ima 6 cifara. Proveri poruku na WhatsApp-u.")).toBeInTheDocument()
    expect(whatsappConnection).toHaveBeenCalledTimes(1)

    whatsappConnection.mockResolvedValueOnce({ ok: false, error: { code: "verification_code_invalid", message: "" } })
    await user.type(code, "456")
    await user.click(within(waSection()).getByRole("button", { name: "Potvrdi" }))
    expect(await within(waSection()).findByText("Kod nije tačan ili je istekao.")).toBeInTheDocument()
  })

  it("'Pošalji kod ponovo' sends a new code with a new idempotency key", async () => {
    const user = userEvent.setup()
    renderScreen()
    whatsappConnection.mockResolvedValue({ ok: true, data: CODE_SENT })
    await enterNumber(user)
    await user.click(within(waSection()).getByRole("button", { name: "Pošalji kod" }))
    const resend = await within(waSection()).findByRole("button", { name: "Pošalji kod ponovo" })
    await waitFor(() => expect(resend).toBeEnabled())
    await user.click(resend)
    await waitFor(() => expect(whatsappConnection).toHaveBeenCalledTimes(2))
    const [first, second] = whatsappConnection.mock.calls.map((c) => c[0])
    expect(second).toMatchObject({ op: "send_code", phone: "+381641234567" })
    expect(second.idempotency_key).not.toBe(first.idempotency_key)
  })
})

describe("FR-23 #2 — WhatsApp per type for Premium; Viber hidden", () => {
  it("a connected Premium user can save whatsapp in a type's channels; Viber is absent while viber_enabled = false", async () => {
    const user = userEvent.setup()
    renderScreen({ settings: settings(CONNECTED) })
    expect(screen.queryByRole("checkbox", { name: "Viber" })).not.toBeInTheDocument()
    const box = within(card("Vakcine")).getByRole("checkbox", { name: "WhatsApp" })
    expect(box).toBeEnabled()
    await user.click(box)
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    await waitFor(() => expect(savePreference).toHaveBeenCalledTimes(1))
    expect(savePreference.mock.calls[0][0]).toMatchObject({ type: "vaccination", channels: ["email", "push", "whatsapp"] })
    expect(await screen.findByText("Podešavanja su sačuvana.")).toBeInTheDocument()
  })

  it("Viber appears only when the Operator has switched it on", () => {
    renderScreen({ settings: settings(CONNECTED, {}, true) })
    expect(screen.getAllByRole("checkbox", { name: "Viber" })).toHaveLength(6)
  })

  it("without a connected number the checkbox shows 'Broj nije povezan'; a 409 whatsapp_not_connected on save shows the error", async () => {
    const user = userEvent.setup()
    renderScreen()
    const box = within(card("Vakcine")).getByRole("checkbox", { name: "WhatsApp" })
    expect(box).toHaveAccessibleDescription("Broj nije povezan")
    savePreference.mockResolvedValueOnce({ ok: false, error: { code: "whatsapp_not_connected", message: "whatsapp_not_connected" } })
    await user.click(box)
    await user.click(screen.getByRole("button", { name: "Sačuvaj podešavanja" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
    expect(screen.queryByText("Podešavanja su sačuvana.")).not.toBeInTheDocument()
  })
})

describe("EP-31 — the monthly counter card", () => {
  it("shows 'n / 30 poruka ovog meseca', the progress bar and the reset date for Premium", () => {
    renderScreen()
    const counter = screen.getByRole("heading", { level: 2, name: "WhatsApp poruke" }).closest('[data-slot="card"]') as HTMLElement
    expect(within(counter).getByText("12 / 30 poruka ovog meseca")).toBeInTheDocument()
    expect(within(counter).getByRole("progressbar", { name: "Iskorišćeno 12 od 30 WhatsApp poruka ovog meseca" })).toBeInTheDocument()
    expect(
      within(counter).getByText("Kad potrošiš svih 30, do kraja meseca podsetnici stižu mejlom i push-om. Brojač se vraća na nulu 1. 11. 2026."),
    ).toBeInTheDocument()
  })

  it("renders in English", () => {
    renderScreen({ locale: "en" })
    expect(screen.getByText("12 / 30 messages this month")).toBeInTheDocument()
    expect(screen.getByText(/The counter resets on 1 Nov 2026\.$/)).toBeInTheDocument()
  })
})

describe("FR-23 #3 — Free user: G state", () => {
  it("the Kanali WhatsApp form is inside PremiumLock, every WhatsApp checkbox is disabled with the Premium badge, no counter card", () => {
    renderScreen({ premium: false, usage: null, settings: settings(NOT_CONNECTED, { vaccination: { channels: ["email", "whatsapp"] } }) })
    const lock = within(waSection()).getByRole("heading", { name: "Dostupno u Premiumu" }).closest("div") as HTMLElement
    expect(lock).toBeInTheDocument()
    expect(within(waSection()).getByLabelText("Broj telefona za WhatsApp")).toBeDisabled()
    // The locked form is shown blurred and hidden from assistive tech behind the PremiumLock card.
    expect(within(waSection()).getByRole("button", { name: "Pošalji kod", hidden: true })).toBeDisabled()
    for (const box of screen.getAllByRole("checkbox", { name: "WhatsApp" })) {
      expect(box).toBeDisabled()
      expect(box).not.toBeChecked()
      expect(box).toHaveAccessibleDescription("Dostupno u Premiumu")
    }
    expect(screen.queryByRole("heading", { name: "WhatsApp poruke" })).not.toBeInTheDocument()
    expect(screen.queryByText("Broj nije povezan")).not.toBeInTheDocument()
  })

  it("premium_required from EP-30 switches the screen to the G state", async () => {
    const user = userEvent.setup()
    renderScreen()
    whatsappConnection.mockResolvedValueOnce({ ok: false, error: { code: "premium_required", message: "", details: { limit: "whatsapp" } } })
    await enterNumber(user)
    await user.click(within(waSection()).getByRole("button", { name: "Pošalji kod" }))
    await waitFor(() => expect(within(waSection()).getByRole("button", { name: "Pošalji kod", hidden: true })).toBeDisabled())
    expect(within(waSection()).getByRole("heading", { name: "Dostupno u Premiumu" })).toBeInTheDocument()
  })
})
