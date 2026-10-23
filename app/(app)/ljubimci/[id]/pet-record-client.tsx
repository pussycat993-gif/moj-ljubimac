"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays, ClipboardList, MoreVertical, Pencil, Phone, Plus, Scale, Syringe, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import type { PetSpecies } from "@/components/app/pet-avatar"
import { PetHeader } from "@/components/app/pet-header"
import { ReadOnlyBanner } from "@/components/app/read-only-banner"
import { StatusBadge } from "@/components/app/status-badge"
import { deletePet, type PetRecord, type WeightUnit } from "@/lib/actions/pets"
import { deleteVaccination, type Vaccination } from "@/lib/actions/vaccinations"
import { createWeightEntry, deleteWeightEntry, updateWeightEntry, type WeightEntry } from "@/lib/actions/weights"
import type { Me } from "@/lib/actions/registration"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S03 — Karton ljubimca · /ljubimci/[id] · FR-03 (display), FR-04, FR-05, FR-13, FR-28 · EP-02
// (rpc:get_pet_record), EP-05 (delete_pet), EP-08 (weights), EP-09 (vaccination edit/delete), EP-15
// (photo). Step 14 renders the header, Pregled (last weight, last visit), Vakcine and Težina; the
// Terapije/Pregledi tabs, memorial, PDF, next-reminders block and Dnevnik/Trenuci links arrive in
// Steps 15–21. States: loading (PetRecordLoading) / default / per-tab empty / read_only (banner by
// read_only_reason, every edit control hidden) / error (PetRecordError on 404 / 5xx).

export type PetRecordCopy = Pick<Dictionary, "petRecord" | "pet" | "petForm" | "common">

type TabKey = "pregled" | "vakcine" | "tezina"

/** API §6 VetVisit — only the fields the Pregled tab shows in Step 14. */
type VetVisitSummary = { id: string; visited_on: string; clinic: string | null; reason: string | null }

const AVATAR_SPECIES: Partial<Record<PetRecord["pet"]["species"], PetSpecies>> = {
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** "YYYY-MM-DD" → local calendar date. */
function parseIsoDate(value: string) {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Local calendar date → "YYYY-MM-DD" (API §3.5). */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** sr-Latn "19. 10. 2026." · en-GB "19 Oct 2026" (Design §9, owner decision Step 13). */
function formatDate(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(d)
}

/** Trend bar caption: sr-Latn "19. 10." · en-GB "19 Oct". */
function formatShortDate(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
  }).format(d)
}

/** "4,2 kg" · "850 g" (Design §9) in the pet's unit (FR-03). */
function formatWeight(value: number, unit: WeightUnit, locale: Locale) {
  const number = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: unit === "kg" ? 1 : 0,
    maximumFractionDigits: 3,
  }).format(value)
  return `${number} ${unit}`
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(dict: object, base: string, n: number, locale: Locale): string {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  return (dict as Record<string, string>)[`${base}_${rule === "one" || rule === "few" ? rule : "other"}`]
}

/** Calendar date (YYYY-MM-DD) in Europe/Belgrade. */
function belgradeDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(date)
}

/** Age as on S01 (owner decision, Step 13): years; under a year months; birth year only → "oko …"; none → null. */
function ageLabel(pet: PetRecord["pet"], today: string, t: PetRecordCopy["pet"], locale: Locale): string | null {
  const [year, month, day] = today.split("-").map(Number)
  const years = (n: number) => format(plural(t, "years", n, locale), { n })
  const months = (n: number) => format(plural(t, "months", n, locale), { n })
  if (pet.birth_date) {
    const [by, bm, bd] = pet.birth_date.split("-").map(Number)
    const total = Math.max(0, (year - by) * 12 + (month - bm) - (day < bd ? 1 : 0))
    return total >= 12 ? years(Math.floor(total / 12)) : months(total)
  }
  if (pet.birth_year) {
    const diff = year - pet.birth_year
    return format(t.about, { age: diff >= 1 ? years(diff) : months(month - 1) })
  }
  return null
}

/** Vaccine next-dose badge (owner decision, Step 14): ≤ 30 days → soon, overdue → missed. */
function vaccineBadge(v: Vaccination, t: PetRecordCopy["petRecord"], locale: Locale) {
  if (!v.next_due_on) return <Badge variant="secondary">{t.noNextDose}</Badge>
  const date = formatDate(parseIsoDate(v.next_due_on), locale)
  const days = v.days_until_due
  if (days === null || days > 30) return <Badge variant="outline">{format(t.nextDose, { date })}</Badge>
  if (days === 0) return <StatusBadge status="soon" label={format(t.nextDoseToday, { date })} />
  if (days > 0) return <StatusBadge status="soon" label={format(plural(t, "nextDoseIn", days, locale), { date, n: days })} />
  const overdue = Math.abs(days)
  return <StatusBadge status="missed" label={format(plural(t, "nextDoseOverdue", overdue, locale), { date, n: overdue })} />
}

function DateField({
  id,
  label,
  value,
  onChange,
  locale,
  copy,
}: {
  id: string
  label: string
  value?: Date
  onChange: (d?: Date) => void
  locale: Locale
  copy: PetRecordCopy["petForm"]
}) {
  const monthNames = copy.calendarMonths.split(",")
  const weekdayNames = copy.calendarWeekdays.split(",")
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn("h-11 w-full justify-start font-normal md:h-9", !value && "text-muted-foreground")}
          >
            <CalendarDays className="size-4" aria-hidden />
            {value ? formatDate(value, locale) : copy.pickDate}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            weekStartsOn={1}
            // EP-08: measured_on is not in the future — later days cannot be picked (owner decision, Step 14).
            disabled={{ after: new Date() }}
            formatters={{
              formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
              formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function SectionHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-heading text-[22px] leading-7 font-bold">{title}</h2>
      {action}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  )
}

/** Row DropdownMenu "Još opcija" → Izmeni / Obriši (owner decision, Step 14). */
function RowMenu({
  label,
  onEdit,
  editHref,
  onDelete,
  t,
}: {
  label: string
  onEdit?: () => void
  editHref?: string
  onDelete: () => void
  t: PetRecordCopy["petRecord"]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`${t.moreOptions}: ${label}`}>
          <MoreVertical className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="shadow-raised">
        {editHref ? (
          <DropdownMenuItem asChild>
            <Link href={editHref}>
              <Pencil className="size-4" aria-hidden />
              {t.editEntry}
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="size-4" aria-hidden />
            {t.editEntry}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-4" aria-hidden />
          {t.deleteEntry}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WeightTrend({
  entries,
  unit,
  name,
  locale,
  t,
}: {
  entries: WeightEntry[]
  unit: WeightUnit
  name: string
  locale: Locale
  t: PetRecordCopy["petRecord"]
}) {
  const values = entries.map((e) => e.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const first = entries[0]
  const last = entries[entries.length - 1]
  return (
    <div
      role="img"
      aria-label={format(t.trendLabel, {
        name,
        first: formatWeight(first.value, unit, locale),
        firstDate: formatDate(parseIsoDate(first.measured_on), locale),
        last: formatWeight(last.value, unit, locale),
        lastDate: formatDate(parseIsoDate(last.measured_on), locale),
      })}
      className="flex h-40 items-end gap-2"
    >
      {entries.map((e) => {
        const pct = 20 + ((e.value - min) / range) * 80
        return (
          <div key={e.id} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1" aria-hidden data-testid="weight-bar">
            <span className="max-w-full truncate text-xs font-medium">{formatWeight(e.value, unit, locale)}</span>
            <div className="flex w-full flex-1 items-end">
              <div className="w-full rounded-sm bg-pet-accent" style={{ height: `${pct}%` }} />
            </div>
            <span className="max-w-full truncate text-xs font-medium text-muted-foreground">
              {formatShortDate(parseIsoDate(e.measured_on), locale)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function PetRecordLoading({ copy }: { copy: PetRecordCopy }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={copy.petRecord.loading}>
      <Card className="gap-4 p-4 md:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </Card>
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="gap-3 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </Card>
          ))}
        </div>
        <Card className="gap-3 p-4 md:p-6">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
      </div>
    </div>
  )
}

/** EP-02 404 / 5xx → the error state; "Pokušaj ponovo" reloads the record. */
export function PetRecordError({ copy }: { copy: PetRecordCopy }) {
  const router = useRouter()
  return <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={() => router.refresh()} />
}

type PendingDelete = { kind: "weight" | "vaccination"; id: string }

export function PetRecordClient({
  record,
  photoUrl,
  now,
  locale,
  copy,
}: {
  record: PetRecord
  photoUrl?: string
  /** Server time (ISO), so the age is the same on server and client. */
  now: string
  /** Me.entitlements — consumed by the Pregledi counter and the PDF lock (Steps 15–16). */
  entitlements?: Me["entitlements"]
  locale: Locale
  copy: PetRecordCopy
}) {
  const t = copy.petRecord
  const router = useRouter()
  const pet = record.pet
  const vaccines = record.vaccinations as unknown as Vaccination[]
  const visits = record.vet_visits as unknown as VetVisitSummary[]
  // EP-02 returns measured_on desc; the trend reads oldest → newest (FR-04).
  const weightsDesc = record.weights as unknown as WeightEntry[]
  const weights = [...weightsDesc].sort(
    (a, b) => a.measured_on.localeCompare(b.measured_on) || a.created_at.localeCompare(b.created_at),
  )

  const [tab, setTab] = useState<TabKey>("pregled")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [weightOpen, setWeightOpen] = useState(false)
  const [editingWeight, setEditingWeight] = useState<WeightEntry | null>(null)
  const [busy, setBusy] = useState(false)

  // weight form
  const [wDate, setWDate] = useState<Date | undefined>(undefined)
  const [wValue, setWValue] = useState("")
  const [wNote, setWNote] = useState("")
  const [wError, setWError] = useState("")

  const canEdit = record.access.can_edit
  const canDelete = record.access.can_delete
  const canLog = record.can_log
  const female = pet.sex === "female"
  const unit = pet.weight_unit

  const bannerText =
    record.read_only_reason === "household_member"
      ? format(t.bannerMember, { owner: record.owner_name ?? "" })
      : record.read_only_reason === "household_read_only"
        ? t.bannerReadOnly
        : record.read_only_reason === "transferred"
          ? t.bannerTransferred
          : null

  function openWeight(entry: WeightEntry | null) {
    setEditingWeight(entry)
    setWDate(entry ? parseIsoDate(entry.measured_on) : new Date())
    setWValue(entry ? String(entry.value).replace(".", locale === "en" ? "." : ",") : "")
    setWNote(entry?.note ?? "")
    setWError("")
    setWeightOpen(true)
  }

  async function saveWeight() {
    const n = Number(wValue.trim().replace(",", "."))
    if (!wValue.trim() || Number.isNaN(n) || n <= 0) {
      setWError(unit === "kg" ? t.errWeightKg : t.errWeightG)
      return
    }
    if (!wDate) {
      setWError(t.errWeightDate)
      return
    }
    setWError("")
    setBusy(true)
    const input = { measured_on: isoDate(wDate), value: n, note: wNote.trim() || null }
    const result = editingWeight
      ? await updateWeightEntry(editingWeight.id, input)
      : await createWeightEntry({ pet_id: pet.id, ...input })
    setBusy(false)
    if (!result.ok) {
      const { code, fields } = result.error
      if (code === "validation_failed" && fields) {
        // 422 → the dialog's inline message; an unmapped field code → the form-level error (owner decision).
        setWError(
          fields.value ? (unit === "kg" ? t.errWeightKg : t.errWeightG) : fields.measured_on ? t.errWeightDate : copy.common.error,
        )
        return
      }
      setWeightOpen(false)
      toast.error(copy.common.error)
      router.refresh()
      return
    }
    setWeightOpen(false)
    toast(t.weightSaved)
    router.refresh()
  }

  async function confirmEntryDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    const result = target.kind === "weight" ? await deleteWeightEntry(target.id) : await deleteVaccination(target.id)
    if (!result.ok) toast.error(copy.common.error)
    router.refresh()
  }

  async function confirmDelete() {
    setDeleteOpen(false)
    const result = await deletePet({ pet_id: pet.id, confirm: true })
    if (!result.ok) {
      toast.error(copy.common.error)
      return
    }
    toast(format(female ? t.deletedFemale : t.deletedMale, { name: pet.name }))
    router.push("/ljubimci")
    router.refresh()
  }

  const lastWeight = weights[weights.length - 1]
  const prevWeight = weights[weights.length - 2]
  const lastVisit = visits[0]

  const speciesLabel = pet.species === "other" && pet.species_other ? pet.species_other : copy.pet.species[pet.species]
  const age = ageLabel(pet, belgradeDate(new Date(now)), copy.pet, locale)
  const subtitle = [pet.breed ?? speciesLabel, age].filter(Boolean).join(" · ")
  const neuteredLabel = female ? t.neuteredFemale : t.neuteredMale
  // Sex unknown: no sex chip, masculine forms (owner decision, Steps 13–14).
  const headerChips = [
    ...(pet.sex === "female" ? [copy.pet.female] : pet.sex === "male" ? [copy.pet.male] : []),
    ...(pet.neutered === "yes" ? [neuteredLabel] : []),
  ]
  const neuteredValue =
    pet.neutered === "yes" ? copy.petForm.yes : pet.neutered === "no" ? copy.petForm.no : copy.petForm.unknown
  const birthValue = pet.birth_date
    ? formatDate(parseIsoDate(pet.birth_date), locale)
    : pet.birth_year
      ? String(pet.birth_year)
      : null

  const headerActions =
    canEdit || canDelete ? (
      <>
        {canEdit && (
          <Button asChild variant="outline" className="h-11 md:h-9">
            <Link href={`/ljubimci/${pet.id}/izmena`}>
              <Pencil className="size-4" aria-hidden />
              {t.edit}
            </Link>
          </Button>
        )}
        {canDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-11 md:size-9" aria-label={t.moreOptions}>
                <MoreVertical className="size-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="shadow-raised">
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" aria-hidden />
                {t.deletePermanently}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </>
    ) : undefined

  const headerMeta = pet.microchip_number ? (
    <>
      <span className="text-muted-foreground">{t.microchip}</span>
      <span className="font-medium tabular-nums">{pet.microchip_number}</span>
    </>
  ) : undefined

  const tabTrigger = "after:bg-pet-accent data-[state=active]:text-pet-accent"

  return (
    <div data-pet-sex={pet.sex} className="space-y-6">
      {bannerText && <ReadOnlyBanner reason={bannerText} />}

      <PetHeader
        name={pet.name}
        sex={pet.sex}
        species={AVATAR_SPECIES[pet.species]}
        photoUrl={photoUrl}
        subtitle={subtitle}
        chips={headerChips}
        meta={headerMeta}
        actions={headerActions}
        labels={{ chips: t.basics }}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* main column */}
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="gap-4">
            <div className="overflow-x-auto overflow-y-hidden border-b border-border">
              <TabsList variant="line" className="h-11 w-max md:h-9">
                <TabsTrigger value="pregled" className={tabTrigger}>
                  <ClipboardList aria-hidden />
                  {t.tabOverview}
                </TabsTrigger>
                <TabsTrigger value="vakcine" className={tabTrigger}>
                  <Syringe aria-hidden />
                  {t.tabVaccines}
                </TabsTrigger>
                <TabsTrigger value="tezina" className={tabTrigger}>
                  <Scale aria-hidden />
                  {t.tabWeight}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Pregled */}
            <TabsContent value="pregled" className="space-y-4">
              {record.upcoming_reminders.length === 0 && !lastWeight && !lastVisit ? (
                <EmptyState
                  icon={ClipboardList}
                  title={format(t.overviewEmptyTitle, { name: pet.name })}
                  description={t.overviewEmptyDescription}
                  action={canEdit ? t.addVaccine : undefined}
                  onAction={() => setTab("vakcine")}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {lastWeight && (
                    <Card className="gap-2 p-4 md:p-6">
                      <p className="text-xs font-medium text-muted-foreground">{t.lastWeight}</p>
                      <p className="font-heading text-[22px] leading-7 font-bold text-pet-accent">
                        {formatWeight(lastWeight.value, unit, locale)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(parseIsoDate(lastWeight.measured_on), locale)}
                        {prevWeight &&
                          ` · ${format(t.sinceLast, {
                            change: `${lastWeight.value >= prevWeight.value ? "+" : "−"}${formatWeight(
                              Math.abs(lastWeight.value - prevWeight.value),
                              unit,
                              locale,
                            )}`,
                          })}`}
                      </p>
                      <Button variant="link" size="sm" className="self-start px-0" onClick={() => setTab("tezina")}>
                        {t.viewTrend}
                      </Button>
                    </Card>
                  )}
                  {lastVisit && (
                    <Card className="gap-2 p-4 md:p-6">
                      <p className="text-xs font-medium text-muted-foreground">{t.lastVisit}</p>
                      {lastVisit.reason && <p className="truncate font-heading text-lg font-bold">{lastVisit.reason}</p>}
                      <p className="truncate text-sm text-muted-foreground">
                        {[formatDate(parseIsoDate(lastVisit.visited_on), locale), lastVisit.clinic].filter(Boolean).join(" · ")}
                      </p>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Vakcine */}
            <TabsContent value="vakcine" className="space-y-4">
              <SectionHeader
                title={t.tabVaccines}
                action={
                  canEdit && vaccines.length > 0 ? (
                    <Button asChild className="h-11 md:h-9">
                      <Link href={`/ljubimci/${pet.id}/vakcine/nova`}>
                        <Plus className="size-4" aria-hidden />
                        {t.addVaccine}
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
              {vaccines.length === 0 ? (
                <EmptyState
                  icon={Syringe}
                  title={t.vaccinesEmptyTitle}
                  description={t.vaccinesEmptyDescription}
                  action={canEdit ? t.addVaccine : undefined}
                  href={`/ljubimci/${pet.id}/vakcine/nova`}
                />
              ) : (
                <Card className="gap-2 p-4 md:p-6">
                  <ul className="space-y-2">
                    {vaccines.map((v) => (
                      <li key={v.id} className="flex flex-col gap-2 rounded-sm bg-foreground/5 p-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{v.name}</p>
                          <p className="truncate text-xs font-medium text-muted-foreground">
                            {[
                              format(t.vaccineGiven, { date: formatDate(parseIsoDate(v.given_on), locale) }),
                              v.clinic,
                              v.batch_number ? format(t.vaccineBatch, { batch: v.batch_number }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {vaccineBadge(v, t, locale)}
                          {canEdit && (
                            <RowMenu
                              label={v.name}
                              editHref={`/ljubimci/${pet.id}/vakcine/${v.id}`}
                              onDelete={() => setPendingDelete({ kind: "vaccination", id: v.id })}
                              t={t}
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </TabsContent>

            {/* Težina */}
            <TabsContent value="tezina" className="space-y-4">
              <SectionHeader
                title={t.tabWeight}
                action={
                  canLog && weights.length > 0 ? (
                    <Button className="h-11 md:h-9" onClick={() => openWeight(null)}>
                      <Plus className="size-4" aria-hidden />
                      {t.addMeasurement}
                    </Button>
                  ) : undefined
                }
              />
              {weights.length === 0 ? (
                <EmptyState
                  icon={Scale}
                  title={t.weightEmptyTitle}
                  description={t.weightEmptyDescription}
                  action={canLog ? t.addMeasurement : undefined}
                  onAction={() => openWeight(null)}
                />
              ) : (
                <>
                  {weights.length >= 2 && (
                    <Card className="gap-4 p-4 md:p-6">
                      <h3 className="font-heading text-lg font-bold">{t.trend}</h3>
                      <WeightTrend entries={weights} unit={unit} name={pet.name} locale={locale} t={t} />
                    </Card>
                  )}
                  <Card className="gap-2 p-4 md:p-6">
                    <h3 className="font-heading text-lg font-bold">{t.allMeasurements}</h3>
                    <ul className="space-y-2">
                      {[...weights].reverse().map((w) => {
                        const date = formatDate(parseIsoDate(w.measured_on), locale)
                        return (
                          <li key={w.id} className="flex min-w-0 items-center justify-between gap-4 rounded-sm bg-foreground/5 p-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{date}</p>
                              {w.note && <p className="truncate text-xs font-medium text-muted-foreground">{w.note}</p>}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <p className="shrink-0 text-sm font-medium">{formatWeight(w.value, unit, locale)}</p>
                              {w.access.can_edit && (
                                <RowMenu
                                  label={date}
                                  onEdit={() => openWeight(w)}
                                  onDelete={() => setPendingDelete({ kind: "weight", id: w.id })}
                                  t={t}
                                />
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* aside */}
        <aside className="min-w-0 space-y-4" aria-label={t.asideLabel}>
          <Card className="gap-3 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">{t.basics}</h2>
            <dl className="space-y-2">
              <InfoRow label={t.species} value={speciesLabel} />
              {pet.breed && <InfoRow label={t.breed} value={pet.breed} />}
              {birthValue && <InfoRow label={t.birthday} value={birthValue} />}
              {pet.colour_markings && <InfoRow label={t.colour} value={pet.colour_markings} />}
              {pet.microchip_number && <InfoRow label={t.microchip} value={pet.microchip_number} />}
              {pet.passport_number && <InfoRow label={t.passport} value={pet.passport_number} />}
              <InfoRow label={neuteredLabel} value={neuteredValue} />
              <InfoRow label={t.weightUnit} value={unit} />
            </dl>
            {pet.note && (
              <>
                <Separator />
                <p className="text-sm text-muted-foreground">{pet.note}</p>
              </>
            )}
          </Card>

          {pet.vet_name && (
            <Card className="gap-3 p-4 md:p-6">
              <h2 className="font-heading text-lg font-bold">{t.vet}</h2>
              <p className="text-sm">{pet.vet_name}</p>
              {pet.vet_phone && (
                <Button asChild variant="outline" className="h-11 md:h-9">
                  <a href={`tel:${pet.vet_phone.replace(/\s/g, "")}`}>
                    <Phone className="size-4" aria-hidden />
                    {format(t.call, { phone: pet.vet_phone })}
                  </a>
                </Button>
              )}
            </Card>
          )}
        </aside>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="shadow-raised">
          <AlertDialogHeader>
            <AlertDialogTitle>{format(t.deleteTitle, { name: pet.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 md:h-9">{t.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="h-11 md:h-9" onClick={confirmDelete}>
              {t.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Entry delete confirmation (owner decision, Step 14) */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="shadow-raised">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteEntryTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteEntryDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 md:h-9">{t.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="h-11 md:h-9" onClick={confirmEntryDelete}>
              {t.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Weight dialog */}
      <Dialog open={weightOpen} onOpenChange={setWeightOpen}>
        <DialogContent className="shadow-raised">
          <DialogHeader>
            <DialogTitle>{format(editingWeight ? t.weightEditTitle : t.weightNewTitle, { name: pet.name })}</DialogTitle>
            <DialogDescription>{format(t.weightDescription, { unit })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <DateField id="tezina-datum" label={t.date} value={wDate} onChange={setWDate} locale={locale} copy={copy.petForm} />
            <div className="space-y-2">
              <Label htmlFor="tezina-vrednost">{format(t.weightValue, { unit })}</Label>
              <Input
                id="tezina-vrednost"
                inputMode="decimal"
                className="h-11 md:h-9"
                value={wValue}
                onChange={(e) => setWValue(e.target.value)}
                aria-invalid={!!wError}
                aria-describedby={wError ? "tezina-greska" : undefined}
                placeholder={unit === "kg" ? t.weightPlaceholderKg : t.weightPlaceholderG}
              />
              {wError && (
                <p id="tezina-greska" className="text-sm text-destructive">
                  {wError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tezina-napomena">{t.note}</Label>
              <Input
                id="tezina-napomena"
                className="h-11 md:h-9"
                value={wNote}
                maxLength={500}
                onChange={(e) => setWNote(e.target.value)}
                placeholder={t.weightNotePlaceholder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setWeightOpen(false)}>
              {t.cancel}
            </Button>
            <Button className="h-11 md:h-9" onClick={saveWeight} disabled={busy}>
              {t.saveWeight}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
