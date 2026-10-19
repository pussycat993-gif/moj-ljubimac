"use client"

import { useState } from "react"
import Link from "next/link"
import { Archive, ArrowRight, PawPrint, Plus, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { PetAvatar, type PetSex, type PetSpecies } from "../components/pet-avatar"
import { PremiumLock } from "../components/premium-lock"
import { ReminderRow, type ReminderRowData } from "../components/reminder-row"
import { ReminderTypeIcon, type ReminderType } from "../components/reminder-type-icon"
import { StateSwitcher } from "../components/state-switcher"
import { StatusBadge, type Status } from "../components/status-badge"

type ViewState = "D" | "L" | "E" | "G"

const states: { value: ViewState; label: string }[] = [
  { value: "D", label: "Podrazumevano" },
  { value: "L", label: "Učitavanje" },
  { value: "E", label: "Prazno" },
  { value: "G", label: "Premium zaključano" },
]

type PetCardData = {
  id: string
  name: string
  sex: PetSex
  species: PetSpecies
  breed: string
  age: string
  weight: string
  updated: string
  next: { type: ReminderType; title: string; when: string; status?: Status }
}

const luna: PetCardData = {
  id: "luna",
  name: "Luna",
  sex: "female",
  species: "cat",
  breed: "Britanska kratkodlaka",
  age: "3 godine",
  weight: "4,2 kg",
  updated: "pre 2 dana",
  next: { type: "treatment_dose", title: "Kapi za oči", when: "Danas · 20:00", status: "today" },
}

const maks: PetCardData = {
  id: "maks",
  name: "Maks",
  sex: "male",
  species: "dog",
  breed: "Zlatni retriver",
  age: "5 godina",
  weight: "31,8 kg",
  updated: "juče",
  next: { type: "vaccination", title: "Godišnja vakcina", when: "4. 11. 2026." },
}

const kiki: PetCardData = {
  id: "kiki",
  name: "Kiki",
  sex: "female",
  species: "rabbit",
  breed: "Holandski patuljasti",
  age: "2 godine",
  weight: "1,9 kg",
  updated: "pre 5 dana",
  next: { type: "vet_follow_up", title: "Kontrola zuba kod „Dr Vet”", when: "23. 10. 2026. · 17:30", status: "soon" },
}

const initialToday: ReminderRowData[] = [
  {
    id: "r1",
    title: "Kapi za oči",
    when: "20:00",
    status: "today",
    type: "treatment_dose",
    channels: ["push", "email"],
    pet: { name: "Luna", sex: "female" },
  },
  {
    id: "r2",
    title: "Tableta protiv krpelja",
    when: "18:00",
    status: "soon",
    type: "treatment_dose",
    channels: ["push"],
    pet: { name: "Maks", sex: "male" },
  },
  {
    id: "r3",
    title: "Kupi hranu u Pet shopu „Šapica”",
    when: "17:00",
    status: "today",
    type: "manual",
    channels: ["email"],
  },
]

// Case- and diacritic-insensitive match (č ć š ž → c c s z; đ → d does not decompose, so map it).
function normalize(value: string) {
  return value
    .toLocaleLowerCase("sr-Latn")
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

function TodayCard({ reminder, onDone }: { reminder: ReminderRowData; onDone: (id: string) => void }) {
  return (
    <Card className="min-w-0 gap-3 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <ReminderTypeIcon type={reminder.type} sex={reminder.pet?.sex} forMe={!reminder.pet} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{reminder.title}</p>
          <p className="truncate text-xs font-medium text-muted-foreground">
            {reminder.pet ? reminder.pet.name : "Za mene"} · {reminder.when}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <StatusBadge status={reminder.status} />
        {reminder.status !== "done" && (
          <Button size="sm" variant="outline" onClick={() => onDone(reminder.id)}>
            Urađeno
          </Button>
        )}
      </div>
    </Card>
  )
}

function PetCard({ pet }: { pet: PetCardData }) {
  return (
    <Card data-pet-sex={pet.sex} className="h-full min-w-0 gap-0 overflow-hidden py-0">
      <div className="relative flex min-w-0 items-center gap-4 bg-pet-accent-soft p-4 md:p-6">
        <PetAvatar name={pet.name} sex={pet.sex} species={pet.species} size="lg" onSoft />
        <div className="min-w-0 flex-1 pr-12">
          <h3 className="truncate font-heading text-[22px] leading-7 font-bold text-pet-accent">{pet.name}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{pet.breed}</p>
        </div>
        <span className="absolute top-4 right-4 rounded-full bg-card px-3 py-1 text-xs font-medium text-pet-accent">
          {pet.sex === "female" ? "Ženka" : "Mužjak"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Starost</dt>
            <dd className="font-medium">{pet.age}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Težina</dt>
            <dd className="font-medium">{pet.weight}</dd>
          </div>
        </dl>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sledeći podsetnik</p>
          <div className="flex min-w-0 items-center gap-3 rounded-sm bg-foreground/5 p-3">
            <ReminderTypeIcon type={pet.next.type} sex={pet.sex} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{pet.next.title}</p>
              <p className="truncate text-xs font-medium text-muted-foreground">{pet.next.when}</p>
            </div>
            {pet.next.status && <StatusBadge status={pet.next.status} className="shrink-0" />}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
          <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">Karton ažuriran {pet.updated}</p>
          <Link
            href={`/ljubimci/${pet.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Otvori karton
            <span className="sr-only">: {pet.name}</span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </Card>
  )
}

function LoadingView() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Učitavanje ljubimaca">
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

export default function PetsHomeScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [today, setToday] = useState<ReminderRowData[]>(initialToday)
  const [statusMessage, setStatusMessage] = useState("")
  const [query, setQuery] = useState("")

  const isFree = view === "G"
  const pets = isFree ? [luna] : [luna, maks, kiki]
  const visibleToday = (isFree ? today.filter((r) => r.pet?.name !== "Maks") : today).slice(0, 3)
  const filteredPets = query.trim() ? pets.filter((p) => normalize(p.name).includes(normalize(query))) : pets

  function markDone(id: string) {
    setToday((list) => list.map((r) => (r.id === id ? { ...r, status: "done" } : r)))
    const done = today.find((r) => r.id === id)
    setStatusMessage(done ? `Označeno kao urađeno: ${done.title}` : "")
  }

  const addHref = isFree ? "#premium-lock" : "/ljubimci/novi"
  const showContent = view === "D" || view === "G"

  return (
    <AppShell variant="owner" active="ljubimci" counts={{ podsetnici: 3 }}>
      <StateSwitcher states={states} value={view} onChange={setView} />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-9 font-bold">Moji ljubimci</h1>
            <p className="text-sm text-muted-foreground">
              {view === "E" ? "Ovde će biti kartoni tvojih ljubimaca." : "Zdravlje, podsetnici i uspomene na jednom mestu."}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {showContent && (
              <div className="relative min-w-0 sm:w-64">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pretraži ljubimce…"
                  aria-label="Pretraži ljubimce po imenu"
                  className="h-11 pl-8 md:h-9"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="h-11 md:h-9">
                <Link href="/uspomene">
                  <Archive className="size-5" aria-hidden />
                  Uspomene
                </Link>
              </Button>
              {view !== "L" && (
                <Button asChild className="h-11 md:h-9">
                  <Link href={addHref}>
                    <Plus className="size-5" aria-hidden />
                    Dodaj ljubimca
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        {view === "L" && <LoadingView />}

        {view === "E" && (
          <EmptyState
            icon={PawPrint}
            title="Dodaj svog prvog ljubimca"
            description="Napravi karton i podsetićemo te na vakcine, terapije i rođendane."
            action="Dodaj ljubimca"
            href="/ljubimci/novi"
          />
        )}

        {showContent && (
          <>
            <section aria-labelledby="danas-naslov" className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                  <h2 id="danas-naslov" className="font-heading text-[22px] leading-7 font-bold">
                    Danas
                  </h2>
                  <span className="text-sm text-muted-foreground">· Ponedeljak, 19. oktobar</span>
                </div>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span>{visibleToday.length} podsetnika ·</span>
                  <Link
                    href="/podsetnici"
                    className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Pogledaj sve
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </p>
              </div>

              {/* Computers: up to 3 cards in a row */}
              <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-3">
                {visibleToday.map((r) => (
                  <TodayCard key={r.id} reminder={r} onDone={markDone} />
                ))}
              </div>

              {/* Phones: stacked list */}
              <Card className="gap-2 p-4 md:hidden">
                {visibleToday.map((r) => (
                  <ReminderRow key={r.id} reminder={r} onDone={markDone} />
                ))}
              </Card>

              <p role="status" className="text-sm text-muted-foreground empty:hidden">
                {statusMessage}
              </p>
            </section>

            <section aria-labelledby="aktivni-naslov" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="aktivni-naslov" className="font-heading text-[22px] leading-7 font-bold">
                  Svi ljubimci <span className="text-sm font-medium text-muted-foreground">({pets.length})</span>
                </h2>
                {isFree ? (
                  <Badge variant="secondary">Free · 1 / 1 aktivan ljubimac</Badge>
                ) : (
                  <StatusBadge status="premium" />
                )}
              </div>

              {filteredPets.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredPets.map((p) => (
                    <PetCard key={p.id} pet={p} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Search}
                  title={`Nema ljubimca sa imenom „${query.trim()}“`}
                  description="Proveri kako je ime napisano ili obriši pretragu."
                  action="Obriši pretragu"
                  onAction={() => setQuery("")}
                />
              )}
            </section>

            {isFree && (
              <section id="premium-lock" aria-label="Dodavanje drugog ljubimca">
                <PremiumLock description="Na Free planu imaš jednog aktivnog ljubimca. Premium otključava neograničen broj ljubimaca, PDF karton i deljenje sa domaćinstvom.">
                  <Card className="gap-4 p-6">
                    <div className="flex items-center gap-4">
                      <PetAvatar name="Maks" sex="male" species="dog" size="lg" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="font-heading text-lg font-bold">Novi ljubimac</p>
                        <p className="text-sm text-muted-foreground">Ime, vrsta, rasa, pol, datum rođenja</p>
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
          </>
        )}
      </div>
    </AppShell>
  )
}
