"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Baby, CalendarDays, ChevronDown, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar } from "@/components/app/pet-avatar"
import { ReadOnlyBanner } from "@/components/app/read-only-banner"
import type { MyOrganisation } from "@/lib/actions/organisation"
import type {
  CreateLitterInput,
  Litter,
  LitterOffspring,
  LittersPage,
  OffspringStatus,
  UpdateOffspringInput,
} from "@/lib/actions/litters"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S22 — Legla · /organizacija/legla · FR-48, FR-49 (port of docs/product/04-design/screens/litters.tsx without the
// StateSwitcher). Data: EP-53 (organisation name, city, approval, breeder plan) and EP-61 (litters, eligible mothers,
// access). Litter cards expand to offspring rows with status (EP-61 update) and price ("Cena (RSD)", owner
// decision); the new litter Dialog calls EP-61 createLitter ("Otac" is a name field only — father_name). States from
// real responses: default; empty (items []); read_only (access.can_edit = false — the pending or plan-less banner,
// controls disabled); error (ErrorState); loading (the page's Suspense fallback). EP-62 is not cached (TC ADR-18), so
// a change shows on the public page on the next request.

export type LittersCopy = {
  litters: Dictionary["litters"]
  orgAnimals: Dictionary["orgAnimals"]
  orgProfile: Dictionary["orgProfile"]
  petForm: Dictionary["petForm"]
  pet: Dictionary["pet"]
  common: Dictionary["common"]
}

export type LittersActions = {
  listLitters: () => Promise<ActionResult<LittersPage>>
  createLitter: (input: CreateLitterInput) => Promise<ActionResult<Litter>>
  updateOffspring: (input: UpdateOffspringInput) => Promise<ActionResult<LitterOffspring>>
}

const STATUSES: OffspringStatus[] = ["available", "reserved", "sold"]

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** A calendar date (YYYY-MM-DD) or a Date: sr-Latn "15. 8. 2026." · en-GB "15 Aug 2026" (Design §9). */
function formatDate(value: string | Date, locale: Locale) {
  const date =
    typeof value === "string"
      ? (() => {
          const [y, m, d] = value.split("-").map(Number)
          return new Date(y, m - 1, d)
        })()
      : value
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(date)
}

/** Local calendar date → "YYYY-MM-DD" (API §3.5). */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

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

function priceInput(offspring: LitterOffspring) {
  return offspring.price ? String(Math.round(offspring.price.amount_minor / 100)) : ""
}

function OffspringBadge({ status, label }: { status: OffspringStatus; label: string }) {
  return (
    <Badge variant={status === "available" ? "default" : "outline"} className={cn(status !== "available" && "bg-card")}>
      {label}
    </Badge>
  )
}

/** S22 loading variant — the page's Suspense fallback. */
export function LittersLoading({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      {[0, 1].map((i) => (
        <Card key={i} className="flex-row items-center gap-3 p-4 md:p-6">
          <Skeleton className="size-12 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  )
}

function NewLitterDialog({
  open,
  onOpenChange,
  mothers,
  locale,
  copy,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mothers: LittersPage["eligible_mothers"]
  locale: Locale
  copy: LittersCopy
  onCreate: (input: CreateLitterInput) => Promise<ActionResult<Litter>>
}) {
  const t = copy.litters
  const [mother, setMother] = useState("")
  const [father, setFather] = useState("")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [count, setCount] = useState("4")
  const [submitted, setSubmitted] = useState(false)
  const [serverFields, setServerFields] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)
  const monthNames = copy.petForm.calendarMonths.split(",")
  const weekdayNames = copy.petForm.calendarWeekdays.split(",")

  const n = Number(count)
  const countValid = /^\d+$/.test(count.trim()) && n >= 1 && n <= 20
  const motherError = (submitted && !mother) || serverFields.mother_id ? t.errMother : ""
  const dateError = (submitted && !date) || serverFields.born_on ? t.errDate : ""
  const countError = (submitted && !countValid) || serverFields.offspring_count ? t.errCount : ""

  function reset() {
    setMother("")
    setFather("")
    setDate(undefined)
    setCount("4")
    setSubmitted(false)
    setServerFields({})
    setFormError("")
  }

  async function save() {
    setSubmitted(true)
    setServerFields({})
    setFormError("")
    if (!mother || !date || !countValid) return
    setBusy(true)
    const result = await onCreate({
      mother_id: mother,
      father_name: father.trim() || null,
      born_on: isoDate(date),
      offspring_count: n,
    })
    setBusy(false)
    if (!result.ok) {
      const fields = result.error.fields ?? {}
      const known = ["mother_id", "born_on", "offspring_count"].some((f) => f in fields)
      setServerFields(fields)
      // Unmapped codes show the screen's form-level error (owner decision, Step 13).
      if (!known) setFormError(copy.common.error)
      return
    }
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.dialogTitle}</DialogTitle>
          <DialogDescription>{t.dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="litter-mother">{t.mother}</Label>
            <Select value={mother} onValueChange={setMother}>
              <SelectTrigger id="litter-mother" className="w-full" aria-invalid={motherError ? true : undefined}>
                <SelectValue placeholder={t.motherPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {mothers.map((m) => (
                  <SelectItem key={m.pet_id} value={m.pet_id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {motherError && <p className="text-sm text-destructive">{motherError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="litter-father">{t.father}</Label>
            <Input
              id="litter-father"
              value={father}
              maxLength={120}
              onChange={(e) => setFather(e.target.value)}
              placeholder={t.fatherPlaceholder}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="litter-date">{t.bornOn}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="litter-date"
                    type="button"
                    variant="outline"
                    className={cn("h-11 w-full justify-start font-normal md:h-9", !date && "text-muted-foreground")}
                    aria-invalid={dateError ? true : undefined}
                  >
                    <CalendarDays className="size-4" aria-hidden />
                    {date ? formatDate(date, locale) : t.pickDate}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    weekStartsOn={1}
                    // EP-61: born_on not in the future — future days cannot be picked (owner decision).
                    disabled={{ after: new Date() }}
                    formatters={{
                      formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
                      formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
                    }}
                  />
                </PopoverContent>
              </Popover>
              {dateError && <p className="text-sm text-destructive">{dateError}</p>}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="litter-count">{t.count}</Label>
              <Input
                id="litter-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                aria-invalid={countError ? true : undefined}
              />
              {countError && <p className="text-sm text-destructive">{countError}</p>}
            </div>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button className="h-11 md:h-9" disabled={busy} onClick={() => void save()}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LittersScreen({
  initialOrg,
  initialLitters,
  locale,
  copy,
  actions,
}: {
  initialOrg: ActionResult<MyOrganisation>
  initialLitters: ActionResult<LittersPage>
  locale: Locale
  copy: LittersCopy
  actions: LittersActions
}) {
  const t = copy.litters
  const router = useRouter()
  const firstPage = initialLitters.ok ? initialLitters.data : null
  const [litters, setLitters] = useState<Litter[]>(firstPage?.items ?? [])
  const [expanded, setExpanded] = useState<string[]>(firstPage?.items[0] ? [firstPage.items[0].id] : [])
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries((firstPage?.items ?? []).flatMap((l) => l.offspring.map((o) => [o.pet_id, priceInput(o)]))),
  )
  const [dialogOpen, setDialogOpen] = useState(false)

  const org = initialOrg.ok ? initialOrg.data : null
  if (!org || !firstPage) {
    return <ErrorState message={copy.common.error} onRetry={() => router.refresh()} labels={{ retry: copy.common.retry }} />
  }

  const organisation = org.organisation
  const canEdit = firstPage.access.can_edit
  const pending = organisation.approval_status === "pending"
  const noPlan = !org.breeder_plan_active
  const cityName = organisation.city
    ? locale === "en"
      ? organisation.city.name_en || organisation.city.name_sr
      : organisation.city.name_sr
    : null
  const heading = cityName ? format(copy.orgProfile.nameCity, { name: organisation.name, city: cityName }) : organisation.name

  function toggle(id: string) {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function replaceOffspring(litterId: string, row: LitterOffspring) {
    setLitters((prev) =>
      prev.map((l) => {
        if (l.id !== litterId) return l
        const offspring = l.offspring.map((o) => (o.pet_id === row.pet_id ? row : o))
        return { ...l, offspring, available_count: offspring.filter((o) => o.offspring_status === "available").length }
      }),
    )
  }

  async function setStatus(litterId: string, offspring: LitterOffspring, status: OffspringStatus) {
    if (status === offspring.offspring_status) return
    const result = await actions.updateOffspring({ pet_id: offspring.pet_id, offspring_status: status })
    if (!result.ok) {
      toast.error(copy.common.error)
      return
    }
    replaceOffspring(litterId, result.data)
  }

  async function savePrice(litterId: string, offspring: LitterOffspring) {
    const raw = (prices[offspring.pet_id] ?? "").trim()
    if (raw === priceInput(offspring)) return
    const amount = Number(raw)
    if (raw !== "" && (!/^\d+$/.test(raw) || !Number.isSafeInteger(amount * 100))) {
      setPrices((prev) => ({ ...prev, [offspring.pet_id]: priceInput(offspring) }))
      toast.error(copy.common.error)
      return
    }
    const result = await actions.updateOffspring({
      pet_id: offspring.pet_id,
      price: raw === "" ? null : { amount_minor: amount * 100, currency: "RSD" },
    })
    if (!result.ok) {
      setPrices((prev) => ({ ...prev, [offspring.pet_id]: priceInput(offspring) }))
      toast.error(copy.common.error)
      return
    }
    replaceOffspring(litterId, result.data)
    setPrices((prev) => ({ ...prev, [offspring.pet_id]: priceInput(result.data) }))
  }

  async function create(input: CreateLitterInput) {
    const result = await actions.createLitter(input)
    if (result.ok) {
      const litter = result.data
      setLitters((prev) =>
        [litter, ...prev.filter((l) => l.id !== litter.id)].sort((a, b) => (a.born_on < b.born_on ? 1 : a.born_on > b.born_on ? -1 : 0)),
      )
      setExpanded((prev) => [...prev, litter.id])
      setPrices((prev) => ({ ...prev, ...Object.fromEntries(litter.offspring.map((o) => [o.pet_id, priceInput(o)])) }))
    } else if (!result.error.fields) {
      toast.error(copy.common.error)
    }
    return result
  }

  return (
    <div className="space-y-6">
      {pending && <ReadOnlyBanner reason={copy.orgAnimals.pendingBanner} />}
      {!pending && noPlan && <ReadOnlyBanner reason={copy.orgAnimals.breederPlanBanner} />}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{heading}</p>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
        </div>
        {litters.length > 0 && canEdit && (
          <Button className="h-11 md:h-9" onClick={() => setDialogOpen(true)}>
            <Plus className="size-5" aria-hidden />
            {t.newLitter}
          </Button>
        )}
      </div>

      {litters.length === 0 ? (
        <EmptyState
          icon={Baby}
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={canEdit ? t.newLitter : undefined}
          onAction={canEdit ? () => setDialogOpen(true) : undefined}
        />
      ) : (
        <div className="space-y-4">
          {litters.map((l) => {
            const isOpen = expanded.includes(l.id)
            const panelId = `litter-panel-${l.id}`
            const father = l.father_name
              ? l.father_external
                ? format(t.externalSire, { name: l.father_name })
                : l.father_name
              : t.noFather
            const born = format(t.born, { date: formatDate(l.born_on, locale) })
            return (
              <Card key={l.id} className="gap-0 p-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(l.id)}
                  className="flex w-full items-center gap-3 rounded-md p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:p-6"
                >
                  <PetAvatar name={l.mother.name} sex="female" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-heading text-lg font-bold">
                      {format(t.pair, { mother: l.mother.name, father })}
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">{[l.breed, born].filter(Boolean).join(" · ")}</p>
                    <p className="text-sm text-muted-foreground">
                      {plural(t, "offspring", l.offspring.length, locale)} · {format(t.available, { n: l.available_count })}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn("size-5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>

                {isOpen && (
                  <div id={panelId} className="space-y-2 border-t border-border p-4 md:p-6">
                    {l.offspring.length === 0 && <p className="text-sm text-muted-foreground">{t.noOffspring}</p>}
                    {l.offspring.map((o) => {
                      const sex = o.sex === "female" ? copy.pet.female : o.sex === "male" ? copy.pet.male : null
                      const price = o.price ? formatMoney(o.price.amount_minor, locale) : t.noPrice
                      return (
                        <div
                          key={o.pet_id}
                          className="flex flex-col gap-3 rounded-sm bg-foreground/5 p-3 md:flex-row md:items-center"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <PetAvatar name={o.name} sex={o.sex} size="sm" />
                            <div className="min-w-0">
                              <Link
                                href={`/ljubimci/${o.pet_id}`}
                                className="block truncate text-sm font-medium hover:underline"
                              >
                                {o.name}
                              </Link>
                              <p className="truncate text-xs text-muted-foreground">{[sex, price].filter(Boolean).join(" · ")}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <OffspringBadge status={o.offspring_status} label={copy.orgAnimals.offspringStatus[o.offspring_status]} />
                            <Label htmlFor={`price-${o.pet_id}`} className="sr-only">
                              {format(t.priceFor, { name: o.name })}
                            </Label>
                            <Input
                              id={`price-${o.pet_id}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              placeholder={t.price}
                              disabled={!canEdit}
                              value={prices[o.pet_id] ?? ""}
                              onChange={(e) => setPrices((prev) => ({ ...prev, [o.pet_id]: e.target.value }))}
                              onBlur={() => void savePrice(l.id, o)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur()
                              }}
                              className="h-8 w-32 bg-card"
                            />
                            <Label htmlFor={`status-${o.pet_id}`} className="sr-only">
                              {format(t.statusFor, { name: o.name })}
                            </Label>
                            <Select
                              value={o.offspring_status}
                              disabled={!canEdit}
                              onValueChange={(v) => void setStatus(l.id, o, v as OffspringStatus)}
                            >
                              <SelectTrigger id={`status-${o.pet_id}`} size="sm" className="min-w-0 bg-card">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {copy.orgAnimals.offspringStatus[s]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {canEdit && (
        <NewLitterDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mothers={firstPage.eligible_mothers}
          locale={locale}
          copy={copy}
          onCreate={create}
        />
      )}
    </div>
  )
}
