import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Plan } from "@/lib/actions/subscription"

// S17 Premium (Step 23). EP-44 derived: with plan prices null the screen is in payments_coming_soon (status card,
// billing toggle and prices hidden, "Cena će biti objavljena uskoro.", CTA disabled "Plaćanje uskoro dostupno",
// card-payment note hidden). EP-45 derived: with priced plans (a fixture) the CTA calls startCheckout, and its 503
// payment_provider_unavailable switches to payments_coming_soon; trial_used when EP-47 trial_available = false
// (or EP-45 trial_already_used).

const toast = Object.assign(vi.fn(), { error: vi.fn() })
vi.mock("@/components/ui/sonner", () => ({ toast }))

const { PremiumClient } = await import("@/app/(app)/premium/premium-client")
const { dictionaries } = await import("@/lib/i18n")

const copy = { premium: dictionaries.sr.premium, common: dictionaries.sr.common }

const unpriced: Plan[] = [
  { code: "premium_monthly", family: "premium", period: "month", price: null, monthly_equivalent: null, trial_days: 7 },
  { code: "premium_yearly", family: "premium", period: "year", price: null, monthly_equivalent: null, trial_days: 7 },
  { code: "breeder_monthly", family: "breeder", period: "month", price: null, monthly_equivalent: null, trial_days: 0 },
  { code: "breeder_yearly", family: "breeder", period: "year", price: null, monthly_equivalent: null, trial_days: 0 },
]
// Test fixture only (OQ-03): priced Premium plans.
const priced: Plan[] = unpriced.map((p) =>
  p.code === "premium_monthly"
    ? { ...p, price: { amount_minor: 49900, currency: "RSD" } }
    : p.code === "premium_yearly"
      ? { ...p, price: { amount_minor: 499000, currency: "RSD" }, monthly_equivalent: { amount_minor: 41583, currency: "RSD" } }
      : p,
)

const startCheckout = vi.fn()

function renderPremium(plans: Plan[], { trialAvailable = true, premium = false } = {}) {
  return render(
    <PremiumClient plans={plans} trialAvailable={trialAvailable} premium={premium} locale="sr" copy={copy} startCheckout={startCheckout} />,
  )
}

function expectComingSoon() {
  expect(screen.getByRole("status")).toHaveTextContent("Plaćanje uskoro dostupno")
  expect(screen.getByRole("status")).toHaveTextContent("Još podešavamo plaćanje karticom.")
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
  expect(screen.getByText("Cena će biti objavljena uskoro.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Plaćanje uskoro dostupno" })).toBeDisabled()
  expect(screen.queryByText("Plaćanje karticom preko Monri-ja")).not.toBeInTheDocument()
  expect(screen.queryByText(/RSD (mesečno|godišnje)/)).not.toBeInTheDocument()
}

beforeEach(() => startCheckout.mockReset())

describe("S17 Premium", () => {
  it("EP-44: plans with price null → payments_coming_soon", () => {
    renderPremium(unpriced)
    expectComingSoon()
    expect(screen.getByText("Prvih 7 dana biće besplatno, a otkazuješ bilo kad u profilu.")).toBeInTheDocument()
  })

  it("the comparison rows from BR-01 / BR-02", () => {
    renderPremium(unpriced)
    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("row")).toHaveLength(11)
    expect(within(table).getByText("Aktivni ljubimci")).toBeInTheDocument()
    expect(within(table).getByText("30 poruka mesečno")).toBeInTheDocument()
    expect(within(table).getAllByText("Uključeno").length).toBeGreaterThan(0)
    expect(screen.getByText("Tvoj plan")).toBeInTheDocument()
  })

  it("EP-45: priced plans (fixture) → trial CTA; a 503 payment_provider_unavailable → payments_coming_soon", async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: false, error: { code: "payment_provider_unavailable", message: "x" } })
    renderPremium(priced)
    expect(screen.getByRole("tablist", { name: "Period naplate" })).toBeInTheDocument()
    expect(screen.getByText("Plaćanje karticom preko Monri-ja")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Probaj 7 dana besplatno" }))
    expect(startCheckout).toHaveBeenCalledWith({
      plan: "premium_yearly",
      expect_trial: true,
      idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expectComingSoon()
  })

  it("trial_used: EP-47 trial_available = false → Pretplati se", () => {
    renderPremium(priced, { trialAvailable: false })
    expect(screen.getByRole("button", { name: "Pretplati se" })).toBeEnabled()
    expect(screen.getByText(/^Probni period je već iskorišćen na ovom nalogu, pa se/)).toBeInTheDocument()
  })

  it("trial_used while payments are coming soon", () => {
    renderPremium(unpriced, { trialAvailable: false })
    expectComingSoon()
    expect(screen.getByText("Probni period je već iskorišćen na ovom nalogu. Otkazuješ bilo kad u profilu.")).toBeInTheDocument()
  })

  it("EP-45 trial_already_used → trial_used", async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: false, error: { code: "trial_already_used", message: "x" } })
    renderPremium(priced)
    await user.click(screen.getByRole("button", { name: "Probaj 7 dana besplatno" }))
    expect(await screen.findByRole("button", { name: "Pretplati se" })).toBeInTheDocument()
  })
})
