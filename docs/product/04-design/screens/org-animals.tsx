"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, MoreHorizontal, PawPrint, Plus, Search, UserPlus, Users } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { ErrorState } from "../components/error-state"
import { PetAvatar, type PetSpecies } from "../components/pet-avatar"
import { ReadOnlyBanner } from "../components/read-only-banner"
import { StateSwitcher } from "../components/state-switcher"

type OrgType = "shelter" | "breeder"
type ViewState = "default" | "loading" | "empty" | "error" | "pending"

type Animal = {
  id: string
  name: string
  species: string
  sex: "Ženka" | "Mužjak" | "Nepoznato"
  age: string
  status: string
  since: string
  kind: PetSpecies
  weight: string
  updated: string
}

const shelterStatuses = ["Prijem", "Na brizi", "Za udomljavanje", "Rezervisan", "Udomljen"] as const
const breederStatuses = ["Dostupno", "Rezervisano", "Prodato"] as const

const shelterAnimals: Animal[] = [
  { id: "a1", name: "Luna", species: "Mačka", sex: "Ženka", age: "oko 2 godine", status: "Za udomljavanje", since: "02. 09. 2026.", kind: "cat", weight: "3,6 kg", updated: "pre 2 dana" },
  { id: "a2", name: "Maks", species: "Pas, mešanac", sex: "Mužjak", age: "oko 4 godine", status: "Rezervisan", since: "14. 08. 2026.", kind: "dog", weight: "18,4 kg", updated: "juče" },
  { id: "a3", name: "Kiki", species: "Zec", sex: "Ženka", age: "oko 1 godine", status: "Na brizi", since: "29. 09. 2026.", kind: "rabbit", weight: "1,7 kg", updated: "pre 4 dana" },
  { id: "a4", name: "Žuća", species: "Pas, mešanac", sex: "Ženka", age: "oko 6 meseci", status: "Prijem", since: "18. 10. 2026.", kind: "dog", weight: "6,1 kg", updated: "danas" },
  { id: "a5", name: "Garfild", species: "Mačka", sex: "Mužjak", age: "oko 3 godine", status: "Udomljen", since: "11. 06. 2026.", kind: "cat", weight: "5,2 kg", updated: "pre 3 meseca" },
  { id: "a6", name: "Mrvica", species: "Mačka", sex: "Nepoznato", age: "oko 8 nedelja", status: "Za udomljavanje", since: "07. 10. 2026.", kind: "cat", weight: "850 g", updated: "juče" },
]

const breederAnimals: Animal[] = [
  { id: "b1", name: "Bela", species: "Zlatni retriver", sex: "Ženka", age: "4 godine", status: "Dostupno", since: "Majka", kind: "dog", weight: "29,5 kg", updated: "pre 6 dana" },
  { id: "b2", name: "Zlatko", species: "Zlatni retriver", sex: "Mužjak", age: "9 nedelja", status: "Dostupno", since: "Leglo 15. 08. 2026.", kind: "dog", weight: "5,4 kg", updated: "juče" },
  { id: "b3", name: "Mila", species: "Zlatni retriver", sex: "Ženka", age: "9 nedelja", status: "Rezervisano", since: "Leglo 15. 08. 2026.", kind: "dog", weight: "5,1 kg", updated: "juče" },
  { id: "b4", name: "Bruno", species: "Zlatni retriver", sex: "Mužjak", age: "9 nedelja", status: "Prodato", since: "Leglo 15. 08. 2026.", kind: "dog", weight: "5,6 kg", updated: "pre 2 dana" },
  { id: "b5", name: "Lola", species: "Zlatni retriver", sex: "Ženka", age: "9 nedelja", status: "Dostupno", since: "Leglo 15. 08. 2026.", kind: "dog", weight: "4,9 kg", updated: "juče" },
]

type Member = { id: string; name: string; email: string; role: "Admin" | "Volonter"; joined: string }

const members: Member[] = [
  { id: "m1", name: "Ivana Petrović", email: "ivana.petrovic@primer.rs", role: "Admin", joined: "03. 03. 2026." },
  { id: "m2", name: "Marko Jovanović", email: "marko.jovanovic@primer.rs", role: "Volonter", joined: "12. 05. 2026." },
  { id: "m3", name: "Jelena Nikolić", email: "jelena.nikolic@primer.rs", role: "Volonter", joined: "21. 07. 2026." },
  { id: "m4", name: "Nikola Stanković", email: "nikola.stankovic@primer.rs", role: "Volonter", joined: "02. 10. 2026." },
]

const orgName: Record<OrgType, string> = {
  shelter: "Azil „Druga šansa“, Novi Sad",
  breeder: "Odgajivačnica „Zlatna šapa“, Bečej",
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function AnimalStatusBadge({ status }: { status: string }) {
  const highlighted = status === "Za udomljavanje" || status === "Dostupno"
  return (
    <Badge variant={highlighted ? "default" : "outline"} className={cn(!highlighted && "bg-card")}>
      {status}
    </Badge>
  )
}

function AnimalActions({ name, canEdit }: { name: string; canEdit: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Radnje za ${name}`}>
          <MoreHorizontal className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/ljubimci/1">Otvori karton</Link>
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuItem>Promeni status</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Obriši životinju</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function IntakeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [arrival, setArrival] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [name, setName] = useState("")
  const [date, setDate] = useState("2026-10-19")

  const nameError = submitted && name.trim() === "" ? "Upiši ime ili privremeni nadimak." : ""
  const arrivalError = submitted && arrival === "" ? "Izaberi kako je životinja stigla." : ""
  const dateError = submitted && date === "" ? "Upiši datum prijema." : ""

  function save() {
    setSubmitted(true)
    if (name.trim() && arrival && date) {
      onOpenChange(false)
      setSubmitted(false)
      setName("")
      setArrival("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novi prijem</DialogTitle>
          <DialogDescription>Upiši osnovno sada — karton dopunjavaš kasnije.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="intake-name">Ime ili nadimak *</Label>
            <Input
              id="intake-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "intake-name-error" : undefined}
            />
            {nameError && (
              <p id="intake-name-error" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="intake-species">Vrsta</Label>
              <Select defaultValue="pas">
                <SelectTrigger id="intake-species" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pas">Pas</SelectItem>
                  <SelectItem value="macka">Mačka</SelectItem>
                  <SelectItem value="zec">Zec</SelectItem>
                  <SelectItem value="ostalo">Ostalo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="intake-date">Datum prijema *</Label>
              <Input
                id="intake-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={dateError ? true : undefined}
              />
              {dateError && <p className="text-sm text-destructive">{dateError}</p>}
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Pol</legend>
            <RadioGroup defaultValue="nepoznato" className="flex flex-wrap gap-4">
              {[
                { v: "zenka", l: "Ženka" },
                { v: "muzjak", l: "Mužjak" },
                { v: "nepoznato", l: "Ne znam još" },
              ].map((o) => (
                <div key={o.v} className="flex items-center gap-2">
                  <RadioGroupItem value={o.v} id={`intake-sex-${o.v}`} />
                  <Label htmlFor={`intake-sex-${o.v}`}>{o.l}</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="intake-arrival">Način dolaska *</Label>
            <Select value={arrival} onValueChange={setArrival}>
              <SelectTrigger id="intake-arrival" className="w-full" aria-invalid={arrivalError ? true : undefined}>
                <SelectValue placeholder="Izaberi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pronadjen">Pronađen</SelectItem>
                <SelectItem value="predat">Predat od vlasnika</SelectItem>
                <SelectItem value="oduzet">Oduzet</SelectItem>
                <SelectItem value="drugo">Drugo</SelectItem>
              </SelectContent>
            </Select>
            {arrivalError && <p className="text-sm text-destructive">{arrivalError}</p>}
          </div>
          {arrival === "pronadjen" && (
            <div className="space-y-2">
              <Label htmlFor="intake-place">Mesto pronalaska</Label>
              <Input id="intake-place" placeholder="npr. Liman 3, kod parka" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="intake-note">Napomena</Label>
            <Textarea id="intake-note" placeholder="Stanje pri prijemu, ponašanje, posebne potrebe" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          <Button className="h-11 md:h-9" onClick={save}>
            Sačuvaj prijem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pozovi člana tima</DialogTitle>
          <DialogDescription>Poslaćemo poziv na mejl. Tim može imati najviše 20 članova.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Mejl *</Label>
            <Input id="invite-email" type="email" placeholder="ime.prezime@primer.rs" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Uloga</legend>
            <RadioGroup defaultValue="volonter" className="space-y-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="admin" id="role-admin" />
                <div className="min-w-0">
                  <Label htmlFor="role-admin">Admin</Label>
                  <p className="text-sm text-muted-foreground">Sve, uključujući odluke o zahtevima i tim.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="volonter" id="role-volonter" />
                <div className="min-w-0">
                  <Label htmlFor="role-volonter">Volonter</Label>
                  <p className="text-sm text-muted-foreground">Upisuje zdravlje i negu; ne briše životinje i ne odlučuje.</p>
                </div>
              </div>
            </RadioGroup>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          <Button className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            Pošalji poziv
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Case- and diacritic-insensitive match (č ć š ž → c c s z; đ → d does not decompose, so map it).
function normalize(value: string) {
  return value
    .toLocaleLowerCase("sr-Latn")
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function AnimalCard({ animal, canEdit, originLabel }: { animal: Animal; canEdit: boolean; originLabel: string }) {
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <div className="flex min-w-0 items-center gap-4 bg-pet-accent-soft p-4">
        <PetAvatar name={animal.name} species={animal.kind} size="md" onSoft />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-lg font-bold text-pet-accent">{animal.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{animal.species}</p>
        </div>
        <span className="shrink-0 rounded-full bg-card px-3 py-1 text-xs font-medium text-pet-accent">{animal.sex}</span>
        <AnimalActions name={animal.name} canEdit={canEdit} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Starost</dt>
            <dd className="font-medium">{animal.age}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Težina</dt>
            <dd className="font-medium">{animal.weight}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <AnimalStatusBadge status={animal.status} />
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
            {originLabel}: {animal.since}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
          <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">Karton ažuriran {animal.updated}</p>
          <Link
            href="/ljubimci/1"
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Otvori karton
            <span className="sr-only">: {animal.name}</span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </Card>
  )
}

function LoadingList() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Učitavanje">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="flex-row items-center gap-3 p-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export default function OrgAnimalsScreen() {
  const [orgType, setOrgType] = useState<OrgType>("shelter")
  const [view, setView] = useState<ViewState>("default")
  const [tab, setTab] = useState<"zivotinje" | "tim">("zivotinje")
  const [filter, setFilter] = useState<string>("Sve")
  const [query, setQuery] = useState("")
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const pending = orgType === "shelter" && view === "pending"
  const canEdit = !pending
  const statuses: readonly string[] = orgType === "shelter" ? shelterStatuses : breederStatuses
  const animals = orgType === "shelter" ? shelterAnimals : breederAnimals
  const byStatus = filter === "Sve" ? animals : animals.filter((a) => a.status === filter)
  const visible = query.trim() ? byStatus.filter((a) => normalize(a.name).includes(normalize(query))) : byStatus

  const viewStates: { value: ViewState; label: string }[] = [
    { value: "default", label: "Podrazumevano" },
    { value: "loading", label: "Učitavanje" },
    { value: "empty", label: "Prazno" },
    { value: "error", label: "Greška" },
    ...(orgType === "shelter" ? [{ value: "pending" as ViewState, label: "Čeka odobrenje" }] : []),
  ]

  function changeOrgType(t: OrgType) {
    setOrgType(t)
    setFilter("Sve")
    setQuery("")
    if (t === "breeder" && view === "pending") setView("default")
  }

  return (
    <AppShell variant="organisation" orgType={orgType} active={tab}>
      <StateSwitcher
        states={[
          { value: "shelter", label: "Azil" },
          { value: "breeder", label: "Odgajivačnica" },
        ]}
        value={orgType}
        onChange={changeOrgType}
      />
      <StateSwitcher states={viewStates} value={view} onChange={setView} />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{orgName[orgType]}</p>
            <h1 className="font-heading text-[28px] leading-9 font-bold">
              {tab === "zivotinje" ? "Životinje" : "Tim"}
            </h1>
          </div>
          {canEdit && tab === "zivotinje" && view === "default" && (
            orgType === "shelter" ? (
              <Button className="h-11 md:h-9" onClick={() => setIntakeOpen(true)}>
                <Plus className="size-5" aria-hidden />
                Novi prijem
              </Button>
            ) : (
              <Button asChild className="h-11 md:h-9">
                <Link href="/organizacija/legla">
                  <Plus className="size-5" aria-hidden />
                  Novo leglo
                </Link>
              </Button>
            )
          )}
          {canEdit && tab === "tim" && view === "default" && (
            <Button className="h-11 md:h-9" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-5" aria-hidden />
              Pozovi člana
            </Button>
          )}
        </div>

        {pending && (
          <ReadOnlyBanner reason="Tvoj azil čeka odobrenje. Obično odobravamo u roku od 2 dana — do tada sve možeš samo da pregledaš." />
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as "zivotinje" | "tim")}>
          <TabsList>
            <TabsTrigger value="zivotinje">Životinje</TabsTrigger>
            <TabsTrigger value="tim">Tim</TabsTrigger>
          </TabsList>

          <TabsContent value="zivotinje" className="mt-4 space-y-4">
            {view === "loading" && <LoadingList />}
            {view === "error" && <ErrorState onRetry={() => setView("default")} />}
            {view === "empty" && (
              <EmptyState
                icon={PawPrint}
                title="Još nema životinja"
                description={
                  orgType === "shelter"
                    ? "Upiši prvi prijem i vodi karton od prvog dana."
                    : "Upiši prvo leglo i svako mladunče dobija svoj karton."
                }
                action={orgType === "shelter" ? "Novi prijem" : "Novo leglo"}
                onAction={() => (orgType === "shelter" ? setIntakeOpen(true) : undefined)}
              />
            )}
            {(view === "default" || pending) && (
              <>
                <div className="relative min-w-0 md:max-w-xs">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Pretraži životinje…"
                    aria-label="Pretraži životinje po imenu"
                    className="h-11 pl-8 md:h-9"
                  />
                </div>
                <div
                  className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1"
                  role="group"
                  aria-label="Filter po statusu"
                >
                  {["Sve", ...statuses].map((s) => {
                    const count = s === "Sve" ? animals.length : animals.filter((a) => a.status === s).length
                    return (
                      <Button
                        key={s}
                        size="sm"
                        variant={filter === s ? "default" : "outline"}
                        aria-pressed={filter === s}
                        className="shrink-0"
                        onClick={() => setFilter(s)}
                      >
                        {s} · {count}
                      </Button>
                    )
                  })}
                </div>

                {visible.length === 0 && query.trim() ? (
                  <EmptyState
                    icon={Search}
                    title={`Nema životinje sa imenom „${query.trim()}“`}
                    description={
                      filter === "Sve"
                        ? "Proveri kako je ime napisano ili obriši pretragu."
                        : `Tražimo samo među statusom „${filter}“. Probaj „Sve“ ili obriši pretragu.`
                    }
                    action="Obriši pretragu"
                    onAction={() => setQuery("")}
                  />
                ) : visible.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-sm text-muted-foreground">Nema životinja sa statusom „{filter}“.</p>
                  </Card>
                ) : (
                  <>
                    {/* Computers: table */}
                    <Card className="hidden gap-0 py-0 lg:flex">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Životinja</TableHead>
                            <TableHead>Vrsta</TableHead>
                            <TableHead>Pol</TableHead>
                            <TableHead>Starost</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>{orgType === "shelter" ? "Prijem" : "Poreklo"}</TableHead>
                            <TableHead className="w-12">
                              <span className="sr-only">Radnje</span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visible.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell>
                                <Link href="/ljubimci/1" className="flex min-w-0 items-center gap-3 font-medium hover:underline">
                                  <PetAvatar name={a.name} species={a.kind} size="sm" />
                                  <span className="truncate">{a.name}</span>
                                </Link>
                              </TableCell>
                              <TableCell>{a.species}</TableCell>
                              <TableCell>{a.sex}</TableCell>
                              <TableCell>{a.age}</TableCell>
                              <TableCell>
                                <AnimalStatusBadge status={a.status} />
                              </TableCell>
                              <TableCell className="text-muted-foreground">{a.since}</TableCell>
                              <TableCell>
                                <AnimalActions name={a.name} canEdit={canEdit} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>

                    {/* Phones and tablets: cards */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:hidden">
                      {visible.map((a) => (
                        <AnimalCard
                          key={a.id}
                          animal={a}
                          canEdit={canEdit}
                          originLabel={orgType === "shelter" ? "Prijem" : "Poreklo"}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="tim" className="mt-4 space-y-4">
            {view === "loading" && <LoadingList />}
            {view === "error" && <ErrorState onRetry={() => setView("default")} />}
            {view === "empty" && (
              <EmptyState
                icon={Users}
                title="Za sada si sam u timu"
                description="Pozovi volontere ili zaposlene da zajedno vodite kartone."
                action="Pozovi člana"
                onAction={() => setInviteOpen(true)}
              />
            )}
            {(view === "default" || pending) && (
              <Card className="gap-4 p-4 md:p-6">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-heading text-lg font-bold">Članovi</h2>
                  <span className="text-sm text-muted-foreground">{members.length} / 20 članova</span>
                </div>
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                          {initials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.email} · od {m.joined}
                        </p>
                      </div>
                      <Badge variant={m.role === "Admin" ? "default" : "outline"} className={cn(m.role !== "Admin" && "bg-card")}>
                        {m.role}
                      </Badge>
                      {canEdit && m.role !== "Admin" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Radnje za ${m.name}`}>
                              <MoreHorizontal className="size-5" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>Postavi za admina</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive">Ukloni iz tima</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <IntakeDialog open={intakeOpen} onOpenChange={setIntakeOpen} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </AppShell>
  )
}
