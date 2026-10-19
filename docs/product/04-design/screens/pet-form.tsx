"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
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
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { ErrorState } from "../components/error-state"
import { PetAvatar, type PetSex, type PetSpecies } from "../components/pet-avatar"
import { StateSwitcher } from "../components/state-switcher"

const speciesKind: Record<string, PetSpecies> = {
  Pas: "dog",
  Mačka: "cat",
  Zec: "rabbit",
  Ptica: "bird",
  Riba: "fish",
  Kornjača: "turtle",
}

type ViewState = "D" | "I" | "X"

const states: { value: ViewState; label: string }[] = [
  { value: "D", label: "Novi ljubimac" },
  { value: "I", label: "Izmena (Luna)" },
  { value: "X", label: "Greška" },
]

const species = [
  "Pas",
  "Mačka",
  "Zec",
  "Hrčak",
  "Zamorac",
  "Činčila",
  "Tvor",
  "Ptica",
  "Riba",
  "Kornjača",
  "Gušter",
  "Zmija",
  "Ostalo",
]

const monthNames = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "jun",
  "jul",
  "avgust",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
]
const weekdayNames = ["ne", "po", "ut", "sr", "če", "pe", "su"]

function formatDate(d: Date) {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`
}

function DateField({
  id,
  label,
  value,
  onChange,
  helper,
}: {
  id: string
  label: string
  value?: Date
  onChange: (d?: Date) => void
  helper?: string
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-describedby={helper ? `${id}-pomoc` : undefined}
            className={cn("h-11 w-full justify-start font-normal md:h-9", !value && "text-muted-foreground")}
          >
            <CalendarDays className="size-4" aria-hidden />
            {value ? formatDate(value) : "Izaberi datum"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            weekStartsOn={1}
            formatters={{
              formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
              formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
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
  species: string
  speciesOther: string
  breed: string
  sex: PetSex | ""
  birthMode: "date" | "year"
  birthDate?: Date
  birthYear: string
  color: string
  photo: string
  microchip: string
  passport: string
  neutered: "da" | "ne" | "ne-znam"
  vetName: string
  vetPhone: string
  weightUnit: "kg" | "g"
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
  photo: "",
  microchip: "",
  passport: "",
  neutered: "ne-znam",
  vetName: "",
  vetPhone: "",
  weightUnit: "kg",
  note: "",
}

const lunaForm: FormData = {
  name: "Luna",
  species: "Mačka",
  speciesOther: "",
  breed: "Britanska kratkodlaka",
  sex: "female",
  birthMode: "date",
  birthDate: new Date(2023, 3, 12),
  birthYear: "",
  color: "Plavo-siva, bela mrlja na grudima",
  photo: "luna-profil.jpg",
  microchip: "688038000123456",
  passport: "RS-NS-0451-23",
  neutered: "da",
  vetName: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
  vetPhone: "021 456 789",
  weightUnit: "kg",
  note: "Ne voli transporter — staviti ćebe unutra.",
}

const errorForm: FormData = { ...emptyForm, species: "Ostalo", sex: "" }

type Errors = Partial<Record<"name" | "species" | "speciesOther" | "sex" | "birthYear", string>>

function validate(f: FormData): Errors {
  const e: Errors = {}
  if (!f.name.trim()) e.name = "Upiši ime ljubimca."
  if (!f.species) e.species = "Izaberi vrstu."
  if (f.species === "Ostalo" && !f.speciesOther.trim()) e.speciesOther = "Upiši koja je vrsta."
  if (!f.sex) e.sex = "Izaberi pol."
  if (f.birthMode === "year" && f.birthYear && !/^(19|20)\d{2}$/.test(f.birthYear))
    e.birthYear = "Upiši godinu sa četiri cifre, npr. 2021."
  return e
}

export default function PetFormScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [form, setForm] = useState<FormData>(emptyForm)
  const [errors, setErrors] = useState<Errors>({})
  const [saveFailed, setSaveFailed] = useState(false)
  const [saved, setSaved] = useState("")

  function changeView(v: ViewState) {
    setView(v)
    setSaved("")
    if (v === "D") {
      setForm(emptyForm)
      setErrors({})
      setSaveFailed(false)
    } else if (v === "I") {
      setForm(lunaForm)
      setErrors({})
      setSaveFailed(false)
    } else {
      setForm(errorForm)
      setErrors(validate(errorForm))
      setSaveFailed(true)
    }
  }

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function blurCheck(key: keyof Errors) {
    const e = validate(form)
    setErrors((prev) => ({ ...prev, [key]: e[key] }))
  }

  function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form)
    setErrors(e)
    if (Object.keys(e).length > 0) {
      setSaved("")
      return
    }
    setSaveFailed(false)
    setSaved(view === "I" ? `Promene za ${form.name} su sačuvane.` : `${form.name} je sada među tvojim ljubimcima.`)
  }

  const isEdit = view === "I"
  const previewSex: PetSex = form.sex || "unknown"
  const previewName = form.name.trim() || "?"

  return (
    <AppShell variant="owner" active="ljubimci">
      <StateSwitcher states={states} value={view} onChange={changeView} />

      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-2">
            <Link href={isEdit ? "/ljubimci/luna" : "/ljubimci"}>
              <ArrowLeft className="size-4" aria-hidden />
              {isEdit ? "Nazad na karton" : "Nazad na ljubimce"}
            </Link>
          </Button>
          <h1 className="font-heading text-[28px] leading-9 font-bold">
            {isEdit ? "Izmeni profil: Luna" : "Dodaj ljubimca"}
          </h1>
          <p className="text-sm text-muted-foreground">Polja sa zvezdicom (*) su obavezna.</p>
        </div>

        {saveFailed && (
          <ErrorState
            message="Nismo uspeli da sačuvamo ljubimca. Proveri označena polja i pokušaj ponovo."
            onRetry={() => setSaveFailed(false)}
          />
        )}

        <form noValidate onSubmit={submit} className="space-y-6">
          {/* Osnovno */}
          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">Osnovno</h2>

            <div data-pet-sex={previewSex} className="flex min-w-0 items-center gap-3 rounded-sm bg-foreground/5 p-3">
              <PetAvatar name={previewName} sex={previewSex} species={speciesKind[form.species]} size="md" ring />
              <div className="min-w-0">
                <p className="truncate font-heading text-lg font-bold text-pet-accent">
                  {form.name.trim() || "Ime ljubimca"}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  Boja kartona prati pol koji izabereš.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="ime">Ime *</Label>
                <Input
                  id="ime"
                  className="h-11 md:h-9"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  onBlur={() => blurCheck("name")}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "ime-greska" : undefined}
                  placeholder="npr. Luna"
                />
                <FieldError id="ime-greska" message={errors.name} />
              </div>

              <div className="min-w-0 space-y-2">
                <Label htmlFor="vrsta">Vrsta *</Label>
                <Select
                  value={form.species}
                  onValueChange={(v) => {
                    set("species", v)
                    setErrors((prev) => ({ ...prev, species: undefined }))
                  }}
                >
                  <SelectTrigger
                    id="vrsta"
                    className="h-11 w-full md:h-9"
                    aria-invalid={!!errors.species}
                    aria-describedby={errors.species ? "vrsta-greska" : undefined}
                  >
                    <SelectValue placeholder="Izaberi vrstu" />
                  </SelectTrigger>
                  <SelectContent>
                    {species.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id="vrsta-greska" message={errors.species} />
              </div>

              {form.species === "Ostalo" && (
                <div className="min-w-0 space-y-2 md:col-span-2">
                  <Label htmlFor="vrsta-ostalo">Koja vrsta? *</Label>
                  <Input
                    id="vrsta-ostalo"
                    className="h-11 md:h-9"
                    value={form.speciesOther}
                    onChange={(e) => set("speciesOther", e.target.value)}
                    onBlur={() => blurCheck("speciesOther")}
                    aria-invalid={!!errors.speciesOther}
                    aria-describedby={errors.speciesOther ? "vrsta-ostalo-greska" : undefined}
                    placeholder="npr. degu"
                  />
                  <FieldError id="vrsta-ostalo-greska" message={errors.speciesOther} />
                </div>
              )}

              <div className="min-w-0 space-y-2">
                <Label htmlFor="rasa">Rasa</Label>
                <Input
                  id="rasa"
                  className="h-11 md:h-9"
                  value={form.breed}
                  onChange={(e) => set("breed", e.target.value)}
                  placeholder="npr. Britanska kratkodlaka"
                />
              </div>

              <fieldset className="min-w-0 space-y-2">
                <legend className="text-sm font-medium">Pol *</legend>
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
                    <Label htmlFor="pol-zenka">Ženka</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="pol-muzjak" value="male" />
                    <Label htmlFor="pol-muzjak">Mužjak</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="pol-nepoznat" value="unknown" />
                    <Label htmlFor="pol-nepoznat">Ne znam</Label>
                  </div>
                </RadioGroup>
                <FieldError id="pol-greska" message={errors.sex} />
              </fieldset>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Rođendan</legend>
              <RadioGroup
                value={form.birthMode}
                onValueChange={(v) => set("birthMode", v as FormData["birthMode"])}
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="rodj-datum" value="date" />
                  <Label htmlFor="rodj-datum">Znam tačan datum</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="rodj-godina" value="year" />
                  <Label htmlFor="rodj-godina">Znam okvirnu godinu</Label>
                </div>
              </RadioGroup>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {form.birthMode === "date" ? (
                  <DateField
                    id="datum-rodjenja"
                    label="Datum rođenja"
                    value={form.birthDate}
                    onChange={(d) => set("birthDate", d)}
                    helper="Napravićemo podsetnik za rođendan."
                  />
                ) : (
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="okvirna-godina">Okvirna godina rođenja</Label>
                    <Input
                      id="okvirna-godina"
                      inputMode="numeric"
                      className="h-11 md:h-9"
                      value={form.birthYear}
                      onChange={(e) => set("birthYear", e.target.value)}
                      onBlur={() => blurCheck("birthYear")}
                      aria-invalid={!!errors.birthYear}
                      aria-describedby={errors.birthYear ? "godina-greska" : undefined}
                      placeholder="npr. 2021"
                    />
                    <FieldError id="godina-greska" message={errors.birthYear} />
                  </div>
                )}
              </div>
            </fieldset>
          </Card>

          {/* Izgled */}
          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">Izgled</h2>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="boja">Boja i oznake</Label>
              <Input
                id="boja"
                className="h-11 md:h-9"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                placeholder="npr. crn sa belom šapom"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fotografija">Fotografija</Label>
              <div className="flex min-w-0 flex-col gap-4 rounded-sm border border-dashed border-border p-4 sm:flex-row sm:items-center">
                <span className="flex size-20 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                  <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">{form.photo || "Još nema fotografije"}</p>
                  <p className="text-sm text-muted-foreground">JPG ili PNG, do 10 MB.</p>
                </div>
                <Button
                  id="fotografija"
                  type="button"
                  variant="outline"
                  className="h-11 md:h-9"
                  onClick={() => set("photo", form.photo ? "" : `${form.name.trim().toLowerCase() || "ljubimac"}-profil.jpg`)}
                >
                  <Upload className="size-4" aria-hidden />
                  {form.photo ? "Ukloni fotografiju" : "Izaberi fotografiju"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Identifikacija */}
          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">Identifikacija</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="mikrocip">Broj mikročipa</Label>
                <Input
                  id="mikrocip"
                  inputMode="numeric"
                  className="h-11 md:h-9"
                  value={form.microchip}
                  onChange={(e) => set("microchip", e.target.value)}
                  placeholder="15 cifara"
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pasos">Broj pasoša</Label>
                <Input
                  id="pasos"
                  className="h-11 md:h-9"
                  value={form.passport}
                  onChange={(e) => set("passport", e.target.value)}
                />
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Sterilisan/a</legend>
              <RadioGroup
                value={form.neutered}
                onValueChange={(v) => set("neutered", v as FormData["neutered"])}
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="ster-da" value="da" />
                  <Label htmlFor="ster-da">Da</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="ster-ne" value="ne" />
                  <Label htmlFor="ster-ne">Ne</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="ster-nz" value="ne-znam" />
                  <Label htmlFor="ster-nz">Ne znam</Label>
                </div>
              </RadioGroup>
            </fieldset>
          </Card>

          {/* Moj veterinar */}
          <Card className="gap-4 p-4 md:p-6">
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-bold">Moj veterinar</h2>
              <p className="text-sm text-muted-foreground">Prikazujemo ga na kartonu, da ti bude pri ruci.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="vet-ime">Ime veterinara ili ambulante</Label>
                <Input
                  id="vet-ime"
                  className="h-11 md:h-9"
                  value={form.vetName}
                  onChange={(e) => set("vetName", e.target.value)}
                  placeholder="npr. Veterinarska ambulanta „Dr Vet”"
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="vet-telefon">Telefon</Label>
                <Input
                  id="vet-telefon"
                  type="tel"
                  className="h-11 md:h-9"
                  value={form.vetPhone}
                  onChange={(e) => set("vetPhone", e.target.value)}
                  placeholder="npr. 021 456 789"
                />
              </div>
            </div>
          </Card>

          {/* Jedinica težine + napomena */}
          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">Ostalo</h2>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Jedinica težine</legend>
              <RadioGroup
                value={form.weightUnit}
                onValueChange={(v) => set("weightUnit", v as FormData["weightUnit"])}
                className="flex flex-wrap gap-4"
                aria-describedby="jedinica-pomoc"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="jed-kg" value="kg" />
                  <Label htmlFor="jed-kg">Kilogrami (kg)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="jed-g" value="g" />
                  <Label htmlFor="jed-g">Grami (g)</Label>
                </div>
              </RadioGroup>
              <p id="jedinica-pomoc" className="text-sm text-muted-foreground">
                Grami su zgodniji za male životinje, npr. hrčka ili zamorca.
              </p>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="napomena">Napomena</Label>
              <Textarea
                id="napomena"
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="Alergije, navike, bilo šta važno"
              />
            </div>
          </Card>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild type="button" variant="outline" className="h-11 md:h-9">
              <Link href={isEdit ? "/ljubimci/luna" : "/ljubimci"}>Otkaži</Link>
            </Button>
            <Button type="submit" className="h-11 md:h-9">
              {isEdit ? "Sačuvaj promene" : "Sačuvaj ljubimca"}
            </Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground sm:text-right">
            {saved}
          </p>
        </form>
      </div>
    </AppShell>
  )
}
