"use client"

// S27 — Nova terapija · /ljubimci/[id]/terapije/nova · FR-06 (dose reminders via FR-20)

import { useState, type FormEvent } from "react"
import Link from "next/link"
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
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { ErrorState } from "../components/error-state"
import { PetAvatar } from "../components/pet-avatar"
import { StateSwitcher } from "../components/state-switcher"

type ViewState = "D" | "X"

const states: { value: ViewState; label: string }[] = [
  { value: "D", label: "Podrazumevano" },
  { value: "X", label: "Greška" },
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

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function hoursLabel(n: number) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return "sat"
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "sata"
  return "sati"
}

function daysLabel(n: number) {
  return n % 10 === 1 && n % 100 !== 11 ? "dan" : "dana"
}

function DateField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  value?: Date
  onChange: (d?: Date) => void
  error?: string
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
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-greska` : undefined}
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
      {error && (
        <p id={`${id}-greska`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

type TreatmentType = "lek" | "dehelmintizacija" | "buve-krpelji" | "ostalo"

const typeOptions: { value: TreatmentType; label: string }[] = [
  { value: "lek", label: "Lek" },
  { value: "dehelmintizacija", label: "Dehelmintizacija" },
  { value: "buve-krpelji", label: "Zaštita od buva i krpelja" },
  { value: "ostalo", label: "Ostalo" },
]

type FreqUnit = "sati" | "dani"
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

const defaultForm: FormData = {
  type: "lek",
  name: "",
  dose: "",
  every: "12",
  unit: "sati",
  start: new Date(2026, 9, 19),
  endMode: "duration",
  end: undefined,
  duration: "7",
  note: "",
}

const errorForm: FormData = {
  type: "",
  name: "",
  dose: "½ tablete",
  every: "0",
  unit: "sati",
  start: new Date(2026, 9, 19),
  endMode: "date",
  end: new Date(2026, 9, 12),
  duration: "",
  note: "",
}

function validate(f: FormData): Errors {
  const e: Errors = {}
  if (!f.type) e.type = "Izaberi vrstu terapije."
  if (!f.name.trim()) e.name = "Upiši naziv leka ili preparata."
  if (f.every.trim() && !(Number.isInteger(Number(f.every)) && Number(f.every) > 0))
    e.every = "Upiši ceo broj veći od nule, npr. 12."
  if (!f.start) e.start = "Izaberi datum početka."
  if (f.endMode === "date" && f.start && f.end && f.end < f.start)
    e.end = "Datum završetka ne može biti pre datuma početka."
  if (f.endMode === "duration" && f.duration.trim() && !(Number.isInteger(Number(f.duration)) && Number(f.duration) > 0))
    e.duration = "Upiši broj dana veći od nule."
  return e
}

function scheduleSummary(f: FormData): string {
  const every = Number(f.every)
  if (!f.start || !f.every.trim() || !(every > 0)) return ""
  const freq = f.unit === "sati" ? `na svakih ${every} ${hoursLabel(every)}` : every === 1 ? "svaki dan" : `na svakih ${every} dana`
  let end: Date | undefined
  if (f.endMode === "date") end = f.end
  else if (Number(f.duration) > 0) end = addDays(f.start, Number(f.duration) - 1)
  if (!end) return `Podsetnik ${freq}, od ${formatDate(f.start)} dok ne završiš terapiju.`
  return `Podsetnik ${freq}, od ${formatDate(f.start)} do ${formatDate(end)}.`
}

export default function TreatmentFormScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [form, setForm] = useState<FormData>(defaultForm)
  const [errors, setErrors] = useState<Errors>({})
  const [saveFailed, setSaveFailed] = useState(false)
  const [saved, setSaved] = useState("")

  function changeView(v: ViewState) {
    setView(v)
    setSaved("")
    if (v === "D") {
      setForm(defaultForm)
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

  function clearError(key: keyof Errors) {
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form)
    setErrors(e)
    if (Object.values(e).some(Boolean)) {
      setSaved("")
      return
    }
    setSaveFailed(false)
    const summary = scheduleSummary(form)
    setSaved(summary ? `Terapija sačuvana. ${summary}` : "Terapija sačuvana.")
  }

  const summary = scheduleSummary(form)
  const everyNum = Number(form.every)

  return (
    <AppShell variant="owner" active="ljubimci">
      <StateSwitcher states={states} value={view} onChange={changeView} />

      <div data-pet-sex="female" className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-2">
            <Link href="/ljubimci/luna">
              <ArrowLeft className="size-4" aria-hidden />
              Nazad na karton
            </Link>
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <PetAvatar name="Luna" sex="female" species="cat" size="md" ring />
            <div className="min-w-0">
              <h1 className="font-heading text-[28px] leading-9 font-bold">Nova terapija</h1>
              <p className="truncate text-sm text-pet-accent">Luna · Mačka · Britanska kratkodlaka</p>
            </div>
          </div>
        </div>

        {saveFailed && (
          <ErrorState
            message="Nismo uspeli da sačuvamo terapiju. Proveri označena polja i pokušaj ponovo."
            onRetry={() => setSaveFailed(false)}
          />
        )}

        <form noValidate onSubmit={submit} className="space-y-6">
          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">Podaci o terapiji</h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="terapija-vrsta">Vrsta *</Label>
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
                    <SelectValue placeholder="Izaberi vrstu" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
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
                <Label htmlFor="terapija-naziv">Naziv *</Label>
                <Input
                  id="terapija-naziv"
                  className="h-11 md:h-9"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  onBlur={() => setErrors((prev) => ({ ...prev, name: validate(form).name }))}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "terapija-naziv-greska" : undefined}
                  placeholder="npr. Synulox 50 mg"
                />
                {errors.name && (
                  <p id="terapija-naziv-greska" className="text-sm text-destructive">
                    {errors.name}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="terapija-doza">Doza</Label>
              <Input
                id="terapija-doza"
                className="h-11 md:h-9"
                value={form.dose}
                onChange={(e) => set("dose", e.target.value)}
                placeholder="npr. ½ tablete ili 0,5 ml"
              />
            </div>

            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-medium">Učestalost</legend>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 md:max-w-sm">
                <Label htmlFor="terapija-svakih" className="font-normal">
                  Na svakih
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
                  placeholder="12"
                />
                <Select value={form.unit} onValueChange={(v) => set("unit", v as FreqUnit)}>
                  <SelectTrigger id="terapija-jedinica" aria-label="Jedinica učestalosti" className="h-11 w-full md:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sati">{everyNum > 0 ? hoursLabel(everyNum) : "sati"}</SelectItem>
                    <SelectItem value="dani">{everyNum > 0 ? daysLabel(everyNum) : "dana"}</SelectItem>
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
                  Napravićemo podsetnike za svaku dozu.
                </p>
              )}
            </fieldset>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DateField
                id="terapija-pocetak"
                label="Datum početka *"
                value={form.start}
                onChange={(d) => {
                  set("start", d)
                  clearError("start")
                  clearError("end")
                }}
                error={errors.start}
              />

              <fieldset className="min-w-0 space-y-2">
                <legend className="text-sm font-medium">Kraj terapije</legend>
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
                      Trajanje
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="kraj-datum" value="date" />
                    <Label htmlFor="kraj-datum" className="font-normal">
                      Datum završetka
                    </Label>
                  </div>
                </RadioGroup>

                {form.endMode === "duration" ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="terapija-trajanje" className="sr-only">
                        Trajanje u danima
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
                        placeholder="7"
                      />
                      <span className="text-sm text-muted-foreground">
                        {Number(form.duration) > 0 ? daysLabel(Number(form.duration)) : "dana"}
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
                    label="Datum završetka"
                    value={form.end}
                    onChange={(d) => {
                      set("end", d)
                      clearError("end")
                    }}
                    error={errors.end}
                  />
                )}
                <p className="text-xs text-muted-foreground">Ostavi prazno ako terapija traje dok je ne završiš.</p>
              </fieldset>
            </div>

            {summary && !errors.every && !errors.end && !errors.duration && (
              <p className="flex items-start gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
                <Bell className="mt-0.5 size-4 shrink-0 text-pet-accent" aria-hidden />
                <span className="min-w-0">{summary}</span>
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="terapija-napomena">Napomena</Label>
              <Textarea
                id="terapija-napomena"
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="npr. davati uz hranu"
              />
            </div>
          </Card>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild type="button" variant="outline" className="h-11 md:h-9">
              <Link href="/ljubimci/luna">Otkaži</Link>
            </Button>
            <Button type="submit" className="h-11 md:h-9">
              Sačuvaj terapiju
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
