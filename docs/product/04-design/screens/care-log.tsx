"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, Clock, Droplet, Plus, Utensils, X } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { PetAvatar } from "../components/pet-avatar"
import { StateSwitcher } from "../components/state-switcher"

// S07 — Dnevnik ishrane i stolice · /ljubimci/[id]/dnevnik · FR-14, FR-15, FR-16

type ViewState = "D" | "L" | "E"

type FoodType = "suva" | "vlazna" | "poslastica" | "domaca" | "ostalo"
type Consistency = "normalna" | "meka" | "proliv" | "tvrda"

type FeedingEntry = {
  id: string
  day: string
  time: string
  type: FoodType
  name: string
  grams?: number
  note?: string
  by: string
}

type StoolEntry = {
  id: string
  day: string
  time: string
  consistency: Consistency
  bloodOrMucus: boolean
  note?: string
  by: string
}

const foodTypeLabel: Record<FoodType, string> = {
  suva: "Suva hrana",
  vlazna: "Vlažna hrana",
  poslastica: "Poslastica",
  domaca: "Domaća hrana",
  ostalo: "Ostalo",
}

const consistencyLabel: Record<Consistency, string> = {
  normalna: "Normalna",
  meka: "Meka",
  proliv: "Proliv",
  tvrda: "Tvrda",
}

const pet = { name: "Luna", sex: "female" as const, species: "Mačka · evropska kratkodlaka" }

const initialFeeding: FeedingEntry[] = [
  { id: "f1", day: "19. 10. 2026.", time: "18:00", type: "vlazna", name: "Gourmet Gold, piletina", grams: 85, by: "Ivana" },
  { id: "f2", day: "19. 10. 2026.", time: "13:30", type: "poslastica", name: "Dreamies, losos", grams: 10, by: "Marko" },
  { id: "f3", day: "19. 10. 2026.", time: "08:00", type: "suva", name: "Royal Canin Indoor", grams: 40, by: "Ivana" },
  { id: "f4", day: "18. 10. 2026.", time: "18:05", type: "vlazna", name: "Gourmet Gold, govedina", grams: 85, by: "Ivana" },
  {
    id: "f5",
    day: "18. 10. 2026.",
    time: "08:10",
    type: "suva",
    name: "Royal Canin Indoor",
    grams: 40,
    note: "Ostavila pola porcije.",
    by: "Marko",
  },
]

const initialStool: StoolEntry[] = [
  { id: "s1", day: "19. 10. 2026.", time: "09:15", consistency: "normalna", bloodOrMucus: false, by: "Ivana" },
  {
    id: "s2",
    day: "18. 10. 2026.",
    time: "20:40",
    consistency: "meka",
    bloodOrMucus: false,
    note: "Posle nove konzerve.",
    by: "Marko",
  },
  {
    id: "s3",
    day: "17. 10. 2026.",
    time: "07:50",
    consistency: "proliv",
    bloodOrMucus: true,
    note: "Pratiti, javiti Dr Vet ako se ponovi.",
    by: "Ivana",
  },
]

const weekdays = [
  { key: "pon", label: "Pon", full: "ponedeljak" },
  { key: "uto", label: "Uto", full: "utorak" },
  { key: "sre", label: "Sre", full: "sreda" },
  { key: "cet", label: "Čet", full: "četvrtak" },
  { key: "pet", label: "Pet", full: "petak" },
  { key: "sub", label: "Sub", full: "subota" },
  { key: "ned", label: "Ned", full: "nedelja" },
]

function formatDate(d: Date) {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`
}

function groupByDay<T extends { day: string }>(items: T[]) {
  const groups: { day: string; items: T[] }[] = []
  for (const item of items) {
    const g = groups.find((x) => x.day === item.day)
    if (g) g.items.push(item)
    else groups.push({ day: item.day, items: [item] })
  }
  return groups
}

function dayLabel(day: string) {
  if (day === "19. 10. 2026.") return `Danas, ${day}`
  if (day === "18. 10. 2026.") return `Juče, ${day}`
  return day
}

function DateField({ id, value, onChange }: { id: string; value: Date; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" className="h-11 w-full justify-start font-normal md:h-9">
          <CalendarDays className="size-4" aria-hidden />
          {formatDate(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            if (d) onChange(d)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function LoadingList() {
  return (
    <Card className="gap-4 p-4 md:p-6" aria-busy="true" aria-label="Učitavanje dnevnika">
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

export default function CareLogScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [tab, setTab] = useState<"ishrana" | "stolica">("ishrana")

  const [feeding, setFeeding] = useState<FeedingEntry[]>(initialFeeding)
  const [stool, setStool] = useState<StoolEntry[]>(initialStool)

  // Feeding dialog
  const [feedOpen, setFeedOpen] = useState(false)
  const [feedDate, setFeedDate] = useState<Date>(new Date(2026, 9, 19))
  const [feedTime, setFeedTime] = useState("18:00")
  const [feedType, setFeedType] = useState<FoodType | "">("")
  const [feedName, setFeedName] = useState("")
  const [feedGrams, setFeedGrams] = useState("")
  const [feedNote, setFeedNote] = useState("")
  const [feedErrors, setFeedErrors] = useState<{ time?: string; type?: string; grams?: string }>({})

  // Stool dialog
  const [stoolOpen, setStoolOpen] = useState(false)
  const [stoolDate, setStoolDate] = useState<Date>(new Date(2026, 9, 19))
  const [stoolTime, setStoolTime] = useState("19:30")
  const [stoolConsistency, setStoolConsistency] = useState<Consistency | "">("")
  const [stoolBlood, setStoolBlood] = useState(false)
  const [stoolNote, setStoolNote] = useState("")
  const [stoolErrors, setStoolErrors] = useState<{ time?: string; consistency?: string }>({})

  // Meal reminders (FR-15)
  const [mealTimes, setMealTimes] = useState<string[]>(["08:00", "18:00"])
  const [newMealTime, setNewMealTime] = useState("13:00")
  const [everyDay, setEveryDay] = useState(true)
  const [days, setDays] = useState<string[]>(weekdays.map((d) => d.key))
  const [mealSaved, setMealSaved] = useState(false)

  const shownFeeding = view === "E" ? [] : feeding
  const shownStool = view === "E" ? [] : stool

  function resetFeedForm() {
    setFeedTime("18:00")
    setFeedType("")
    setFeedName("")
    setFeedGrams("")
    setFeedNote("")
    setFeedErrors({})
  }

  function saveFeeding() {
    const errors: typeof feedErrors = {}
    if (!feedTime) errors.time = "Unesi vreme obroka."
    if (!feedType) errors.type = "Izaberi vrstu hrane."
    if (feedGrams && (Number.isNaN(Number(feedGrams)) || Number(feedGrams) <= 0))
      errors.grams = "Količina mora biti broj veći od nule."
    setFeedErrors(errors)
    if (Object.keys(errors).length > 0 || !feedType) return
    setFeeding((prev) => [
      {
        id: `f${Date.now()}`,
        day: formatDate(feedDate),
        time: feedTime,
        type: feedType,
        name: feedName || foodTypeLabel[feedType],
        grams: feedGrams ? Number(feedGrams) : undefined,
        note: feedNote || undefined,
        by: "Ivana",
      },
      ...prev,
    ])
    if (view === "E") setView("D")
    setFeedOpen(false)
    resetFeedForm()
  }

  function resetStoolForm() {
    setStoolTime("19:30")
    setStoolConsistency("")
    setStoolBlood(false)
    setStoolNote("")
    setStoolErrors({})
  }

  function saveStool() {
    const errors: typeof stoolErrors = {}
    if (!stoolTime) errors.time = "Unesi vreme."
    if (!stoolConsistency) errors.consistency = "Izaberi konzistenciju."
    setStoolErrors(errors)
    if (Object.keys(errors).length > 0 || !stoolConsistency) return
    setStool((prev) => [
      {
        id: `s${Date.now()}`,
        day: formatDate(stoolDate),
        time: stoolTime,
        consistency: stoolConsistency,
        bloodOrMucus: stoolBlood,
        note: stoolNote || undefined,
        by: "Ivana",
      },
      ...prev,
    ])
    if (view === "E") setView("D")
    setStoolOpen(false)
    resetStoolForm()
  }

  function toggleDay(key: string) {
    setMealSaved(false)
    setDays((prev) => (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]))
  }

  function addMealTime() {
    if (!newMealTime || mealTimes.includes(newMealTime)) return
    setMealSaved(false)
    setMealTimes((prev) => [...prev, newMealTime].sort())
  }

  return (
    <AppShell active="ljubimci">
      <StateSwitcher
        states={[
          { value: "D", label: "Podrazumevano" },
          { value: "L", label: "Učitavanje" },
          { value: "E", label: "Prazno" },
        ]}
        value={view}
        onChange={setView}
      />

      <div data-pet-sex={pet.sex} className="space-y-6">
        {/* Page header */}
        <div className="space-y-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/ljubimci/luna">
              <ArrowLeft className="size-4" aria-hidden />
              Karton: {pet.name}
            </Link>
          </Button>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <PetAvatar name={pet.name} sex={pet.sex} species="cat" size="md" ring />
              <div className="min-w-0">
                <h1 className="truncate font-heading text-[28px] leading-9 font-bold">Dnevnik ishrane i stolice</h1>
                <p className="truncate text-sm text-muted-foreground">
                  {pet.name} · {pet.species}
                </p>
              </div>
            </div>
            <Button
              className="h-11 md:h-9"
              onClick={() => (tab === "ishrana" ? setFeedOpen(true) : setStoolOpen(true))}
            >
              <Plus className="size-5" aria-hidden />
              {tab === "ishrana" ? "Dodaj obrok" : "Dodaj stolicu"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column */}
          <div className="min-w-0">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "ishrana" | "stolica")}>
              <TabsList variant="line" className="border-b border-border">
                <TabsTrigger value="ishrana" className="after:bg-pet-accent">
                  <Utensils className="size-4" aria-hidden />
                  Ishrana
                </TabsTrigger>
                <TabsTrigger value="stolica" className="after:bg-pet-accent">
                  <Droplet className="size-4" aria-hidden />
                  Stolica
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ishrana" className="mt-4">
                {view === "L" ? (
                  <LoadingList />
                ) : shownFeeding.length === 0 ? (
                  <EmptyState
                    icon={Utensils}
                    title="Još nema unosa ishrane"
                    description={`Zabeleži šta ${pet.name} jede i koliko, pa ćeš lako pratiti ishranu iz dana u dan.`}
                    action="Dodaj obrok"
                    onAction={() => setFeedOpen(true)}
                  />
                ) : (
                  <Card className="gap-6 p-4 md:p-6">
                    {groupByDay(shownFeeding).map((group) => (
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
                                  <p className="min-w-0 truncate text-sm font-medium">{e.name}</p>
                                  <Badge variant="outline">{foodTypeLabel[e.type]}</Badge>
                                </div>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {e.time}
                                  {e.grams ? ` · ${e.grams} g` : ""} · upisao/la {e.by}
                                </p>
                                {e.note && <p className="mt-1 text-sm text-muted-foreground">{e.note}</p>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="stolica" className="mt-4">
                {view === "L" ? (
                  <LoadingList />
                ) : shownStool.length === 0 ? (
                  <EmptyState
                    icon={Droplet}
                    title="Još nema unosa stolice"
                    description="Beleženje stolice pomaže da na vreme primetiš probleme sa varenjem."
                    action="Dodaj stolicu"
                    onAction={() => setStoolOpen(true)}
                  />
                ) : (
                  <Card className="gap-6 p-4 md:p-6">
                    {groupByDay(shownStool).map((group) => (
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
                                  <p className="min-w-0 truncate text-sm font-medium">
                                    {consistencyLabel[e.consistency]}
                                  </p>
                                  {e.bloodOrMucus && (
                                    <span className="text-xs font-medium text-destructive">Krv ili sluz: da</span>
                                  )}
                                </div>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {e.time} · upisao/la {e.by}
                                </p>
                                {e.note && <p className="mt-1 text-sm text-muted-foreground">{e.note}</p>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Aside — meal reminders (FR-15) */}
          <aside className="min-w-0" aria-label="Podsetnici za obroke">
            {view === "L" ? (
              <Card className="gap-4 p-4 md:p-6">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </Card>
            ) : (
              <Card className="gap-4 p-4 md:p-6">
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-bold">Podsetnici za obroke</h2>
                  <p className="text-sm text-muted-foreground">Stižu tačno u zadato vreme.</p>
                </div>

                <ul className="space-y-2" aria-label="Vremena obroka">
                  {mealTimes.map((t) => (
                    <li key={t} className="flex items-center gap-2 rounded-sm bg-foreground/5 py-1 pr-1 pl-3">
                      <Clock className="size-4 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 text-sm font-medium">{t}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Ukloni obrok u ${t}`}
                        onClick={() => {
                          setMealSaved(false)
                          setMealTimes((prev) => prev.filter((x) => x !== t))
                        }}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                  {mealTimes.length === 0 && (
                    <li className="text-sm text-muted-foreground">Nema zadatih obroka.</li>
                  )}
                </ul>

                <div className="space-y-2">
                  <Label htmlFor="meal-new-time">Dodaj vreme obroka</Label>
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
                      Dodaj
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="meal-every-day" className="min-w-0">
                    Svaki dan
                  </Label>
                  <Switch
                    id="meal-every-day"
                    checked={everyDay}
                    onCheckedChange={(v) => {
                      setMealSaved(false)
                      setEveryDay(v)
                      if (v) setDays(weekdays.map((d) => d.key))
                    }}
                  />
                </div>

                {!everyDay && (
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-medium text-muted-foreground">Izabrani dani</legend>
                    <div className="flex flex-wrap gap-2">
                      {weekdays.map((d) => {
                        const on = days.includes(d.key)
                        return (
                          <Button
                            key={d.key}
                            type="button"
                            size="sm"
                            variant={on ? "default" : "outline"}
                            aria-pressed={on}
                            aria-label={d.full}
                            onClick={() => toggleDay(d.key)}
                          >
                            {d.label}
                          </Button>
                        )
                      })}
                    </div>
                    {days.length === 0 && (
                      <p className="text-sm text-destructive">Izaberi bar jedan dan.</p>
                    )}
                  </fieldset>
                )}

                <Button
                  className="h-11 md:h-9"
                  disabled={mealTimes.length === 0 || days.length === 0}
                  onClick={() => setMealSaved(true)}
                >
                  Sačuvaj podsetnike
                </Button>
                {mealSaved && (
                  <p role="status" className="text-sm text-success">
                    Podsetnici za obroke su sačuvani.
                  </p>
                )}
              </Card>
            )}
          </aside>
        </div>
      </div>

      {/* New feeding entry (FR-14) */}
      <Dialog
        open={feedOpen}
        onOpenChange={(o) => {
          setFeedOpen(o)
          if (!o) resetFeedForm()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novi obrok</DialogTitle>
            <DialogDescription>Šta je {pet.name} jela i koliko.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="feed-date">Datum *</Label>
                <DateField id="feed-date" value={feedDate} onChange={setFeedDate} />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="feed-time">Vreme *</Label>
                <Input
                  id="feed-time"
                  type="time"
                  value={feedTime}
                  onChange={(e) => setFeedTime(e.target.value)}
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
              <Label htmlFor="feed-type">Vrsta hrane *</Label>
              <Select
                value={feedType}
                onValueChange={(v) => {
                  setFeedType(v as FoodType)
                  setFeedErrors((e) => ({ ...e, type: undefined }))
                }}
              >
                <SelectTrigger
                  id="feed-type"
                  className="w-full"
                  aria-invalid={!!feedErrors.type}
                  aria-describedby={feedErrors.type ? "feed-type-error" : undefined}
                >
                  <SelectValue placeholder="Izaberi vrstu" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(foodTypeLabel) as FoodType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {foodTypeLabel[k]}
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
                <Label htmlFor="feed-name">Naziv ili brend</Label>
                <Input
                  id="feed-name"
                  placeholder="npr. Royal Canin Indoor"
                  value={feedName}
                  onChange={(e) => setFeedName(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="feed-grams">Količina (g)</Label>
                <Input
                  id="feed-grams"
                  inputMode="numeric"
                  placeholder="npr. 40"
                  value={feedGrams}
                  onChange={(e) => setFeedGrams(e.target.value)}
                  onBlur={() =>
                    setFeedErrors((er) => ({
                      ...er,
                      grams:
                        feedGrams && (Number.isNaN(Number(feedGrams)) || Number(feedGrams) <= 0)
                          ? "Količina mora biti broj veći od nule."
                          : undefined,
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
              <Label htmlFor="feed-note">Napomena</Label>
              <Textarea
                id="feed-note"
                placeholder="npr. Pojela sve za pet minuta."
                value={feedNote}
                onChange={(e) => setFeedNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setFeedOpen(false)}>
              Otkaži
            </Button>
            <Button className="h-11 md:h-9" onClick={saveFeeding}>
              Sačuvaj obrok
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New stool entry (FR-16) */}
      <Dialog
        open={stoolOpen}
        onOpenChange={(o) => {
          setStoolOpen(o)
          if (!o) resetStoolForm()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova stolica</DialogTitle>
            <DialogDescription>Kratak unos pomaže veterinaru ako se nešto promeni.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="stool-date">Datum *</Label>
                <DateField id="stool-date" value={stoolDate} onChange={setStoolDate} />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="stool-time">Vreme *</Label>
                <Input
                  id="stool-time"
                  type="time"
                  value={stoolTime}
                  onChange={(e) => setStoolTime(e.target.value)}
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
              <legend className="text-sm font-medium">Konzistencija *</legend>
              <RadioGroup
                value={stoolConsistency}
                onValueChange={(v) => {
                  setStoolConsistency(v as Consistency)
                  setStoolErrors((e) => ({ ...e, consistency: undefined }))
                }}
                className="grid grid-cols-2 gap-2"
                aria-describedby={stoolErrors.consistency ? "stool-consistency-error" : undefined}
              >
                {(Object.keys(consistencyLabel) as Consistency[]).map((k) => (
                  <Label
                    key={k}
                    htmlFor={`stool-${k}`}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-border px-3",
                      stoolConsistency === k && "border-primary",
                    )}
                  >
                    <RadioGroupItem id={`stool-${k}`} value={k} />
                    {consistencyLabel[k]}
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
                Vidi se krv ili sluz
              </Label>
              <Switch id="stool-blood" checked={stoolBlood} onCheckedChange={setStoolBlood} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stool-note">Napomena</Label>
              <Textarea
                id="stool-note"
                placeholder="npr. Posle promene hrane."
                value={stoolNote}
                onChange={(e) => setStoolNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setStoolOpen(false)}>
              Otkaži
            </Button>
            <Button className="h-11 md:h-9" onClick={saveStool}>
              Sačuvaj unos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
