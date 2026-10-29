"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Paddle } from "@paddle/paddle-js"
import { Check, CreditCard, ExternalLink, Minus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/sonner"
import { StatusBadge } from "@/components/app/status-badge"
import type { CheckoutSession, StartCheckoutInput } from "@/lib/actions/checkout"
import type { Money, Plan, Subscription } from "@/lib/actions/subscription"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S17 — Premium · /premium · FR-36, FR-37, FR-42 (port of docs/product/04-design/screens/premium.tsx without the
// StateSwitcher, plus the Design v1.7 breeder variant). Prices are EP-44 data in EUR before VAT (BR-62), formatted
// per Design §9 ("3 €", "€3"); "+ PDV prema tvojoj zemlji" under the price. The CTA calls EP-45 startCheckout, then
// loads @paddle/paddle-js on click and opens the Paddle overlay; on checkout.completed the overlay closes, the app
// goes to /profil and shows the payment toast. States (Design §12 S17, API §7.3): payments_coming_soon while
// payments are off (PADDLE_API_KEY or NEXT_PUBLIC_PADDLE_CLIENT_TOKEN empty), while EP-44 lists the plans with
// price null (CR-22) or after EP-45 answers 503 payment_provider_unavailable; trial_used when EP-47
// trial_available = false (or EP-45 trial_already_used). The breeder variant (Admin of a breeder organisation)
// sells breeder_* without a trial (BR-51) and, while the plan runs, shows its status card with
// "Upravljaj plaćanjem" (EP-89) instead of the CTA.

type Billing = "monthly" | "yearly"
type Cell = string | boolean

export type PremiumCopy = { premium: Dictionary["premium"]; common: Dictionary["common"] }

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** Design §9 plan prices: Intl EUR, no decimals for whole euros, two otherwise — "3 €" · "€3" · "2,50 €". */
function formatPrice(money: Money, locale: Locale) {
  const fractional = money.amount_minor % 100 !== 0
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: fractional ? 2 : 0,
  }).format(money.amount_minor / 100)
}

/** sr-Latn "19. 11. 2026." · en-GB "19 Nov 2026" (Design §9). */
function formatDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso))
}

function CellValue({ value, t }: { value: Cell; t: PremiumCopy["premium"] }) {
  if (value === true)
    return (
      <span className="inline-flex items-center gap-1">
        <Check className="size-4 text-primary" aria-hidden />
        <span className="sr-only">{t.included}</span>
      </span>
    )
  if (value === false)
    return (
      <span className="inline-flex items-center gap-1">
        <Minus className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t.notIncluded}</span>
      </span>
    )
  return <span>{value}</span>
}

export function PremiumClient({
  variant = "premium",
  plans,
  subscription,
  premium,
  paymentsEnabled,
  locale,
  copy,
  startCheckout,
  getBillingPortalUrl,
}: {
  /** "breeder" for the Admin of a breeder organisation (Design v1.7). */
  variant?: "premium" | "breeder"
  /** EP-44 (v_public_plans). */
  plans: Plan[]
  /** EP-47 — trial_available; the running breeder plan. */
  subscription: Subscription
  /** Me.entitlements.premium — which card says "Tvoj plan". */
  premium: boolean
  /** PADDLE_API_KEY and NEXT_PUBLIC_PADDLE_CLIENT_TOKEN are both set (read by page.tsx). */
  paymentsEnabled: boolean
  locale: Locale
  copy: PremiumCopy
  startCheckout: (input: StartCheckoutInput) => Promise<ActionResult<CheckoutSession>>
  getBillingPortalUrl?: () => Promise<ActionResult<{ url: string }>>
}) {
  const router = useRouter()
  const t = copy.premium
  const breeder = variant === "breeder"
  const [billing, setBilling] = useState<Billing>("yearly")
  const [providerUnavailable, setProviderUnavailable] = useState(false)
  const [trialUsed, setTrialUsed] = useState(breeder || !subscription.trial_available)
  const [busy, setBusy] = useState(false)
  const paddleRef = useRef<Paddle | null>(null)

  const family = breeder ? "breeder" : "premium"
  const monthly = plans.find((p) => p.code === `${family}_monthly`)
  const yearly = plans.find((p) => p.code === `${family}_yearly`)
  const unavailable = !paymentsEnabled || providerUnavailable || !monthly?.price || !yearly?.price
  const plan = billing === "yearly" ? yearly : monthly
  const amount = plan?.price ? formatPrice(plan.price, locale) : ""
  const period = billing === "yearly" ? `${t.perYear} ${t.yearlyFree}` : t.perMonth
  const breederRunning = breeder && subscription.is_active && !!subscription.current_period_end

  const rows: { feature: string; free: Cell; premium: Cell }[] = [
    { feature: t.rowActivePets, free: "1", premium: t.unlimited },
    { feature: t.rowMemorials, free: "2", premium: t.unlimited },
    { feature: t.rowAttachments, free: "10", premium: t.unlimited },
    { feature: t.rowMoments, free: "5", premium: t.unlimited },
    { feature: t.rowCareLog, free: t.unlimited, premium: t.unlimited },
    { feature: t.rowPdf, free: false, premium: true },
    { feature: t.rowHousehold, free: false, premium: true },
    { feature: t.rowEmailPush, free: true, premium: true },
    { feature: t.rowWhatsapp, free: false, premium: t.whatsappPremium },
    { feature: t.rowLogo, free: t.logoFree, premium: t.logoPremium },
  ]
  const breederFeatures = [t.breederLitters, t.breederPublicPage, t.breederInquiries, t.breederHandover]

  /** EP-45 States: Paddle.js is loaded only now, on click. */
  async function openOverlay(session: CheckoutSession) {
    if (!paddleRef.current) {
      const { initializePaddle } = await import("@paddle/paddle-js")
      const paddle = await initializePaddle({
        environment: session.environment,
        token: session.client_token,
        eventCallback: (event) => {
          if (String(event.name) !== "checkout.completed") return
          paddleRef.current?.Checkout.close()
          toast(t.paymentReceived)
          router.push("/profil")
        },
      })
      if (!paddle) throw new Error("Paddle.js did not initialise")
      paddleRef.current = paddle
    }
    paddleRef.current.Checkout.open({
      items: [{ priceId: session.price_id, quantity: 1 }],
      customer: { email: session.customer_email },
      customData: session.custom_data,
      settings: { displayMode: "overlay" },
    })
  }

  async function onCheckout() {
    if (!plan) return
    setBusy(true)
    const result = await startCheckout({ plan: plan.code, expect_trial: !trialUsed, idempotency_key: crypto.randomUUID() })
    if (result.ok) {
      try {
        await openOverlay(result.data)
      } catch (error) {
        console.error("[premium] Paddle overlay:", error instanceof Error ? error.message : error)
        toast.error(copy.common.error)
      }
      setBusy(false)
      return
    }
    setBusy(false)
    if (result.error.code === "payment_provider_unavailable") setProviderUnavailable(true)
    else if (result.error.code === "trial_already_used") setTrialUsed(true)
    else toast.error(copy.common.error)
  }

  async function onManageBilling() {
    if (!getBillingPortalUrl) return
    // Opened before the await so the browser keeps it as a user-initiated tab; the short-lived URL is set after.
    const tab = window.open("", "_blank")
    setBusy(true)
    const result = await getBillingPortalUrl()
    setBusy(false)
    if (result.ok) {
      if (tab) {
        tab.opener = null
        tab.location.href = result.data.url
      } else window.open(result.data.url, "_blank", "noopener")
      return
    }
    tab?.close()
    toast.error(copy.common.error)
  }

  const statusCard = unavailable && (
    <Card role="status" className="flex-row items-start gap-3 p-4 md:p-6">
      <CreditCard className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{t.comingSoonTitle}</p>
        <p className="text-sm text-muted-foreground">{breeder ? t.priceSoon : t.comingSoonBody}</p>
      </div>
    </Card>
  )

  const toggle = !unavailable && (
    <Tabs value={billing} onValueChange={(v) => setBilling(v as Billing)}>
      <TabsList aria-label={t.billingLabel}>
        <TabsTrigger value="monthly">{t.monthly}</TabsTrigger>
        <TabsTrigger value="yearly">{t.yearly}</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const price = unavailable ? (
    <p className="text-sm text-muted-foreground">{t.priceSoon}</p>
  ) : (
    <div>
      <p className="font-heading text-[22px] leading-7 font-bold">
        {amount} <span className="font-sans text-sm font-normal text-muted-foreground">{period}</span>
      </p>
      <p className="text-sm text-muted-foreground">{t.vatNote}</p>
    </div>
  )

  const paymentNote = !unavailable && (
    <Card className="flex-row items-start gap-3 p-4 md:p-6">
      <CreditCard className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{t.cardTitle}</p>
        <p className="text-sm text-muted-foreground">{t.cardBody}</p>
      </div>
    </Card>
  )

  if (breeder) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.breederTitle}</h1>
        {statusCard || toggle}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="gap-4 border-primary p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">{t.breederTitle}</h2>
            {price}
            {breederRunning ? (
              <div className="space-y-3 rounded-sm bg-foreground/5 p-3">
                <p className="text-sm">
                  {format(t.breederActive, { date: formatDate(subscription.current_period_end!, locale) })}
                </p>
                {subscription.manage_billing_available && getBillingPortalUrl && (
                  <Button variant="outline" className="h-11 md:h-9" disabled={busy} onClick={() => void onManageBilling()}>
                    <ExternalLink className="size-5" aria-hidden />
                    {t.manageBilling}
                  </Button>
                )}
              </div>
            ) : (
              <Button className="h-11 md:h-9" disabled={unavailable || busy} onClick={() => void onCheckout()}>
                <Sparkles className="size-5" aria-hidden />
                {unavailable ? t.ctaComingSoon : t.ctaSubscribe}
              </Button>
            )}
          </Card>

          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">{t.featuresTitle}</h2>
            <ul className="space-y-2">
              {breederFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-primary" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {paymentNote}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {statusCard || toggle}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="gap-4 p-4 md:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-bold">{t.freeName}</h2>
              <p className="text-sm text-muted-foreground">{t.freeDescription}</p>
            </div>
            {!premium && (
              <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-1 text-xs font-medium">{t.yourPlan}</span>
            )}
          </div>
          <p className="font-heading text-[22px] leading-7 font-bold">{t.freePrice}</p>
          {!premium && (
            <Button variant="outline" className="mt-auto h-11 md:h-9" disabled>
              {t.currentPlan}
            </Button>
          )}
        </Card>

        <Card className="gap-4 border-primary p-4 md:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-bold">{t.premiumName}</h2>
              <p className="text-sm text-muted-foreground">{t.premiumDescription}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {premium && <span className="rounded-full bg-foreground/5 px-2 py-1 text-xs font-medium">{t.yourPlan}</span>}
              <StatusBadge status="premium" label={copy.common.premium} />
            </div>
          </div>
          {price}
          <Button className="h-11 md:h-9" disabled={unavailable || busy} onClick={() => void onCheckout()}>
            <Sparkles className="size-5" aria-hidden />
            {unavailable ? t.ctaComingSoon : trialUsed ? t.ctaSubscribe : t.ctaTrial}
          </Button>
          <p className="text-xs text-muted-foreground">
            {unavailable
              ? trialUsed
                ? t.noteComingSoonTrialUsed
                : t.noteComingSoon
              : trialUsed
                ? format(t.noteTrialUsed, { amount })
                : format(t.noteTrial, { amount, period: billing === "yearly" ? t.perYear : t.perMonth })}
          </p>
        </Card>
      </div>

      <Card className="gap-4 p-4 md:p-6">
        <h2 className="font-heading text-lg font-bold">{t.featuresTitle}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-normal">{t.feature}</TableHead>
              <TableHead className="whitespace-normal">{t.freeName}</TableHead>
              <TableHead className="whitespace-normal text-primary">{t.premiumName}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.feature}>
                <TableCell className="whitespace-normal">{r.feature}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  <CellValue value={r.free} t={t} />
                </TableCell>
                <TableCell className="whitespace-normal font-medium">
                  <CellValue value={r.premium} t={t} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {paymentNote}
    </div>
  )
}
