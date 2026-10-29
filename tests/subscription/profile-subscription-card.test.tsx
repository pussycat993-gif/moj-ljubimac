import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Subscription } from "@/lib/actions/subscription"

// S18 Profil — the Premium card (Step 23). FR-25 #2: a trialing / active subscription shows the days-remaining
// Progress and value computed from current_period_end on the Europe/Belgrade calendar. FR-38: "Otkaži obnovu"
// AlertDialog → EP-48 false → cancelled variant; "Uključi obnovu" → EP-48 true. FR-39: the expired variant shows
// the over_limits summary and "Obnovi Premium". Never subscribed → "Free plan" + "Pogledaj Premium" (owner
// decision). The name/city/language form is covered by tests/profile/profile-form.test.tsx. Step 31: the EUR price
// (Design §9) and EP-89 "Upravljaj plaćanjem" — shown only when manage_billing_available, it opens the Paddle portal
// URL in a new tab; an error shows the generic error toast.

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
vi.mock("@/lib/actions/registration", () => ({ updateMe: vi.fn() }))
vi.mock("@/lib/actions/auth", () => ({ signOut: vi.fn() }))
const getBillingPortalUrl = vi.fn()
vi.mock("@/lib/actions/subscription", () => ({ getBillingPortalUrl }))
const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { ProfileClient } = await import("@/app/(app)/profil/profile-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = {
  sr: { profile: dictionaries.sr.profile, common: dictionaries.sr.common, subscription: dictionaries.sr.subscription },
  en: { profile: dictionaries.en.profile, common: dictionaries.en.common, subscription: dictionaries.en.subscription },
}

function me(locale: "sr-Latn" | "en" = "sr-Latn") {
  return {
    id: "a1000000-0000-4000-8000-000000000001",
    email: "ivana.petrovic@mojljubimac.test",
    full_name: "Ivana Petrović",
    account_type: "owner",
    locale,
    city: null,
    organisation: null,
  } as never
}

function subscription(extra: Partial<Subscription> = {}): Subscription {
  return {
    id: "f1000000-0000-4000-8000-000000000001",
    plan: "premium_monthly",
    status: "active",
    trial_ends_at: null,
    // 23:30 UTC on 15 Nov = 00:30 on 16 Nov in Belgrade → 24 days from 23 Oct (23 on the UTC calendar).
    current_period_end: "2026-11-15T23:30:00.000Z",
    auto_renew: true,
    price: null,
    period_days: 30,
    days_remaining: 24,
    is_active: true,
    trial_available: false,
    card_brand: "visa",
    card_last4: "4821",
    manage_billing_available: false,
    over_limits: [],
    ...extra,
  }
}

const setAutoRenew = vi.fn()

function renderCard(sub: Subscription | null, locale: "sr-Latn" | "en" = "sr-Latn") {
  return render(<ProfileClient me={me(locale)} cities={[]} subscription={sub} setAutoRenew={setAutoRenew} copy={copy} />)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-23T10:00:00Z"))
  setAutoRenew.mockReset()
  getBillingPortalUrl.mockReset()
  toast.error.mockReset()
  refresh.mockReset()
})
afterEach(() => vi.useRealTimers())

describe("S18 Premium card", () => {
  it("FR-25 #2: active — days remaining from current_period_end (Europe/Belgrade) with Progress", () => {
    renderCard(subscription())
    expect(screen.getByRole("heading", { name: "Pretplata" })).toBeInTheDocument()
    expect(screen.getByText("Mesečni plan")).toBeInTheDocument()
    expect(screen.getByText("Još 24 dana Premiuma")).toBeInTheDocument()
    expect(screen.getByText("24 / 30")).toBeInTheDocument()
    const bar = screen.getByRole("progressbar", { name: "Preostalo 24 od 30 dana" })
    expect(bar.querySelector("[data-slot=progress-indicator]")).toHaveStyle({ transform: "translateX(-20%)" })
    expect(screen.getByText("Sledeća naplata 16. 11. 2026. · Visa •••• 4821")).toBeInTheDocument()
    expect(screen.getByText("Uključena")).toBeInTheDocument()
  })

  it("FR-25 #2: trialing — 7-day period, singular plural form", () => {
    renderCard(subscription({ status: "trialing", trial_ends_at: "2026-10-24T08:00:00.000Z", current_period_end: "2026-10-24T08:00:00.000Z", period_days: 7, card_brand: null }))
    expect(screen.getByText("Još 1 dan Premiuma")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Preostalo 1 od 7 dana" })).toBeInTheDocument()
    expect(screen.getByText("Sledeća naplata 24. 10. 2026.")).toBeInTheDocument()
  })

  it("shows a price only when Subscription.price is set (owner decision), in EUR per Design §9", () => {
    renderCard(subscription({ price: { amount_minor: 300, currency: "EUR" } }))
    // Intl puts a no-break space between the amount and "€" (Design §9 "3 €").
    const paragraph = (value: string) => screen.getByText((_, el) => el?.tagName === "P" && el.textContent === value)
    expect(paragraph("Mesečni plan · 3\u00a0€")).toBeInTheDocument()
    expect(paragraph("Sledeća naplata 16. 11. 2026. · 3\u00a0€ · Visa •••• 4821")).toBeInTheDocument()
  })

  it("EP-89: Upravljaj plaćanjem only when manage_billing_available; opens the portal in a new tab", async () => {
    const user = userEvent.setup()
    renderCard(subscription())
    expect(screen.queryByRole("button", { name: "Upravljaj plaćanjem" })).not.toBeInTheDocument()
    cleanup()

    const tab = { opener: {}, location: { href: "" }, close: vi.fn() }
    const open = vi.spyOn(window, "open").mockReturnValue(tab as never)
    getBillingPortalUrl.mockResolvedValue({ ok: true, data: { url: "https://customer-portal.paddle.com/cpl_test" } })
    renderCard(subscription({ manage_billing_available: true }))
    await user.click(screen.getByRole("button", { name: "Upravljaj plaćanjem" }))
    expect(getBillingPortalUrl).toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith("", "_blank")
    expect(tab.location.href).toBe("https://customer-portal.paddle.com/cpl_test")
    expect(tab.opener).toBeNull()

    getBillingPortalUrl.mockResolvedValue({ ok: false, error: { code: "payment_provider_unavailable", message: "x" } })
    await user.click(screen.getByRole("button", { name: "Upravljaj plaćanjem" }))
    expect(tab.close).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(dictionaries.sr.common.error)
    open.mockRestore()
  })

  it("EP-89: the expired variant also offers Upravljaj plaćanjem with a Paddle customer", () => {
    renderCard(subscription({ status: "expired", is_active: false, auto_renew: false, manage_billing_available: true }))
    expect(screen.getByRole("link", { name: "Obnovi Premium" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Upravljaj plaćanjem" })).toBeInTheDocument()
  })

  it("FR-38: Otkaži obnovu → AlertDialog → EP-48 false → cancelled; Uključi obnovu → EP-48 true", async () => {
    const user = userEvent.setup()
    setAutoRenew.mockResolvedValueOnce({ ok: true, data: subscription({ status: "cancelled", auto_renew: false }) })
    renderCard(subscription())

    await user.click(screen.getByRole("button", { name: "Otkaži obnovu" }))
    const dialog = screen.getByRole("alertdialog", { name: "Otkazati automatsku obnovu?" })
    expect(within(dialog).getByText(/Premium ostaje aktivan do 16\. 11\. 2026\./)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Da, otkaži obnovu" }))
    expect(setAutoRenew).toHaveBeenCalledWith({ auto_renew: false })

    expect(await screen.findByText("Isključena — nećemo te ponovo naplatiti")).toBeInTheDocument()
    expect(screen.getByText("Premium ističe 16. 11. 2026. Posle toga prelaziš na Free.")).toBeInTheDocument()
    expect(screen.getByText("Još 24 dana Premiuma")).toBeInTheDocument()

    setAutoRenew.mockResolvedValueOnce({ ok: true, data: subscription() })
    await user.click(screen.getByRole("button", { name: "Uključi obnovu" }))
    expect(setAutoRenew).toHaveBeenLastCalledWith({ auto_renew: true })
    expect(await screen.findByText("Uključena")).toBeInTheDocument()
  })

  it("FR-38: a cancelled subscription from EP-47 renders the cancelled variant", () => {
    renderCard(subscription({ status: "cancelled", auto_renew: false }))
    expect(screen.getByRole("button", { name: "Uključi obnovu" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Otkaži obnovu" })).not.toBeInTheDocument()
  })

  it("FR-39: expired — Free plan with the over_limits summary and Obnovi Premium", () => {
    renderCard(
      subscription({
        status: "expired",
        is_active: false,
        auto_renew: false,
        current_period_end: "2026-09-12T10:00:00.000Z",
        days_remaining: 0,
        over_limits: [
          { limit: "pets", pet_id: null, pet_name: null, used: 2, allowed: 1 },
          { limit: "attachments", pet_id: "c1", pet_name: "Maks", used: 14, allowed: 10 },
          { limit: "household", pet_id: null, pet_name: null, used: 3, allowed: 0 },
          { limit: "whatsapp", pet_id: null, pet_name: null, used: 2, allowed: 0 },
        ],
      }),
    )
    expect(screen.getByText("Free plan")).toBeInTheDocument()
    expect(screen.getByText(/^Premium je istekao 12\. 9\. 2026\. Ništa nije obrisano/)).toBeInTheDocument()
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(4)
    expect(within(items[0]).getByText("Aktivni ljubimci")).toBeInTheDocument()
    expect(within(items[0]).getByText("2 od 1")).toBeInTheDocument()
    expect(within(items[0]).getByText("Svi ljubimci ostaju vidljivi; novog ljubimca ne možeš da dodaš.")).toBeInTheDocument()
    expect(within(items[1]).getByText("Prilozi — Maks")).toBeInTheDocument()
    expect(within(items[1]).getByText("14 od 10")).toBeInTheDocument()
    expect(within(items[2]).getByText("3 člana")).toBeInTheDocument()
    expect(within(items[3]).getByText("Isključeno")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Obnovi Premium" })).toHaveAttribute("href", "/premium")
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("never subscribed → Free plan, Free pill and Pogledaj Premium", () => {
    renderCard(
      subscription({ id: null, plan: null, status: null, current_period_end: null, auto_renew: null, period_days: null, days_remaining: null, is_active: false, trial_available: true, card_brand: null, card_last4: null }),
    )
    expect(screen.getByText("Free plan")).toBeInTheDocument()
    expect(screen.getByText("Free")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Pogledaj Premium" })).toHaveAttribute("href", "/premium")
  })

  it("no card without a Subscription (organisation accounts)", () => {
    renderCard(null)
    expect(screen.queryByRole("heading", { name: "Pretplata" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Lični podaci" })).toBeInTheDocument()
  })

  it("English", () => {
    renderCard(subscription(), "en")
    expect(screen.getByText("24 days of Premium left")).toBeInTheDocument()
    expect(screen.getByText("Next charge 16 Nov 2026 · Visa •••• 4821")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel renewal" })).toBeInTheDocument()
  })
})
