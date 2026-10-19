"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, Check, Trash2 } from "lucide-react"
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
import { AppShell } from "../components/shells"
import { ErrorState } from "../components/error-state"
import { PetAvatar } from "../components/pet-avatar"
import { StateSwitcher } from "../components/state-switcher"

// S11 — Novi / izmeni podsetnik · /podsetnici/novi, /podsetnici/[id] · FR-21
// (BR-18: linked to a pet or only to the user; edit/delete changes future occurrences, history is kept)

type ViewState = "D" | "I" | "X"
type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly"

const pets = [
  { id: "luna", name: "Luna", sex: "female" as const, species: "cat" as const },
  { id: "maks", name: "Maks", sex: "male" as const, species: "dog" as const },
  { id: "kiki", name: "Kiki", sex: "female" as const, species: "rabbit" as const },
]

// Existing manual reminder used by the edit variant.
const existing = {
  title: "Šišanje u salonu „Čupko”",
  forWhom: "maks",
  date: new Date(2026, 10, 8),
  time: "11:00",
  repeat: "monthly" as Repeat,
}

const repeatLabel: Record<Repeat, string> = {
  none: "Ne ponavlja se",
  daily: "Svaki dan",
  weekly: "Svake nedelje",
  monthly: "Svakog meseca",
  yearly: "Svake godine",
}

function formatDate(d: Date) {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`
}

type Errors = { title?: string; date?: string; time?: string }

export default function ReminderFormScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [title, setTitle] = useState("")
  const [forWhom, setForWhom] = useState<string>("me")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [dateOpen, setDateOpen] = useState(false)
  const [time, setTime] = useState("09:00")
  const [repeat, setRepeat] = useState<Repeat>("none")
  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const isEdit = view === "I"

  function changeView(v: ViewState) {
    setView(v)
    setSaved(false)
    setDeleted(false)
    setErrors({})
    if (v === "I") {
      setTitle(existing.title)
      setForWhom(existing.forWhom)
      setDate(existing.date)
      setTime(existing.time)
      setRepeat(existing.repeat)
    } else {
      setTitle("")
      setForWhom("me")
      setDate(undefined)
      setTime("09:00")
      setRepeat("none")
    }
  }

  function validate(): Errors {
    const e: Errors = {}
    if (!title.trim()) e.title = "Upiši naslov podsetnika."
    else if (title.trim().length > 80) e.title = "Naslov može imati najviše 80 znakova."
    if (!date) e.date = "Izaberi datum."
    if (!time) e.time = "Unesi vreme."
    return e
  }

  function submit() {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setSaved(true)
  }

  const selectedPet = pets.find((p) => p.id === forWhom)

  return (
    <AppShell active="podsetnici">
      <StateSwitcher
        states={[
          { value: "D", label: "Novi" },
          { value: "I", label: "Izmena" },
          { value: "X", label: "Greška" },
        ]}
        value={view}
        onChange={changeView}
      />

      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/podsetnici">
              <ArrowLeft className="size-4" aria-hidden />
              Podsetnici
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-9 font-bold">{isEdit ? "Izmeni podsetnik" : "Novi podsetnik"}</h1>
            <p className="text-sm text-muted-foreground">
              {isEdit
                ? "Izmene važe za sledeća ponavljanja. Ono što je već prošlo ostaje u istoriji."
                : "Za sve što vakcine i terapije ne pokrivaju — šišanje, hrana, račun."}
            </p>
          </div>
        </div>

        {view === "X" && <ErrorState message="Podsetnik nije sačuvan. Nešto nije u redu, pokušaj ponovo." onRetry={() => setView("D")} />}

        {deleted && (
          <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
            <Check className="size-5 shrink-0 text-success" aria-hidden />
            <p className="min-w-0 text-sm">
              Podsetnik „{existing.title}“ je obrisan. Sledeća ponavljanja su otkazana, a prošla istorija ostaje.{" "}
              <Link href="/podsetnici" className="font-medium text-primary underline-offset-4 hover:underline">
                Nazad na podsetnike
              </Link>
            </p>
          </Card>
        )}

        {saved && view !== "X" && (
          <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
            <Check className="size-5 shrink-0 text-success" aria-hidden />
            <p className="min-w-0 text-sm">
              {isEdit ? "Izmene su sačuvane" : `Podsetnik „${title.trim()}“ je sačuvan`} za {date ? formatDate(date) : ""} u{" "}
              {time}.
            </p>
          </Card>
        )}

        {!deleted && (
        <Card className="gap-6 p-4 md:p-6">
          <form
            noValidate
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="reminder-title">Naslov *</Label>
              <Input
                id="reminder-title"
                placeholder="npr. Zakaži šišanje u Čupku"
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
              <Label htmlFor="reminder-for">Za koga</Label>
              <Select value={forWhom} onValueChange={setForWhom}>
                <SelectTrigger id="reminder-for" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Samo za mene</SelectItem>
                  <SelectSeparator />
                  {pets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPet ? (
                <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  <PetAvatar name={selectedPet.name} sex={selectedPet.sex} species={selectedPet.species} size="sm" />
                  <span className="min-w-0 truncate">Podsetnik će se videti i u kartonu: {selectedPet.name}.</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Vidiš ga samo ti, nije vezan za ljubimca.</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="reminder-date">Datum *</Label>
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
                      {date ? formatDate(date) : <span className="text-muted-foreground">Izaberi datum</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      defaultMonth={new Date(2026, 9, 19)}
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
                <Label htmlFor="reminder-time">Vreme *</Label>
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
              <Label htmlFor="reminder-repeat">Ponavljanje</Label>
              <Select value={repeat} onValueChange={(v) => setRepeat(v as Repeat)}>
                <SelectTrigger id="reminder-repeat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(repeatLabel) as Repeat[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {repeatLabel[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {repeat === "monthly" && (
                <p className="text-sm text-muted-foreground">Sledeći put stiže tačno mesec dana kasnije.</p>
              )}
            </div>

            <p className="rounded-sm bg-foreground/5 p-3 text-sm text-muted-foreground">
              Kanale i koliko ranije stiže biraš u{" "}
              <Link href="/podesavanja/podsetnici" className="font-medium text-primary underline-offset-4 hover:underline">
                podešavanjima podsetnika
              </Link>{" "}
              (Moji podsetnici).
            </p>

            <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-end">
              {isEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" className="h-11 text-destructive md:mr-auto md:h-9">
                      <Trash2 className="size-4" aria-hidden />
                      Obriši podsetnik
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Obrisati podsetnik „{existing.title}“?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Sledeća ponavljanja više neće stizati. Ono što je već urađeno ostaje u istoriji.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="h-11 md:h-9">Otkaži</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" className="h-11 md:h-9" onClick={() => setDeleted(true)}>
                        Da, obriši
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button asChild type="button" variant="outline" className="h-11 md:h-9">
                <Link href="/podsetnici">Otkaži</Link>
              </Button>
              <Button type="submit" className="h-11 md:h-9">
                {isEdit ? "Sačuvaj izmene" : "Sačuvaj podsetnik"}
              </Button>
            </div>
          </form>
        </Card>
        )}
      </div>
    </AppShell>
  )
}
