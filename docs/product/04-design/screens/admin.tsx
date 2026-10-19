"use client"

import { useState } from "react"
import { Building2, CircleCheck, Crosshair, MessageCircle, Pencil, Plus, TriangleAlert } from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { ErrorState } from "../components/error-state"
import { StateSwitcher } from "../components/state-switcher"
import { StatusBadge } from "../components/status-badge"

type ViewState = "default" | "loading" | "empty" | "error"
type TabKey = "azili" | "partneri" | "statistika" | "kanali"
type PartnerType = "vet" | "shop" | "grooming" | "hotel"

const typeLabel: Record<PartnerType, string> = {
  vet: "Veterinar",
  shop: "Pet shop",
  grooming: "Grooming",
  hotel: "Pet hotel",
}

type PendingShelter = {
  id: string
  name: string
  city: string
  contact: string
  email: string
  registeredOn: string
  note: string
}

const pendingShelters: PendingShelter[] = [
  {
    id: "s1",
    name: "Udruženje „Druga šansa“",
    city: "Novi Sad",
    contact: "Ivana Petrović",
    email: "kontakt@drugasansa.rs",
    registeredOn: "18. 10. 2026.",
    note: "Registrovano udruženje, PIB 112233445. Oko 40 pasa i 25 mačaka.",
  },
  {
    id: "s2",
    name: "Azil „Šapa nade“",
    city: "Bečej",
    contact: "Marko Jovanović",
    email: "sapanade@primer.rs",
    registeredOn: "17. 10. 2026.",
    note: "Privremeni smeštaj za napuštene pse, saradnja sa opštinom.",
  },
]

// Shared city list — same in registration (S15) and profile (S18).
const cities = [
  "Novi Sad",
  "Beograd",
  "Niš",
  "Kragujevac",
  "Subotica",
  "Bečej",
  "Zrenjanin",
  "Sombor",
  "Čačak",
  "Kraljevo",
] as const

type DayKey = "pon" | "uto" | "sre" | "cet" | "pet" | "sub" | "ned"
// Working hours are stored as structured rows; a day without a row is closed.
type HoursRow = { day: DayKey; from: string; to: string }
// Messaging uses its own number, separate from the call phone.
type MessageChannel = "none" | "whatsapp" | "viber" | "sms"

const dayOrder: { key: DayKey; label: string }[] = [
  { key: "pon", label: "Ponedeljak" },
  { key: "uto", label: "Utorak" },
  { key: "sre", label: "Sreda" },
  { key: "cet", label: "Četvrtak" },
  { key: "pet", label: "Petak" },
  { key: "sub", label: "Subota" },
  { key: "ned", label: "Nedelja" },
]

function weekdays(from: string, to: string, days: DayKey[]): HoursRow[] {
  return days.map((day) => ({ day, from, to }))
}

const workWeek: DayKey[] = ["pon", "uto", "sre", "cet", "pet"]

type AdminPartner = {
  id: string
  name: string
  type: PartnerType
  city: string
  featured: boolean
  paidUntil: string
  active: boolean
  message_number?: string
  message_channel: MessageChannel
  hours: HoursRow[]
}

const initialPartners: AdminPartner[] = [
  { id: "p1", name: "Veterinarska ambulanta „Dr Vet“", type: "vet", city: "Novi Sad", featured: true, paidUntil: "31. 12. 2026.", active: true, message_number: "+381 64 455 1000", message_channel: "whatsapp", hours: [...weekdays("08:00", "20:00", workWeek), { day: "sub", from: "09:00", to: "14:00" }] },
  { id: "p2", name: "Veterinarska stanica „Zdrava šapa“", type: "vet", city: "Novi Sad", featured: true, paidUntil: "30. 11. 2026.", active: true, message_channel: "none", hours: weekdays("07:00", "21:00", [...workWeek, "sub", "ned"]) },
  { id: "p3", name: "Veterinarska klinika „Liman“", type: "vet", city: "Novi Sad", featured: true, paidUntil: "31. 01. 2027.", active: true, message_number: "+381 63 640 2200", message_channel: "viber", hours: [...weekdays("09:00", "19:00", workWeek), { day: "sub", from: "09:00", to: "13:00" }] },
  { id: "p4", name: "Veterinarska ambulanta „Detelinara“", type: "vet", city: "Novi Sad", featured: false, paidUntil: "15. 12. 2026.", active: true, message_number: "+381 64 300 9000", message_channel: "sms", hours: weekdays("08:00", "16:00", workWeek) },
  { id: "p5", name: "Pet shop „Šapica“", type: "shop", city: "Novi Sad", featured: true, paidUntil: "31. 12. 2026.", active: true, message_number: "+381 65 662 0400", message_channel: "whatsapp", hours: weekdays("09:00", "20:00", [...workWeek, "sub"]) },
  { id: "p6", name: "Grooming salon „Čupko“", type: "grooming", city: "Novi Sad", featured: true, paidUntil: "28. 02. 2027.", active: true, message_number: "+381 64 633 8180", message_channel: "viber", hours: weekdays("10:00", "18:00", ["uto", "sre", "cet", "pet", "sub"]) },
  { id: "p7", name: "Pet hotel „Kod Mace“", type: "hotel", city: "Novi Sad", featured: false, paidUntil: "30. 09. 2026.", active: false, message_number: "+381 60 820 7770", message_channel: "whatsapp", hours: weekdays("00:00", "24:00", [...workWeek, "sub", "ned"]) },
]

const stats = [
  { name: "Veterinarska ambulanta „Dr Vet“", call: 142, message: 61, email: 18, web: 44 },
  { name: "Pet shop „Šapica“", call: 37, message: 52, email: 9, web: 71 },
  { name: "Grooming salon „Čupko“", call: 58, message: 33, email: 12, web: 0 },
  { name: "Veterinarska stanica „Zdrava šapa“", call: 49, message: 0, email: 7, web: 0 },
  { name: "Pet hotel „Kod Mace“", call: 21, message: 14, email: 16, web: 25 },
]

function TableSkeleton() {
  return (
    <Card className="gap-3 p-4 md:p-6" aria-busy="true" aria-label="Učitavanje">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </Card>
  )
}

function PartnerDialog({
  open,
  onOpenChange,
  partner,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  partner: AdminPartner | null
}) {
  const [coords, setCoords] = useState("")
  const isEdit = partner !== null
  const [channel, setChannel] = useState<MessageChannel>(partner?.message_channel ?? "none")
  const [hours, setHours] = useState(() =>
    dayOrder.map((d) => {
      const row = partner?.hours.find((h) => h.day === d.key)
      return {
        day: d.key,
        from: row?.from ?? "09:00",
        to: row?.to ?? "17:00",
        closed: partner ? !row : d.key === "ned",
      }
    }),
  )

  function setHour(day: DayKey, patch: Partial<{ from: string; to: string; closed: boolean }>) {
    setHours((prev) => prev.map((h) => (h.day === day ? { ...h, ...patch } : h)))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setCoords("")
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Izmeni partnera" : "Novi partner"}</DialogTitle>
          <DialogDescription>Polja sa * su obavezna. Partner je vidljiv dok ne prođe datum „plaćeno do“.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pf-name">Naziv *</Label>
            <Input id="pf-name" defaultValue={partner?.name ?? ""} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-type">Tip *</Label>
              <Select defaultValue={partner?.type ?? "vet"}>
                <SelectTrigger id="pf-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vet">Veterinar</SelectItem>
                  <SelectItem value="shop">Pet shop</SelectItem>
                  <SelectItem value="grooming">Grooming salon</SelectItem>
                  <SelectItem value="hotel">Pet hotel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-city">Grad *</Label>
              <Select defaultValue={partner?.city}>
                <SelectTrigger id="pf-city" className="w-full">
                  <SelectValue placeholder="Izaberi grad" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-address">Adresa *</Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input id="pf-address" className="min-w-0 flex-1" defaultValue={isEdit ? "Bulevar oslobođenja 45" : ""} />
              <Button
                type="button"
                variant="outline"
                className="h-11 md:h-9"
                onClick={() => setCoords("45,2551° N, 19,8452° E")}
              >
                <Crosshair className="size-4" aria-hidden />
                Pronađi koordinate
              </Button>
            </div>
            {coords && <p className="text-sm text-muted-foreground">Koordinate: {coords}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-phone">Telefon *</Label>
              <Input id="pf-phone" type="tel" defaultValue={isEdit ? "+381 21 455 100" : ""} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-email">Mejl</Label>
              <Input id="pf-email" type="email" defaultValue={isEdit ? "kontakt@drvet.rs" : ""} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-web">Sajt</Label>
              <Input id="pf-web" defaultValue={isEdit ? "drvet.rs" : ""} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-ig">Instagram</Label>
              <Input id="pf-ig" placeholder="bez @" defaultValue={isEdit ? "drvet.ns" : ""} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-channel">Kanal za poruke</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as MessageChannel)}>
                <SelectTrigger id="pf-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez poruka</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="viber">Viber</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-message-number">Broj za poruke{channel !== "none" ? " *" : ""}</Label>
              <Input
                id="pf-message-number"
                type="tel"
                placeholder="+381 64 123 4567"
                disabled={channel === "none"}
                aria-describedby="pf-message-number-hint"
                defaultValue={partner?.message_number ?? ""}
              />
              <p id="pf-message-number-hint" className="text-xs text-muted-foreground">
                {channel === "none"
                  ? "Dugme „Poruka” se ne prikazuje."
                  : "Može da se razlikuje od broja za pozive."}
              </p>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-paid">Plaćeno do *</Label>
              <Input id="pf-paid" type="date" defaultValue={isEdit ? "2026-12-31" : ""} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Radno vreme</legend>
            <ul className="space-y-2">
              {dayOrder.map((d) => {
                const h = hours.find((x) => x.day === d.key)!
                return (
                  <li
                    key={d.key}
                    className="flex flex-col gap-2 rounded-sm bg-foreground/5 p-3"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{d.label}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Label htmlFor={`pf-closed-${d.key}`} className="text-xs font-medium">
                          Zatvoreno
                        </Label>
                        <Switch
                          id={`pf-closed-${d.key}`}
                          checked={h.closed}
                          onCheckedChange={(v) => setHour(d.key, { closed: v })}
                        />
                      </div>
                    </div>
                    {h.closed ? (
                      <p className="min-w-0 text-sm text-muted-foreground">Ne radi ovog dana.</p>
                    ) : (
                      <div className="grid min-w-0 grid-cols-2 gap-2">
                        <div className="min-w-0 space-y-1">
                          <Label htmlFor={`pf-from-${d.key}`} className="text-xs font-medium">
                            Od
                          </Label>
                          <Input
                            id={`pf-from-${d.key}`}
                            type="time"
                            value={h.from}
                            onChange={(e) => setHour(d.key, { from: e.target.value })}
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <Label htmlFor={`pf-to-${d.key}`} className="text-xs font-medium">
                            Do
                          </Label>
                          <Input
                            id={`pf-to-${d.key}`}
                            type="time"
                            value={h.to}
                            onChange={(e) => setHour(d.key, { to: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="pf-desc">Kratak opis</Label>
            <Textarea id="pf-desc" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-logo">Logo ili fotografija</Label>
            <Input id="pf-logo" type="file" accept="image/*" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-sm bg-foreground/5 p-3">
            <div className="min-w-0">
              <Label htmlFor="pf-featured">Istaknut</Label>
              <p className="text-xs text-muted-foreground">Najviše 3 po tipu u gradu.</p>
            </div>
            <Switch id="pf-featured" defaultChecked={partner?.featured ?? false} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          <Button className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            Sačuvaj partnera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminScreen() {
  const [view, setView] = useState<ViewState>("default")
  const [tab, setTab] = useState<TabKey>("azili")
  const [shelters, setShelters] = useState<PendingShelter[]>(pendingShelters)
  const [notice, setNotice] = useState("")
  const [rejecting, setRejecting] = useState<PendingShelter | null>(null)
  const [partners, setPartners] = useState<AdminPartner[]>(initialPartners)
  const [editing, setEditing] = useState<AdminPartner | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viberOn, setViberOn] = useState(false)
  const [confirmViber, setConfirmViber] = useState(false)

  const shelterList = view === "empty" ? [] : shelters
  const partnerList = view === "empty" ? [] : partners

  function featuredCount(type: PartnerType, city: string) {
    return partners.filter((p) => p.type === type && p.city === city && p.featured && p.active).length
  }

  function toggleFeatured(id: string, value: boolean) {
    setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, featured: value } : p)))
  }

  function approve(s: PendingShelter) {
    setShelters((prev) => prev.filter((x) => x.id !== s.id))
    setNotice(`${s.name} je odobren. Poslali smo mejl na ${s.email}.`)
  }

  function confirmReject() {
    if (!rejecting) return
    setShelters((prev) => prev.filter((x) => x.id !== rejecting.id))
    setNotice(`${rejecting.name} je odbijen i obavešten mejlom.`)
    setRejecting(null)
  }

  return (
    <AppShell variant="admin" active={tab} user={{ name: "Marko Jovanović" }}>
      <StateSwitcher
        states={[
          { value: "default", label: "Podrazumevano" },
          { value: "loading", label: "Učitavanje" },
          { value: "empty", label: "Prazno" },
          { value: "error", label: "Greška" },
        ]}
        value={view}
        onChange={setView}
      />

      <div className="space-y-6">
        <h1 className="font-heading text-[28px] leading-9 font-bold">Administracija</h1>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as TabKey)
            setNotice("")
          }}
        >
          <div className="overflow-x-auto overflow-y-hidden">
            <TabsList>
              <TabsTrigger value="azili">Azili na čekanju</TabsTrigger>
              <TabsTrigger value="partneri">Partneri</TabsTrigger>
              <TabsTrigger value="statistika">Statistika</TabsTrigger>
              <TabsTrigger value="kanali">Kanali</TabsTrigger>
            </TabsList>
          </div>

          {notice && (
            <Card role="status" className="mt-4 flex-row items-center gap-3 px-4 py-3">
              <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
              <p className="min-w-0 text-sm">{notice}</p>
            </Card>
          )}

          {/* Azili na čekanju */}
          <TabsContent value="azili" className="mt-4 space-y-4">
            {view === "loading" && <TableSkeleton />}
            {view === "error" && <ErrorState onRetry={() => setView("default")} />}
            {(view === "default" || view === "empty") && shelterList.length === 0 && (
              <EmptyState
                icon={Building2}
                title="Nema azila na čekanju"
                description="Sve prijave su obrađene. Nove stižu ovde čim se azil registruje."
              />
            )}
            {(view === "default" || view === "empty") &&
              shelterList.map((s) => (
                <Card key={s.id} className="gap-4 p-4 md:p-6">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate font-heading text-lg font-bold">{s.name}</h2>
                      <p className="truncate text-sm text-muted-foreground">
                        {s.city} · {s.contact} · {s.email}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      Prijava {s.registeredOn}
                    </span>
                  </div>
                  <p className="rounded-sm bg-foreground/5 p-3 text-sm">{s.note}</p>
                  <div className="flex flex-col gap-2 md:flex-row md:justify-end">
                    <Button variant="outline" className="h-11 md:h-9" onClick={() => setRejecting(s)}>
                      Odbij
                    </Button>
                    <Button className="h-11 md:h-9" onClick={() => approve(s)}>
                      Odobri
                    </Button>
                  </div>
                </Card>
              ))}
          </TabsContent>

          {/* Partneri */}
          <TabsContent value="partneri" className="mt-4 space-y-4">
            {view === "loading" && <TableSkeleton />}
            {view === "error" && <ErrorState onRetry={() => setView("default")} />}
            {(view === "default" || view === "empty") && (
              <>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Istaknuti veterinari u Novom Sadu: {featuredCount("vet", "Novi Sad")} / 3
                  </p>
                  <Button
                    className="h-11 md:h-9"
                    onClick={() => {
                      setEditing(null)
                      setDialogOpen(true)
                    }}
                  >
                    <Plus className="size-5" aria-hidden />
                    Novi partner
                  </Button>
                </div>
                {partnerList.length === 0 ? (
                  <EmptyState
                    icon={Building2}
                    title="Još nema partnera"
                    description="Dodaj prvog partnera i pojaviće se vlasnicima u njegovom gradu."
                    action="Novi partner"
                    onAction={() => {
                      setEditing(null)
                      setDialogOpen(true)
                    }}
                  />
                ) : (
                  <Card className="gap-0 py-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Naziv</TableHead>
                          <TableHead>Tip</TableHead>
                          <TableHead>Grad</TableHead>
                          <TableHead>Istaknut</TableHead>
                          <TableHead>Plaćeno do</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-12">
                            <span className="sr-only">Radnje</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {partnerList.map((p) => {
                          const count = featuredCount(p.type, p.city)
                          const limitReached = !p.featured && count >= 3
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell>{typeLabel[p.type]}</TableCell>
                              <TableCell>{p.city}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={p.featured}
                                    disabled={limitReached || !p.active}
                                    onCheckedChange={(v) => toggleFeatured(p.id, v)}
                                    aria-label={`Istaknut: ${p.name}`}
                                  />
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {limitReached ? "3 / 3 — limit" : `${count} / 3`}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>{p.paidUntil}</TableCell>
                              <TableCell>
                                {p.active ? (
                                  <StatusBadge status="done" label="Aktivan" />
                                ) : (
                                  <StatusBadge status="missed" label="Istekao — skriven" />
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Izmeni ${p.name}`}
                                  onClick={() => {
                                    setEditing(p)
                                    setDialogOpen(true)
                                  }}
                                >
                                  <Pencil className="size-4" aria-hidden />
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* Statistika */}
          <TabsContent value="statistika" className="mt-4 space-y-4">
            {view === "loading" && <TableSkeleton />}
            {view === "error" && <ErrorState onRetry={() => setView("default")} />}
            {(view === "default" || view === "empty") && (
              <>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h2 className="font-heading text-[22px] leading-7 font-bold">Klikovi po partneru</h2>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="stats-period" className="shrink-0">
                      Period
                    </Label>
                    <Select defaultValue="2026-10">
                      <SelectTrigger id="stats-period" className="w-full md:w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2026-10">Oktobar 2026.</SelectItem>
                        <SelectItem value="2026-09">Septembar 2026.</SelectItem>
                        <SelectItem value="2026-08">Avgust 2026.</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {view === "empty" ? (
                  <EmptyState
                    icon={Building2}
                    title="Još nema klikova"
                    description="Kad vlasnici koriste brze akcije, brojke se pojavljuju ovde."
                  />
                ) : (
                  <Card className="gap-0 py-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Partner</TableHead>
                          <TableHead className="text-right">Pozovi</TableHead>
                          <TableHead className="text-right">Poruka</TableHead>
                          <TableHead className="text-right">Mejl</TableHead>
                          <TableHead className="text-right">Sajt</TableHead>
                          <TableHead className="text-right">Ukupno</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.map((s) => (
                          <TableRow key={s.name}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.call}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.message}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.email}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.web}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {s.call + s.message + s.email + s.web}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* Kanali */}
          <TabsContent value="kanali" className="mt-4 space-y-4">
            {view === "loading" && <TableSkeleton />}
            {view === "error" && <ErrorState onRetry={() => setView("default")} />}
            {(view === "default" || view === "empty") && (
              <>
                <Card className="gap-4 p-4 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                        <MessageCircle className="size-5 text-muted-foreground" aria-hidden />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Label htmlFor="viber-switch" className="font-heading text-lg font-bold">
                            Viber
                          </Label>
                          <Badge variant={viberOn ? "default" : "outline"} className={viberOn ? "" : "bg-card"}>
                            {viberOn ? "Uključen" : "Isključen"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Kad je uključen, Premium korisnici mogu da izaberu Viber za podsetnike. Dok je isključen,
                          Viber se nigde ne prikazuje.
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="viber-switch"
                      checked={viberOn}
                      onCheckedChange={(v) => (v ? setConfirmViber(true) : setViberOn(false))}
                    />
                  </div>
                  <p className="flex items-start gap-2 text-sm text-warning">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      Viber poslovne poruke koštaju oko 100 € mesečno, bez obzira na broj korisnika.
                    </span>
                  </p>
                </Card>

                <Card className="gap-3 p-4 md:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-heading text-lg font-bold">WhatsApp</h2>
                    <StatusBadge status="done" label="Uključen" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Dostupan Premium korisnicima. Limit: 30 WhatsApp/Viber poruka po korisniku mesečno, posle toga
                    podsetnici idu mejlom i push porukom.
                  </p>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odbiti {rejecting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Azil dobija mejl na {rejecting?.email}. Možeš da dodaš razlog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Razlog (opciono)</Label>
            <Textarea id="reject-reason" placeholder="npr. Nedostaje dokaz o registraciji udruženja." />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmReject}>
              Da, odbij
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmViber} onOpenChange={setConfirmViber}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uključiti Viber?</AlertDialogTitle>
            <AlertDialogDescription>
              Ovo pokreće trošak od oko 100 € mesečno. Premium korisnici će odmah moći da izaberu Viber u
              podešavanjima podsetnika.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setViberOn(true)
                setConfirmViber(false)
              }}
            >
              Da, uključi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PartnerDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        partner={editing}
      />
    </AppShell>
  )
}
