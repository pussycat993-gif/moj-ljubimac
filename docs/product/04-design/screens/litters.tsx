"use client"

import { useState } from "react"
import Link from "next/link"
import { Baby, CalendarDays, ChevronDown, Plus } from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { PetAvatar } from "../components/pet-avatar"
import { StateSwitcher } from "../components/state-switcher"

type ViewState = "default" | "empty"
type OffspringStatus = "Dostupno" | "Rezervisano" | "Prodato"

type Offspring = { id: string; name: string; sex: "Ženka" | "Mužjak"; status: OffspringStatus; price: string }
type Litter = {
  id: string
  mother: string
  father: string
  breed: string
  birthDate: string
  offspring: Offspring[]
}

const initialLitters: Litter[] = [
  {
    id: "l1",
    mother: "Bela",
    father: "Rex (spoljni pastuv)",
    breed: "Zlatni retriver",
    birthDate: "15. 08. 2026.",
    offspring: [
      { id: "o1", name: "Zlatko", sex: "Mužjak", status: "Dostupno", price: "120.000 RSD" },
      { id: "o2", name: "Mila", sex: "Ženka", status: "Rezervisano", price: "130.000 RSD" },
      { id: "o3", name: "Bruno", sex: "Mužjak", status: "Prodato", price: "120.000 RSD" },
      { id: "o4", name: "Lola", sex: "Ženka", status: "Dostupno", price: "130.000 RSD" },
      { id: "o5", name: "Feđa", sex: "Mužjak", status: "Dostupno", price: "120.000 RSD" },
    ],
  },
  {
    id: "l2",
    mother: "Daša",
    father: "Ares",
    breed: "Zlatni retriver",
    birthDate: "02. 03. 2026.",
    offspring: [
      { id: "o6", name: "Nala", sex: "Ženka", status: "Prodato", price: "125.000 RSD" },
      { id: "o7", name: "Čarli", sex: "Mužjak", status: "Prodato", price: "115.000 RSD" },
      { id: "o8", name: "Biba", sex: "Ženka", status: "Prodato", price: "125.000 RSD" },
    ],
  },
]

const mothers = ["Bela", "Daša", "Kira"]

function formatDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}. ${mm}. ${d.getFullYear()}.`
}

function OffspringBadge({ status }: { status: OffspringStatus }) {
  return (
    <Badge variant={status === "Dostupno" ? "default" : "outline"} className={cn(status !== "Dostupno" && "bg-card")}>
      {status}
    </Badge>
  )
}

function NewLitterDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (l: Litter) => void
}) {
  const [mother, setMother] = useState("")
  const [father, setFather] = useState("")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [count, setCount] = useState("4")
  const [submitted, setSubmitted] = useState(false)

  const motherError = submitted && !mother ? "Izaberi majku." : ""
  const dateError = submitted && !date ? "Izaberi datum okota." : ""

  function save() {
    setSubmitted(true)
    if (!mother || !date) return
    const n = Math.max(0, Math.min(20, Number(count) || 0))
    onSave({
      id: `l${Date.now()}`,
      mother,
      father: father || "—",
      breed: "Zlatni retriver",
      birthDate: formatDate(date),
      offspring: Array.from({ length: n }, (_, i) => ({
        id: `new-${i}`,
        name: `Mladunče ${i + 1}`,
        sex: i % 2 === 0 ? "Ženka" : "Mužjak",
        status: "Dostupno",
        price: "—",
      })),
    })
    setMother("")
    setFather("")
    setDate(undefined)
    setCount("4")
    setSubmitted(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo leglo</DialogTitle>
          <DialogDescription>Napravićemo karton za svako mladunče, povezan sa leglom.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="litter-mother">Majka *</Label>
            <Select value={mother} onValueChange={setMother}>
              <SelectTrigger id="litter-mother" className="w-full" aria-invalid={motherError ? true : undefined}>
                <SelectValue placeholder="Izaberi ženku iz odgajivačnice" />
              </SelectTrigger>
              <SelectContent>
                {mothers.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {motherError && <p className="text-sm text-destructive">{motherError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="litter-father">Otac</Label>
            <Input
              id="litter-father"
              value={father}
              onChange={(e) => setFather(e.target.value)}
              placeholder="Ime ili pedigre oca"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="litter-date">Datum okota *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="litter-date"
                    variant="outline"
                    className={cn("h-11 w-full justify-start font-normal md:h-9", !date && "text-muted-foreground")}
                    aria-invalid={dateError ? true : undefined}
                  >
                    <CalendarDays className="size-4" aria-hidden />
                    {date ? formatDate(date) : "Izaberi datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} />
                </PopoverContent>
              </Popover>
              {dateError && <p className="text-sm text-destructive">{dateError}</p>}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="litter-count">Broj mladunaca</Label>
              <Input
                id="litter-count"
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          <Button className="h-11 md:h-9" onClick={save}>
            Sačuvaj leglo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function LittersScreen() {
  const [view, setView] = useState<ViewState>("default")
  const [litters, setLitters] = useState<Litter[]>(initialLitters)
  const [expanded, setExpanded] = useState<string[]>(["l1"])
  const [dialogOpen, setDialogOpen] = useState(false)

  const list = view === "empty" ? [] : litters

  function toggle(id: string) {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function setStatus(litterId: string, offspringId: string, status: OffspringStatus) {
    setLitters((prev) =>
      prev.map((l) =>
        l.id === litterId
          ? { ...l, offspring: l.offspring.map((o) => (o.id === offspringId ? { ...o, status } : o)) }
          : l,
      ),
    )
  }

  return (
    <AppShell variant="organisation" orgType="breeder" active="legla">
      <StateSwitcher
        states={[
          { value: "default", label: "Podrazumevano" },
          { value: "empty", label: "Prazno" },
        ]}
        value={view}
        onChange={setView}
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">Odgajivačnica „Zlatna šapa“, Bečej</p>
            <h1 className="font-heading text-[28px] leading-9 font-bold">Legla</h1>
          </div>
          {list.length > 0 && (
            <Button className="h-11 md:h-9" onClick={() => setDialogOpen(true)}>
              <Plus className="size-5" aria-hidden />
              Novo leglo
            </Button>
          )}
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={Baby}
            title="Još nema legla"
            description="Upiši prvo leglo i svako mladunče dobija svoj karton od rođenja."
            action="Novo leglo"
            onAction={() => setDialogOpen(true)}
          />
        ) : (
          <div className="space-y-4">
            {list.map((l) => {
              const isOpen = expanded.includes(l.id)
              const available = l.offspring.filter((o) => o.status === "Dostupno").length
              const panelId = `litter-panel-${l.id}`
              return (
                <Card key={l.id} className="gap-0 p-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(l.id)}
                    className="flex w-full items-center gap-3 rounded-md p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:p-6"
                  >
                    <PetAvatar name={l.mother} species="dog" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-heading text-lg font-bold">
                        {l.mother} × {l.father}
                      </h2>
                      <p className="truncate text-sm text-muted-foreground">
                        {l.breed} · okot {l.birthDate}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {l.offspring.length} mladunaca · {available} dostupno
                      </p>
                    </div>
                    <ChevronDown
                      className={cn("size-5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                      aria-hidden
                    />
                  </button>

                  {isOpen && (
                    <div id={panelId} className="space-y-2 border-t border-border p-4 md:p-6">
                      {l.offspring.length === 0 && (
                        <p className="text-sm text-muted-foreground">Mladunci još nisu upisani.</p>
                      )}
                      {l.offspring.map((o) => (
                        <div
                          key={o.id}
                          className="flex flex-col gap-3 rounded-sm bg-foreground/5 p-3 md:flex-row md:items-center"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <PetAvatar name={o.name} species="dog" size="sm" />
                            <div className="min-w-0">
                              <Link href="/ljubimci/1" className="block truncate text-sm font-medium hover:underline">
                                {o.name}
                              </Link>
                              <p className="truncate text-xs text-muted-foreground">
                                {o.sex} · {o.price}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <OffspringBadge status={o.status} />
                            <Label htmlFor={`status-${o.id}`} className="sr-only">
                              Status za {o.name}
                            </Label>
                            <Select value={o.status} onValueChange={(v) => setStatus(l.id, o.id, v as OffspringStatus)}>
                              <SelectTrigger id={`status-${o.id}`} size="sm" className="min-w-0 bg-card">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Dostupno">Dostupno</SelectItem>
                                <SelectItem value="Rezervisano">Rezervisano</SelectItem>
                                <SelectItem value="Prodato">Prodato</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <NewLitterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={(l) => {
          setLitters((prev) => [l, ...prev])
          setExpanded((prev) => [...prev, l.id])
          if (view === "empty") setView("default")
        }}
      />
    </AppShell>
  )
}
