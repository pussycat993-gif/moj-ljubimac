"use client"

import { useState } from "react"
import { Check, CreditCard, Minus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/sonner"
import { StatusBadge } from "@/components/app/status-badge"
import type { CheckoutSession, StartCheckoutInput } from "@/lib/actions/checkout"
import type { Plan } from "@/lib/actions/subscription"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S17 — Premium · /premium · FR-36, FR-37 (port of docs/product/04-design/screens/premium.tsx without the
// StateSwitcher). States (Design §12 S17, API §7.3): payments_coming_soon while EP-44 lists the Premium plans
// with price null (CR-22) or after EP-45 answers 503 payment_provider_unavailable — status card, billing toggle
// and prices hidden ("Cena će biti objavljena uskoro."), CTA disabled "Plaćanje uskoro dostupno", card-payment
// note hidden; trial_used when EP-47 trial_available = false (or EP-45 trial_already_used). The purchase state
// with prices is Step 31 (OQ-03, OQ-11); prices are only ever data from EP-44.

type Billing = "monthly" | "yearly"
type Cell = string | boolean

export type PremiumCopy = { premium: Dictionary["premium"]; common: Dictionary["common"] }

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** "499 RSD" · "4.990 RSD" (Design §9). */
function formatMoney(money: { amount_minor: number; currency: string }, locale: Locale) {
  const fractional = money.amount_minor % 100 !== 0
  const amount = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(money.amount_minor / 100)
  return `${amount} ${money.currency}`
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
  plans,
  trialAvailable,
  premium,
  locale,
  copy,
  startCheckout,
}: {
  /** EP-44 (v_public_plans). */
  plans: Plan[]
  /** EP-47 trial_available. */
  trialAvailable: boolean
  /** Me.entitlements.premium — which card says "Tvoj plan". */
  premium: boolean
  locale: Locale
  copy: PremiumCopy
  startCheckout: (input: StartCheckoutInput) => Promise<ActionResult<CheckoutSession>>
}) {
  const t = copy.premium
  const [billing, setBilling] = useState<Billing>("yearly")
  const [providerUnavailable, setProviderUnavailable] = useState(false)
  const [trialUsed, setTrialUsed] = useState(!trialAvailable)
  const [busy, setBusy] = useState(false)

  const monthly = plans.find((p) => p.code === "premium_monthly")
  const yearly = plans.find((p) => p.code === "premium_yearly")
  const unavailable = providerUnavailable || !monthly?.price || !yearly?.price
  const plan = billing === "yearly" ? yearly : monthly
  const amount = plan?.price ? formatMoney(plan.price, locale) : ""
  const period = billing === "yearly" ? t.perYear : t.perMonth
  const note =
    billing === "yearly" && yearly?.monthly_equivalent
      ? format(t.yearlyNote, { amount: formatMoney(yearly.monthly_equivalent, locale) })
      : null

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

  async function onCheckout() {
    if (!plan) return
    setBusy(true)
    const result = await startCheckout({ plan: plan.code, expect_trial: !trialUsed, idempotency_key: crypto.randomUUID() })
    setBusy(false)
    if (result.ok) {
      window.location.assign(result.data.checkout_url)
      return
    }
    if (result.error.code === "payment_provider_unavailable") setProviderUnavailable(true)
    else if (result.error.code === "trial_already_used") setTrialUsed(true)
    else toast.error(copy.common.error)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {unavailable ? (
        <Card role="status" className="flex-row items-start gap-3 p-4 md:p-6">
          <CreditCard className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{t.comingSoonTitle}</p>
            <p className="text-sm text-muted-foreground">{t.comingSoonBody}</p>
          </div>
        </Card>
      ) : (
        <Tabs value={billing} onValueChange={(v) => setBilling(v as Billing)}>
          <TabsList aria-label={t.billingLabel}>
            <TabsTrigger value="monthly">{t.monthly}</TabsTrigger>
            <TabsTrigger value="yearly">{t.yearly}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

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
          {unavailable ? (
            <p className="text-sm text-muted-foreground">{t.priceSoon}</p>
          ) : (
            <div>
              <p className="font-heading text-[22px] leading-7 font-bold">
                {amount /* placeholder price — OQ-03 */}{" "}
                <span className="font-sans text-sm font-normal text-muted-foreground">{period}</span>
              </p>
              {note && <p className="text-sm text-muted-foreground">{note}</p>}
            </div>
          )}
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
                : format(t.noteTrial, { amount, period })}
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

      {!unavailable && (
        <Card className="flex-row items-start gap-3 p-4 md:p-6">
          <CreditCard className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{t.cardTitle}</p>
            <p className="text-sm text-muted-foreground">{t.cardBody}</p>
          </div>
        </Card>
      )}
    </div>
  )
}
