"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, Bell, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

function DateField({
  id,
  label,
  value,
  onChange,
  helper,
  error,
}: {
  id: string
  label: string
  value?: Date
  onChange: (d?: Date) => void
  helper?: string
  error?: string
}) {
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

const defaultForm: FormData = {
  name: "",
  given: new Date(2026, 9, 19),
  next: undefined,
  clinic: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
  batch: "",
  note: "",
}

const errorForm: FormData = {
  name: "",
  given: new Date(2026, 9, 19),
  next: new Date(2026, 8, 1),
  clinic: "Veterinarska ambulanta „Dr Vet”, Novi Sad",
  batch: "RB-26-1019",
  note: "",
}

function validate(f: FormData): Errors {
  const e: Errors = {}
  if (!f.name.trim()) e.name = "Upiši naziv ili vrstu vakcine."
  if (!f.given) e.given = "Izaberi datum davanja."
  if (f.given && f.next && f.next <= f.given) e.next = "Datum sledeće doze mora biti posle datuma davanja."
  return e
}

export default function VaccinationFormScreen() {
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

  function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form)
    setErrors(e)
    if (Object.keys(e).length > 0) {
      setSaved("")
      return
    }
    setSaveFailed(false)
    setSaved(
      form.next
        ? `Vakcina sačuvana. Podsetićemo te ${formatDate(form.next)} na sledeću dozu.`
        : "Vakcina sačuvana.",
    )
  }

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
              <h1 className="font-heading text-[28px] leading-9 font-bold">Nova vakcina</h1>
              <p className="truncate text-sm text-pet-accent">Luna · Mačka · Britanska kratkodlaka</p>
            </div>
          </div>
        </div>

        {saveFailed && (
          <ErrorState
            message="Nismo uspeli da sačuvamo vakcinu. Proveri označena polja i pokušaj ponovo."
            onRetry={() => setSaveFailed(false)}
          />
        )}

        <form noValidate onSubmit={submit} className="space-y-6">
          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">Podaci o vakcini</h2>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="vakcina-naziv">Naziv ili vrsta vakcine *</Label>
              <Input
                id="vakcina-naziv"
                className="h-11 md:h-9"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => setErrors((prev) => ({ ...prev, name: validate(form).name }))}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "vakcina-naziv-greska" : undefined}
                placeholder="npr. Besnilo — Rabisin"
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
                label="Datum davanja *"
                value={form.given}
                onChange={(d) => {
                  set("given", d)
                  setErrors((prev) => ({ ...prev, given: undefined }))
                }}
                error={errors.given}
              />
              <DateField
                id="vakcina-sledeca"
                label="Datum sledeće doze"
                value={form.next}
                onChange={(d) => {
                  set("next", d)
                  setErrors((prev) => ({ ...prev, next: undefined }))
                }}
                helper="Napravićemo podsetnik."
                error={errors.next}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="vakcina-ambulanta">Veterinar ili ambulanta</Label>
                <Input
                  id="vakcina-ambulanta"
                  className="h-11 md:h-9"
                  value={form.clinic}
                  onChange={(e) => set("clinic", e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="vakcina-serija">Serijski broj</Label>
                <Input
                  id="vakcina-serija"
                  className="h-11 md:h-9"
                  value={form.batch}
                  onChange={(e) => set("batch", e.target.value)}
                  placeholder="sa nalepnice u pasošu"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vakcina-napomena">Napomena</Label>
              <Textarea
                id="vakcina-napomena"
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="npr. bila malo pospana posle vakcine"
              />
            </div>
          </Card>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild type="button" variant="outline" className="h-11 md:h-9">
              <Link href="/ljubimci/luna">Otkaži</Link>
            </Button>
            <Button type="submit" className="h-11 md:h-9">
              Sačuvaj vakcinu
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
