"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import {
  Archive,
  CalendarDays,
  Camera,
  ClipboardList,
  FileDown,
  FileText,
  ImageIcon,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  Pill,
  Plus,
  Scale,
  Stethoscope,
  Syringe,
  Trash2,
  Utensils,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import type { PetSex, PetSpecies } from "../components/pet-avatar"
import { PetHeader } from "../components/pet-header"
import { PremiumLock } from "../components/premium-lock"
import { ReadOnlyBanner } from "../components/read-only-banner"
import { ReminderRow, type ReminderRowData } from "../components/reminder-row"
import { StateSwitcher } from "../components/state-switcher"
import { StatusBadge, type Status } from "../components/status-badge"

/* ---------- states ---------- */

// V = pet without "moj veterinar" → vet suggestion card (top 2 vet partners, EP-64, CR-22)
type ViewState = "D" | "M" | "V" | "L" | "E" | "G" | "R"

const states: { value: ViewState; label: string }[] = [
  { value: "D", label: "Podrazumevano (Luna)" },
  { value: "M", label: "Drugi ljubimac (Maks)" },
  { value: "V", label: "Bez veterinara (predlog)" },
  { value: "L", label: "Učitavanje" },
  { value: "E", label: "Prazno" },
  { value: "G", label: "Premium zaključano (PDF)" },
  { value: "R", label: "Član domaćinstva" },
]

type TabKey = "pregled" | "vakcine" | "terapije" | "pregledi" | "tezina"

/* ---------- helpers ---------- */

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

function formatWeight(value: number, unit: "kg" | "g") {
  return unit === "kg" ? `${value.toFixed(1).replace(".", ",")} kg` : `${Math.round(value)} g`
}

/* ---------- mock data ---------- */

type Vaccine = {
  id: string
  name: string
  given: string
  clinic: string
  batch: string
  next?: string
  nextStatus?: Status
  nextHint?: string
}

type DoseLog = { when: string; by: string }

type Treatment = {
  id: string
  name: string
  type: string
  dose: string
  frequency: string
  period: string
  nextDose?: string
  active: boolean
  log: DoseLog[]
}

type Attachment = { name: string; kind: "pdf" | "image"; size: string }

type Visit = {
  id: string
  date: string
  clinic: string
  reason: string
  findings: string
  recommendations: string
  cost: string
  checkup?: string
  attachments: Attachment[]
}

type WeightEntry = { id: string; date: string; short: string; value: number; note?: string }

type PetData = {
  id: string
  name: string
  sex: PetSex
  species: string
  speciesKey: PetSpecies
  breed: string
  age: string
  birth: string
  color: string
  microchip: string
  passport: string
  neutered: string
  unit: "kg" | "g"
  vet?: { name: string; phone: string }
  note: string
  reminders: ReminderRowData[]
  vaccines: Vaccine[]
  treatments: Treatment[]
  visits: Visit[]
  weights: WeightEntry[]
}

const lunaData: PetData = {
  id: "luna",
  name: "Luna",
  sex: "female",
  species: "Mačka",
  speciesKey: "cat",
  breed: "Britanska kratkodlaka",
  age: "3 godine",
  birth: "12. 4. 2023.",
  color: "Plavo-siva, bela mrlja na grudima",
  microchip: "688038000123456",
  passport: "RS-NS-0451-23",
  neutered: "Da",
  unit: "kg",
  vet: { name: "Veterinarska ambulanta „Dr Vet”, Novi Sad", phone: "021 456 789" },
  note: "Ne voli transporter — staviti ćebe unutra.",
  reminders: [
    {
      id: "l-r1",
      type: "treatment_dose",
      title: "Kapi za oči — Tobrex",
      when: "Danas 20:00",
      status: "today",
      channels: ["push"],
      pet: { name: "Luna", sex: "female" },
    },
    {
      id: "l-r2",
      type: "vaccination",
      title: "Vakcina protiv besnila",
      when: "26. 10. 2026.",
      status: "soon",
      channels: ["email", "push"],
      pet: { name: "Luna", sex: "female" },
    },
    {
      id: "l-r3",
      type: "vet_follow_up",
      title: "Kontrola očiju kod „Dr Vet”",
      when: "30. 10. 2026. 17:30",
      status: "soon",
      channels: ["email"],
      pet: { name: "Luna", sex: "female" },
    },
  ],
  vaccines: [
    {
      id: "l-v1",
      name: "Besnilo — Rabisin",
      given: "26. 10. 2025.",
      clinic: "Veterinarska ambulanta „Dr Vet”",
      batch: "RB-24-0917",
      next: "26. 10. 2026.",
      nextStatus: "soon",
      nextHint: "za 7 dana",
    },
    {
      id: "l-v2",
      name: "Trovalentna — Purevax RCP",
      given: "12. 3. 2026.",
      clinic: "Veterinarska ambulanta „Dr Vet”",
      batch: "PX-26-1142",
      next: "12. 3. 2027.",
    },
    {
      id: "l-v3",
      name: "Leukoza (FeLV) — Purevax FeLV",
      given: "12. 3. 2024.",
      clinic: "Veterinarska ambulanta „Dr Vet”",
      batch: "FV-24-0310",
    },
  ],
  treatments: [
    {
      id: "l-t1",
      name: "Tobrex kapi za oči",
      type: "Lek",
      dose: "1 kap u svako oko",
      frequency: "Svakih 12 sati",
      period: "15. 10. 2026. – 25. 10. 2026.",
      nextDose: "Danas 20:00",
      active: true,
      log: [
        { when: "19. 10. 2026. 08:00", by: "Ivana Petrović" },
        { when: "18. 10. 2026. 20:05", by: "Marko Jovanović" },
        { when: "18. 10. 2026. 08:10", by: "Ivana Petrović" },
      ],
    },
    {
      id: "l-t2",
      name: "Stronghold Plus",
      type: "Zaštita od buva i krpelja",
      dose: "1 pipeta (0,5 ml)",
      frequency: "Svakih 30 dana",
      period: "Od 1. 4. 2026.",
      nextDose: "1. 11. 2026.",
      active: true,
      log: [{ when: "1. 10. 2026. 19:00", by: "Ivana Petrović" }],
    },
    {
      id: "l-t3",
      name: "Milbemax",
      type: "Dehelmintizacija",
      dose: "1/2 tablete",
      frequency: "Jednokratno",
      period: "12. 3. 2026.",
      active: false,
      log: [{ when: "12. 3. 2026. 18:30", by: "Ivana Petrović" }],
    },
  ],
  visits: [
    {
      id: "l-p1",
      date: "2. 10. 2026.",
      clinic: "Veterinarska ambulanta „Dr Vet”",
      reason: "Suzenje levog oka",
      findings: "Blagi konjunktivitis, bez povrede rožnjače.",
      recommendations: "Tobrex kapi 10 dana, kontrola posle terapije.",
      cost: "2.990 RSD",
      checkup: "30. 10. 2026.",
      attachments: [{ name: "nalaz-oko-02-10-2026.pdf", kind: "pdf", size: "0,8 MB" }],
    },
    {
      id: "l-p2",
      date: "12. 3. 2026.",
      clinic: "Veterinarska ambulanta „Dr Vet”",
      reason: "Godišnji pregled i vakcinacija",
      findings: "Zdrava, zubi čisti, težina u granicama normale.",
      recommendations: "Suva hrana za sterilisane mačke, više vode.",
      cost: "4.500 RSD",
      attachments: [
        { name: "krvna-slika-mart-2026.pdf", kind: "pdf", size: "1,2 MB" },
        { name: "luna-pregled-zuba.jpg", kind: "image", size: "3,4 MB" },
      ],
    },
  ],
  weights: [
    { id: "l-w1", date: "17. 4. 2026.", short: "17. 4.", value: 3.8 },
    { id: "l-w2", date: "17. 5. 2026.", short: "17. 5.", value: 3.9 },
    { id: "l-w3", date: "17. 6. 2026.", short: "17. 6.", value: 4.0 },
    { id: "l-w4", date: "17. 7. 2026.", short: "17. 7.", value: 4.0 },
    { id: "l-w5", date: "2. 10. 2026.", short: "2. 10.", value: 4.1, note: "Izmereno kod „Dr Vet”" },
    { id: "l-w6", date: "19. 10. 2026.", short: "19. 10.", value: 4.2 },
  ],
}

const maksData: PetData = {
  id: "maks",
  name: "Maks",
  sex: "male",
  species: "Pas",
  speciesKey: "dog",
  breed: "Zlatni retriver",
  age: "5 godina",
  birth: "3. 6. 2021.",
  color: "Zlatna",
  microchip: "688038000654321",
  passport: "RS-NS-0187-21",
  neutered: "Ne",
  unit: "kg",
  vet: { name: "Veterinarska ambulanta „Dr Vet”, Novi Sad", phone: "021 456 789" },
  note: "Alergičan na piletinu.",
  reminders: [
    {
      id: "m-r1",
      type: "treatment_dose",
      title: "Tableta protiv krpelja — Bravecto",
      when: "Danas 18:00",
      status: "today",
      channels: ["push"],
      pet: { name: "Maks", sex: "male" },
    },
    {
      id: "m-r2",
      type: "manual",
      title: "Šišanje u salonu „Čupko”",
      when: "8. 11. 2026. 10:00",
      status: "soon",
      channels: ["email"],
      pet: { name: "Maks", sex: "male" },
    },
    {
      id: "m-r3",
      type: "vaccination",
      title: "Vakcina DHPPi+L",
      when: "4. 2. 2027.",
      status: "soon",
      channels: ["email", "push"],
      pet: { name: "Maks", sex: "male" },
    },
  ],
  vaccines: [
    {
      id: "m-v1",
      name: "DHPPi+L — Nobivac",
      given: "4. 2. 2026.",
      clinic: "Veterinarska ambulanta „Dr Vet”",
      batch: "NB-26-0204",
      next: "4. 2. 2027.",
    },
    {
      id: "m-v2",
      name: "Besnilo — Nobivac Rabies",
      given: "4. 2. 2026.",
      clinic: "Veterinarska ambulanta „Dr Vet”",
      batch: "NR-26-0388",
      next: "4. 2. 2027.",
    },
  ],
  treatments: [
    {
      id: "m-t1",
      name: "Bravecto 1000 mg",
      type: "Zaštita od buva i krpelja",
      dose: "1 tableta",
      frequency: "Svakih 90 dana",
      period: "Od 21. 4. 2026.",
      nextDose: "Danas 18:00",
      active: true,
      log: [{ when: "21. 7. 2026. 18:10", by: "Marko Jovanović" }],
    },
  ],
  visits: [
    {
      id: "m-p1",
      date: "4. 2. 2026.",
      clinic: "Veterinarska ambulanta „Dr Vet”",
      reason: "Godišnja vakcinacija",
      findings: "Dobro opšte stanje, blago povišena težina.",
      recommendations: "Smanjiti obrok za 10 %, duže šetnje.",
      cost: "3.800 RSD",
      attachments: [],
    },
  ],
  weights: [
    { id: "m-w1", date: "4. 2. 2026.", short: "4. 2.", value: 33.6 },
    { id: "m-w2", date: "4. 4. 2026.", short: "4. 4.", value: 33.1 },
    { id: "m-w3", date: "4. 6. 2026.", short: "4. 6.", value: 32.7 },
    { id: "m-w4", date: "4. 8. 2026.", short: "4. 8.", value: 32.4 },
    { id: "m-w5", date: "4. 10. 2026.", short: "4. 10.", value: 32.0 },
  ],
}

const maksNoVet: PetData = { ...maksData, vet: undefined }

// Top 2 vet partners near the owner's city (featured first, then distance) — from EP-64.
const suggestedVets = [
  {
    id: "p4",
    name: "Veterinarska ambulanta „Detelinara”",
    address: "Rumenačka 90, Novi Sad",
    distance: "0,8 km",
    phone: "+381 21 300 900",
  },
  {
    id: "p1",
    name: "Veterinarska ambulanta „Dr Vet”",
    address: "Bulevar oslobođenja 45, Novi Sad",
    distance: "1,2 km",
    phone: "+381 21 455 100",
  },
]

const emptyLuna: PetData = { ...lunaData, reminders: [], vaccines: [], treatments: [], visits: [], weights: [] }

/* ---------- small building blocks ---------- */

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value?: Date
  onChange: (d?: Date) => void
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
    </div>
  )
}

function SectionHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-heading text-[22px] leading-7 font-bold">{title}</h2>
      {action}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  )
}

function AttachmentChip({ file }: { file: Attachment }) {
  const Icon = file.kind === "pdf" ? FileText : ImageIcon
  return (
    <a
      href="#"
      className="flex max-w-full min-w-0 items-center gap-2 rounded-sm bg-foreground/5 px-3 py-2 text-sm hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">{file.name}</span>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{file.size}</span>
    </a>
  )
}

function WeightTrend({ entries, unit, name }: { entries: WeightEntry[]; unit: "kg" | "g"; name: string }) {
  const values = entries.map((e) => e.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const first = entries[0]
  const last = entries[entries.length - 1]
  return (
    <div
      role="img"
      aria-label={`Trend težine za ${name}: od ${formatWeight(first.value, unit)} (${first.date}) do ${formatWeight(last.value, unit)} (${last.date}).`}
      className="flex h-40 items-end gap-2"
    >
      {entries.map((e) => {
        const pct = 20 + ((e.value - min) / range) * 80
        return (
          <div key={e.id} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1" aria-hidden>
            <span className="max-w-full truncate text-xs font-medium">{formatWeight(e.value, unit)}</span>
            <div className="flex w-full flex-1 items-end">
              <div className="w-full rounded-sm bg-pet-accent" style={{ height: `${pct}%` }} />
            </div>
            <span className="max-w-full truncate text-xs font-medium text-muted-foreground">{e.short}</span>
          </div>
        )
      })}
    </div>
  )
}

function LoadingView() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Učitavanje kartona">
      <Card className="gap-4 p-4 md:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </Card>
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="gap-3 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </Card>
          ))}
        </div>
        <Card className="gap-3 p-4 md:p-6">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
      </div>
    </div>
  )
}

/* ---------- screen ---------- */

export default function PetRecordScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [tab, setTab] = useState<TabKey>("pregled")
  const [pet, setPet] = useState<PetData>(lunaData)
  const [statusMessage, setStatusMessage] = useState("")
  const [pdfLockOpen, setPdfLockOpen] = useState(false)
  const [memorialOpen, setMemorialOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)

  // memorial form
  const [memDate, setMemDate] = useState<Date | undefined>(undefined)
  const [memReason, setMemReason] = useState("preminuo")
  const [memNote, setMemNote] = useState("")
  const [memError, setMemError] = useState("")

  // weight form
  const [wDate, setWDate] = useState<Date | undefined>(new Date(2026, 9, 19))
  const [wValue, setWValue] = useState("")
  const [wNote, setWNote] = useState("")
  const [wError, setWError] = useState("")

  function changeView(v: ViewState) {
    setView(v)
    setStatusMessage("")
    setPdfLockOpen(v === "G")
    setPet(v === "M" ? maksData : v === "V" ? maksNoVet : v === "E" ? emptyLuna : lunaData)
  }

  const isFree = view === "G"
  const isMember = view === "R"
  const canEdit = !isMember
  const currentUser = isMember ? "Marko Jovanović" : "Ivana Petrović"
  const female = pet.sex === "female"

  const reasonOptions = [
    { value: "preminuo", label: female ? "Preminula" : "Preminuo" },
    { value: "udomljen", label: female ? "Udomljena kod drugih" : "Udomljen kod drugih" },
    { value: "izgubljen", label: female ? "Izgubljena" : "Izgubljen" },
  ]

  function exportPdf() {
    if (isFree) {
      setPdfLockOpen(true)
      setStatusMessage("")
      return
    }
    setStatusMessage(`Karton je spreman: ${pet.name}-karton.pdf`)
  }

  function markReminderDone(id: string) {
    setPet((p) => ({
      ...p,
      reminders: p.reminders.map((r) => (r.id === id ? { ...r, status: "done" } : r)),
    }))
    setStatusMessage("Podsetnik označen kao urađen.")
  }

  function giveDose(id: string) {
    setPet((p) => ({
      ...p,
      treatments: p.treatments.map((t) =>
        t.id === id
          ? {
              ...t,
              nextDose: t.frequency === "Svakih 12 sati" ? "20. 10. 2026. 08:00" : t.nextDose,
              log: [{ when: "19. 10. 2026. 20:00", by: currentUser }, ...t.log],
            }
          : t,
      ),
    }))
    setStatusMessage("Doza je upisana.")
  }

  function saveMemorial() {
    if (!memDate) {
      setMemError("Izaberi datum.")
      return
    }
    setMemError("")
    setMemorialOpen(false)
    setStatusMessage(`${pet.name} je ${female ? "premeštena" : "premešten"} u Uspomene. Podsetnici su zaustavljeni.`)
  }

  function confirmDelete() {
    setDeleteOpen(false)
    setStatusMessage(`${pet.name} je trajno ${female ? "obrisana" : "obrisan"}, sa svim unosima i podsetnicima.`)
  }

  function saveWeight() {
    const n = Number(wValue.replace(",", "."))
    if (!wValue.trim() || Number.isNaN(n) || n <= 0) {
      setWError(pet.unit === "kg" ? "Upiši težinu, npr. 4,2." : "Upiši težinu u gramima, npr. 850.")
      return
    }
    if (!wDate) {
      setWError("Izaberi datum merenja.")
      return
    }
    setWError("")
    const date = formatDate(wDate)
    setPet((p) => ({
      ...p,
      weights: [
        ...p.weights,
        {
          id: `w-${p.weights.length + 1}`,
          date,
          short: `${wDate.getDate()}. ${wDate.getMonth() + 1}.`,
          value: n,
          note: wNote.trim() || undefined,
        },
      ],
    }))
    setWValue("")
    setWNote("")
    setWeightOpen(false)
    setStatusMessage("Merenje je sačuvano.")
  }

  const lastWeight = pet.weights[pet.weights.length - 1]
  const prevWeight = pet.weights[pet.weights.length - 2]
  const lastVisit = pet.visits[0]
  const attachmentsCount = pet.visits.reduce((n, v) => n + v.attachments.length, 0)

  const subtitle = `${pet.breed} · ${pet.age}`
  const headerChips = [female ? "Ženka" : "Mužjak", ...(pet.neutered === "Da" ? [female ? "Sterilisana" : "Kastriran"] : [])]

  const headerActions = (
    <>
      {canEdit && (
        <Button asChild variant="outline" className="h-11 md:h-9">
          <Link href={`/ljubimci/${pet.id}/izmena`}>
            <Pencil className="size-4" aria-hidden />
            Izmeni
          </Link>
        </Button>
      )}
      {canEdit && (
        <Button className="h-11 md:h-9" onClick={exportPdf}>
          <FileDown className="size-4" aria-hidden />
          Izvezi PDF
          {isFree && <StatusBadge status="premium" className="ml-1" />}
        </Button>
      )}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-11 md:size-9" aria-label="Još opcija">
              <MoreVertical className="size-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="shadow-raised">
            <DropdownMenuItem onSelect={() => setMemorialOpen(true)}>
              <Archive className="size-4" aria-hidden />
              Premesti u Uspomene
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" aria-hidden />
              Obriši trajno
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )

  const headerMeta = (
    <>
      <span className="text-muted-foreground">Mikročip</span>
      <span className="font-medium tabular-nums">{pet.microchip}</span>
    </>
  )

  const tabTrigger = "after:bg-pet-accent data-[state=active]:text-pet-accent"

  return (
    <AppShell variant="owner" active="ljubimci" counts={{ podsetnici: 3 }}>
      <StateSwitcher states={states} value={view} onChange={changeView} />

      {view === "L" ? (
        <LoadingView />
      ) : (
        <div data-pet-sex={pet.sex} className="space-y-6">
          {isMember && (
            <ReadOnlyBanner reason="Ti si član domaćinstva Ivane Petrović. Možeš da pregledaš karton, označiš podsetnike i date doze, a medicinske unose menja samo vlasnica." />
          )}

          <PetHeader
            name={pet.name}
            sex={pet.sex}
            species={pet.speciesKey}
            subtitle={subtitle}
            chips={headerChips}
            meta={headerMeta}
            actions={headerActions}
          />

          <p role="status" className="text-sm text-muted-foreground empty:hidden">
            {statusMessage}
          </p>

          {isFree && pdfLockOpen && (
            <section aria-label="Izvoz kartona u PDF">
              <PremiumLock
                description="Izvezi ceo karton u PDF — za veterinara, groomera ili granicu."
              >
                <Card className="gap-3 p-6">
                  <p className="font-heading text-lg font-bold">Karton ljubimca — {pet.name}</p>
                  <Separator />
                  <p className="text-sm">Vakcine · Terapije · Pregledi · Težina</p>
                  <div className="h-8 rounded-sm bg-foreground/5" />
                  <div className="h-8 rounded-sm bg-foreground/5" />
                  <div className="h-8 rounded-sm bg-foreground/5" />
                  <div className="h-8 rounded-sm bg-foreground/5" />
                  <div className="h-8 rounded-sm bg-foreground/5" />
                </Card>
              </PremiumLock>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* main column */}
            <div className="min-w-0">
              <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="gap-4">
                <div className="overflow-x-auto overflow-y-hidden border-b border-border">
                  <TabsList variant="line" className="h-11 w-max md:h-9">
                    <TabsTrigger value="pregled" className={tabTrigger}>
                      <ClipboardList aria-hidden />
                      Pregled
                    </TabsTrigger>
                    <TabsTrigger value="vakcine" className={tabTrigger}>
                      <Syringe aria-hidden />
                      Vakcine
                    </TabsTrigger>
                    <TabsTrigger value="terapije" className={tabTrigger}>
                      <Pill aria-hidden />
                      Terapije
                    </TabsTrigger>
                    <TabsTrigger value="pregledi" className={tabTrigger}>
                      <Stethoscope aria-hidden />
                      Pregledi
                    </TabsTrigger>
                    <TabsTrigger value="tezina" className={tabTrigger}>
                      <Scale aria-hidden />
                      Težina
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Pregled */}
                <TabsContent value="pregled" className="space-y-4">
                  {pet.reminders.length === 0 && !lastWeight && !lastVisit ? (
                    <EmptyState
                      icon={ClipboardList}
                      title={`${pet.name} još nema unose`}
                      description="Dodaj vakcinu, terapiju ili pregled i ovde ćeš videti šta sledi."
                      action={canEdit ? "Dodaj vakcinu" : undefined}
                      onAction={() => setTab("vakcine")}
                    />
                  ) : (
                    <>
                      <Card className="gap-3 p-4 md:p-6">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="font-heading text-lg font-bold">Sledeći podsetnici</h2>
                          <Button asChild variant="link" size="sm">
                            <Link href="/podsetnici">Svi podsetnici</Link>
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {pet.reminders.slice(0, 3).map((r) => (
                            <ReminderRow key={r.id} reminder={r} onDone={markReminderDone} />
                          ))}
                        </div>
                      </Card>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {lastWeight && (
                          <Card className="gap-2 p-4 md:p-6">
                            <p className="text-xs font-medium text-muted-foreground">Poslednja težina</p>
                            <p className="font-heading text-[22px] leading-7 font-bold text-pet-accent">
                              {formatWeight(lastWeight.value, pet.unit)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {lastWeight.date}
                              {prevWeight &&
                                ` · ${lastWeight.value >= prevWeight.value ? "+" : "−"}${formatWeight(
                                  Math.abs(lastWeight.value - prevWeight.value),
                                  pet.unit,
                                )} od prošlog merenja`}
                            </p>
                            <Button variant="link" size="sm" className="self-start px-0" onClick={() => setTab("tezina")}>
                              Pogledaj trend
                            </Button>
                          </Card>
                        )}
                        {lastVisit && (
                          <Card className="gap-2 p-4 md:p-6">
                            <p className="text-xs font-medium text-muted-foreground">Poslednji pregled</p>
                            <p className="truncate font-heading text-lg font-bold">{lastVisit.reason}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {lastVisit.date} · {lastVisit.clinic}
                            </p>
                            <Button variant="link" size="sm" className="self-start px-0" onClick={() => setTab("pregledi")}>
                              Svi pregledi
                            </Button>
                          </Card>
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Vakcine */}
                <TabsContent value="vakcine" className="space-y-4">
                  <SectionHeader
                    title="Vakcine"
                    action={
                      canEdit && pet.vaccines.length > 0 ? (
                        <Button asChild className="h-11 md:h-9">
                          <Link href={`/ljubimci/${pet.id}/vakcine/nova`}>
                            <Plus className="size-4" aria-hidden />
                            Dodaj vakcinu
                          </Link>
                        </Button>
                      ) : undefined
                    }
                  />
                  {pet.vaccines.length === 0 ? (
                    <EmptyState
                      icon={Syringe}
                      title="Još nema vakcina"
                      description="Dodaj prvu vakcinu i podsetićemo te na sledeću."
                      action={canEdit ? "Dodaj vakcinu" : undefined}
                    />
                  ) : (
                    <Card className="gap-2 p-4 md:p-6">
                      <ul className="space-y-2">
                        {pet.vaccines.map((v) => (
                          <li key={v.id} className="flex flex-col gap-2 rounded-sm bg-foreground/5 p-3 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{v.name}</p>
                              <p className="truncate text-xs font-medium text-muted-foreground">
                                Data {v.given} · {v.clinic} · Serija {v.batch}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              {v.next ? (
                                v.nextStatus ? (
                                  <StatusBadge status={v.nextStatus} label={`Sledeća ${v.next} · ${v.nextHint}`} />
                                ) : (
                                  <Badge variant="outline">Sledeća {v.next}</Badge>
                                )
                              ) : (
                                <Badge variant="secondary">Bez sledeće doze</Badge>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </TabsContent>

                {/* Terapije */}
                <TabsContent value="terapije" className="space-y-4">
                  <SectionHeader
                    title="Terapije"
                    action={
                      canEdit && pet.treatments.length > 0 ? (
                        <Button asChild className="h-11 md:h-9">
                          <Link href={`/ljubimci/${pet.id}/terapije/nova`}>
                            <Plus className="size-4" aria-hidden />
                            Dodaj terapiju
                          </Link>
                        </Button>
                      ) : undefined
                    }
                  />
                  {pet.treatments.length === 0 ? (
                    <EmptyState
                      icon={Pill}
                      title="Još nema terapija"
                      description="Upiši lek ili zaštitu od parazita i podsetićemo te na svaku dozu."
                      action={canEdit ? "Dodaj terapiju" : undefined}
                      href={`/ljubimci/${pet.id}/terapije/nova`}
                    />
                  ) : (
                    pet.treatments.map((t) => (
                      <Card key={t.id} className="gap-3 p-4 md:p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 truncate font-heading text-lg font-bold">{t.name}</h3>
                              <Badge variant="secondary">{t.type}</Badge>
                              {!t.active && <StatusBadge status="done" label="Završeno" />}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {t.dose} · {t.frequency} · {t.period}
                            </p>
                            {t.active && t.nextDose && (
                              <p className="text-sm">
                                <span className="text-muted-foreground">Sledeća doza: </span>
                                <span className="font-medium text-pet-accent">{t.nextDose}</span>
                              </p>
                            )}
                          </div>
                          {t.active && (
                            <Button className="h-11 shrink-0 md:h-9" onClick={() => giveDose(t.id)}>
                              Doza data
                            </Button>
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Dnevnik doza</p>
                          <ul className="space-y-1">
                            {t.log.slice(0, 4).map((l, i) => (
                              <li key={`${t.id}-${i}`} className="flex min-w-0 justify-between gap-2 rounded-sm bg-foreground/5 px-3 py-2 text-sm">
                                <span className="min-w-0 truncate">{l.when}</span>
                                <span className="shrink-0 text-muted-foreground">{l.by}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </Card>
                    ))
                  )}
                </TabsContent>

                {/* Pregledi */}
                <TabsContent value="pregledi" className="space-y-4">
                  <SectionHeader
                    title="Pregledi"
                    action={
                      <div className="flex flex-wrap items-center gap-2">
                        {isFree && (
                          <Badge variant="secondary">
                            {attachmentsCount} / 10 priloga
                          </Badge>
                        )}
                        {canEdit && pet.visits.length > 0 && (
                          <Button asChild className="h-11 md:h-9">
                            <Link href={`/ljubimci/${pet.id}/pregledi/novi`}>
                              <Plus className="size-4" aria-hidden />
                              Novi pregled
                            </Link>
                          </Button>
                        )}
                      </div>
                    }
                  />
                  {pet.visits.length === 0 ? (
                    <EmptyState
                      icon={Stethoscope}
                      title="Još nema pregleda"
                      description="Sačuvaj nalaz sa pregleda i priloži slike ili PDF."
                      action={canEdit ? "Novi pregled" : undefined}
                    />
                  ) : (
                    pet.visits.map((v) => (
                      <Card key={v.id} className="gap-3 p-4 md:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-heading text-lg font-bold">{v.reason}</h3>
                            <p className="text-sm text-muted-foreground">
                              {v.date} · {v.clinic}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-medium">{v.cost}</p>
                        </div>
                        <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="min-w-0">
                            <dt className="text-xs font-medium text-muted-foreground">Nalaz</dt>
                            <dd className="text-sm">{v.findings}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs font-medium text-muted-foreground">Preporuke</dt>
                            <dd className="text-sm">{v.recommendations}</dd>
                          </div>
                        </dl>
                        {v.checkup && (
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                            <span className="text-muted-foreground">Kontrola:</span>
                            <span className="font-medium">{v.checkup}</span>
                            <StatusBadge status="soon" />
                          </div>
                        )}
                        {v.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {v.attachments.map((a) => (
                              <AttachmentChip key={a.name} file={a} />
                            ))}
                          </div>
                        )}
                      </Card>
                    ))
                  )}
                </TabsContent>

                {/* Težina */}
                <TabsContent value="tezina" className="space-y-4">
                  <SectionHeader
                    title="Težina"
                    action={
                      canEdit && pet.weights.length > 0 ? (
                        <Button className="h-11 md:h-9" onClick={() => setWeightOpen(true)}>
                          <Plus className="size-4" aria-hidden />
                          Dodaj merenje
                        </Button>
                      ) : undefined
                    }
                  />
                  {pet.weights.length === 0 ? (
                    <EmptyState
                      icon={Scale}
                      title="Još nema merenja"
                      description="Upiši prvu težinu i pratićemo kako se menja."
                      action={canEdit ? "Dodaj merenje" : undefined}
                      onAction={() => setWeightOpen(true)}
                    />
                  ) : (
                    <>
                      {pet.weights.length >= 2 && (
                        <Card className="gap-4 p-4 md:p-6">
                          <h3 className="font-heading text-lg font-bold">Trend</h3>
                          <WeightTrend entries={pet.weights} unit={pet.unit} name={pet.name} />
                        </Card>
                      )}
                      <Card className="gap-2 p-4 md:p-6">
                        <h3 className="font-heading text-lg font-bold">Sva merenja</h3>
                        <ul className="space-y-2">
                          {[...pet.weights].reverse().map((w) => (
                            <li key={w.id} className="flex min-w-0 items-center justify-between gap-4 rounded-sm bg-foreground/5 p-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{w.date}</p>
                                {w.note && <p className="truncate text-xs font-medium text-muted-foreground">{w.note}</p>}
                              </div>
                              <p className="shrink-0 text-sm font-medium">{formatWeight(w.value, pet.unit)}</p>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* aside */}
            <aside className="min-w-0 space-y-4" aria-label="Podaci o ljubimcu">
              <Card className="gap-3 p-4 md:p-6">
                <h2 className="font-heading text-lg font-bold">Osnovni podaci</h2>
                <dl className="space-y-2">
                  <InfoRow label="Vrsta" value={pet.species} />
                  <InfoRow label="Rasa" value={pet.breed} />
                  <InfoRow label="Rođendan" value={pet.birth} />
                  <InfoRow label="Boja" value={pet.color} />
                  <InfoRow label="Mikročip" value={pet.microchip} />
                  <InfoRow label="Pasoš" value={pet.passport} />
                  <InfoRow label={female ? "Sterilisana" : "Kastriran"} value={pet.neutered} />
                  <InfoRow label="Jedinica težine" value={pet.unit} />
                </dl>
                {pet.note && (
                  <>
                    <Separator />
                    <p className="text-sm text-muted-foreground">{pet.note}</p>
                  </>
                )}
              </Card>

              {pet.vet ? (
                <Card className="gap-3 p-4 md:p-6">
                  <h2 className="font-heading text-lg font-bold">Moj veterinar</h2>
                  <p className="text-sm">{pet.vet.name}</p>
                  <Button asChild variant="outline" className="h-11 md:h-9">
                    <a href={`tel:${pet.vet.phone.replace(/\s/g, "")}`}>
                      <Phone className="size-4" aria-hidden />
                      Pozovi {pet.vet.phone}
                    </a>
                  </Button>
                </Card>
              ) : (
                <Card className="gap-3 p-4 md:p-6">
                  <div className="min-w-0">
                    <h2 className="font-heading text-lg font-bold">Predlog veterinara u blizini</h2>
                    <p className="text-sm text-muted-foreground">{pet.name} nema upisanog veterinara.</p>
                  </div>
                  <ul className="space-y-2">
                    {suggestedVets.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
                        <Stethoscope className="size-5 shrink-0 text-pet-accent" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/partneri/${v.id}`}
                            className="block rounded-sm break-words text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {v.name}
                          </Link>
                          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">
                              {v.distance} · {v.address}
                            </span>
                          </p>
                        </div>
                        <Button asChild variant="outline" size="icon" className="size-11 shrink-0 md:size-9">
                          <a href={`tel:${v.phone.replace(/\s/g, "")}`} aria-label={`Pozovi: ${v.name}`}>
                            <Phone className="size-4" aria-hidden />
                          </a>
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant="link" className="justify-start px-0">
                    <Link href="/partneri">Svi partneri →</Link>
                  </Button>
                </Card>
              )}

              <Card className="gap-2 p-4 md:p-6">
                <h2 className="font-heading text-lg font-bold">Još o ljubimcu</h2>
                <Button asChild variant="ghost" className="h-11 justify-start md:h-9">
                  <Link href={`/ljubimci/${pet.id}/dnevnik`}>
                    <Utensils className="size-4" aria-hidden />
                    Dnevnik ishrane i stolice
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="h-11 justify-start md:h-9">
                  <Link href={`/ljubimci/${pet.id}/trenuci`}>
                    <Camera className="size-4" aria-hidden />
                    Trenuci
                  </Link>
                </Button>
              </Card>
            </aside>
          </div>

          {/* Memorial dialog */}
          <Dialog open={memorialOpen} onOpenChange={setMemorialOpen}>
            <DialogContent className="shadow-raised">
              <DialogHeader>
                <DialogTitle>Premesti u Uspomene — {pet.name}</DialogTitle>
                <DialogDescription>
                  Karton ostaje sačuvan, a svi podsetnici za ovog ljubimca se zaustavljaju.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <DateField id="uspomena-datum" label="Datum *" value={memDate} onChange={setMemDate} />
                {memError && <p className="text-sm text-destructive">{memError}</p>}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Razlog</legend>
                  <RadioGroup value={memReason} onValueChange={setMemReason} className="space-y-1">
                    {reasonOptions.map((o) => (
                      <div key={o.value} className="flex items-center gap-2">
                        <RadioGroupItem id={`razlog-${o.value}`} value={o.value} />
                        <Label htmlFor={`razlog-${o.value}`}>{o.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </fieldset>
                <div className="space-y-2">
                  <Label htmlFor="uspomena-napomena">Napomena</Label>
                  <Textarea
                    id="uspomena-napomena"
                    value={memNote}
                    onChange={(e) => setMemNote(e.target.value)}
                    placeholder="Nešto što želiš da zapamtiš"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="h-11 md:h-9" onClick={() => setMemorialOpen(false)}>
                  Odustani
                </Button>
                <Button className="h-11 md:h-9" onClick={saveMemorial}>
                  Premesti u Uspomene
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete confirmation */}
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent className="shadow-raised">
              <AlertDialogHeader>
                <AlertDialogTitle>Trajno obriši karton — {pet.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Brišu se svi unosi, prilozi, trenuci i podsetnici. Ovo ne može da se poništi. Ako želiš da sačuvaš
                  karton, premesti ljubimca u Uspomene.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11 md:h-9">Odustani</AlertDialogCancel>
                <AlertDialogAction variant="destructive" className="h-11 md:h-9" onClick={confirmDelete}>
                  Da, obriši
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Weight dialog */}
          <Dialog open={weightOpen} onOpenChange={setWeightOpen}>
            <DialogContent className="shadow-raised">
              <DialogHeader>
                <DialogTitle>Novo merenje — {pet.name}</DialogTitle>
                <DialogDescription>Težinu upisuješ u jedinici izabranoj za ovog ljubimca ({pet.unit}).</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <DateField id="tezina-datum" label="Datum *" value={wDate} onChange={setWDate} />
                <div className="space-y-2">
                  <Label htmlFor="tezina-vrednost">Težina ({pet.unit}) *</Label>
                  <Input
                    id="tezina-vrednost"
                    inputMode="decimal"
                    className="h-11 md:h-9"
                    value={wValue}
                    onChange={(e) => setWValue(e.target.value)}
                    aria-invalid={!!wError}
                    aria-describedby={wError ? "tezina-greska" : undefined}
                    placeholder={pet.unit === "kg" ? "npr. 4,2" : "npr. 850"}
                  />
                  {wError && (
                    <p id="tezina-greska" className="text-sm text-destructive">
                      {wError}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tezina-napomena">Napomena</Label>
                  <Input
                    id="tezina-napomena"
                    className="h-11 md:h-9"
                    value={wNote}
                    onChange={(e) => setWNote(e.target.value)}
                    placeholder="npr. izmereno kod veterinara"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="h-11 md:h-9" onClick={() => setWeightOpen(false)}>
                  Odustani
                </Button>
                <Button className="h-11 md:h-9" onClick={saveWeight}>
                  Sačuvaj merenje
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </AppShell>
  )
}
