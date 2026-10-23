"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, CircleCheck, Globe, ImageIcon, LogIn, Mail, MapPin, PawPrint, Phone, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PublicShell, type PublicShellLabels } from "@/components/app/shells"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import type { SubmitOrgRequestInput, SubmittedOrgRequest } from "@/lib/actions/org-requests"
import type { PublicAnimal, PublicOrgPage } from "@/lib/server/public-org-page"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S23 — Javna stranica azila / odgajivačnice · /o/[slug] · FR-46, FR-47, FR-49 (port of
// docs/product/04-design/screens/public-org.tsx without the StateSwitchers). Server-rendered from EP-62 on every
// request (TC ADR-18): only public fields (BR-37) — photo, name, species, sex, approximate age, description,
// spayed/neutered and vaccinated yes/no, and the price for breeders. Guest vs signed-in comes from the session
// (EP-43), not from EP-62: a guest's request Dialog is the sign-in prompt (E-17); a signed-in user's Dialog calls
// EP-63 submitOrgRequest (prefilled from Me) — 401 → the sign-in prompt, 422 → inline field errors, 429 → the
// rate-limit message, 404 → "no longer available". States: default; empty (animals []); error (404 / 5xx).
// "Učitaj još" pages through EP-62 (GET /api/public/orgs/[slug]?offset=).

export type PublicOrgCopy = {
  publicOrg: Dictionary["publicOrg"]
  pet: Dictionary["pet"]
  common: Dictionary["common"]
}

/** The signed-in visitor (EP-43): prefills the request form. null = Visitor without a session. */
export type PublicOrgViewer = { name: string; email: string } | null

export type PublicOrgActions = {
  submitOrgRequest: (input: SubmitOrgRequestInput) => Promise<ActionResult<SubmittedOrgRequest>>
}

const PAGE_SIZE = 20
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** "120.000 RSD" · "120,000 RSD" (Design §9). */
function formatMoney(amountMinor: number, locale: Locale) {
  const fractional = amountMinor % 100 !== 0
  const amount = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
  return `${amount} RSD`
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(t: Record<string, unknown>, base: string, n: number, locale: Locale) {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  const key = `${base}_${rule === "one" || rule === "few" ? rule : "other"}`
  return format(String(t[key]), { n })
}

/** The approximate age, else from the birth date / year (Step 13 rule); none → null. */
function ageLabel(a: PublicAnimal, today: string, t: Dictionary["pet"], locale: Locale): string | null {
  if (a.approx_age_text) return a.approx_age_text
  const [year, month, day] = today.split("-").map(Number)
  if (a.birth_date) {
    const [by, bm, bd] = a.birth_date.split("-").map(Number)
    const months = Math.max(0, (year - by) * 12 + (month - bm) - (day < bd ? 1 : 0))
    return months >= 12 ? plural(t, "years", Math.floor(months / 12), locale) : plural(t, "months", months, locale)
  }
  if (a.birth_year) {
    const years = year - a.birth_year
    const age = years >= 1 ? plural(t, "years", years, locale) : plural(t, "months", month - 1, locale)
    return format(t.about, { age })
  }
  return null
}

function belgradeToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date())
}

/** "Mačka · Ženka · oko 2 godine" — the sex is left out when unknown (owner decision, Step 13). */
function animalDetail(a: PublicAnimal, today: string, copy: PublicOrgCopy, locale: Locale) {
  const species =
    a.species === "other" && a.species_other
      ? a.species_other
      : (copy.pet.species[a.species as keyof Dictionary["pet"]["species"]] ?? a.species)
  const kind = [species, a.breed].filter(Boolean).join(", ")
  const sex = a.sex === "female" ? copy.pet.female : a.sex === "male" ? copy.pet.male : null
  return [kind, sex, ageLabel(a, today, copy.pet, locale)].filter(Boolean).join(" · ")
}

function YesNoBadge({ yes, yesLabel, noLabel }: { yes: boolean; yesLabel: string; noLabel: string }) {
  return (
    <Badge variant="outline" className="bg-card">
      {yes ? <Check aria-hidden /> : <X aria-hidden />}
      {yes ? yesLabel : noLabel}
    </Badge>
  )
}

function AnimalPhoto({ animal }: { animal: PublicAnimal }) {
  const url = animal.photo_url?.url
  if (!url) {
    return (
      <div role="img" aria-label={animal.name} className="flex aspect-square items-center justify-center bg-foreground/5">
        <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URLs, not optimisable
  return <img src={url} alt={animal.name} className="aspect-square w-full object-cover" />
}

/** A website for the link: stored values start with https:// (EP-72); shown without the scheme. */
function websiteLabel(website: string) {
  return website.replace(/^https?:\/\//, "").replace(/\/$/, "")
}

export function PublicOrgScreen({
  page,
  viewer,
  locale,
  copy,
  shellLabels,
  actions,
}: {
  page: PublicOrgPage | null
  viewer: PublicOrgViewer
  locale: Locale
  copy: PublicOrgCopy
  shellLabels: PublicShellLabels
  actions: PublicOrgActions
}) {
  const t = copy.publicOrg
  const router = useRouter()
  const [animals, setAnimals] = useState<PublicAnimal[]>(page?.animals ?? [])
  const [total, setTotal] = useState(page?.total ?? 0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [requestFor, setRequestFor] = useState<PublicAnimal | null>(null)
  const [signInPrompt, setSignInPrompt] = useState(viewer === null)
  const [sent, setSent] = useState<{ email: string } | null>(null)
  const [form, setForm] = useState({ name: viewer?.name ?? "", phone: "", email: viewer?.email ?? "", message: "" })
  const [submitted, setSubmitted] = useState(false)
  const [serverFields, setServerFields] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [today] = useState(belgradeToday)

  if (!page) {
    return (
      <PublicShell labels={shellLabels}>
        <ErrorState message={copy.common.error} onRetry={() => router.refresh()} labels={{ retry: copy.common.retry }} />
      </PublicShell>
    )
  }

  const o = page.organisation
  const isShelter = o.type === "shelter"
  const typeLabel = isShelter ? t.typeShelter : t.typeBreeder
  const action = isShelter ? t.actionShelter : t.actionBreeder
  const cityName = o.city ? (locale === "en" ? o.city.name_en || o.city.name_sr : o.city.name_sr) : null

  const errors = {
    name: (submitted && !form.name.trim()) || serverFields.name ? t.errName : "",
    phone: (submitted && !form.phone.trim()) || serverFields.phone ? t.errPhone : "",
    email: (submitted && !EMAIL.test(form.email.trim())) || serverFields.email ? t.errEmail : "",
  }

  function openRequest(a: PublicAnimal) {
    setRequestFor(a)
    setSignInPrompt(viewer === null)
    setSent(null)
    setSubmitted(false)
    setServerFields({})
    setFormError("")
    setIdempotencyKey(crypto.randomUUID())
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const response = await fetch(`/api/public/orgs/${encodeURIComponent(o.slug)}?limit=${PAGE_SIZE}&offset=${animals.length}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error(String(response.status))
      const next = (await response.json()) as PublicOrgPage
      setAnimals((current) => [...current, ...next.animals.filter((a) => !current.some((c) => c.pet_id === a.pet_id))])
      setTotal(next.total)
    } catch {
      // The button stays; the next tap tries again.
    } finally {
      setLoadingMore(false)
    }
  }

  async function submit() {
    if (!requestFor) return
    setSubmitted(true)
    setServerFields({})
    setFormError("")
    if (!form.name.trim() || !form.phone.trim() || !EMAIL.test(form.email.trim())) return
    setBusy(true)
    const result = await actions.submitOrgRequest({
      pet_id: requestFor.pet_id,
      name: form.name,
      phone: form.phone,
      email: form.email,
      message: form.message.trim() || null,
      idempotency_key: idempotencyKey,
    })
    setBusy(false)
    if (result.ok) {
      setSent({ email: form.email.trim() })
      return
    }
    const error = result.error
    if (error.code === "unauthenticated") {
      setSignInPrompt(true)
    } else if (error.code === "validation_failed" && error.fields && ["name", "phone", "email"].some((f) => f in error.fields!)) {
      setServerFields(error.fields)
    } else if (error.code === "rate_limited") {
      const seconds = Number(error.details?.retry_after_s ?? 60)
      setFormError(format(t.rateLimited, { n: Math.max(1, Math.ceil(seconds / 60)) }))
    } else if (error.code === "not_found") {
      setFormError(t.unavailable)
    } else {
      setFormError(copy.common.error)
    }
  }

  const next = encodeURIComponent(`/o/${o.slug}`)

  return (
    <PublicShell labels={shellLabels}>
      <div className="space-y-6">
        <Card className="gap-4 p-4 md:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-20">
              {o.logo_url?.url && <AvatarImage src={o.logo_url.url} alt={o.name} />}
              <AvatarFallback className="bg-muted font-heading text-[22px] leading-7 font-bold text-foreground">
                {o.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="font-heading text-[28px] leading-9 font-bold">{o.name}</h1>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{cityName ? format(t.typeCity, { type: typeLabel, city: cityName }) : typeLabel}</span>
              </p>
            </div>
          </div>
          {o.description && <p className="text-base whitespace-pre-line">{o.description}</p>}
          {(o.phone || o.email || o.website) && (
            <div className="flex flex-col gap-2 text-sm md:flex-row md:flex-wrap md:gap-4">
              {o.phone && (
                <a
                  href={`tel:${o.phone.replace(/\s/g, "")}`}
                  className="flex min-w-0 items-center gap-2 text-primary hover:underline"
                >
                  <Phone className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{o.phone}</span>
                </a>
              )}
              {o.email && (
                <a href={`mailto:${o.email}`} className="flex min-w-0 items-center gap-2 text-primary hover:underline">
                  <Mail className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{o.email}</span>
                </a>
              )}
              {o.website && (
                <a
                  href={o.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-2 text-primary hover:underline"
                >
                  <Globe className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{websiteLabel(o.website)}</span>
                </a>
              )}
            </div>
          )}
        </Card>

        <section className="space-y-4" aria-labelledby="animals-heading">
          <h2 id="animals-heading" className="font-heading text-[22px] leading-7 font-bold">
            {isShelter ? t.sectionShelter : t.sectionBreeder}
          </h2>

          {animals.length === 0 ? (
            <EmptyState
              icon={PawPrint}
              title={isShelter ? t.emptyTitleShelter : t.emptyTitleBreeder}
              description={isShelter ? t.emptyShelter : t.emptyBreeder}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {animals.map((a) => {
                  // Unknown sex uses the masculine form (owner decision, Step 26).
                  const female = a.sex === "female"
                  return (
                    <Card key={a.pet_id} className="gap-0 overflow-hidden py-0" data-pet-sex={a.sex}>
                      <AnimalPhoto animal={a} />
                      <div className="flex flex-1 flex-col gap-3 p-4">
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="min-w-0 truncate font-heading text-lg font-bold">{a.name}</h3>
                            {a.price && (
                              <span className="shrink-0 text-sm font-medium">{formatMoney(a.price.amount_minor, locale)}</span>
                            )}
                          </div>
                          <p className="truncate text-sm text-muted-foreground">{animalDetail(a, today, copy, locale)}</p>
                        </div>
                        {a.public_description && <p className="text-sm whitespace-pre-line">{a.public_description}</p>}
                        <div className="flex flex-wrap gap-2">
                          {a.neutered !== "unknown" && (
                            <YesNoBadge
                              yes={a.neutered === "yes"}
                              yesLabel={female ? t.neuteredFemale : t.neuteredMale}
                              noLabel={female ? t.notNeuteredFemale : t.notNeuteredMale}
                            />
                          )}
                          <YesNoBadge
                            yes={a.vaccinated}
                            yesLabel={female ? t.vaccinatedFemale : t.vaccinatedMale}
                            noLabel={female ? t.notVaccinatedFemale : t.notVaccinatedMale}
                          />
                        </div>
                        <Button className="mt-auto h-11 w-full md:h-9" onClick={() => openRequest(a)}>
                          {action}
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
              {animals.length < total && (
                <div className="flex justify-center">
                  <Button variant="outline" className="h-11 md:h-9" disabled={loadingMore} onClick={() => void loadMore()}>
                    {t.loadMore}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <Dialog open={requestFor !== null} onOpenChange={(open) => !open && setRequestFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {signInPrompt ? (
            <>
              <DialogHeader>
                <DialogTitle>{isShelter ? t.signInTitleShelter : t.signInTitleBreeder}</DialogTitle>
                <DialogDescription>
                  {format(isShelter ? t.signInBodyShelter : t.signInBodyBreeder, { pet: requestFor?.name ?? "" })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button asChild variant="outline" className="h-11 md:h-9">
                  <Link href={`/prijava?next=${next}`}>
                    <LogIn className="size-5" aria-hidden />
                    {t.signIn}
                  </Link>
                </Button>
                <Button asChild className="h-11 md:h-9">
                  <Link href="/registracija">{t.createAccount}</Link>
                </Button>
              </DialogFooter>
            </>
          ) : sent ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CircleCheck className="size-5 text-success" aria-hidden />
                  {isShelter ? t.sentTitleShelter : t.sentTitleBreeder}
                </DialogTitle>
                <DialogDescription>
                  {format(isShelter ? t.sentBodyShelter : t.sentBodyBreeder, { organisation: o.name, email: sent.email })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button className="h-11 md:h-9" onClick={() => setRequestFor(null)}>
                  {t.ok}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {format(isShelter ? t.formTitleShelter : t.formTitleBreeder, { pet: requestFor?.name ?? "" })}
                </DialogTitle>
                <DialogDescription>{isShelter ? t.formBodyShelter : t.formBodyBreeder}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="req-name">{t.name}</Label>
                  <Input
                    id="req-name"
                    value={form.name}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-invalid={errors.name ? true : undefined}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="req-phone">{t.phone}</Label>
                    <Input
                      id="req-phone"
                      type="tel"
                      placeholder={t.phonePlaceholder}
                      value={form.phone}
                      maxLength={30}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      aria-invalid={errors.phone ? true : undefined}
                    />
                    {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="req-email">{t.email}</Label>
                    <Input
                      id="req-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      aria-invalid={errors.email ? true : undefined}
                    />
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="req-message">{t.message}</Label>
                  <Textarea
                    id="req-message"
                    placeholder={isShelter ? t.messagePlaceholderShelter : t.messagePlaceholderBreeder}
                    value={form.message}
                    maxLength={2000}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </div>
                {formError && (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" className="h-11 md:h-9" onClick={() => setRequestFor(null)}>
                  {t.cancel}
                </Button>
                <Button className="h-11 md:h-9" disabled={busy} onClick={() => void submit()}>
                  {action}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PublicShell>
  )
}
