"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bell, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar"
import type { PetSummary } from "@/lib/actions/pets"
import { createTreatment, updateTreatment, type Treatment, type TreatmentType } from "@/lib/actions/treatments"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S27 — Nova terapija · /ljubimci/[id]/terapije/nova (EP-01 header with the id filter, EP-10 insert)
// and its edit route /ljubimci/[id]/terapije/[terapijaId] (EP-02 preload, EP-10 update; owner
// decision, Step 15) · FR-06 (dose reminders via FR-20). "Trajanje N dana" is sent as
// ends_on = starts_on + N − 1 (EP-10). States: D → toast with the schedule summary + back to S03;
// inline field errors on 422; X (ErrorState) on any other failure.

export type TreatmentFormCopy = Pick<Dictionary, "treatmentForm" | "pet" | "petForm" | "common">

/** The pet fields the S27 header needs (PetSummary or Pet). */
export type TreatmentFormPet = Pick<PetSummary, "id" | "name" | "sex" | "species" | "species_other" | "breed">

const AVATAR_SPECIES: Partial<Record<PetSummary["species"], PetSpecies>> = {
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

const TYPES: TreatmentType[] = ["medication", "deworming", "flea_tick", "other"]

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** sr-Latn "19. 10. 2026." · en-GB "19 Oct 2026" (Design §9). */
function formatDate(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(d)
}

/** Local calendar date → "YYYY-MM-DD" (API §3.5). */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function parseIsoDate(value: string | null) {
  if (!value) return undefined
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(dict: object, base: string, n: number, locale: Locale): string {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  return (dict as Record<string, string>)[`${base}_${rule === "one" || rule === "few" ? rule : "other"}`]
}

function DateField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  locale,
  copy,
}: {
  id: string
  label: string
  value?: Date
  onChange: (d?: Date) => void
  error?: string
  disabled?: { before: Date }
  locale: Locale
  copy: TreatmentFormCopy["petForm"]
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
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-greska` : undefined}
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
            // EP-10: ends_on ≥ starts_on — earlier days cannot be picked (owner decision).
            disabled={disabled}
            formatters={{
              formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
              formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
            }}
          />
        </PopoverContent>
      </Popover>
      {error && (
        <p id={`${id}-greska`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

type FreqUnit = "hours" | "days"
type EndMode = "date" | "duration"

type FormData = {
  type: TreatmentType | ""
  name: string
  dose: string
  every: string
  unit: FreqUnit
  start?: Date
  endMode: EndMode
  end?: Date
  duration: string
  note: string
}

type Errors = Partial<Record<"type" | "name" | "every" | "start" | "end" | "duration", string>>

function validate(f: FormData, t: TreatmentFormCopy["treatmentForm"]): Errors {
  const e: Errors = {}
  if (!f.type) e.type = t.errType
  if (!f.name.trim()) e.name = t.errName
  if (f.every.trim() && !(Number.isInteger(Number(f.every)) && Number(f.every) > 0)) e.every = t.errEvery
  if (!f.start) e.start = t.errStart
  if (f.endMode === "date" && f.start && f.end && f.end < f.start) e.end = t.errEnd
  if (f.endMode === "duration" && f.duration.trim() && !(Number.isInteger(Number(f.duration)) && Number(f.duration) > 0))
    e.duration = t.errDuration
  return e
}

/** EP-10: the end date, or "Trajanje N dana" converted to starts_on + N − 1; none → open-ended. */
function endDate(f: FormData): Date | undefined {
  if (f.endMode === "date") return f.end
  if (f.start && Number(f.duration) > 0) return addDays(f.start, Number(f.duration) - 1)
  return undefined
}

/** The dose-schedule summary under the dates; "" for a one-time treatment. */
function scheduleSummary(f: FormData, t: TreatmentFormCopy["treatmentForm"], locale: Locale): string {
  const every = Number(f.every)
  if (!f.start || !f.every.trim() || !(every > 0)) return ""
  const freq =
    f.unit === "hours"
      ? format(plural(t, "freqHours", every, locale), { n: every })
      : every === 1
        ? t.freqDaily
        : format(t.freqDays, { n: every })
  const end = endDate(f)
  const start = formatDate(f.start, locale)
  if (!end) return format(t.summaryOpen, { freq, start })
  return format(t.summaryUntil, { freq, start, end: formatDate(end, locale) })
}

/** 422 `fields` → the inline messages the mockup has; any other field code → null (form-level error). */
function fieldErrors(fields: Record<string, string>, f: FormData, t: TreatmentFormCopy["treatmentForm"]): Errors | null {
  const e: Errors = {}
  for (const [field, code] of Object.entries(fields)) {
    if (field === "type" && code === "required") e.type = t.errType
    else if (field === "name" && code === "required") e.name = t.errName
    else if (field === "interval_value" && code === "out_of_range") e.every = t.errEvery
    else if (field === "starts_on" && code === "required") e.start = t.errStart
    else if (field === "ends_on" && code === "before_start") {
      if (f.endMode === "date") e.end = t.errEnd
      else e.duration = t.errDuration
    } else return null
  }
  return e
}

function initialForm(treatment: Treatment | null): FormData {
  if (!treatment) {
    return {
      type: "medication",
      name: "",
      dose: "",
      every: "12",
      unit: "hours",
      start: new Date(),
      endMode: "duration",
      end: undefined,
      duration: "7",
      note: "",
    }
  }
  return {
    type: treatment.type,
    name: treatment.name,
    dose: treatment.dose ?? "",
    every: treatment.interval_value ? String(treatment.interval_value) : "",
    unit: treatment.interval_unit ?? "hours",
    start: parseIsoDate(treatment.starts_on),
    endMode: treatment.ends_on ? "date" : "duration",
    end: parseIsoDate(treatment.ends_on),
    duration: "",
    note: treatment.note ?? "",
  }
}

export function TreatmentFormClient({
  pet,
  treatment = null,
  locale,
  copy,
}: {
  pet: TreatmentFormPet
  /** Edit route: the EP-02 treatment. New: null. */
  treatment?: Treatment | null
  locale: Locale
  copy: TreatmentFormCopy
}) {
  const t = copy.treatmentForm
  const router = useRouter()
  const isEdit = treatment !== null
  const [form, setForm] = useState<FormData>(() => initialForm(treatment))
  const [errors, setErrors] = useState<Errors>({})
  const [saveFailed, setSaveFailed] = useState(false)
  const [pending, setPending] = useState(false)

  const recordHref = `/ljubimci/${pet.id}`
  const speciesLabel = pet.species === "other" && pet.species_other ? pet.species_other : copy.pet.species[pet.species]
  const subtitle = [pet.name, speciesLabel, pet.breed].filter(Boolean).join(" · ")

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function clearError(key: keyof Errors) {
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form, t)
    setErrors(e)
    if (Object.values(e).some(Boolean)) return

    setPending(true)
    setSaveFailed(false)
    const opt = (v: string) => (v.trim() === "" ? null : v.trim())
    const every = form.every.trim() ? Number(form.every) : null
    const end = endDate(form)
    const input = {
      type: form.type as TreatmentType,
      name: form.name.trim(),
      dose: opt(form.dose),
      interval_value: every,
      interval_unit: every ? form.unit : null,
      starts_on: isoDate(form.start!),
      ends_on: end ? isoDate(end) : null,
      note: opt(form.note),
    }
    const result = isEdit ? await updateTreatment(treatment.id, input) : await createTreatment({ pet_id: pet.id, ...input })

    if (!result.ok) {
      setPending(false)
      const { code, fields } = result.error
      const inline = code === "validation_failed" && fields ? fieldErrors(fields, form, t) : null
      if (inline) setErrors(inline)
      else setSaveFailed(true)
      return
    }

    const summary = scheduleSummary(form, t, locale)
    toast(summary ? format(t.savedWithSummary, { summary }) : t.saved)
    router.push(recordHref)
    router.refresh()
  }

  const summary = scheduleSummary(form, t, locale)
  const everyNum = Number(form.every)
  const durationNum = Number(form.duration)

  return (
    <div data-pet-sex={pet.sex} className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="px-2">
          <Link href={recordHref}>
            <ArrowLeft className="size-4" aria-hidden />
            {t.backToRecord}
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-3">
          <PetAvatar name={pet.name} sex={pet.sex} species={AVATAR_SPECIES[pet.species]} size="md" ring />
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-9 font-bold">{isEdit ? t.titleEdit : t.titleNew}</h1>
            <p className="truncate text-sm text-pet-accent">{subtitle}</p>
          </div>
        </div>
      </div>

      {saveFailed && (
        <ErrorState message={t.saveError} labels={{ retry: copy.common.retry }} onRetry={() => setSaveFailed(false)} />
      )}

      <form noValidate onSubmit={submit} className="space-y-6">
        <Card className="gap-4 p-4 md:p-6">
          <h2 className="font-heading text-lg font-bold">{t.details}</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="terapija-vrsta">{t.type}</Label>
              <Select
                value={form.type || undefined}
                onValueChange={(v) => {
                  set("type", v as TreatmentType)
                  clearError("type")
                }}
              >
                <SelectTrigger
                  id="terapija-vrsta"
                  className="h-11 w-full md:h-9"
                  aria-invalid={!!errors.type}
                  aria-describedby={errors.type ? "terapija-vrsta-greska" : undefined}
                >
                  <SelectValue placeholder={t.typePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {copy.pet.treatmentType[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && (
                <p id="terapija-vrsta-greska" className="text-sm text-destructive">
                  {errors.type}
                </p>
              )}
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="terapija-naziv">{t.name}</Label>
              <Input
                id="terapija-naziv"
                className="h-11 md:h-9"
                value={form.name}
                maxLength={100}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => setErrors((prev) => ({ ...prev, name: validate(form, t).name }))}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "terapija-naziv-greska" : undefined}
                placeholder={t.namePlaceholder}
              />
              {errors.name && (
                <p id="terapija-naziv-greska" className="text-sm text-destructive">
                  {errors.name}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="terapija-doza">{t.dose}</Label>
            <Input
              id="terapija-doza"
              className="h-11 md:h-9"
              value={form.dose}
              maxLength={60}
              onChange={(e) => set("dose", e.target.value)}
              placeholder={t.dosePlaceholder}
            />
          </div>

          <fieldset className="min-w-0 space-y-2">
            <legend className="text-sm font-medium">{t.frequency}</legend>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 md:max-w-sm">
              <Label htmlFor="terapija-svakih" className="font-normal">
                {t.every}
              </Label>
              <Input
                id="terapija-svakih"
                inputMode="numeric"
                className="h-11 md:h-9"
                value={form.every}
                onChange={(e) => {
                  set("every", e.target.value.replace(/\D/g, ""))
                  clearError("every")
                }}
                aria-invalid={!!errors.every}
                aria-describedby={errors.every ? "terapija-svakih-greska" : "terapija-svakih-pomoc"}
                placeholder={t.everyPlaceholder}
              />
              <Select value={form.unit} onValueChange={(v) => set("unit", v as FreqUnit)}>
                <SelectTrigger id="terapija-jedinica" aria-label={t.unitLabel} className="h-11 w-full md:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">{everyNum > 0 ? plural(t, "unitHours", everyNum, locale) : t.unitHours_other}</SelectItem>
                  <SelectItem value="days">{everyNum > 0 ? plural(t, "unitDays", everyNum, locale) : t.unitDays_other}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {errors.every ? (
              <p id="terapija-svakih-greska" className="text-sm text-destructive">
                {errors.every}
              </p>
            ) : (
              <p id="terapija-svakih-pomoc" className="flex items-center gap-1 text-sm text-muted-foreground">
                <Bell className="size-3.5 shrink-0" aria-hidden />
                {t.frequencyHelper}
              </p>
            )}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DateField
              id="terapija-pocetak"
              label={t.startsOn}
              value={form.start}
              onChange={(d) => {
                set("start", d)
                clearError("start")
                clearError("end")
              }}
              error={errors.start}
              locale={locale}
              copy={copy.petForm}
            />

            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-medium">{t.end}</legend>
              <RadioGroup
                value={form.endMode}
                onValueChange={(v) => {
                  set("endMode", v as EndMode)
                  clearError("end")
                  clearError("duration")
                }}
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="kraj-trajanje" value="duration" />
                  <Label htmlFor="kraj-trajanje" className="font-normal">
                    {t.endDuration}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="kraj-datum" value="date" />
                  <Label htmlFor="kraj-datum" className="font-normal">
                    {t.endDate}
                  </Label>
                </div>
              </RadioGroup>

              {form.endMode === "duration" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="terapija-trajanje" className="sr-only">
                      {t.durationLabel}
                    </Label>
                    <Input
                      id="terapija-trajanje"
                      inputMode="numeric"
                      className="h-11 w-24 md:h-9"
                      value={form.duration}
                      onChange={(e) => {
                        set("duration", e.target.value.replace(/\D/g, ""))
                        clearError("duration")
                      }}
                      aria-invalid={!!errors.duration}
                      aria-describedby={errors.duration ? "terapija-trajanje-greska" : undefined}
                      placeholder={t.durationPlaceholder}
                    />
                    <span className="text-sm text-muted-foreground">
                      {durationNum > 0 ? plural(t, "unitDays", durationNum, locale) : t.unitDays_other}
                    </span>
                  </div>
                  {errors.duration && (
                    <p id="terapija-trajanje-greska" className="text-sm text-destructive">
                      {errors.duration}
                    </p>
                  )}
                </div>
              ) : (
                <DateField
                  id="terapija-kraj"
                  label={t.endDate}
                  value={form.end}
                  onChange={(d) => {
                    set("end", d)
                    clearError("end")
                  }}
                  error={errors.end}
                  disabled={form.start ? { before: form.start } : undefined}
                  locale={locale}
                  copy={copy.petForm}
                />
              )}
              <p className="text-xs text-muted-foreground">{t.endHelper}</p>
            </fieldset>
          </div>

          {summary && !errors.every && !errors.end && !errors.duration && (
            <p className="flex items-start gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
              <Bell className="mt-0.5 size-4 shrink-0 text-pet-accent" aria-hidden />
              <span className="min-w-0">{summary}</span>
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="terapija-napomena">{t.note}</Label>
            <Textarea
              id="terapija-napomena"
              value={form.note}
              maxLength={1000}
              onChange={(e) => set("note", e.target.value)}
              placeholder={t.notePlaceholder}
            />
          </div>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild type="button" variant="outline" className="h-11 md:h-9">
            <Link href={recordHref}>{t.cancel}</Link>
          </Button>
          <Button type="submit" className="h-11 md:h-9" disabled={pending}>
            {isEdit ? t.saveEdit : t.save}
          </Button>
        </div>
      </form>
    </div>
  )
}
