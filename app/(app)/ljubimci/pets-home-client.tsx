"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, ArrowRight, PawPrint, Plus, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar"
import { PremiumLock } from "@/components/app/premium-lock"
import { ReminderRow, type ReminderRowData, type ReminderRowLabels } from "@/components/app/reminder-row"
import { ReminderTypeIcon } from "@/components/app/reminder-type-icon"
import { StatusBadge } from "@/components/app/status-badge"
import { getFileUrls } from "@/lib/actions/files"
import type { PetSummary, ReminderOccurrence } from "@/lib/actions/pets"
import { markOccurrenceDone } from "@/lib/actions/reminders"
import { reminderRowLabels, toReminderRow } from "@/app/(app)/podsetnici/reminders-client"
import { format, getDictionary, type Dictionary, type Locale } from "@/lib/i18n"

// S01 — Moji ljubimci · /ljubimci · FR-01, FR-24, FR-36, FR-59 · EP-01 (view:pet_summaries_api, active
// rows), EP-15 (pet photos), EP-43 (Entitlements), EP-25 (the "Danas" strip: filter=today, first 3,
// loaded through lib/actions/reminders.ts) and EP-26 ("Urađeno"); the header links to S06 Uspomene. States: loading (PetsHomeLoading, while EP-01
// is in flight) / default / empty (no active pet) / premium_locked (Free and own active count ≥
// the limit when pressing "Dodaj ljubimca").

// `reminders` (the Danas rows) is optional so callers without reminder rows keep their copy; it falls back to the
// locale's dictionary.
export type PetsHomeCopy = Pick<Dictionary, "petsHome" | "pet" | "common"> & Partial<Pick<Dictionary, "reminders">>

const AVATAR_SPECIES: Partial<Record<PetSummary["species"], PetSpecies>> = {
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

// Case- and diacritic-insensitive match (č ć š ž → c c s z; đ → d does not decompose, so map it).
function normalize(value: string) {
  return value
    .toLocaleLowerCase("sr-Latn")
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(t: Record<string, unknown>, base: string, n: number, locale: Locale) {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  const key = `${base}_${rule === "one" || rule === "few" ? rule : "other"}`
  return format(String(t[key]), { n })
}

/** Calendar date (YYYY-MM-DD) in Europe/Belgrade. */
function belgradeDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(date)
}

/** "Starost" (owner decision, Step 13): years; under a year, months; birth year only → "oko …"; no date → null. */
function ageLabel(pet: PetSummary, today: string, t: PetsHomeCopy["pet"], locale: Locale): string | null {
  const [year, month, day] = today.split("-").map(Number)
  if (pet.birth_date) {
    const [by, bm, bd] = pet.birth_date.split("-").map(Number)
    const months = Math.max(0, (year - by) * 12 + (month - bm) - (day < bd ? 1 : 0))
    return months >= 12 ? plural(t, "years", Math.floor(months / 12), locale) : plural(t, "months", months, locale)
  }
  if (pet.birth_year) {
    const years = year - pet.birth_year
    const age = years >= 1 ? plural(t, "years", years, locale) : plural(t, "months", month - 1, locale)
    return format(t.about, { age })
  }
  return null
}

function reminderTitle(reminder: ReminderOccurrence, pet: PetSummary, t: PetsHomeCopy["pet"]) {
  if (reminder.title) return reminder.title
  if (reminder.type === "birthday") return format(t.birthdayTitle, { pet: pet.name })
  return pet.name
}

// Date-based reminders show the date; timed ones (doses, meals, manual) the date and time.
function reminderWhen(reminder: ReminderOccurrence, copy: PetsHomeCopy, locale: Locale) {
  const due = new Date(reminder.due_at)
  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Belgrade",
  }).format(due)
  if (reminder.display_status === "today") return format(copy.petsHome.todayAt, { time })
  const date = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(due)
  return reminder.type === "vaccination" || reminder.type === "birthday" || reminder.type === "vet_follow_up"
    ? date
    : `${date} · ${time}`
}

function TodayCard({
  reminder,
  onDone,
  canMarkDone,
  labels,
}: {
  reminder: ReminderRowData
  onDone: (id: string) => void
  canMarkDone: boolean
  labels: ReminderRowLabels
}) {
  return (
    <Card className="min-w-0 gap-3 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <ReminderTypeIcon type={reminder.type} sex={reminder.pet?.sex} forMe={!reminder.pet} size="md" />
        <div className="min-w-0 flex-1">
          {reminder.href ? (
            <Link
              href={reminder.href}
              className="block truncate rounded-sm text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {reminder.title}
            </Link>
          ) : (
            <p className="truncate text-sm font-medium">{reminder.title}</p>
          )}
          <p className="truncate text-xs font-medium text-muted-foreground">
            {reminder.pet ? reminder.pet.name : labels.forMe} · {reminder.when}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <StatusBadge status={reminder.status} label={labels.status?.[reminder.status]} />
        {reminder.status !== "done" && canMarkDone && (
          <Button size="sm" variant="outline" onClick={() => onDone(reminder.id)}>
            {labels.done}
          </Button>
        )}
      </div>
    </Card>
  )
}

function PetCard({
  pet,
  photoUrl,
  today,
  copy,
  locale,
}: {
  pet: PetSummary
  photoUrl?: string
  today: string
  copy: PetsHomeCopy
  locale: Locale
}) {
  const t = copy.petsHome
  const age = ageLabel(pet, today, copy.pet, locale)
  const next = pet.next_reminder
  const subtitle = pet.breed ?? (pet.species === "other" && pet.species_other ? pet.species_other : copy.pet.species[pet.species])
  return (
    <Card data-pet-sex={pet.sex} className="h-full min-w-0 gap-0 overflow-hidden py-0">
      <div className="relative flex min-w-0 items-center gap-4 bg-pet-accent-soft p-4 md:p-6">
        <PetAvatar
          name={pet.name}
          sex={pet.sex}
          species={AVATAR_SPECIES[pet.species]}
          photoUrl={photoUrl}
          size="lg"
          onSoft
        />
        <div className="min-w-0 flex-1 pr-12">
          <h3 className="truncate font-heading text-[22px] leading-7 font-bold text-pet-accent">{pet.name}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {pet.sex !== "unknown" && (
          <span className="absolute top-4 right-4 rounded-full bg-card px-3 py-1 text-xs font-medium text-pet-accent">
            {pet.sex === "female" ? copy.pet.female : copy.pet.male}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {age && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{t.age}</dt>
              <dd className="font-medium">{age}</dd>
            </div>
          </dl>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t.nextReminder}</p>
          {next ? (
            <div className="flex min-w-0 items-center gap-3 rounded-sm bg-foreground/5 p-3">
              <ReminderTypeIcon type={next.type} sex={pet.sex} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{reminderTitle(next, pet, copy.pet)}</p>
                <p className="truncate text-xs font-medium text-muted-foreground">{reminderWhen(next, copy, locale)}</p>
              </div>
              {next.display_status === "today" && (
                <StatusBadge status="today" label={t.today} className="shrink-0" />
              )}
            </div>
          ) : (
            <p className="rounded-sm bg-foreground/5 p-3 text-sm text-muted-foreground">{t.noReminder}</p>
          )}
        </div>

        <div className="mt-auto flex items-center justify-end gap-2 border-t border-border pt-4">
          <Link
            href={`/ljubimci/${pet.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {t.openRecord}
            <span className="sr-only">: {pet.name}</span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </Card>
  )
}

function LoadingView({ label }: { label: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={label}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="gap-3 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-sm" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-8 w-full" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1].map((i) => (
          <Card key={i} className="gap-0 overflow-hidden py-0">
            <div className="flex items-center gap-4 bg-foreground/5 p-4 md:p-6">
              <Skeleton className="size-20 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            <div className="space-y-3 p-4 md:p-6">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Header({
  copy,
  empty = false,
  search,
  add,
}: {
  copy: PetsHomeCopy
  empty?: boolean
  search?: { query: string; onChange: (q: string) => void }
  add?: string
}) {
  const t = copy.petsHome
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{empty ? t.subtitleEmpty : t.subtitle}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {search && (
          <div className="relative min-w-0 sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search.query}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchLabel}
              className="h-11 pl-8 md:h-9"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11 md:h-9">
            <Link href="/uspomene">
              <Archive className="size-5" aria-hidden />
              {t.memorials}
            </Link>
          </Button>
          {add && (
            <Button asChild className="h-11 md:h-9">
              <Link href={add}>
                <Plus className="size-5" aria-hidden />
                {t.add}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** S01 loading state: shown by app/(app)/ljubimci/page.tsx while EP-01 is in flight. */
export function PetsHomeLoading({ copy }: { copy: PetsHomeCopy }) {
  return (
    <div className="space-y-6">
      <Header copy={copy} />
      <LoadingView label={copy.petsHome.loading} />
    </div>
  )
}

export function PetsHomeClient({
  pets,
  today: todayList,
  activePetLimit,
  now,
  locale,
  copy,
}: {
  /** EP-01 active rows (lifecycle = active), or null when the read failed. */
  pets: PetSummary[] | null
  /** EP-25 filter=today (items and total), or null when the read failed (the strip shows its empty form). */
  today?: { items: ReminderOccurrence[]; total: number } | null
  /** Entitlements.limits.active_pets (EP-43): 1 on Free, null = unlimited. */
  activePetLimit: number | null
  /** Server time (ISO) the page was rendered at — "Danas" and ages. */
  now: string
  locale: Locale
  copy: PetsHomeCopy
}) {
  const t = copy.petsHome
  const [query, setQuery] = useState("")
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const router = useRouter()
  const [todayItems, setTodayItems] = useState<ReminderOccurrence[]>(todayList?.items ?? [])
  const [statusMessage, setStatusMessage] = useState("")
  const rowCopy = { pet: copy.pet, reminders: copy.reminders ?? getDictionary(locale).reminders }
  const rowLabels = reminderRowLabels(rowCopy.reminders)

  // EP-26: the card switches to the done badge; the status line names the reminder (FR-24).
  async function markDone(id: string) {
    const result = await markOccurrenceDone(id).catch(() => null)
    if (!result?.ok) {
      // 403 household_read_only → read_only: the control disappears on the next render (EP-26 States).
      setStatusMessage(result?.error.code === "household_read_only" ? "" : copy.common.error)
      router.refresh()
      return
    }
    setTodayItems((list) => list.map((r) => (r.id === id ? result.data : r)))
    setStatusMessage(format(t.markedDone, { title: toReminderRow(result.data, rowCopy, locale).title }))
    router.refresh()
  }

  // EP-15: pet photos render when their URLs arrive; until then the avatar shows the species icon.
  useEffect(() => {
    const withPhoto = (pets ?? []).filter((p) => p.has_photo).slice(0, 50)
    if (withPhoto.length === 0) return
    let cancelled = false
    getFileUrls({ items: withPhoto.map((p) => ({ kind: "pet_photo" as const, id: p.id })) })
      .then((result) => {
        if (cancelled || !result.ok) return
        setPhotoUrls(Object.fromEntries(result.data.flatMap((f) => (f.url ? [[f.id, f.url]] : []))))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pets])

  if (pets === null) {
    return (
      <div className="space-y-6">
        <Header copy={copy} />
        <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  const today = belgradeDate(new Date(now))
  const ownActive = pets.filter((p) => p.access.role === "owner").length
  const isFree = activePetLimit !== null
  const locked = isFree && ownActive >= activePetLimit
  const filteredPets = query.trim() ? pets.filter((p) => normalize(p.name).includes(normalize(query))) : pets
  const addHref = locked ? "#premium-lock" : "/ljubimci/novi"
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Belgrade",
  }).format(new Date(now))
  const weekdayLabel = weekday.charAt(0).toLocaleUpperCase(intlLocale(locale)) + weekday.slice(1)
  const visibleToday = todayItems.slice(0, 3)
  const todayTotal = todayList?.total ?? 0

  if (pets.length === 0) {
    return (
      <div className="space-y-6">
        <Header copy={copy} empty add={addHref} />
        <EmptyState icon={PawPrint} title={t.emptyTitle} description={t.emptyDescription} action={t.add} href="/ljubimci/novi" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header copy={copy} search={{ query, onChange: setQuery }} add={addHref} />

      <section aria-labelledby="danas-naslov" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            <h2 id="danas-naslov" className="font-heading text-[22px] leading-7 font-bold">
              {t.today}
            </h2>
            <span className="text-sm text-muted-foreground">· {weekdayLabel}</span>
          </div>
          {/* Owner decisions: no count when nothing is due today (Step 13); "Pogledaj sve" → S10 from Step 17. */}
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            {todayTotal > 0 && <span>{plural(copy.petsHome, "todayCount", todayTotal, locale)}</span>}
            <Link
              href="/podsetnici"
              className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t.viewAll}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </p>
        </div>

        {visibleToday.length > 0 ? (
          <>
            {/* Computers: up to 3 cards in a row */}
            <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-3">
              {visibleToday.map((r) => (
                <TodayCard
                  key={r.id}
                  reminder={toReminderRow(r, rowCopy, locale)}
                  onDone={markDone}
                  canMarkDone={r.can_mark_done}
                  labels={rowLabels}
                />
              ))}
            </div>

            {/* Phones: stacked list */}
            <Card className="gap-2 p-4 md:hidden">
              {visibleToday.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={toReminderRow(r, rowCopy, locale)}
                  onDone={markDone}
                  canMarkDone={r.can_mark_done}
                  labels={rowLabels}
                />
              ))}
            </Card>
          </>
        ) : (
          <Card className="gap-2 p-4">
            <p className="text-sm text-muted-foreground">{t.todayEmpty}</p>
          </Card>
        )}

        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {statusMessage}
        </p>
      </section>

      <section aria-labelledby="aktivni-naslov" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="aktivni-naslov" className="font-heading text-[22px] leading-7 font-bold">
            {t.allPets} <span className="text-sm font-medium text-muted-foreground">({pets.length})</span>
          </h2>
          {isFree ? (
            <Badge variant="secondary">{format(t.freeCounter, { count: ownActive, limit: activePetLimit })}</Badge>
          ) : (
            <StatusBadge status="premium" label={copy.common.premium} />
          )}
        </div>

        {filteredPets.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPets.map((p) => (
              <PetCard key={p.id} pet={p} photoUrl={photoUrls[p.id]} today={today} copy={copy} locale={locale} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title={format(t.noMatchTitle, { query: query.trim() })}
            description={t.noMatchDescription}
            action={t.clearSearch}
            onAction={() => setQuery("")}
          />
        )}
      </section>

      {locked && (
        <section id="premium-lock" aria-label={t.lockLabel}>
          <PremiumLock title={copy.common.premiumTitle} description={t.lockDescription} cta={copy.common.premiumCta}>
            <Card className="gap-4 p-6">
              <div className="flex items-center gap-4">
                <PetAvatar name="Maks" sex="male" species="dog" size="lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-heading text-lg font-bold">{t.lockPreviewTitle}</p>
                  <p className="text-sm text-muted-foreground">{t.lockPreviewFields}</p>
                </div>
              </div>
              <div className="h-11 rounded-sm bg-foreground/5" />
              <div className="h-11 rounded-sm bg-foreground/5" />
              <div className="h-11 rounded-sm bg-foreground/5" />
              <div className="h-11 rounded-sm bg-foreground/5" />
            </Card>
          </PremiumLock>
        </section>
      )}
    </div>
  )
}
