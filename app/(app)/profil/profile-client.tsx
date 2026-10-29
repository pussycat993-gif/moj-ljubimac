"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, ChevronRight, Database, ExternalLink, LogOut, Sparkles } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { ErrorState } from "@/components/app/error-state"
import { StatusBadge } from "@/components/app/status-badge"
import { signOut } from "@/lib/actions/auth"
import { updateMe, type City, type Me } from "@/lib/actions/registration"
import { getBillingPortalUrl, type Subscription } from "@/lib/actions/subscription"
import type { ActionResult } from "@/lib/server/result"
import { format, fromProfileLocale, toProfileLocale, type Dictionary, type Locale } from "@/lib/i18n"

/** `subscription` is needed only with the Premium card (Step 23). */
export type ProfileCopy = Pick<Dictionary, "profile" | "common"> & Partial<Pick<Dictionary, "subscription">>
type CardCopy = Pick<Dictionary, "common" | "subscription">
type Errors = { city?: string; form?: string }

// S18 — Profil · /profil · FR-25, FR-35, FR-38, FR-39 · EP-43 (get, update), EP-67 (cities), EP-42 (sign out),
// EP-47 (Premium card), EP-48 (cancel / resume auto-renew) and EP-89 ("Upravljaj plaćanjem" opens the Paddle
// customer portal in a new tab when manage_billing_available; an error → the generic error toast). Card states from EP-47 (API §7.3): is_active
// with auto_renew → default; auto_renew = false while the period runs → cancelled; a row that is no longer
// active → expired with the over_limits summary; never subscribed → "Free plan" with "Pogledaj Premium"
// (owner decision, Step 23). The card is shown to owner accounts only (owner decision). Loading is
// ProfileLoading (shown by page.tsx while EP-43 / EP-47 are in flight); a failed read → ErrorState.

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** sr-Latn "11. 11. 2026." · en-GB "11 Nov 2026", on the Europe/Belgrade calendar (Design §9). */
function formatDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso))
}

/** Design §9 plan prices: Intl EUR, no decimals for whole euros, two otherwise — "3 €" · "€3" · "2,50 €". */
function formatMoney(money: { amount_minor: number; currency: string }, locale: Locale) {
  const fractional = money.amount_minor % 100 !== 0
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: fractional ? 2 : 0,
  }).format(money.amount_minor / 100)
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(dict: object, base: string, n: number, locale: Locale): string {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  return format((dict as Record<string, string>)[`${base}_${rule === "one" || rule === "few" ? rule : "other"}`], { n })
}

/** Whole days from today to `iso` on the Europe/Belgrade calendar, min 0 (FR-25, API §6 days_remaining). */
function daysUntil(iso: string, now: Date = new Date()) {
  const day = (d: Date) => {
    const [y, m, dd] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(d).split("-").map(Number)
    return Date.UTC(y, m - 1, dd)
  }
  return Math.max(0, Math.round((day(new Date(iso)) - day(now)) / 86_400_000))
}

/** "Visa •••• 4821" — the stored brand with its first letter capitalised. */
function cardLabel(sub: Subscription, t: CardCopy["subscription"]) {
  if (!sub.card_brand) return null
  const brand = sub.card_brand.charAt(0).toUpperCase() + sub.card_brand.slice(1)
  return format(t.card, { brand, last4: sub.card_last4 ?? "" })
}

function SubscriptionCard({
  initial,
  locale,
  copy,
  setAutoRenew,
}: {
  initial: Subscription
  locale: Locale
  copy: CardCopy
  setAutoRenew: (input: { auto_renew: boolean }) => Promise<ActionResult<Subscription>>
}) {
  const router = useRouter()
  const t = copy.subscription
  const [sub, setSub] = useState(initial)
  const [busy, setBusy] = useState(false)

  const neverSubscribed = sub.id === null
  const expired = !neverSubscribed && !sub.is_active
  const cancelled = !expired && !neverSubscribed && (sub.auto_renew === false || sub.status === "cancelled")
  const endsOn = sub.current_period_end ? formatDate(sub.current_period_end, locale) : ""
  const planLabel = sub.plan?.endsWith("_yearly") ? t.planYearly : t.planMonthly
  const price = sub.price ? formatMoney(sub.price, locale) : null
  const daysLeft = sub.current_period_end ? daysUntil(sub.current_period_end) : 0
  const periodDays = sub.period_days && sub.period_days > 0 ? sub.period_days : Math.max(daysLeft, 1)
  const pct = Math.min(100, Math.round((daysLeft / periodDays) * 100))
  const nextCharge = [format(t.nextCharge, { date: endsOn }), price, cardLabel(sub, t)].filter(Boolean).join(" · ")

  async function onSetAutoRenew(autoRenew: boolean) {
    setBusy(true)
    const result = await setAutoRenew({ auto_renew: autoRenew })
    setBusy(false)
    if (result.ok) {
      setSub(result.data)
      return
    }
    if (result.error.code === "subscription_not_active") {
      router.refresh()
      return
    }
    toast.error(copy.common.error)
  }

  /** EP-89: the short-lived portal URL opens in a new tab (opened before the await, so it is not blocked). */
  async function onManageBilling() {
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

  const manageBilling = sub.manage_billing_available && (
    <Button variant="outline" className="h-11 w-full md:h-9 md:w-auto" disabled={busy} onClick={() => void onManageBilling()}>
      <ExternalLink className="size-5" aria-hidden />
      {t.manageBilling}
    </Button>
  )

  return (
    <Card className="gap-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold">{t.title}</h2>
          <p className="text-sm text-muted-foreground">
            {expired || neverSubscribed ? t.freePlan : [planLabel, price].filter(Boolean).join(" · ")}
          </p>
        </div>
        {expired || neverSubscribed ? (
          <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-1 text-xs font-medium">{t.free}</span>
        ) : (
          <StatusBadge status="premium" className="shrink-0" label={copy.common.premium} />
        )}
      </div>

      {!expired && !neverSubscribed && (
        <>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 text-sm font-medium">{plural(t, "daysLeft", daysLeft, locale)}</p>
              <p className="shrink-0 text-xs text-muted-foreground">{format(t.daysOf, { n: daysLeft, total: periodDays })}</p>
            </div>
            <Progress value={pct} aria-label={format(t.daysAria, { n: daysLeft, total: periodDays })} />
            <p className={cancelled ? "text-sm text-warning" : "text-sm text-muted-foreground"}>
              {cancelled ? format(t.endsOn, { date: endsOn }) : nextCharge}
            </p>
          </div>
          <Separator />
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t.autoRenew}</p>
              <p className="text-sm text-muted-foreground">{cancelled ? t.autoRenewOff : t.autoRenewOn}</p>
            </div>
            {!cancelled ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="h-11 md:h-9" disabled={busy}>
                    {t.cancel}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.cancelTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{format(t.cancelBody, { date: endsOn })}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.cancelKeep}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void onSetAutoRenew(false)}>
                      {t.cancelConfirm}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button className="h-11 md:h-9" disabled={busy} onClick={() => void onSetAutoRenew(true)}>
                {t.resume}
              </Button>
            )}
          </div>
          {manageBilling}
        </>
      )}

      {expired && (
        <div className="space-y-4">
          <p className="text-sm">{format(t.expiredBody, { date: endsOn })}</p>
          {sub.over_limits.length > 0 && (
            <ul className="space-y-2">
              {sub.over_limits.map((item) => {
                const usedOf = format(t.usedOf, { used: item.used, allowed: item.allowed })
                const row =
                  item.limit === "pets"
                    ? { label: t.overPets, value: usedOf, detail: t.overPetsDetail }
                    : item.limit === "attachments"
                      ? { label: format(t.overAttachments, { pet: item.pet_name ?? "" }), value: usedOf, detail: t.overAttachmentsDetail }
                      : item.limit === "household"
                        ? { label: t.overHousehold, value: plural(t, "members", item.used, locale), detail: t.overHouseholdDetail }
                        : { label: t.overWhatsapp, value: t.overWhatsappValue, detail: t.overWhatsappDetail }
                return (
                  <li key={`${item.limit}-${item.pet_id ?? ""}`} className="rounded-sm bg-foreground/5 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">{row.label}</p>
                      <p className="shrink-0 text-xs font-medium text-muted-foreground">{row.value}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{row.detail}</p>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex flex-col gap-3 md:flex-row">
            <Button className="h-11 w-full md:h-9 md:w-auto" asChild>
              <Link href="/premium">
                <Sparkles className="size-5" aria-hidden />
                {t.renew}
              </Link>
            </Button>
            {manageBilling}
          </div>
        </div>
      )}

      {neverSubscribed && (
        <Button className="h-11 w-full md:h-9 md:w-auto" asChild>
          <Link href="/premium">
            <Sparkles className="size-5" aria-hidden />
            {t.seePremium}
          </Link>
        </Button>
      )}
    </Card>
  )
}

/** S18 loading state: shown by app/(app)/profil/page.tsx while EP-43 / EP-47 are in flight. */
export function ProfileLoading({ copy }: { copy: ProfileCopy }) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] leading-9 font-bold">{copy.profile.title}</h1>
      <div className="space-y-4" aria-busy="true" aria-label={copy.profile.loading}>
        {[0, 1].map((i) => (
          <Card key={i} className="gap-4 p-4 md:p-6">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </Card>
        ))}
      </div>
    </div>
  )
}

export function ProfileClient({
  me,
  cities,
  subscription = null,
  setAutoRenew,
  copy,
}: {
  me: Me | null
  cities: City[]
  /** EP-47 for owner accounts; null hides the card (organisation accounts, owner decision Step 23). */
  subscription?: Subscription | null
  /** EP-48 server action (lib/actions/subscription.ts). */
  setAutoRenew?: (input: { auto_renew: boolean }) => Promise<ActionResult<Subscription>>
  copy: Record<Locale, ProfileCopy>
}) {
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>(fromProfileLocale(me?.locale))
  const [name, setName] = useState(me?.full_name ?? "")
  const [city, setCity] = useState(me?.city?.id ?? "")
  const [language, setLanguage] = useState<Locale>(fromProfileLocale(me?.locale))
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)
  const t = copy[locale].profile
  const common = copy[locale].common

  async function onSave() {
    setPending(true)
    setErrors({})
    const result = await updateMe({ full_name: name, city_id: city || null, locale: toProfileLocale(language) })
    setPending(false)
    if (result.ok) {
      // A language change switches the UI at once; the refresh re-renders the shell in it.
      setLocale(fromProfileLocale(result.data.locale))
      router.refresh()
      return
    }
    const fields = result.error.fields
    if (result.error.code === "validation_failed" && fields?.city_id) setErrors({ city: t.errCity })
    else setErrors({ form: common.error })
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>

      {me === null ? (
        <ErrorState message={common.error} onRetry={() => router.refresh()} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            {/* Subscription */}
            {subscription && setAutoRenew && copy[locale].subscription && (
              <SubscriptionCard
                initial={subscription}
                locale={locale}
                copy={{ common, subscription: copy[locale].subscription }}
                setAutoRenew={setAutoRenew}
              />
            )}

            {/* Personal details */}
            <Card className="gap-4 p-4 md:p-6">
              <h2 className="font-heading text-lg font-bold">{t.personal}</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="profile-name">{t.name}</Label>
                  <Input id="profile-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="profile-city">{t.city}</Label>
                  <Select
                    value={city}
                    onValueChange={(v) => {
                      setCity(v)
                      setErrors((p) => ({ ...p, city: undefined }))
                    }}
                  >
                    <SelectTrigger
                      id="profile-city"
                      className="w-full"
                      aria-invalid={!!errors.city}
                      aria-describedby={errors.city ? "profile-city-error" : undefined}
                    >
                      <SelectValue placeholder={t.cityPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {locale === "en" ? c.name_en : c.name_sr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.city && (
                    <p id="profile-city-error" className="text-sm text-destructive">
                      {errors.city}
                    </p>
                  )}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="profile-email">{t.email}</Label>
                  <Input id="profile-email" type="email" value={me.email} readOnly />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="profile-language">{t.language}</Label>
                  <Select value={language} onValueChange={(v) => setLanguage(v as Locale)}>
                    <SelectTrigger id="profile-language" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sr">{t.languageSr}</SelectItem>
                      <SelectItem value="en">{t.languageEn}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {errors.form && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.form}
                </p>
              )}
              <Button className="h-11 md:h-9 md:self-start" disabled={pending} onClick={onSave}>
                {t.save}
              </Button>
            </Card>
          </div>

          {/* Aside — links */}
          <aside className="min-w-0 space-y-4">
            <Card className="gap-0 py-0">
              <Link
                href="/podesavanja/podsetnici"
                className="flex items-center gap-3 p-4 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Bell className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.reminderSettings}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.reminderSettingsHint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
              <Separator />
              <Link
                href="/profil/podaci"
                className="flex items-center gap-3 p-4 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Database className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.myData}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.myDataHint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </Card>
            <Button variant="outline" className="h-11 w-full md:h-9" onClick={() => void signOut()}>
              <LogOut className="size-5" aria-hidden />
              {t.signOut}
            </Button>
          </aside>
        </div>
      )}
    </div>
  )
}
