import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ReminderPreference,
  ReminderSettings,
  ReminderSettingsActions,
} from "@/app/(app)/podesavanja/podsetnici/reminder-settings-client"

// S12 Kanali → Push (FR-23, EP-29, ADR-05): the push row comes from the browser permission plus the EP-29
// check; "Uključi obaveštenja" subscribes with the VAPID key and registers through EP-29; "Isključi"
// unregisters through EP-29 and unsubscribes; permission denied → "Blokirano u pregledaču" with no call;
// no push support or no VAPID key → the owner-approved "not supported" line; the iPhone home-screen hint
// card shows on iOS when the app is not opened from the home screen.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { ReminderSettingsClient } = await import("@/app/(app)/podesavanja/podsetnici/reminder-settings-client")
const { dictionaries } = await import("@/lib/i18n")

const VAPID = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
const ENDPOINT = "https://push.example/browser-1"
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

const settings: ReminderSettings = {
  preferences: (["vaccination", "treatment_dose", "vet_follow_up", "meal", "birthday", "manual"] as const).map(
    (type): ReminderPreference => ({
      type,
      lead_minutes: [0],
      delivery_time: type === "treatment_dose" || type === "meal" ? null : "09:00",
      channels: ["email", "push"],
      fixed_time: type === "treatment_dose" || type === "meal",
      is_default: true,
      updated_at: null,
    }),
  ),
  viber_enabled: false,
  whatsapp: { channel: "whatsapp", status: "not_connected", phone: null, connected_at: null },
}

const registerPush = vi.fn()
const checkPush = vi.fn()
const unregisterPush = vi.fn()
const actions: ReminderSettingsActions = {
  savePreference: vi.fn(),
  registerPush: (...a) => registerPush(...a),
  checkPush: (...a) => checkPush(...a),
  unregisterPush: (...a) => unregisterPush(...a),
}

type Browser = {
  permission?: NotificationPermission
  subscribed?: boolean
  request?: NotificationPermission
  userAgent?: string
  standalone?: boolean
  displayStandalone?: boolean
}

let fake: ReturnType<typeof installBrowser>

function installBrowser({
  permission = "default",
  subscribed = false,
  request = "granted",
  userAgent = DESKTOP_UA,
  standalone,
  displayStandalone = false,
}: Browser = {}) {
  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "BKey_-1", auth: "authSecret" } }),
    unsubscribe: vi.fn(async () => true),
  }
  let current: typeof subscription | null = subscribed ? subscription : null
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      current = subscription
      return subscription
    }),
  }
  const registration = { pushManager }
  const serviceWorker = { register: vi.fn(async () => registration), ready: Promise.resolve(registration) }
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker })
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => userAgent })
  Object.defineProperty(navigator, "standalone", { configurable: true, value: standalone })
  const notification = {
    permission,
    requestPermission: vi.fn(async () => {
      notification.permission = request
      return request
    }),
  }
  vi.stubGlobal("Notification", notification)
  vi.stubGlobal("PushManager", function PushManager() {})
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: displayStandalone && query === "(display-mode: standalone)" }))
  return { subscription, pushManager, serviceWorker, notification }
}

function renderScreen(vapidPublicKey = VAPID) {
  return render(
    <ReminderSettingsClient
      settings={settings}
      email="ivana.petrovic@mojljubimac.test"
      premium={false}
      vapidPublicKey={vapidPublicKey}
      copy={{ reminderSettings: dictionaries.sr.reminderSettings, common: dictionaries.sr.common }}
      actions={actions}
    />,
  )
}

const pushSection = () => screen.getByRole("heading", { level: 3, name: "Push" }).closest("section") as HTMLElement

beforeEach(() => {
  registerPush.mockReset()
  checkPush.mockReset()
  unregisterPush.mockReset()
  toast.error.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator as { serviceWorker?: unknown }).serviceWorker
  delete (navigator as { standalone?: unknown }).standalone
  delete (navigator as { userAgent?: unknown }).userAgent
})

describe("S12 push row — EP-29", () => {
  it("no subscription in this browser → 'Isključeno' with the turn-on button; the service worker is registered", async () => {
    fake = installBrowser()
    renderScreen()
    expect(await screen.findByText("Isključeno")).toBeInTheDocument()
    expect(screen.getByText("Obaveštenja stižu na ovaj uređaj i kad aplikacija nije otvorena.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Uključi obaveštenja u ovom pregledaču" })).toBeEnabled()
    expect(fake.serviceWorker.register).toHaveBeenCalledWith("/sw.js")
    expect(checkPush).not.toHaveBeenCalled()
  })

  it("register: asks permission, subscribes with the VAPID key and registers the endpoint through EP-29", async () => {
    const user = userEvent.setup()
    fake = installBrowser()
    registerPush.mockResolvedValue({
      ok: true,
      data: { id: "ps-1", endpoint: ENDPOINT, user_agent: DESKTOP_UA, created_at: "2026-10-23T10:00:00Z" },
    })
    renderScreen()
    await user.click(await screen.findByRole("button", { name: "Uključi obaveštenja u ovom pregledaču" }))

    await waitFor(() => expect(screen.getByText("Uključeno")).toBeInTheDocument())
    expect(fake.notification.requestPermission).toHaveBeenCalled()
    expect(fake.pushManager.subscribe).toHaveBeenCalledTimes(1)
    const options = fake.pushManager.subscribe.mock.calls[0] as unknown as [{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }]
    expect(options[0].userVisibleOnly).toBe(true)
    expect(options[0].applicationServerKey).toBeInstanceOf(Uint8Array)
    expect(options[0].applicationServerKey).toHaveLength(65)
    expect(registerPush).toHaveBeenCalledWith({ endpoint: ENDPOINT, p256dh: "BKey_-1", auth: "authSecret", user_agent: DESKTOP_UA })
    expect(screen.getByRole("status")).toHaveTextContent("Ovaj pregledač prima obaveštenja. Na drugom uređaju ih uključuješ posebno.")
    expect(screen.getByRole("button", { name: "Isključi u ovom pregledaču" })).toBeInTheDocument()
  })

  it("check: an existing subscription stored for the caller → 'Uključeno'", async () => {
    fake = installBrowser({ permission: "granted", subscribed: true })
    checkPush.mockResolvedValue({
      ok: true,
      data: [{ id: "ps-1", endpoint: ENDPOINT, user_agent: null, created_at: "2026-10-20T10:00:00Z" }],
    })
    renderScreen()
    expect(await screen.findByText("Uključeno")).toBeInTheDocument()
    expect(checkPush).toHaveBeenCalledWith(ENDPOINT)
  })

  it("check: the browser is subscribed but EP-29 returns [] → 'Isključeno'", async () => {
    fake = installBrowser({ permission: "granted", subscribed: true })
    checkPush.mockResolvedValue({ ok: true, data: [] })
    renderScreen()
    expect(await screen.findByText("Isključeno")).toBeInTheDocument()
    expect(checkPush).toHaveBeenCalledWith(ENDPOINT)
  })

  it("unregister: deletes the endpoint through EP-29 and unsubscribes the browser", async () => {
    const user = userEvent.setup()
    fake = installBrowser({ permission: "granted", subscribed: true })
    checkPush.mockResolvedValue({ ok: true, data: [{ id: "ps-1", endpoint: ENDPOINT, user_agent: null, created_at: "x" }] })
    unregisterPush.mockResolvedValue({ ok: true, data: null })
    renderScreen()
    await user.click(await screen.findByRole("button", { name: "Isključi u ovom pregledaču" }))
    await waitFor(() => expect(screen.getByText("Isključeno")).toBeInTheDocument())
    expect(unregisterPush).toHaveBeenCalledWith(ENDPOINT)
    expect(fake.subscription.unsubscribe).toHaveBeenCalled()
  })

  it("a failed register shows the error toast and stays off", async () => {
    const user = userEvent.setup()
    fake = installBrowser()
    registerPush.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "boom" } })
    renderScreen()
    await user.click(await screen.findByRole("button", { name: "Uključi obaveštenja u ovom pregledaču" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nešto nije u redu. Pokušaj ponovo."))
    expect(screen.getByText("Isključeno")).toBeInTheDocument()
  })
})

describe("S12 push row — blokirano", () => {
  it("Notification.permission = denied → 'Blokirano u pregledaču' with no EP-29 call", async () => {
    fake = installBrowser({ permission: "denied", subscribed: true })
    renderScreen()
    expect(await screen.findByText("Blokirano u pregledaču")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Pregledač je blokirao obaveštenja za Moj Ljubimac. Klikni na ikonicu katanca pored adrese, dozvoli obaveštenja i osveži stranicu.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Proveri ponovo" })).toBeInTheDocument()
    expect(checkPush).not.toHaveBeenCalled()
    expect(registerPush).not.toHaveBeenCalled()
  })

  it("denying the permission prompt → blokirano; 'Proveri ponovo' re-reads the permission", async () => {
    const user = userEvent.setup()
    fake = installBrowser({ request: "denied" })
    renderScreen()
    await user.click(await screen.findByRole("button", { name: "Uključi obaveštenja u ovom pregledaču" }))
    expect(await screen.findByText("Blokirano u pregledaču")).toBeInTheDocument()
    expect(registerPush).not.toHaveBeenCalled()

    fake.notification.permission = "default"
    await user.click(screen.getByRole("button", { name: "Proveri ponovo" }))
    expect(await screen.findByText("Isključeno")).toBeInTheDocument()
  })
})

describe("S12 push row — support and the iPhone hint (ADR-05)", () => {
  it("no VAPID public key → the not-supported line and no push button", async () => {
    fake = installBrowser()
    renderScreen("")
    expect(await screen.findByText("Ovaj pregledač ne podržava push obaveštenja.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Uključi obaveštenja u ovom pregledaču" })).not.toBeInTheDocument()
  })

  it("no Push API in the browser → the not-supported line", async () => {
    fake = installBrowser()
    vi.unstubAllGlobals()
    renderScreen()
    expect(await screen.findByText("Ovaj pregledač ne podržava push obaveštenja.")).toBeInTheDocument()
    expect(pushSection()).not.toHaveTextContent("Isključeno")
  })

  it("iPhone not opened from the home screen → the 'Koristiš iPhone?' card with the three steps", async () => {
    fake = installBrowser({ userAgent: IPHONE_UA })
    renderScreen()
    expect(await screen.findByRole("heading", { level: 2, name: "Koristiš iPhone?" })).toBeInTheDocument()
    expect(screen.getByText("Push obaveštenja rade tek kad dodaš aplikaciju.")).toBeInTheDocument()
    expect(screen.getByText("Otvori Moj Ljubimac u Safariju.")).toBeInTheDocument()
    expect(screen.getByLabelText("Podeli")).toBeInTheDocument()
    expect(screen.getByText("Izaberi „Dodaj na početni ekran“ i otvori aplikaciju sa ikonice.")).toBeInTheDocument()
  })

  it("iPhone opened from the home screen (installed) → no hint card", async () => {
    fake = installBrowser({ userAgent: IPHONE_UA, standalone: true })
    renderScreen()
    expect(await screen.findByText("Isključeno")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Koristiš iPhone?" })).not.toBeInTheDocument()
  })

  it("iPhone in display-mode standalone → no hint card; desktop → no hint card", async () => {
    fake = installBrowser({ userAgent: IPHONE_UA, displayStandalone: true })
    const { unmount } = renderScreen()
    expect(await screen.findByText("Isključeno")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Koristiš iPhone?" })).not.toBeInTheDocument()
    unmount()

    fake = installBrowser()
    renderScreen()
    expect(await screen.findByText("Isključeno")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Koristiš iPhone?" })).not.toBeInTheDocument()
  })
})
