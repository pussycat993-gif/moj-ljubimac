"use client"

import { useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CalendarDays, ImageIcon, Upload } from "lucide-react"
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
import { PetAvatar, type PetSex, type PetSpecies } from "@/components/app/pet-avatar"
import { PremiumLock } from "@/components/app/premium-lock"
import {
  createPet,
  updatePet,
  type NeuteredValue,
  type Pet,
  type PetInput,
  type PetSpeciesValue,
  type WeightUnit,
} from "@/lib/actions/pets"
import { confirmUpload, requestUpload } from "@/lib/actions/uploads"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import { useFocusFirstInvalid } from "@/lib/forms/focus-first-invalid"

// S02 — Dodaj / izmeni ljubimca · /ljubimci/novi (EP-03) and /ljubimci/[id]/izmena (EP-02 preload,
// EP-04 save) · FR-01, FR-02, FR-03, FR-09. The photo goes through EP-13 after the pet exists.
// States: default; inline field errors on 422; PremiumLock on premium_required; X on 5xx.

export type PetFormCopy = Pick<Dictionary, "petForm" | "pet" | "petsHome" | "common">

const speciesKind: Partial<Record<PetSpeciesValue, PetSpecies>> = {
  dog: "dog",
  cat: "cat",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

const species: PetSpeciesValue[] = [
  "dog",
  "cat",
  "rabbit",
  "hamster",
  "guinea_pig",
  "chinchilla",
  "ferret",
  "bird",
  "fish",
  "turtle",
  "lizard",
  "snake",
  "other",
]

const PHOTO_TYPES = "image/jpeg,image/png,image/webp,image/heic"

/** Earliest birth year the form offers (date picker and approximate year, QA Q1). */
const FIRST_BIRTH_YEAR = 1990

/** This year down to 1990 — the approximate birth year choices. */
function birthYears(now = new Date()) {
  const years: string[] = []
  for (let y = now.getFullYear(); y >= FIRST_BIRTH_YEAR; y--) years.push(String(y))
  return years
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
  required = false,
  label,
  value,
  onChange,
  helper,
  locale,
  copy,
}: {
  id: string
  /** Step FX (Step 32 D-07 b): a required date is not cleared by clicking the selected day again. */
  required?: boolean
  label: string
  value?: Date
  onChange: (d?: Date) => void
  helper?: string
  locale: Locale
  copy: PetFormCopy["petForm"]
}) {
  // Step FX (Step 32 D-07 a): the calendar closes once a day is picked; focus returns to the field.
  const [open, setOpen] = useState(false)
  const monthNames = copy.calendarMonths.split(",")
  const weekdayNames = copy.calendarWeekdays.split(",")
  const today = new Date()
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-describedby={helper ? `${id}-pomoc` : undefined}
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
            onSelect={(d) => {
              if (d || !required) onChange(d)
              setOpen(false)
            }}
            weekStartsOn={1}
            // QA Q1: month and year dropdowns in the caption, years 1990 → this year.
            captionLayout="dropdown"
            startMonth={new Date(FIRST_BIRTH_YEAR, 0)}
            endMonth={new Date(today.getFullYear(), today.getMonth())}
            defaultMonth={value ?? today}
            // EP-03: birth_date is not in the future — later days cannot be picked (owner decision, Step 13).
            disabled={{ after: today }}
            formatters={{
              formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
              formatMonthDropdown: (d: Date) => monthNames[d.getMonth()],
              formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
            }}
            labels={{
              labelMonthDropdown: () => copy.calendarMonth,
              labelYearDropdown: () => copy.calendarYear,
            }}
          />
        </PopoverContent>
      </Popover>
      {helper && (
        <p id={`${id}-pomoc`} className="text-sm text-muted-foreground">
          {helper}
        </p>
      )}
    </div>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  )
}

type FormData = {
  name: string
  species: PetSpeciesValue | ""
  speciesOther: string
  breed: string
  sex: PetSex | ""
  birthMode: "date" | "year"
  birthDate?: Date
  birthYear: string
  color: string
  microchip: string
  passport: string
  neutered: NeuteredValue
  vetName: string
  vetPhone: string
  weightUnit: WeightUnit
  note: string
}

const emptyForm: FormData = {
  name: "",
  species: "",
  speciesOther: "",
  breed: "",
  sex: "",
  birthMode: "date",
  birthDate: undefined,
  birthYear: "",
  color: "",
  microchip: "",
  passport: "",
  neutered: "unknown",
  vetName: "",
  vetPhone: "",
  weightUnit: "kg",
  note: "",
}

function formFromPet(pet: Pet): FormData {
  return {
    name: pet.name,
    species: pet.species,
    speciesOther: pet.species_other ?? "",
    breed: pet.breed ?? "",
    sex: pet.sex,
    birthMode: pet.birth_year !== null && pet.birth_date === null ? "year" : "date",
    birthDate: parseIsoDate(pet.birth_date),
    birthYear: pet.birth_year !== null ? String(pet.birth_year) : "",
    color: pet.colour_markings ?? "",
    microchip: pet.microchip_number ?? "",
    passport: pet.passport_number ?? "",
    neutered: pet.neutered,
    vetName: pet.vet_name ?? "",
    vetPhone: pet.vet_phone ?? "",
    weightUnit: pet.weight_unit,
    note: pet.note ?? "",
  }
}

/** The form → EP-03 / EP-04 Request (empty optional fields → null). */
function toInput(f: FormData): PetInput {
  const opt = (v: string) => (v.trim() === "" ? null : v.trim())
  return {
    name: f.name.trim(),
    species: f.species,
    species_other: f.species === "other" ? opt(f.speciesOther) : null,
    sex: f.sex,
    breed: opt(f.breed),
    colour_markings: opt(f.color),
    microchip_number: opt(f.microchip),
    passport_number: opt(f.passport),
    birth_date: f.birthMode === "date" && f.birthDate ? isoDate(f.birthDate) : null,
    birth_year: f.birthMode === "year" && f.birthYear.trim() ? Number(f.birthYear.trim()) : null,
    neutered: f.neutered,
    vet_name: opt(f.vetName),
    vet_phone: opt(f.vetPhone),
    weight_unit: f.weightUnit,
    note: opt(f.note),
  }
}

type ErrorKey = "name" | "species" | "speciesOther" | "sex" | "birthYear"
type Errors = Partial<Record<ErrorKey, string>>

function validate(f: FormData, t: PetFormCopy["petForm"]): Errors {
  const e: Errors = {}
  if (!f.name.trim()) e.name = t.errName
  if (!f.species) e.species = t.errSpecies
  if (f.species === "other" && !f.speciesOther.trim()) e.speciesOther = t.errSpeciesOther
  if (!f.sex) e.sex = t.errSex
  if (f.birthMode === "year" && f.birthYear) {
    const year = Number(f.birthYear)
    if (!/^(19|20)\d{2}$/.test(f.birthYear) || year < 1990 || year > new Date().getFullYear()) e.birthYear = t.errBirthYear
  }
  return e
}

/** 422 `fields` → the inline messages the mockup has; any other field code → null (form-level error). */
function fieldErrors(fields: Record<string, string>, t: PetFormCopy["petForm"]): Errors | null {
  const e: Errors = {}
  for (const [field, code] of Object.entries(fields)) {
    if (field === "name" && code === "required") e.name = t.errName
    else if (field === "species" && code === "required") e.species = t.errSpecies
    else if (field === "species_other" && code === "required") e.speciesOther = t.errSpeciesOther
    else if (field === "sex" && code === "required") e.sex = t.errSex
    else if (field === "birth_year") e.birthYear = t.errBirthYear
    else return null
  }
  return e
}

/** EP-13: ticket → direct PUT to R2 → confirm. true when the photo is saved. */
async function uploadPhoto(petId: string, file: File): Promise<boolean> {
  try {
    const ticket = await requestUpload({
      purpose: "pet_photo",
      target_id: petId,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    })
    if (!ticket.ok) return false
    const put = await fetch(ticket.data.put_url, {
      method: ticket.data.method,
      headers: { "Content-Type": ticket.data.headers["Content-Type"] },
      body: file,
    })
    if (!put.ok) return false
    const confirmed = await confirmUpload({ upload_token: ticket.data.upload_token })
    return confirmed.ok
  } catch {
    return false
  }
}

export function PetFormClient({
  pet = null,
  photoUrl,
  locale,
  copy,
}: {
  /** Edit (/ljubimci/[id]/izmena): the EP-02 `pet`. Create (/ljubimci/novi): null. */
  pet?: Pet | null
  photoUrl?: string
  locale: Locale
  copy: PetFormCopy
}) {
  const t = copy.petForm
  const router = useRouter()
  const isEdit = pet !== null
  const [form, setForm] = useState<FormData>(pet ? formFromPet(pet) : emptyForm)
  const [errors, setErrors] = useState<Errors>({})
  const [saveFailed, setSaveFailed] = useState(false)
  const [premiumLocked, setPremiumLocked] = useState(false)
  const [pending, setPending] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const speciesOtherInput = useRef<HTMLInputElement>(null)
  // Set when "Ostalo" is chosen: the Select hands focus to "Koja vrsta?" instead of its trigger.
  const focusSpeciesOther = useRef(false)
  const focusFirstInvalid = useFocusFirstInvalid(formRef)

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function blurCheck(key: ErrorKey) {
    const e = validate(form, t)
    setErrors((prev) => ({ ...prev, [key]: e[key] }))
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form, t)
    setErrors(e)
    if (Object.keys(e).length > 0) {
      focusFirstInvalid()
      return
    }

    setPending(true)
    setSaveFailed(false)
    setPremiumLocked(false)
    const input = toInput(form)
    const result = isEdit ? await updatePet(pet.id, input) : await createPet(input)

    if (!result.ok) {
      setPending(false)
      const { code, fields } = result.error
      if (code === "premium_required") {
        setPremiumLocked(true)
        return
      }
      const inline = code === "validation_failed" && fields ? fieldErrors(fields, t) : null
      if (inline) {
        setErrors(inline)
        focusFirstInvalid()
      } else setSaveFailed(true)
      return
    }

    const saved = result.data
    if (photoFile && !(await uploadPhoto(saved.id, photoFile))) toast.error(copy.common.error)
    toast(format(isEdit ? t.savedEdit : t.savedNew, { name: saved.name }))
    router.push(`/ljubimci/${saved.id}`)
    router.refresh()
  }

  const previewSex: PetSex = form.sex || "unknown"
  const previewName = form.name.trim() || "?"
  const backHref = isEdit ? `/ljubimci/${pet.id}` : "/ljubimci"
  const photoName = photoFile?.name ?? pet?.photo_file_name ?? ""

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="px-2">
          <Link href={backHref}>
            <ArrowLeft className="size-4" aria-hidden />
            {isEdit ? t.backToRecord : t.backToPets}
          </Link>
        </Button>
        <h1 className="font-heading text-[28px] leading-9 font-bold">
          {isEdit ? format(t.titleEdit, { name: pet.name }) : t.titleNew}
        </h1>
        <p className="text-sm text-muted-foreground">{t.requiredNote}</p>
      </div>

      {saveFailed && (
        <ErrorState message={t.saveError} labels={{ retry: copy.common.retry }} onRetry={() => setSaveFailed(false)} />
      )}

      {premiumLocked && (
        <PremiumLock title={copy.common.premiumTitle} description={copy.petsHome.lockDescription} cta={copy.common.premiumCta} ctaHref="/premium" />
      )}

      <form ref={formRef} noValidate onSubmit={submit} className="space-y-6">
        {/* Osnovno */}
        <Card className="gap-4 p-4 md:p-6">
          <h2 className="font-heading text-lg font-bold">{t.basics}</h2>

          <div data-pet-sex={previewSex} className="flex min-w-0 items-center gap-3 rounded-sm bg-foreground/5 p-3">
            <PetAvatar
              name={previewName}
              sex={previewSex}
              species={form.species ? speciesKind[form.species] : undefined}
              photoUrl={photoFile ? undefined : photoUrl}
              size="md"
              ring
            />
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-bold text-pet-accent">{form.name.trim() || t.previewName}</p>
              <p className="text-xs font-medium text-muted-foreground">{t.previewHint}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="ime">{t.name}</Label>
              <Input
                id="ime"
                className="h-11 md:h-9"
                value={form.name}
                maxLength={60}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => blurCheck("name")}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "ime-greska" : undefined}
                placeholder={t.namePlaceholder}
              />
              <FieldError id="ime-greska" message={errors.name} />
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="vrsta">{t.species}</Label>
              <Select
                value={form.species}
                onValueChange={(v) => {
                  set("species", v as PetSpeciesValue)
                  focusSpeciesOther.current = v === "other"
                  // "Upiši koja je vrsta." waits for a submit or a blur of the empty field (QA Q1).
                  setErrors((prev) => ({ ...prev, species: undefined, speciesOther: undefined }))
                }}
              >
                <SelectTrigger
                  id="vrsta"
                  className="h-11 w-full md:h-9"
                  aria-invalid={!!errors.species}
                  aria-describedby={errors.species ? "vrsta-greska" : undefined}
                >
                  <SelectValue placeholder={t.speciesPlaceholder} />
                </SelectTrigger>
                <SelectContent
                  onCloseAutoFocus={(ev) => {
                    if (!focusSpeciesOther.current) return
                    focusSpeciesOther.current = false
                    ev.preventDefault()
                    setTimeout(() => speciesOtherInput.current?.focus(), 0)
                  }}
                >
                  {species.map((s) => (
                    <SelectItem key={s} value={s}>
                      {copy.pet.species[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="vrsta-greska" message={errors.species} />
              {/* QA Q1: "Koja vrsta?" sits right under the species control, grouped with it. */}
              {form.species === "other" && (
                <div data-testid="vrsta-ostalo-grupa" className="min-w-0 space-y-2 border-l-2 border-primary pl-3">
                  <Label htmlFor="vrsta-ostalo">{t.speciesOther}</Label>
                  <Input
                    ref={speciesOtherInput}
                    id="vrsta-ostalo"
                    className="h-11 md:h-9"
                    value={form.speciesOther}
                    maxLength={60}
                    onChange={(e) => set("speciesOther", e.target.value)}
                    onBlur={() => blurCheck("speciesOther")}
                    aria-invalid={!!errors.speciesOther}
                    aria-describedby={errors.speciesOther ? "vrsta-ostalo-greska" : undefined}
                    placeholder={t.speciesOtherPlaceholder}
                  />
                  <FieldError id="vrsta-ostalo-greska" message={errors.speciesOther} />
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="rasa">{t.breed}</Label>
              <Input
                id="rasa"
                className="h-11 md:h-9"
                value={form.breed}
                maxLength={100}
                onChange={(e) => set("breed", e.target.value)}
                placeholder={t.breedPlaceholder}
              />
            </div>

            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-medium">{t.sex}</legend>
              <RadioGroup
                value={form.sex}
                onValueChange={(v) => {
                  set("sex", v as PetSex)
                  setErrors((prev) => ({ ...prev, sex: undefined }))
                }}
                className="flex flex-wrap gap-4"
                aria-invalid={!!errors.sex}
                aria-describedby={errors.sex ? "pol-greska" : undefined}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="pol-zenka" value="female" />
                  <Label htmlFor="pol-zenka">{t.female}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="pol-muzjak" value="male" />
                  <Label htmlFor="pol-muzjak">{t.male}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="pol-nepoznat" value="unknown" />
                  <Label htmlFor="pol-nepoznat">{t.sexUnknown}</Label>
                </div>
              </RadioGroup>
              <FieldError id="pol-greska" message={errors.sex} />
            </fieldset>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t.birthday}</legend>
            <RadioGroup
              value={form.birthMode}
              onValueChange={(v) => set("birthMode", v as FormData["birthMode"])}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="rodj-datum" value="date" />
                <Label htmlFor="rodj-datum">{t.birthExact}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="rodj-godina" value="year" />
                <Label htmlFor="rodj-godina">{t.birthApprox}</Label>
              </div>
            </RadioGroup>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {form.birthMode === "date" ? (
                <DateField
                  id="datum-rodjenja"
                  label={t.birthDate}
                  value={form.birthDate}
                  onChange={(d) => set("birthDate", d)}
                  helper={t.birthDateHelper}
                  locale={locale}
                  copy={t}
                />
              ) : (
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="okvirna-godina">{t.birthYear}</Label>
                  {/* QA Q1: a Select of years (this year down to 1990) instead of a free number. */}
                  <Select
                    value={form.birthYear}
                    onValueChange={(v) => {
                      set("birthYear", v)
                      setErrors((prev) => ({ ...prev, birthYear: undefined }))
                    }}
                  >
                    <SelectTrigger
                      id="okvirna-godina"
                      className="h-11 w-full md:h-9"
                      aria-invalid={!!errors.birthYear}
                      aria-describedby={errors.birthYear ? "godina-greska" : undefined}
                    >
                      <SelectValue placeholder={t.birthYearPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {birthYears().map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id="godina-greska" message={errors.birthYear} />
                </div>
              )}
            </div>
          </fieldset>
        </Card>

        {/* Izgled */}
        <Card className="gap-4 p-4 md:p-6">
          <h2 className="font-heading text-lg font-bold">{t.appearance}</h2>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="boja">{t.colour}</Label>
            <Input
              id="boja"
              className="h-11 md:h-9"
              value={form.color}
              maxLength={100}
              onChange={(e) => set("color", e.target.value)}
              placeholder={t.colourPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fotografija">{t.photo}</Label>
            <div className="flex min-w-0 flex-col gap-4 rounded-sm border border-dashed border-border p-4 sm:flex-row sm:items-center">
              <span className="flex size-20 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">{photoName || t.noPhoto}</p>
                <p className="text-sm text-muted-foreground">{t.photoHint}</p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept={PHOTO_TYPES}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                data-testid="pet-photo-input"
                onChange={(e) => {
                  setPhotoFile(e.target.files?.[0] ?? null)
                  e.target.value = ""
                }}
              />
              {/* "Ukloni fotografiju" only clears a photo not uploaded yet; a saved photo can be replaced (owner decision, Step 13). */}
              <Button
                id="fotografija"
                type="button"
                variant="outline"
                className="h-11 md:h-9"
                onClick={() => (photoFile ? setPhotoFile(null) : fileInput.current?.click())}
              >
                <Upload className="size-4" aria-hidden />
                {photoFile ? t.removePhoto : t.choosePhoto}
              </Button>
            </div>
          </div>
        </Card>

        {/* Identifikacija */}
        <Card className="gap-4 p-4 md:p-6">
          <h2 className="font-heading text-lg font-bold">{t.identification}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="mikrocip">{t.microchip}</Label>
              <Input
                id="mikrocip"
                inputMode="numeric"
                className="h-11 md:h-9"
                value={form.microchip}
                maxLength={100}
                onChange={(e) => set("microchip", e.target.value)}
                placeholder={t.microchipPlaceholder}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pasos">{t.passport}</Label>
              <Input
                id="pasos"
                className="h-11 md:h-9"
                value={form.passport}
                maxLength={100}
                onChange={(e) => set("passport", e.target.value)}
              />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.neutered}</legend>
            <RadioGroup
              value={form.neutered}
              onValueChange={(v) => set("neutered", v as NeuteredValue)}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ster-da" value="yes" />
                <Label htmlFor="ster-da">{t.yes}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ster-ne" value="no" />
                <Label htmlFor="ster-ne">{t.no}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ster-nz" value="unknown" />
                <Label htmlFor="ster-nz">{t.unknown}</Label>
              </div>
            </RadioGroup>
          </fieldset>
        </Card>

        {/* Moj veterinar */}
        <Card className="gap-4 p-4 md:p-6">
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-bold">{t.vet}</h2>
            <p className="text-sm text-muted-foreground">{t.vetHint}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="vet-ime">{t.vetName}</Label>
              <Input
                id="vet-ime"
                className="h-11 md:h-9"
                value={form.vetName}
                maxLength={100}
                onChange={(e) => set("vetName", e.target.value)}
                placeholder={t.vetNamePlaceholder}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="vet-telefon">{t.vetPhone}</Label>
              <Input
                id="vet-telefon"
                type="tel"
                className="h-11 md:h-9"
                value={form.vetPhone}
                maxLength={30}
                onChange={(e) => set("vetPhone", e.target.value)}
                placeholder={t.vetPhonePlaceholder}
              />
            </div>
          </div>
        </Card>

        {/* Jedinica težine + napomena */}
        <Card className="gap-4 p-4 md:p-6">
          <h2 className="font-heading text-lg font-bold">{t.other}</h2>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.weightUnit}</legend>
            <RadioGroup
              value={form.weightUnit}
              onValueChange={(v) => set("weightUnit", v as WeightUnit)}
              className="flex flex-wrap gap-4"
              aria-describedby="jedinica-pomoc"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="jed-kg" value="kg" />
                <Label htmlFor="jed-kg">{t.kg}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="jed-g" value="g" />
                <Label htmlFor="jed-g">{t.g}</Label>
              </div>
            </RadioGroup>
            <p id="jedinica-pomoc" className="text-sm text-muted-foreground">
              {t.weightUnitHint}
            </p>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="napomena">{t.note}</Label>
            <Textarea
              id="napomena"
              value={form.note}
              maxLength={2000}
              onChange={(e) => set("note", e.target.value)}
              placeholder={t.notePlaceholder}
            />
          </div>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild type="button" variant="outline" className="h-11 md:h-9">
            <Link href={backHref}>{t.cancel}</Link>
          </Button>
          <Button type="submit" className="h-11 md:h-9" disabled={pending}>
            {isEdit ? t.saveEdit : t.saveNew}
          </Button>
        </div>
      </form>
    </div>
  )
}
