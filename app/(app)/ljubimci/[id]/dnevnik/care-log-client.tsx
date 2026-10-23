"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, Clock, Droplet, MoreVertical, Pencil, Plus, Trash2, Utensils, X } from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/app/empty-state"
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar"
import type { Access, PetSummary } from "@/lib/actions/pets"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S07 — Dnevnik ishrane i stolice · /ljubimci/[id]/dnevnik · FR-14, FR-15, FR-16, FR-28 · EP-01 header
// (view:pet_summaries_api, id filter), EP-17 (Ishrana / Stolica pages of 20, "Učitaj još"), EP-18
// (quick-add, edit and delete Dialogs; fed_at / observed_at built from date + HH:MM in Europe/Belgrade),
// EP-19 ("Podsetnici za obroke": get through view:meal_schedules_api, save through rpc:set_meal_schedule).
// Entries are grouped by day in Europe/Belgrade ("Danas, …" / "Juče, …"). "Dodaj obrok" / "Dodaj stolicu"
// follow PetSummary.can_log (FR-28); each row's menu follows its access.can_edit (BR-23); the meal
// schedule is edited by the owner only (members see times and days without controls). States: loading
// (CareLogLoading) / default / empty per tab (total = 0); the page shows ErrorState when the pet is missing.

export type CareLogCopy = Pick<Dictionary, "careLog" | "pet" | "petForm" | "common">

/** API §6 FeedingEntry. */
export type FeedingEntry = {
  id: string
  pet_id: string
  fed_at: string
  type: FoodType
  brand: string | null
  amount_g: number | null
  note: string | null
  created_by: string
  created_by_name: string | null
  created_at: string
  access: Access
}

/** API §6 StoolEntry. */
export type StoolEntry = {
  id: string
  pet_id: string
  observed_at: string
  consistency: Consistency
  blood_or_mucus: boolean
  note: string | null
  created_by: string
  created_by_name: string | null
  created_at: string
  access: Access
}

/** API §6 MealSchedule. */
export type MealSchedule = {
  pet_id: string
  reminder_id: string | null
  meal_times: string[]
  meal_weekdays: number[]
  every_day: boolean
  active: boolean
}

export type FoodType = "dry" | "wet" | "treat" | "home_made" | "other"
export type Consistency = "normal" | "soft" | "diarrhoea" | "hard"
export type CareKind = "feeding" | "stool"

/** EP-17 response. */
export type CareLogPage<T> = { items: T[]; total: number }

/** EP-18 feeding insert; update takes the same fields without pet_id. */
export type FeedingInput = {
  pet_id: string
  fed_at: string
  type: FoodType
  brand: string | null
  amount_g: number | null
  note: string | null
}

/** EP-18 stool insert; update takes the same fields without pet_id. */
export type StoolInput = {
  pet_id: string
  observed_at: string
  consistency: Consistency
  blood_or_mucus: boolean
  note: string | null
}

/** EP-19 set. */
export type MealScheduleInput = { pet_id: string; meal_times: string[]; meal_weekdays: number[] }

export type CareLogActions = {
  listEntries: (input: { pet_id: string; kind: CareKind; offset: number }) => Promise<
    ActionResult<CareLogPage<FeedingEntry> | CareLogPage<StoolEntry>>
  >
  createFeeding: (input: FeedingInput) => Promise<ActionResult<FeedingEntry>>
  updateFeeding: (id: string, input: Omit<FeedingInput, "pet_id">) => Promise<ActionResult<FeedingEntry>>
  createStool: (input: StoolInput) => Promise<ActionResult<StoolEntry>>
  updateStool: (id: string, input: Omit<StoolInput, "pet_id">) => Promise<ActionResult<StoolEntry>>
  deleteEntry: (kind: CareKind, id: string) => Promise<ActionResult<{ id: string }>>
  setMealSchedule: (input: MealScheduleInput) => Promise<ActionResult<MealSchedule>>
}

/** The pet fields the S07 header and controls need (PetSummary, EP-01). */
export type CareLogPet = Pick<
  PetSummary,
  "id" | "name" | "sex" | "species" | "species_other" | "breed" | "lifecycle" | "access" | "can_log"
>

const FOOD_TYPES: FoodType[] = ["dry", "wet", "treat", "home_made", "other"]
const CONSISTENCIES: Consistency[] = ["normal", "soft", "diarrhoea", "hard"]
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const MAX_MEAL_TIMES = 6

const AVATAR_SPECIES: Partial<Record<PetSummary["species"], PetSpecies>> = {
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

const TZ = "Europe/Belgrade"
const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** A timestamp → its Europe/Belgrade calendar day as "YYYY-MM-DD". */
function belgradeDay(value: string | number | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(value))
}

/** A timestamp → its Europe/Belgrade wall-clock time "HH:MM". */
function belgradeTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(value),
  )
}

/** Minutes Europe/Belgrade is ahead of UTC at an instant. */
function belgradeOffsetMinutes(utcMs: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs))
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"))
  return Math.round((wall - Math.floor(utcMs / 60000) * 60000) / 60000)
}

/** EP-18: date "YYYY-MM-DD" + "HH:MM" on the Europe/Belgrade wall clock → ISO 8601 UTC. */
export function belgradeToIso(day: string, time: string) {
  const [y, m, d] = day.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  let utc = wall - belgradeOffsetMinutes(wall) * 60000
  utc = wall - belgradeOffsetMinutes(utc) * 60000
  return new Date(utc).toISOString()
}

/** "YYYY-MM-DD" → local calendar date (Calendar value). */
function parseDay(value: string) {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Local calendar date → "YYYY-MM-DD". */
function dayOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** The calendar day before "YYYY-MM-DD". */
function previousDay(day: string) {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

/** sr-Latn "19. 10. 2026." · en-GB "19 Oct 2026" (Design §9). */
function formatDay(day: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(parseDay(day))
}

/** Weight-style number format for grams (Design §9: "40", "12,5"). */
function formatGrams(value: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(value)
}

function groupByDay<T>(items: T[], at: (item: T) => string) {
  const groups: { day: string; items: T[] }[] = []
  for (const item of items) {
    const day = belgradeDay(at(item))
    const group = groups.find((g) => g.day === day)
    if (group) group.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}

function sortFeeding(items: FeedingEntry[]) {
  return [...items].sort((a, b) => b.fed_at.localeCompare(a.fed_at) || b.created_at.localeCompare(a.created_at))
}

function sortStool(items: StoolEntry[]) {
  return [...items].sort(
    (a, b) => b.observed_at.localeCompare(a.observed_at) || b.created_at.localeCompare(a.created_at),
  )
}

/** "40" / "12,5" / "12.5" → grams; null when empty; NaN when not a positive number with ≤ 1 decimal (EP-18). */
function parseGrams(value: string) {
  const text = value.trim().replace(",", ".")
  if (text === "") return null
  if (!/^\d+(\.\d)?$/.test(text)) return Number.NaN
  const n = Number(text)
  return n > 0 && n < 10_000_000 ? n : Number.NaN
}

/** EP-18: not more than 5 minutes in the future. */
function inFuture(iso: string) {
  return new Date(iso).getTime() > Date.now() + 5 * 60 * 1000
}

function DateField({
  id,
  label,
  value,
  onChange,
  today,
  locale,
  copy,
}: {
  id: string
  label: string
  value: string
  onChange: (day: string) => void
  today: string
  locale: Locale
  copy: CareLogCopy["petForm"]
}) {
  const [open, setOpen] = useState(false)
  const monthNames = copy.calendarMonths.split(",")
  const weekdayNames = copy.calendarWeekdays.split(",")
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className="h-11 w-full justify-start font-normal md:h-9">
            <CalendarDays className="size-4" aria-hidden />
            {formatDay(value, locale)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={parseDay(value)}
            onSelect={(d) => {
              if (d) onChange(dayOf(d))
              setOpen(false)
            }}
            weekStartsOn={1}
            // EP-18: not in the future — later days cannot be picked (owner decision).
            disabled={{ after: parseDay(today) }}
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

function LoadingList({ label }: { label: string }) {
  return (
    <Card className="gap-4 p-4 md:p-6" aria-busy="true" aria-label={label}>
      {[0, 1].map((g) => (
        <div key={g} className="space-y-3">
          <Skeleton className="h-4 w-40" />
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </Card>
  )
}

/** S07 loading state (Suspense fallback while EP-01 / EP-17 / EP-19 are in flight). */
export function CareLogLoading({ copy }: { copy: CareLogCopy }) {
  const t = copy.careLog
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <LoadingList label={t.loading} />
        </div>
        <Card className="gap-4 p-4 md:p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </Card>
      </div>
    </div>
  )
}

function RowMenu({ t, onEdit, onDelete }: { t: CareLogCopy["careLog"]; onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={t.moreOptions}>
          <MoreVertical className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="size-4" aria-hidden />
          {t.edit}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-4" aria-hidden />
          {t.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type FeedForm = { id: string | null; day: string; time: string; type: FoodType | ""; brand: string; grams: string; note: string }
type FeedErrors = { time?: string; type?: string; grams?: string }
type StoolForm = {
  id: string | null
  day: string
  time: string
  consistency: Consistency | ""
  blood: boolean
  note: string
}
type StoolErrors = { time?: string; consistency?: string }

export function CareLogClient({
  pet,
  photoUrl,
  feeding: initialFeeding,
  stool: initialStool,
  schedule: initialSchedule,
  now,
  locale,
  copy,
  actions,
}: {
  pet: CareLogPet
  photoUrl?: string
  feeding: CareLogPage<FeedingEntry>
  stool: CareLogPage<StoolEntry>
  /** EP-19 get: the pet's MealSchedule, or null when there is none. */
  schedule: MealSchedule | null
  /** Render time (ISO) — "Danas" / "Juče" are computed from it in Europe/Belgrade. */
  now: string
  locale: Locale
  copy: CareLogCopy
  actions: CareLogActions
}) {
  const t = copy.careLog
  const [tab, setTab] = useState<"ishrana" | "stolica">("ishrana")

  const [feeding, setFeeding] = useState(initialFeeding)
  const [stool, setStool] = useState(initialStool)
  const [loadingMore, setLoadingMore] = useState<CareKind | null>(null)

  const [feedOpen, setFeedOpen] = useState(false)
  const [feedForm, setFeedForm] = useState<FeedForm>(() => newFeedForm())
  const [feedErrors, setFeedErrors] = useState<FeedErrors>({})
  const [stoolOpen, setStoolOpen] = useState(false)
  const [stoolForm, setStoolForm] = useState<StoolForm>(() => newStoolForm())
  const [stoolErrors, setStoolErrors] = useState<StoolErrors>({})
  const [pending, setPending] = useState(false)
  const [deleting, setDeleting] = useState<{ kind: CareKind; id: string } | null>(null)

  const [schedule, setSchedule] = useState<MealSchedule | null>(initialSchedule)
  const [mealTimes, setMealTimes] = useState<string[]>(initialSchedule?.meal_times ?? [])
  const [newMealTime, setNewMealTime] = useState("")
  const [everyDay, setEveryDay] = useState(initialSchedule ? initialSchedule.every_day : true)
  const [days, setDays] = useState<number[]>(initialSchedule?.meal_weekdays.length ? initialSchedule.meal_weekdays : ALL_DAYS)
  const [mealSaved, setMealSaved] = useState(false)
  const [mealPending, setMealPending] = useState(false)

  const today = belgradeDay(now)
  const yesterday = previousDay(today)
  const canLog = pet.can_log
  // EP-19 set: Owner ✅, Member ❌; a memorial pet has no active reminders (BR-17).
  const canEditSchedule = pet.access.role === "owner" && pet.lifecycle === "active"
  const weekdayLabels = t.weekdays.split(",")
  const weekdayNames = t.weekdaysFull.split(",")
  const speciesLabel = pet.species === "other" && pet.species_other ? pet.species_other : copy.pet.species[pet.species]
  const subtitle = [pet.name, speciesLabel, pet.breed].filter(Boolean).join(" · ")
  const feedingDescription =
    pet.sex === "female" ? t.feedingDescriptionFemale : pet.sex === "male" ? t.feedingDescriptionMale : t.feedingDescriptionUnknown

  function newFeedForm(): FeedForm {
    const at = Date.now()
    return { id: null, day: belgradeDay(at), time: belgradeTime(at), type: "", brand: "", grams: "", note: "" }
  }

  function newStoolForm(): StoolForm {
    const at = Date.now()
    return { id: null, day: belgradeDay(at), time: belgradeTime(at), consistency: "", blood: false, note: "" }
  }

  function dayLabel(day: string) {
    const date = formatDay(day, locale)
    if (day === today) return format(t.today, { date })
    if (day === yesterday) return format(t.yesterday, { date })
    return date
  }

  function failed() {
    toast.error(copy.common.error)
  }

  function openNewFeeding() {
    setFeedForm(newFeedForm())
    setFeedErrors({})
    setFeedOpen(true)
  }

  function openEditFeeding(e: FeedingEntry) {
    setFeedForm({
      id: e.id,
      day: belgradeDay(e.fed_at),
      time: belgradeTime(e.fed_at),
      type: e.type,
      brand: e.brand ?? "",
      grams: e.amount_g === null ? "" : formatGrams(e.amount_g, locale),
      note: e.note ?? "",
    })
    setFeedErrors({})
    setFeedOpen(true)
  }

  function openNewStool() {
    setStoolForm(newStoolForm())
    setStoolErrors({})
    setStoolOpen(true)
  }

  function openEditStool(e: StoolEntry) {
    setStoolForm({
      id: e.id,
      day: belgradeDay(e.observed_at),
      time: belgradeTime(e.observed_at),
      consistency: e.consistency,
      blood: e.blood_or_mucus,
      note: e.note ?? "",
    })
    setStoolErrors({})
    setStoolOpen(true)
  }

  async function saveFeeding() {
    const errors: FeedErrors = {}
    if (!feedForm.time) errors.time = t.errFeedTime
    if (!feedForm.type) errors.type = t.errFoodType
    const grams = parseGrams(feedForm.grams)
    if (Number.isNaN(grams)) errors.grams = t.errAmount
    const fedAt = feedForm.time ? belgradeToIso(feedForm.day, feedForm.time) : ""
    if (fedAt && inFuture(fedAt)) errors.time = t.errFuture
    setFeedErrors(errors)
    if (Object.keys(errors).length > 0 || !feedForm.type) return

    const values = {
      fed_at: fedAt,
      type: feedForm.type,
      brand: feedForm.brand.trim() || null,
      amount_g: grams,
      note: feedForm.note.trim() || null,
    }
    setPending(true)
    const result = feedForm.id
      ? await actions.updateFeeding(feedForm.id, values)
      : await actions.createFeeding({ pet_id: pet.id, ...values })
    setPending(false)
    if (!result.ok) {
      const fields = result.error.code === "validation_failed" ? result.error.fields ?? {} : null
      const mapped: FeedErrors = {}
      let unmapped = fields === null
      for (const [field, code] of Object.entries(fields ?? {})) {
        if (field === "fed_at") mapped.time = code === "out_of_range" ? t.errFuture : t.errFeedTime
        else if (field === "type") mapped.type = t.errFoodType
        else if (field === "amount_g") mapped.grams = t.errAmount
        else unmapped = true
      }
      setFeedErrors(mapped)
      if (unmapped) failed()
      return
    }
    const saved = result.data
    setFeeding((prev) =>
      feedForm.id
        ? { ...prev, items: sortFeeding(prev.items.map((e) => (e.id === saved.id ? saved : e))) }
        : { items: sortFeeding([saved, ...prev.items]), total: prev.total + 1 },
    )
    setFeedOpen(false)
    toast(t.entrySaved)
  }

  async function saveStool() {
    const errors: StoolErrors = {}
    if (!stoolForm.time) errors.time = t.errStoolTime
    if (!stoolForm.consistency) errors.consistency = t.errConsistency
    const observedAt = stoolForm.time ? belgradeToIso(stoolForm.day, stoolForm.time) : ""
    if (observedAt && inFuture(observedAt)) errors.time = t.errFuture
    setStoolErrors(errors)
    if (Object.keys(errors).length > 0 || !stoolForm.consistency) return

    const values = {
      observed_at: observedAt,
      consistency: stoolForm.consistency,
      blood_or_mucus: stoolForm.blood,
      note: stoolForm.note.trim() || null,
    }
    setPending(true)
    const result = stoolForm.id
      ? await actions.updateStool(stoolForm.id, values)
      : await actions.createStool({ pet_id: pet.id, ...values })
    setPending(false)
    if (!result.ok) {
      const fields = result.error.code === "validation_failed" ? result.error.fields ?? {} : null
      const mapped: StoolErrors = {}
      let unmapped = fields === null
      for (const [field, code] of Object.entries(fields ?? {})) {
        if (field === "observed_at") mapped.time = code === "out_of_range" ? t.errFuture : t.errStoolTime
        else if (field === "consistency") mapped.consistency = t.errConsistency
        else unmapped = true
      }
      setStoolErrors(mapped)
      if (unmapped) failed()
      return
    }
    const saved = result.data
    setStool((prev) =>
      stoolForm.id
        ? { ...prev, items: sortStool(prev.items.map((e) => (e.id === saved.id ? saved : e))) }
        : { items: sortStool([saved, ...prev.items]), total: prev.total + 1 },
    )
    setStoolOpen(false)
    toast(t.entrySaved)
  }

  async function confirmDelete() {
    if (!deleting) return
    const { kind, id } = deleting
    setPending(true)
    const result = await actions.deleteEntry(kind, id)
    setPending(false)
    setDeleting(null)
    if (!result.ok) return failed()
    if (kind === "feeding") setFeeding((prev) => ({ items: prev.items.filter((e) => e.id !== id), total: prev.total - 1 }))
    else setStool((prev) => ({ items: prev.items.filter((e) => e.id !== id), total: prev.total - 1 }))
    toast(t.entryDeleted)
  }

  async function loadMore(kind: CareKind) {
    setLoadingMore(kind)
    const offset = kind === "feeding" ? feeding.items.length : stool.items.length
    const result = await actions.listEntries({ pet_id: pet.id, kind, offset })
    setLoadingMore(null)
    if (!result.ok) return failed()
    if (kind === "feeding") {
      const page = result.data as CareLogPage<FeedingEntry>
      setFeeding((prev) => ({
        items: [...prev.items, ...page.items.filter((n) => !prev.items.some((e) => e.id === n.id))],
        total: page.total,
      }))
    } else {
      const page = result.data as CareLogPage<StoolEntry>
      setStool((prev) => ({
        items: [...prev.items, ...page.items.filter((n) => !prev.items.some((e) => e.id === n.id))],
        total: page.total,
      }))
    }
  }

  function toggleDay(day: number) {
    setMealSaved(false)
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()))
  }

  function addMealTime() {
    if (!newMealTime || mealTimes.includes(newMealTime) || mealTimes.length >= MAX_MEAL_TIMES) return
    setMealSaved(false)
    setMealTimes((prev) => [...prev, newMealTime].sort())
  }

  async function saveMeals() {
    const weekdays = mealTimes.length === 0 ? [] : everyDay ? ALL_DAYS : [...days].sort()
    setMealPending(true)
    const result = await actions.setMealSchedule({ pet_id: pet.id, meal_times: mealTimes, meal_weekdays: weekdays })
    setMealPending(false)
    if (!result.ok) return failed()
    setSchedule(result.data.reminder_id ? result.data : null)
    setMealTimes(result.data.meal_times)
    setMealSaved(true)
  }

  // Save needs times and days; with zero times it removes an existing schedule (owner decision, Step 20).
  const canSaveMeals =
    !mealPending &&
    ((mealTimes.length > 0 && (everyDay || days.length > 0)) || (mealTimes.length === 0 && schedule !== null))

  return (
    <div data-pet-sex={pet.sex} className="space-y-6">
      {/* Page header */}
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/ljubimci/${pet.id}`}>
            <ArrowLeft className="size-4" aria-hidden />
            {format(t.backToRecord, { name: pet.name })}
          </Link>
        </Button>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <PetAvatar
              name={pet.name}
              sex={pet.sex}
              species={AVATAR_SPECIES[pet.species]}
              photoUrl={photoUrl}
              size="md"
              ring
            />
            <div className="min-w-0">
              <h1 className="truncate font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {canLog && (
            <Button className="h-11 md:h-9" onClick={() => (tab === "ishrana" ? openNewFeeding() : openNewStool())}>
              <Plus className="size-5" aria-hidden />
              {tab === "ishrana" ? t.addMeal : t.addStool}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main column */}
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "ishrana" | "stolica")}>
            <TabsList variant="line" className="border-b border-border">
              <TabsTrigger value="ishrana" className="after:bg-pet-accent">
                <Utensils className="size-4" aria-hidden />
                {t.tabFeeding}
              </TabsTrigger>
              <TabsTrigger value="stolica" className="after:bg-pet-accent">
                <Droplet className="size-4" aria-hidden />
                {t.tabStool}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ishrana" className="mt-4 space-y-4">
              {feeding.total === 0 && feeding.items.length === 0 ? (
                <EmptyState
                  icon={Utensils}
                  title={t.feedingEmptyTitle}
                  description={format(t.feedingEmptyDescription, { name: pet.name })}
                  action={canLog ? t.addMeal : undefined}
                  onAction={openNewFeeding}
                />
              ) : (
                <Card className="gap-6 p-4 md:p-6">
                  {groupByDay(feeding.items, (e) => e.fed_at).map((group) => (
                    <section key={group.day} className="space-y-3" aria-label={dayLabel(group.day)}>
                      <h2 className="text-xs font-medium text-muted-foreground">{dayLabel(group.day)}</h2>
                      <ul className="space-y-2">
                        {group.items.map((e) => (
                          <li key={e.id} className="flex items-start gap-3 rounded-sm bg-foreground/5 p-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pet-accent-soft text-pet-accent">
                              <Utensils className="size-4" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <p className="min-w-0 truncate text-sm font-medium">{e.brand || t.foodType[e.type]}</p>
                                <Badge variant="outline">{t.foodType[e.type]}</Badge>
                              </div>
                              <p className="text-xs font-medium text-muted-foreground">
                                {[
                                  belgradeTime(e.fed_at),
                                  e.amount_g !== null ? format(t.grams, { n: formatGrams(e.amount_g, locale) }) : null,
                                  e.created_by_name ? format(t.loggedBy, { name: e.created_by_name }) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {e.note && <p className="mt-1 text-sm text-muted-foreground">{e.note}</p>}
                            </div>
                            {e.access.can_edit && (
                              <RowMenu
                                t={t}
                                onEdit={() => openEditFeeding(e)}
                                onDelete={() => setDeleting({ kind: "feeding", id: e.id })}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </Card>
              )}
              {feeding.items.length < feeding.total && (
                <Button
                  variant="outline"
                  className="h-11 w-full md:h-9"
                  disabled={loadingMore === "feeding"}
                  onClick={() => loadMore("feeding")}
                >
                  {t.loadMore}
                </Button>
              )}
            </TabsContent>

            <TabsContent value="stolica" className="mt-4 space-y-4">
              {stool.total === 0 && stool.items.length === 0 ? (
                <EmptyState
                  icon={Droplet}
                  title={t.stoolEmptyTitle}
                  description={t.stoolEmptyDescription}
                  action={canLog ? t.addStool : undefined}
                  onAction={openNewStool}
                />
              ) : (
                <Card className="gap-6 p-4 md:p-6">
                  {groupByDay(stool.items, (e) => e.observed_at).map((group) => (
                    <section key={group.day} className="space-y-3" aria-label={dayLabel(group.day)}>
                      <h2 className="text-xs font-medium text-muted-foreground">{dayLabel(group.day)}</h2>
                      <ul className="space-y-2">
                        {group.items.map((e) => (
                          <li key={e.id} className="flex items-start gap-3 rounded-sm bg-foreground/5 p-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pet-accent-soft text-pet-accent">
                              <Droplet className="size-4" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <p className="min-w-0 truncate text-sm font-medium">{t.consistency[e.consistency]}</p>
                                {e.blood_or_mucus && (
                                  <span className="text-xs font-medium text-destructive">{t.bloodYes}</span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-muted-foreground">
                                {[
                                  belgradeTime(e.observed_at),
                                  e.created_by_name ? format(t.loggedBy, { name: e.created_by_name }) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {e.note && <p className="mt-1 text-sm text-muted-foreground">{e.note}</p>}
                            </div>
                            {e.access.can_edit && (
                              <RowMenu
                                t={t}
                                onEdit={() => openEditStool(e)}
                                onDelete={() => setDeleting({ kind: "stool", id: e.id })}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </Card>
              )}
              {stool.items.length < stool.total && (
                <Button
                  variant="outline"
                  className="h-11 w-full md:h-9"
                  disabled={loadingMore === "stool"}
                  onClick={() => loadMore("stool")}
                >
                  {t.loadMore}
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Aside — meal reminders (FR-15, EP-19) */}
        <aside className="min-w-0" aria-label={t.mealTitle}>
          <Card className="gap-4 p-4 md:p-6">
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-bold">{t.mealTitle}</h2>
              <p className="text-sm text-muted-foreground">{t.mealDescription}</p>
            </div>

            <ul className="space-y-2" aria-label={t.mealTimes}>
              {(canEditSchedule ? mealTimes : (schedule?.meal_times ?? [])).map((time) => (
                <li key={time} className="flex min-h-9 items-center gap-2 rounded-sm bg-foreground/5 py-1 pr-1 pl-3">
                  <Clock className="size-4 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm font-medium">{time}</span>
                  {canEditSchedule && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={format(t.removeMealTime, { time })}
                      onClick={() => {
                        setMealSaved(false)
                        setMealTimes((prev) => prev.filter((x) => x !== time))
                      }}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
              {(canEditSchedule ? mealTimes : (schedule?.meal_times ?? [])).length === 0 && (
                <li className="text-sm text-muted-foreground">{t.noMealTimes}</li>
              )}
            </ul>

            {canEditSchedule ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="meal-new-time">{t.addMealTime}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="meal-new-time"
                      type="time"
                      value={newMealTime}
                      onChange={(e) => setNewMealTime(e.target.value)}
                      className="min-w-0 flex-1"
                    />
                    <Button variant="outline" onClick={addMealTime}>
                      <Plus className="size-4" aria-hidden />
                      {t.add}
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="meal-every-day" className="min-w-0">
                    {t.everyDay}
                  </Label>
                  <Switch
                    id="meal-every-day"
                    checked={everyDay}
                    onCheckedChange={(v) => {
                      setMealSaved(false)
                      setEveryDay(v)
                      if (v) setDays(ALL_DAYS)
                    }}
                  />
                </div>

                {!everyDay && (
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-medium text-muted-foreground">{t.chosenDays}</legend>
                    <div className="flex flex-wrap gap-2">
                      {ALL_DAYS.map((day) => {
                        const on = days.includes(day)
                        return (
                          <Button
                            key={day}
                            type="button"
                            size="sm"
                            variant={on ? "default" : "outline"}
                            aria-pressed={on}
                            aria-label={weekdayNames[day - 1]}
                            onClick={() => toggleDay(day)}
                          >
                            {weekdayLabels[day - 1]}
                          </Button>
                        )
                      })}
                    </div>
                    {days.length === 0 && <p className="text-sm text-destructive">{t.errDays}</p>}
                  </fieldset>
                )}

                <Button className="h-11 md:h-9" disabled={!canSaveMeals} onClick={saveMeals}>
                  {t.saveMeals}
                </Button>
                {mealSaved && (
                  <p role="status" className="text-sm text-success">
                    {t.mealsSaved}
                  </p>
                )}
              </>
            ) : (
              schedule &&
              schedule.meal_times.length > 0 && (
                <>
                  <Separator />
                  {schedule.every_day ? (
                    <p className="text-sm font-medium">{t.everyDay}</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{t.chosenDays}</p>
                      <ul className="flex flex-wrap gap-2" aria-label={t.chosenDays}>
                        {schedule.meal_weekdays.map((day) => (
                          <li key={day}>
                            <Badge variant="outline" aria-label={weekdayNames[day - 1]}>
                              {weekdayLabels[day - 1]}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )
            )}
          </Card>
        </aside>
      </div>

      {/* New / edit feeding entry (FR-14, EP-18) */}
      <Dialog open={feedOpen} onOpenChange={setFeedOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{feedForm.id ? t.feedingEditTitle : t.feedingNewTitle}</DialogTitle>
            <DialogDescription>{format(feedingDescription, { name: pet.name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DateField
                id="feed-date"
                label={t.date}
                value={feedForm.day}
                onChange={(day) => setFeedForm((f) => ({ ...f, day }))}
                today={belgradeDay(Date.now())}
                locale={locale}
                copy={copy.petForm}
              />
              <div className="min-w-0 space-y-2">
                <Label htmlFor="feed-time">{t.time}</Label>
                <Input
                  id="feed-time"
                  type="time"
                  value={feedForm.time}
                  onChange={(e) => setFeedForm((f) => ({ ...f, time: e.target.value }))}
                  aria-invalid={!!feedErrors.time}
                  aria-describedby={feedErrors.time ? "feed-time-error" : undefined}
                />
                {feedErrors.time && (
                  <p id="feed-time-error" className="text-sm text-destructive">
                    {feedErrors.time}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feed-type">{t.foodTypeLabel}</Label>
              <Select
                value={feedForm.type}
                onValueChange={(v) => {
                  setFeedForm((f) => ({ ...f, type: v as FoodType }))
                  setFeedErrors((e) => ({ ...e, type: undefined }))
                }}
              >
                <SelectTrigger
                  id="feed-type"
                  className="w-full"
                  aria-invalid={!!feedErrors.type}
                  aria-describedby={feedErrors.type ? "feed-type-error" : undefined}
                >
                  <SelectValue placeholder={t.foodTypePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {FOOD_TYPES.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t.foodType[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {feedErrors.type && (
                <p id="feed-type-error" className="text-sm text-destructive">
                  {feedErrors.type}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="feed-name">{t.brand}</Label>
                <Input
                  id="feed-name"
                  placeholder={t.brandPlaceholder}
                  maxLength={100}
                  value={feedForm.brand}
                  onChange={(e) => setFeedForm((f) => ({ ...f, brand: e.target.value }))}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="feed-grams">{t.amount}</Label>
                <Input
                  id="feed-grams"
                  inputMode="decimal"
                  placeholder={t.amountPlaceholder}
                  value={feedForm.grams}
                  onChange={(e) => setFeedForm((f) => ({ ...f, grams: e.target.value }))}
                  onBlur={() =>
                    setFeedErrors((er) => ({
                      ...er,
                      grams: Number.isNaN(parseGrams(feedForm.grams)) ? t.errAmount : undefined,
                    }))
                  }
                  aria-invalid={!!feedErrors.grams}
                  aria-describedby={feedErrors.grams ? "feed-grams-error" : undefined}
                />
                {feedErrors.grams && (
                  <p id="feed-grams-error" className="text-sm text-destructive">
                    {feedErrors.grams}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feed-note">{t.note}</Label>
              <Textarea
                id="feed-note"
                placeholder={t.feedingNotePlaceholder}
                maxLength={500}
                value={feedForm.note}
                onChange={(e) => setFeedForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setFeedOpen(false)}>
              {t.cancel}
            </Button>
            <Button className="h-11 md:h-9" disabled={pending} onClick={saveFeeding}>
              {t.saveMeal}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New / edit stool entry (FR-16, EP-18) */}
      <Dialog open={stoolOpen} onOpenChange={setStoolOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{stoolForm.id ? t.stoolEditTitle : t.stoolNewTitle}</DialogTitle>
            <DialogDescription>{t.stoolDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DateField
                id="stool-date"
                label={t.date}
                value={stoolForm.day}
                onChange={(day) => setStoolForm((f) => ({ ...f, day }))}
                today={belgradeDay(Date.now())}
                locale={locale}
                copy={copy.petForm}
              />
              <div className="min-w-0 space-y-2">
                <Label htmlFor="stool-time">{t.time}</Label>
                <Input
                  id="stool-time"
                  type="time"
                  value={stoolForm.time}
                  onChange={(e) => setStoolForm((f) => ({ ...f, time: e.target.value }))}
                  aria-invalid={!!stoolErrors.time}
                  aria-describedby={stoolErrors.time ? "stool-time-error" : undefined}
                />
                {stoolErrors.time && (
                  <p id="stool-time-error" className="text-sm text-destructive">
                    {stoolErrors.time}
                  </p>
                )}
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t.consistencyLabel}</legend>
              <RadioGroup
                value={stoolForm.consistency}
                onValueChange={(v) => {
                  setStoolForm((f) => ({ ...f, consistency: v as Consistency }))
                  setStoolErrors((e) => ({ ...e, consistency: undefined }))
                }}
                className="grid grid-cols-2 gap-2"
                aria-describedby={stoolErrors.consistency ? "stool-consistency-error" : undefined}
              >
                {CONSISTENCIES.map((k) => (
                  <Label
                    key={k}
                    htmlFor={`stool-${k}`}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-border px-3",
                      stoolForm.consistency === k && "border-primary",
                    )}
                  >
                    <RadioGroupItem id={`stool-${k}`} value={k} />
                    {t.consistency[k]}
                  </Label>
                ))}
              </RadioGroup>
              {stoolErrors.consistency && (
                <p id="stool-consistency-error" className="text-sm text-destructive">
                  {stoolErrors.consistency}
                </p>
              )}
            </fieldset>
            <div className="flex items-center justify-between gap-3 rounded-sm bg-foreground/5 p-3">
              <Label htmlFor="stool-blood" className="min-w-0">
                {t.bloodOrMucus}
              </Label>
              <Switch
                id="stool-blood"
                checked={stoolForm.blood}
                onCheckedChange={(blood) => setStoolForm((f) => ({ ...f, blood }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stool-note">{t.note}</Label>
              <Textarea
                id="stool-note"
                placeholder={t.stoolNotePlaceholder}
                maxLength={500}
                value={stoolForm.note}
                onChange={(e) => setStoolForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setStoolOpen(false)}>
              {t.cancel}
            </Button>
            <Button className="h-11 md:h-9" disabled={pending} onClick={saveStool}>
              {t.saveStool}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete entry (owner decision, Step 20) */}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelDelete}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {t.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
