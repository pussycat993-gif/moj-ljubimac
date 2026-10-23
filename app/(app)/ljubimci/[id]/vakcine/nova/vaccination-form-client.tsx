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
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar"
import type { PetSummary } from "@/lib/actions/pets"
import { createVaccination, updateVaccination, type Vaccination } from "@/lib/actions/vaccinations"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S04 — Nova vakcina · /ljubimci/[id]/vakcine/nova (EP-01 header with the id filter, EP-09 insert)
// and its edit route /ljubimci/[id]/vakcine/[vakcinaId] (EP-02 preload, EP-09 update; owner decision,
// Step 14) · FR-05, FR-20. The clinic is prefilled from vet_name. States: D → toast + back to S03;
// inline field errors on 422; X (ErrorState) on any other failure.

export type VaccinationFormCopy = Pick<Dictionary, "vaccinationForm" | "pet" | "petForm" | "common">

/** The pet fields the S04 header and prefill need (PetSummary or Pet). */
export type VaccinationFormPet = Pick<
  PetSummary,
  "id" | "name" | "sex" | "species" | "species_other" | "breed" | "vet_name"
>

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

/** Local calendar date → "YYYY-MM-DD" (API §3.5). */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function parseIsoDate(value: string | null) {
  if (!value) return undefined
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function DateField({
  id,
  label,
  value,
  onChange,
  helper,
  error,
  disabled,
  locale,
  copy,
}: {
  id: string
  label: string
  value?: Date
  onChange: (d?: Date) => void
  helper?: string
  error?: string
  disabled: { after: Date } | { before: Date } | undefined
  locale: Locale
  copy: VaccinationFormCopy["petForm"]
}) {
  const monthNames = copy.calendarMonths.split(",")
  const weekdayNames = copy.calendarWeekdays.split(",")
  const describedBy = [helper ? `${id}-pomoc` : "", error ? `${id}-greska` : ""].filter(Boolean).join(" ") || undefined
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
            aria-describedby={describedBy}
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
            // EP-09: given_on not in the future, next_due_on after given_on — invalid days cannot be picked (owner decision).
            disabled={disabled}
            formatters={{
              formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
              formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
            }}
          />
        </PopoverContent>
      </Popover>
      {helper && (
        <p id={`${id}-pomoc`} className="flex items-center gap-1 text-sm text-muted-foreground">
          <Bell className="size-3.5 shrink-0" aria-hidden />
          {helper}
        </p>
      )}
      {error && (
        <p id={`${id}-greska`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

type FormData = {
  name: string
  given?: Date
  next?: Date
  clinic: string
  batch: string
  note: string
}

type Errors = Partial<Record<"name" | "given" | "next", string>>

function validate(f: FormData, t: VaccinationFormCopy["vaccinationForm"]): Errors {
  const e: Errors = {}
  if (!f.name.trim()) e.name = t.errName
  if (!f.given) e.given = t.errGiven
  if (f.given && f.next && f.next <= f.given) e.next = t.errNext
  return e
}

/** 422 `fields` → the inline messages the mockup has; any other field code → null (form-level error). */
function fieldErrors(fields: Record<string, string>, t: VaccinationFormCopy["vaccinationForm"]): Errors | null {
  const e: Errors = {}
  for (const [field, code] of Object.entries(fields)) {
    if (field === "name" && code === "required") e.name = t.errName
    else if (field === "given_on" && code === "required") e.given = t.errGiven
    else if (field === "next_due_on" && code === "before_start") e.next = t.errNext
    else return null
  }
  return e
}

export function VaccinationFormClient({
  pet,
  vaccination = null,
  locale,
  copy,
}: {
  pet: VaccinationFormPet
  /** Edit route: the EP-02 vaccination. New: null. */
  vaccination?: Vaccination | null
  locale: Locale
  copy: VaccinationFormCopy
}) {
  const t = copy.vaccinationForm
  const router = useRouter()
  const isEdit = vaccination !== null
  const [form, setForm] = useState<FormData>(() =>
    vaccination
      ? {
          name: vaccination.name,
          given: parseIsoDate(vaccination.given_on),
          next: parseIsoDate(vaccination.next_due_on),
          clinic: vaccination.clinic ?? "",
          batch: vaccination.batch_number ?? "",
          note: vaccination.note ?? "",
        }
      : { name: "", given: new Date(), next: undefined, clinic: pet.vet_name ?? "", batch: "", note: "" },
  )
  const [errors, setErrors] = useState<Errors>({})
  const [saveFailed, setSaveFailed] = useState(false)
  const [pending, setPending] = useState(false)

  const recordHref = `/ljubimci/${pet.id}`
  const speciesLabel = pet.species === "other" && pet.species_other ? pet.species_other : copy.pet.species[pet.species]
  const subtitle = [pet.name, speciesLabel, pet.breed].filter(Boolean).join(" · ")

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form, t)
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setPending(true)
    setSaveFailed(false)
    const opt = (v: string) => (v.trim() === "" ? null : v.trim())
    const input = {
      name: form.name.trim(),
      given_on: isoDate(form.given!),
      next_due_on: form.next ? isoDate(form.next) : null,
      clinic: opt(form.clinic),
      batch_number: opt(form.batch),
      note: opt(form.note),
    }
    const result = isEdit
      ? await updateVaccination(vaccination.id, input)
      : await createVaccination({ pet_id: pet.id, ...input })

    if (!result.ok) {
      setPending(false)
      const { code, fields } = result.error
      const inline = code === "validation_failed" && fields ? fieldErrors(fields, t) : null
      if (inline) setErrors(inline)
      else setSaveFailed(true)
      return
    }

    toast(form.next ? format(t.savedWithReminder, { date: formatDate(form.next, locale) }) : t.saved)
    router.push(recordHref)
    router.refresh()
  }

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

          <div className="min-w-0 space-y-2">
            <Label htmlFor="vakcina-naziv">{t.name}</Label>
            <Input
              id="vakcina-naziv"
              className="h-11 md:h-9"
              value={form.name}
              maxLength={100}
              onChange={(e) => set("name", e.target.value)}
              onBlur={() => setErrors((prev) => ({ ...prev, name: validate(form, t).name }))}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "vakcina-naziv-greska" : undefined}
              placeholder={t.namePlaceholder}
            />
            {errors.name && (
              <p id="vakcina-naziv-greska" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DateField
              id="vakcina-datum"
              label={t.givenOn}
              value={form.given}
              onChange={(d) => {
                set("given", d)
                setErrors((prev) => ({ ...prev, given: undefined }))
              }}
              error={errors.given}
              disabled={{ after: new Date() }}
              locale={locale}
              copy={copy.petForm}
            />
            <DateField
              id="vakcina-sledeca"
              label={t.nextDueOn}
              value={form.next}
              onChange={(d) => {
                set("next", d)
                setErrors((prev) => ({ ...prev, next: undefined }))
              }}
              helper={t.nextHelper}
              error={errors.next}
              disabled={
                form.given
                  ? { before: new Date(form.given.getFullYear(), form.given.getMonth(), form.given.getDate() + 1) }
                  : undefined
              }
              locale={locale}
              copy={copy.petForm}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="vakcina-ambulanta">{t.clinic}</Label>
              <Input
                id="vakcina-ambulanta"
                className="h-11 md:h-9"
                value={form.clinic}
                maxLength={100}
                onChange={(e) => set("clinic", e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="vakcina-serija">{t.batch}</Label>
              <Input
                id="vakcina-serija"
                className="h-11 md:h-9"
                value={form.batch}
                maxLength={60}
                onChange={(e) => set("batch", e.target.value)}
                placeholder={t.batchPlaceholder}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vakcina-napomena">{t.note}</Label>
            <Textarea
              id="vakcina-napomena"
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
