import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Plan, Subscription } from "@/lib/actions/subscription"

// S17 Premium (Step 23, Step 31). BR-62 / EP-44: the EUR prices from v_public_plans in sr-Latn and en-GB ("3 €
// mesečno", "30 € godišnje (2 meseca gratis)"; "€3 a month", "€30 a year (2 months free)") and no
// "placeholder price — OQ-03" marker left in app/. EP-45 local mode: payments_coming_soon while payments are off
// (either Paddle variable empty → paymentsEnabled false), while prices are null, or after a 503. FR-37 #1: the CTA
// calls startCheckout, then loads @paddle/paddle-js (mocked) and opens the overlay with
// Checkout.open({ items: [{ priceId }], customer: { email }, customData }); checkout.completed closes it, goes to
// /profil and shows the payment toast. FR-42: the breeder variant shows the breeder prices without a trial and,
// while the plan runs, the status card with "Upravljaj plaćanjem" (EP-89).

const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))

const paddle = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  options: null as null | { environment: string; token: string; eventCallback: (event: { name: string }) => void },
}))
const initializePaddle = vi.hoisted(() =>
  vi.fn(async (options: typeof paddle.options) => {
    paddle.options = options
    return { Checkout: { open: paddle.open, close: paddle.close } }
  }),
)
vi.mock("@paddle/paddle-js", () => ({ initializePaddle }))

const { PremiumClient } = await import("@/app/(app)/premium/premium-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = { premium: dictionaries.sr.premium, common: dictionaries.sr.common }
const copyEn = { premium: dictionaries.en.premium, common: dictionaries.en.common }

const unpriced: Plan[] = [
  { code: "premium_monthly", family: "premium", period: "month", price: null, monthly_equivalent: null, trial_days: 7 },
  { code: "premium_yearly", family: "premium", period: "year", price: null, monthly_equivalent: null, trial_days: 7 },
  { code: "breeder_monthly", family: "breeder", period: "month", price: null, monthly_equivalent: null, trial_days: 0 },
  { code: "breeder_yearly", family: "breeder", period: "year", price: null, monthly_equivalent: null, trial_days: 0 },
]
// EP-44 as seeded (BR-62).
const priced: Plan[] = [
  { ...unpriced[0], price: { amount_minor: 300, currency: "EUR" } },
  { ...unpriced[1], price: { amount_minor: 3000, currency: "EUR" }, monthly_equivalent: { amount_minor: 250, currency: "EUR" } },
  { ...unpriced[2], price: { amount_minor: 1100, currency: "EUR" } },
  { ...unpriced[3], price: { amount_minor: 11000, currency: "EUR" }, monthly_equivalent: { amount_minor: 917, currency: "EUR" } },
]

function subscription(extra: Partial<Subscription> = {}): Subscription {
  return {
    id: null,
    plan: null,
    status: null,
    trial_ends_at: null,
    current_period_end: null,
    auto_renew: null,
    price: null,
    period_days: null,
    days_remaining: null,
    is_active: false,
    trial_available: true,
    card_brand: null,
    card_last4: null,
    manage_billing_available: false,
    over_limits: [],
    ...extra,
  }
}

const startCheckout = vi.fn()
const getBillingPortalUrl = vi.fn()

function renderPremium(
  plans: Plan[],
  {
    trialAvailable = true,
    premium = false,
    paymentsEnabled = true,
    variant = "premium" as "premium" | "breeder",
    sub = subscription({ trial_available: trialAvailable }),
    locale = "sr" as "sr" | "en",
  } = {},
) {
  return render(
    <PremiumClient
      variant={variant}
      plans={plans}
      subscription={sub}
      premium={premium}
      paymentsEnabled={paymentsEnabled}
      locale={locale}
      copy={locale === "en" ? copyEn : copy}
      startCheckout={startCheckout}
      getBillingPortalUrl={getBillingPortalUrl}
    />,
  )
}

/** Intl puts a no-break space between the amount and "€". */
const text = (el: HTMLElement) => (el.textContent ?? "").replace(/ /g, " ")

function expectComingSoon() {
  expect(screen.getByRole("status")).toHaveTextContent("Plaćanje uskoro dostupno")
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
  expect(screen.getAllByText("Cena će biti objavljena uskoro.").length).toBeGreaterThan(0)
  expect(screen.getByRole("button", { name: "Plaćanje uskoro dostupno" })).toBeDisabled()
  expect(screen.queryByText("Plaćanje preko Paddle-a")).not.toBeInTheDocument()
  expect(screen.queryByText("+ PDV prema tvojoj zemlji")).not.toBeInTheDocument()
}

const session = {
  price_id: "pri_test_pm_trial",
  customer_email: "ivana.petrovic@mojljubimac.test",
  custom_data: { user_id: "a1000000-0000-4000-8000-000000000001", plan: "premium_yearly", idempotency_key: "k" },
  environment: "sandbox",
  client_token: "test_client_token",
  plan: "premium_yearly",
  trial_applied: true,
  trial_ends_at: "2026-11-05T10:00:00.000Z",
  amount: { amount_minor: 3000, currency: "EUR" },
  first_charge_at: "2026-11-05T10:00:00.000Z",
}

beforeEach(() => {
  startCheckout.mockReset()
  getBillingPortalUrl.mockReset()
  initializePaddle.mockClear()
  paddle.open.mockReset()
  paddle.close.mockReset()
  paddle.options = null
  push.mockReset()
  toast.mockReset()
  toast.error.mockReset()
})

describe("S17 Premium — prices (BR-62 / EP-44)", () => {
  it("sr-Latn: 3 € mesečno, 30 € godišnje (2 meseca gratis), + PDV, 0 € Free, the Paddle note", async () => {
    const user = userEvent.setup()
    renderPremium(priced)
    const yearly = screen.getByText(/godišnje \(2 meseca gratis\)/).closest("p") as HTMLElement
    expect(text(yearly)).toBe("30 € godišnje (2 meseca gratis)")
    expect(screen.getByText("+ PDV prema tvojoj zemlji")).toBeInTheDocument()
    expect(screen.getByText("0 €")).toBeInTheDocument()
    expect(screen.getByText("Plaćanje preko Paddle-a")).toBeInTheDocument()
    expect(screen.getByText(/Paddle je prodavac i izdaje račun/)).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "Mesečno" }))
    const monthly = screen.getByText("mesečno").closest("p") as HTMLElement
    expect(text(monthly)).toBe("3 € mesečno")
  })

  it("en-GB: €3 a month, €30 a year (2 months free)", async () => {
    const user = userEvent.setup()
    renderPremium(priced, { locale: "en" })
    expect(text(screen.getByText(/a year \(2 months free\)/).closest("p") as HTMLElement)).toBe("€30 a year (2 months free)")
    await user.click(screen.getByRole("tab", { name: "Monthly" }))
    expect(text(screen.getByText("a month").closest("p") as HTMLElement)).toBe("€3 a month")
    expect(screen.getByText("+ VAT for your country")).toBeInTheDocument()
    expect(screen.getByText("€0")).toBeInTheDocument()
  })

  it("no '/* placeholder price — OQ-03 */' marker is left in app/", () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(tsx?|jsx?)$/.test(name)) files.push(path)
      }
    }
    walk(join(process.cwd(), "app"))
    const marked = files.filter((f) => readFileSync(f, "utf8").includes("placeholder price — OQ-03"))
    expect(marked).toEqual([])
  })

  it("the comparison rows from BR-01 / BR-02", () => {
    renderPremium(priced)
    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("row")).toHaveLength(11)
    expect(within(table).getByText("Aktivni ljubimci")).toBeInTheDocument()
    expect(within(table).getByText("30 poruka mesečno")).toBeInTheDocument()
    expect(screen.getByText("Tvoj plan")).toBeInTheDocument()
  })
})

describe("S17 Premium — payments_coming_soon (EP-45 local mode)", () => {
  it("either Paddle variable empty (paymentsEnabled = false) → payments_coming_soon even with prices", () => {
    renderPremium(priced, { paymentsEnabled: false })
    expectComingSoon()
    expect(screen.getByRole("status")).toHaveTextContent("Još podešavamo plaćanje karticom.")
    expect(screen.getByText("Prvih 7 dana biće besplatno, a otkazuješ bilo kad u profilu.")).toBeInTheDocument()
  })

  it("plans with price null → payments_coming_soon", () => {
    renderPremium(unpriced)
    expectComingSoon()
  })

  it("a 503 payment_provider_unavailable from EP-45 → payments_coming_soon, no Paddle.js", async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: false, error: { code: "payment_provider_unavailable", message: "x" } })
    renderPremium(priced)
    await user.click(screen.getByRole("button", { name: "Probaj 7 dana besplatno" }))
    expectComingSoon()
    expect(initializePaddle).not.toHaveBeenCalled()
  })

  it("trial_used while payments are coming soon", () => {
    renderPremium(unpriced, { trialAvailable: false })
    expectComingSoon()
    expect(screen.getByText("Probni period je već iskorišćen na ovom nalogu. Otkazuješ bilo kad u profilu.")).toBeInTheDocument()
  })
})

describe("S17 Premium — checkout (FR-37 #1, EP-45)", () => {
  it("the CTA calls startCheckout, then opens the Paddle overlay; checkout.completed → close, /profil, toast", async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: true, data: session })
    renderPremium(priced)
    expect(initializePaddle).not.toHaveBeenCalled() // loaded only on click

    await user.click(screen.getByRole("button", { name: "Probaj 7 dana besplatno" }))
    expect(startCheckout).toHaveBeenCalledWith({
      plan: "premium_yearly",
      expect_trial: true,
      idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(initializePaddle).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "sandbox", token: "test_client_token", eventCallback: expect.any(Function) }),
    )
    expect(paddle.open).toHaveBeenCalledWith({
      items: [{ priceId: "pri_test_pm_trial", quantity: 1 }],
      customer: { email: "ivana.petrovic@mojljubimac.test" },
      customData: session.custom_data,
      settings: { displayMode: "overlay" },
    })

    // Closing without paying leaves S17 unchanged.
    paddle.options!.eventCallback({ name: "checkout.closed" })
    expect(push).not.toHaveBeenCalled()

    paddle.options!.eventCallback({ name: "checkout.completed" })
    expect(paddle.close).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith("/profil")
    expect(toast).toHaveBeenCalledWith("Plaćanje je primljeno. Premium se uključuje za nekoliko trenutaka.")
  })

  it("trial_used: EP-47 trial_available = false → Pretplati se with expect_trial false", async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: true, data: { ...session, price_id: "pri_test_py", trial_applied: false } })
    renderPremium(priced, { trialAvailable: false })
    expect(screen.getByText(/^Probni period je već iskorišćen na ovom nalogu, pa se/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Pretplati se" }))
    expect(startCheckout).toHaveBeenCalledWith(expect.objectContaining({ expect_trial: false }))
    expect(paddle.open).toHaveBeenCalledWith(expect.objectContaining({ items: [{ priceId: "pri_test_py", quantity: 1 }] }))
  })

  it("EP-45 trial_already_used → trial_used", async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: false, error: { code: "trial_already_used", message: "x" } })
    renderPremium(priced)
    await user.click(screen.getByRole("button", { name: "Probaj 7 dana besplatno" }))
    expect(await screen.findByRole("button", { name: "Pretplati se" })).toBeInTheDocument()
  })

  it("Paddle.js failing to load → the generic error toast", async () => {
    const user = userEvent.setup()
    vi.spyOn(console, "error").mockImplementation(() => {})
    startCheckout.mockResolvedValue({ ok: true, data: session })
    initializePaddle.mockResolvedValueOnce(undefined as never)
    renderPremium(priced)
    await user.click(screen.getByRole("button", { name: "Probaj 7 dana besplatno" }))
    expect(toast.error).toHaveBeenCalledWith(dictionaries.sr.common.error)
  })
})

describe("S17 breeder variant (FR-42)", () => {
  it("breeder prices, no trial, Pretplati se → breeder plan checkout", async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: true, data: { ...session, price_id: "pri_test_by", trial_applied: false, plan: "breeder_yearly" } })
    renderPremium(priced, { variant: "breeder", sub: subscription({ trial_available: false }) })
    expect(screen.getByRole("heading", { level: 1, name: "Odgajivački plan" })).toBeInTheDocument()
    expect(text(screen.getByText(/godišnje \(2 meseca gratis\)/).closest("p") as HTMLElement)).toBe("110 € godišnje (2 meseca gratis)")
    for (const feature of ["Legla i mladunci", "Javna stranica sa cenama", "Upiti kupaca", "Predaja kartona"]) {
      expect(screen.getByText(feature)).toBeInTheDocument()
    }
    expect(screen.queryByText("Probaj 7 dana besplatno")).not.toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "Mesečno" }))
    expect(text(screen.getByText("mesečno").closest("p") as HTMLElement)).toBe("11 € mesečno")
    await user.click(screen.getByRole("button", { name: "Pretplati se" }))
    expect(startCheckout).toHaveBeenCalledWith(expect.objectContaining({ plan: "breeder_monthly", expect_trial: false }))
  })

  it("a running breeder plan → status card with Upravljaj plaćanjem (EP-89) instead of the CTA", async () => {
    const user = userEvent.setup()
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() }
    const open = vi.spyOn(window, "open").mockReturnValue(tab as never)
    getBillingPortalUrl.mockResolvedValue({ ok: true, data: { url: "https://customer-portal.paddle.com/cpl_test" } })
    renderPremium(priced, {
      variant: "breeder",
      sub: subscription({
        id: "s1",
        plan: "breeder_monthly",
        status: "active",
        current_period_end: "2026-11-19T10:00:00.000Z",
        auto_renew: true,
        is_active: true,
        trial_available: false,
        manage_billing_available: true,
      }),
    })
    expect(screen.getByText("Odgajivački plan je aktivan do 19. 11. 2026.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Pretplati se" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Upravljaj plaćanjem" }))
    expect(getBillingPortalUrl).toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith("", "_blank")
    expect(tab.location.href).toBe("https://customer-portal.paddle.com/cpl_test")
    expect(tab.opener).toBeNull()
    open.mockRestore()
  })

  it("payments off → coming soon for the breeder variant too", () => {
    renderPremium(priced, { variant: "breeder", paymentsEnabled: false, sub: subscription({ trial_available: false }) })
    expect(screen.getByRole("status")).toHaveTextContent("Plaćanje uskoro dostupno")
    expect(screen.getByRole("button", { name: "Plaćanje uskoro dostupno" })).toBeDisabled()
  })
})
