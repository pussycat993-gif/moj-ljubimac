"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Archive, CalendarDays, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { PetAvatar, type PetSpecies } from "../components/pet-avatar"
import { PremiumLock } from "../components/premium-lock"
import { StateSwitcher } from "../components/state-switcher"

type ViewState = "D" | "E" | "G"

const states: { value: ViewState; label: string }[] = [
  { value: "D", label: "Podrazumevano" },
  { value: "E", label: "Prazno" },
  { value: "G", label: "Premium zaključano" },
]

type Memorial = {
  id: string
  name: string
  species: string
  kind: PetSpecies
  years: string
  reason: string
  date: string
  note: string
}

const kiki: Memorial = {
  id: "kiki",
  name: "Kiki",
  species: "Zec · Holandski patuljasti",
  kind: "rabbit",
  years: "2022 – 2026",
  reason: "Izgubljena",
  date: "14. 6. 2026.",
  note: "Pobegla iz dvorišta u Bečeju. Javili smo se Pet shopu „Šapica” i komšijama.",
}

const zuca: Memorial = {
  id: "zuca",
  name: "Žuća",
  species: "Pas · Mešanac",
  kind: "dog",
  years: "2010 – 2025",
  reason: "Preminula",
  date: "3. 2. 2025.",
  note: "Petnaest godina šetnji po Dunavskom parku. Najbolja drugarica.",
}

const mica: Memorial = {
  id: "mica",
  name: "Mica",
  species: "Mačka · Domaća kratkodlaka",
  kind: "cat",
  years: "2019 – 2024",
  reason: "Udomljena kod drugih",
  date: "20. 8. 2024.",
  note: "Živi sa Markom Jovanovićem u Beogradu i šalje pozdrave.",
}

function MemorialCard({
  memorial,
  onRestore,
}: {
  memorial: Memorial
  onRestore: (m: Memorial) => void
}) {
  return (
    <Card className="gap-4 bg-muted p-4 md:p-6">
      <div className="flex min-w-0 items-center gap-4">
        <PetAvatar name={memorial.name} sex="unknown" species={memorial.kind} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-lg font-bold">{memorial.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{memorial.species}</p>
          <p className="text-sm text-muted-foreground">{memorial.years}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{memorial.reason}</Badge>
        <span className="flex items-center gap-1 text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden />
          {memorial.date}
        </span>
      </div>
      <p className="text-sm">{memorial.note}</p>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 bg-card md:h-9" onClick={() => onRestore(memorial)}>
          <RotateCcw className="size-4" aria-hidden />
          Vrati među aktivne
        </Button>
        <Button asChild variant="ghost" className="h-11 md:h-9">
          <Link href={`/ljubimci/${memorial.id}`}>Pogledaj karton</Link>
        </Button>
      </div>
    </Card>
  )
}

export default function MemorialsScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [list, setList] = useState<Memorial[]>([kiki, zuca, mica])
  const [blocked, setBlocked] = useState<Memorial | null>(null)
  const [statusMessage, setStatusMessage] = useState("")

  function changeView(v: ViewState) {
    setView(v)
    setStatusMessage("")
    setList(v === "D" ? [kiki, zuca, mica] : v === "G" ? [kiki, zuca] : [])
    setBlocked(v === "G" ? kiki : null)
  }

  const isFree = view === "G"

  function restore(m: Memorial) {
    if (isFree) {
      // Free: Luna already takes the only active slot (FR-12)
      setBlocked(m)
      setStatusMessage("")
      return
    }
    setList((l) => l.filter((x) => x.id !== m.id))
    setStatusMessage(`${m.name} je ponovo među aktivnim ljubimcima. Podsetnike možeš ponovo da uključiš na kartonu.`)
  }

  return (
    <AppShell variant="owner" active="ljubimci">
      <StateSwitcher states={states} value={view} onChange={changeView} />

      <div className="space-y-6">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-2">
            <Link href="/ljubimci">
              <ArrowLeft className="size-4" aria-hidden />
              Nazad na ljubimce
            </Link>
          </Button>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h1 className="font-heading text-[28px] leading-9 font-bold">Uspomene</h1>
              <p className="text-sm text-muted-foreground">
                Kartoni ljubimaca koji više nisu s tobom. Čuvamo ih dok god imaš nalog.
              </p>
            </div>
            {view !== "E" &&
              (isFree ? (
                <Badge variant="secondary">Free · {list.length} / 2 uspomene</Badge>
              ) : (
                <Badge variant="outline" className="border-primary text-primary">
                  Premium · bez ograničenja
                </Badge>
              ))}
          </div>
        </div>

        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {statusMessage}
        </p>

        {isFree && blocked && (
          <section aria-label="Vraćanje ljubimca među aktivne">
            <PremiumLock
              description={`Na Free planu imaš jednog aktivnog ljubimca, a to mesto zauzima Luna. Uz Premium možeš da vratiš i ovog ljubimca (${blocked.name}).`}
            />
          </section>
        )}

        {view === "E" || list.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="Ovde još nema uspomena"
            description="Kada ljubimac premine, bude udomljen ili se izgubi, njegov karton možeš da sačuvaš ovde."
            action="Nazad na ljubimce"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <MemorialCard key={m.id} memorial={m} onRestore={restore} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
