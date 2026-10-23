"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CalendarDays, Trash2 } from "lucide-react"
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
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/sonner"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar"
import type { PetSummary } from "@/lib/actions/pets"
import {
  createManualReminder,
  deleteManualReminder,
  updateManualReminder,
  type ManualRecurrence,
  type ManualReminderInput,
  type Reminder,
} from "@/lib/actions/reminders"
import { format, interpolate, type Dictionary, type Locale } from "@/lib/i18n"

// S11 — Novi / izmeni podsetnik · /podsetnici/novi (EP-27 create) and /podsetnici/[id] (EP-27 get
// prefill, update, "Obriši podsetnik" → AlertDialog → delete) · FR-21, BR-18 (linked to a pet or
// only to the user; edit / delete change future occurrences, history is kept). The pet picker lists
// the caller's own active pets (EP-01) plus "Samo za mene". The Belgrade date + HH:MM input is sent
// as UTC (EP-27). States: D → toast + back to S10; 422 → inline field errors; X (ErrorState) on any
// other failure.

export type ReminderFormCopy = Pick<Dictionary, "reminderForm" | "petForm" | "common">

export type ReminderFormPet = Pick<PetSummary, "id" | "name" | "sex" | "species">

type Errors = { title?: string; forWhom?: string; date?: string; time?: string }

const REPEATS: { value: ManualRecurrence; label: keyof Dictionary["reminderForm"] }[] = [
  { value: "none", label: "repeatNone" },
  { value: "daily", label: "repeatDaily" },
  { value: "weekly", label: "repeatWeekly" },
  { value: "monthly", label: "repeatMonthly" },
  { value: "yearly", label: "repeatYearly" },
]

const AVATAR_SPECIES: Partial<Record<PetSummary["species"], PetSpecies>> = {
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

function formatDate(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(d)
}

/** Europe/Belgrade wall-clock parts of an instant. */
function belgradeParts(ts: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") }
}

/** Belgrade calendar date + "HH:MM" → UTC ISO (NFR-02, EP-27 starts_at). */
export function belgradeToUtc(date: Date, time: string): string {
  const [h, m] = time.split(":").map(Number)
  const wall = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), h, m)
  const offsetAt = (ts: number) => {
    const p = belgradeParts(ts)
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ts
  }
  let utc = wall - offsetAt(wall)
  const second = wall - offsetAt(utc)
  if (second !== utc) utc = second
  return new Date(utc).toISOString()
}

/** UTC ISO → the Belgrade calendar date and "HH:MM" (the edit prefill). */
function fromUtc(iso: string): { date: Date; time: string } {
  const p = belgradeParts(Date.parse(iso))
  return {
    date: new Date(p.year, p.month - 1, p.day),
    time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
  }
}

export function ReminderFormClient({
  pets,
  reminder,
  locale,
  copy,
}: {
  /** EP-01: the caller's own active pets. */
  pets: ReminderFormPet[]
  /** EP-27 get — set in the edit variant (/podsetnici/[id]). */
  reminder?: Reminder
  locale: Locale
  copy: ReminderFormCopy
}) {
  const t = copy.reminderForm
  const router = useRouter()
  const isEdit = !!reminder
  const initial = reminder ? fromUtc(reminder.starts_at) : null

  const [title, setTitle] = useState(reminder?.title ?? "")
  const [forWhom, setForWhom] = useState<string>(reminder?.pet_id ?? "me")
  const [date, setDate] = useState<Date | undefined>(initial?.date)
  const [dateOpen, setDateOpen] = useState(false)
  const [time, setTime] = useState(initial?.time ?? "09:00")
  const [repeat, setRepeat] = useState<ManualRecurrence>(
    reminder && reminder.recurrence !== "hourly_interval" ? reminder.recurrence : "none",
  )
  const [errors, setErrors] = useState<Errors>({})
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const monthNames = copy.petForm.calendarMonths.split(",")
  const weekdayNames = copy.petForm.calendarWeekdays.split(",")
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const selectedPet = pets.find((p) => p.id === forWhom)

  function validate(): Errors {
    const e: Errors = {}
    if (!title.trim()) e.title = t.errTitleRequired
    else if (title.trim().length > 80) e.title = t.errTitleTooLong
    if (!date) e.date = t.errDate
    if (!time) e.time = t.errTime
    return e
  }

  const dateTimeChanged = !initial || !date || date.getTime() !== initial.date.getTime() || time !== initial.time

  async function submit() {
    const e = validate()
    if (Object.keys(e).length === 0 && dateTimeChanged && Date.parse(belgradeToUtc(date!, time)) <= Date.now()) {
      e.date = t.errInPast
    }
    setErrors(e)
    if (Object.keys(e).length > 0) return

    const petId = forWhom === "me" ? null : forWhom
    const input: Partial<ManualReminderInput> = { title: title.trim(), pet_id: petId, recurrence: repeat }
    if (dateTimeChanged) input.starts_at = belgradeToUtc(date!, time)

    setBusy(true)
    setFailed(false)
    const result = await (reminder
      ? updateManualReminder(reminder.id, input)
      : createManualReminder(input as ManualReminderInput)
    ).catch(() => null)
    setBusy(false)

    if (!result?.ok) {
      const fields = result?.error.code === "validation_failed" ? result.error.fields : undefined
      const inline: Errors = {}
      let unmapped = !fields
      for (const [field, code] of Object.entries(fields ?? {})) {
        if (field === "title" && code === "required") inline.title = t.errTitleRequired
        else if (field === "title" && code === "too_long") inline.title = t.errTitleTooLong
        else if (field === "starts_at" && code === "in_past") inline.date = t.errInPast
        else if (field === "starts_at" && code === "required") inline.date = t.errDate
        else if (field === "pet_id" && code === "pet_memorial") inline.forWhom = t.errPetMemorial
        else unmapped = true
      }
      setErrors(inline)
      // Any other failure (and an unmapped field code) → the X error state (owner decision, Step 17).
      if (unmapped) setFailed(true)
      return
    }

    const when = { date: formatDate(date!, locale), time }
    toast(isEdit ? format(t.savedEdit, when) : format(t.savedNew, { title: title.trim(), ...when }))
    router.push("/podsetnici")
    router.refresh()
  }

  async function remove() {
    if (!reminder) return
    const result = await deleteManualReminder(reminder.id).catch(() => null)
    if (!result?.ok) {
      toast.error(copy.common.error)
      return
    }
    toast(format(t.deleted, { title: reminder.title ?? "" }))
    router.push("/podsetnici")
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/podsetnici">
            <ArrowLeft className="size-4" aria-hidden />
            {t.back}
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-9 font-bold">{isEdit ? t.titleEdit : t.titleNew}</h1>
          <p className="text-sm text-muted-foreground">{isEdit ? t.subtitleEdit : t.subtitleNew}</p>
        </div>
      </div>

      {failed && <ErrorState message={t.error} labels={{ retry: copy.common.retry }} onRetry={() => setFailed(false)} />}

      <Card className="gap-6 p-4 md:p-6">
        <form
          noValidate
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="reminder-title">{t.titleLabel}</Label>
            <Input
              id="reminder-title"
              placeholder={t.titlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setErrors((er) => ({ ...er, title: validate().title }))}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "reminder-title-error" : undefined}
            />
            {errors.title && (
              <p id="reminder-title-error" className="text-sm text-destructive">
                {errors.title}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-for">{t.forWhom}</Label>
            <Select
              value={forWhom}
              onValueChange={(v) => {
                setForWhom(v)
                setErrors((er) => ({ ...er, forWhom: undefined }))
              }}
            >
              <SelectTrigger
                id="reminder-for"
                className="w-full"
                aria-invalid={!!errors.forWhom}
                aria-describedby={errors.forWhom ? "reminder-for-error" : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">{t.onlyMe}</SelectItem>
                {pets.length > 0 && <SelectSeparator />}
                {pets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPet ? (
              <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <PetAvatar name={selectedPet.name} sex={selectedPet.sex} species={AVATAR_SPECIES[selectedPet.species]} size="sm" />
                <span className="min-w-0 truncate">{format(t.petHint, { pet: selectedPet.name })}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.meHint}</p>
            )}
            {errors.forWhom && (
              <p id="reminder-for-error" className="text-sm text-destructive">
                {errors.forWhom}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="reminder-date">{t.date}</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="reminder-date"
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-start font-normal md:h-9"
                    aria-invalid={!!errors.date}
                    aria-describedby={errors.date ? "reminder-date-error" : undefined}
                  >
                    <CalendarDays className="size-4" aria-hidden />
                    {date ? formatDate(date, locale) : <span className="text-muted-foreground">{t.pickDate}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    defaultMonth={date ?? today}
                    weekStartsOn={1}
                    // EP-27: starts_at in the future — past days cannot be picked (owner decision).
                    disabled={{ before: today }}
                    formatters={{
                      formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
                      formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
                    }}
                    onSelect={(d) => {
                      setDate(d)
                      setErrors((er) => ({ ...er, date: d ? undefined : er.date }))
                      setDateOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
              {errors.date && (
                <p id="reminder-date-error" className="text-sm text-destructive">
                  {errors.date}
                </p>
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="reminder-time">{t.time}</Label>
              <Input
                id="reminder-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                onBlur={() => setErrors((er) => ({ ...er, time: validate().time }))}
                aria-invalid={!!errors.time}
                aria-describedby={errors.time ? "reminder-time-error" : undefined}
              />
              {errors.time && (
                <p id="reminder-time-error" className="text-sm text-destructive">
                  {errors.time}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-repeat">{t.repeat}</Label>
            <Select value={repeat} onValueChange={(v) => setRepeat(v as ManualRecurrence)}>
              <SelectTrigger id="reminder-repeat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPEATS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {t[r.label]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {repeat === "monthly" && <p className="text-sm text-muted-foreground">{t.monthlyHint}</p>}
          </div>

          <p className="rounded-sm bg-foreground/5 p-3 text-sm text-muted-foreground">
            {interpolate(t.channelsHint, {
              link: (
                <Link href="/podesavanja/podsetnici" className="font-medium text-primary underline-offset-4 hover:underline">
                  {t.channelsLink}
                </Link>
              ),
            })}
          </p>

          <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-end">
            {reminder && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost" className="h-11 text-destructive md:mr-auto md:h-9">
                    <Trash2 className="size-4" aria-hidden />
                    {t.delete}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{format(t.deleteTitle, { title: reminder.title ?? "" })}</AlertDialogTitle>
                    <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="h-11 md:h-9">{t.cancel}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" className="h-11 md:h-9" onClick={() => void remove()}>
                      {t.confirmDelete}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button asChild type="button" variant="outline" className="h-11 md:h-9">
              <Link href="/podsetnici">{t.cancel}</Link>
            </Button>
            <Button type="submit" className="h-11 md:h-9" disabled={busy}>
              {isEdit ? t.saveEdit : t.save}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
