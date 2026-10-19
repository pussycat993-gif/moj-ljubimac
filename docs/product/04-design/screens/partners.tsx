"use client"

import { useState } from "react"
import Link from "next/link"
import { Clock, Globe, LocateFixed, Mail, MapPin, MessageCircle, Phone, Star } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { ErrorState } from "../components/error-state"
import { PetAvatar } from "../components/pet-avatar"
import { StateSwitcher } from "../components/state-switcher"

type ViewState = "default" | "loading" | "empty" | "error"
type PartnerType = "vet" | "shop" | "grooming" | "hotel"
type Filter = "all" | PartnerType

type DayKey = "pon" | "uto" | "sre" | "cet" | "pet" | "sub" | "ned"
// Working hours are structured rows; a day without a row is closed.
type HoursRow = { day: DayKey; from: string; to: string }
// Partner messaging uses its own number, separate from the call phone.
type MessageChannel = "none" | "whatsapp" | "viber" | "sms"

type Partner = {
  id: string
  name: string
  type: PartnerType
  address: string
  distanceKm: number
  phone: string
  message_number?: string
  message_channel: MessageChannel
  email?: string
  website?: string
  featured: boolean
  hours: HoursRow[]
}

const channelLabel: Record<Exclude<MessageChannel, "none">, string> = {
  whatsapp: "WhatsApp",
  viber: "Viber",
  sms: "SMS",
}

function messageHref(channel: MessageChannel, number: string) {
  const d = number.replace(/\D/g, "")
  if (channel === "whatsapp") return `https://wa.me/${d}`
  if (channel === "viber") return `viber://chat?number=%2B${d}`
  return `sms:+${d}`
}

function weekdays(from: string, to: string, days: DayKey[] = ["pon", "uto", "sre", "cet", "pet"]): HoursRow[] {
  return days.map((day) => ({ day, from, to }))
}

// Mock "today" is Monday, 19. 10. 2026.
const TODAY: DayKey = "pon"

function todayHours(hours: HoursRow[]) {
  const row = hours.find((h) => h.day === TODAY)
  return row ? `Danas ${row.from} – ${row.to}` : "Danas zatvoreno"
}

const typeLabel: Record<PartnerType, string> = {
  vet: "Veterinar",
  shop: "Pet shop",
  grooming: "Grooming",
  hotel: "Pet hotel",
}

const filterChips: { value: Filter; label: string }[] = [
  { value: "all", label: "Sve" },
  { value: "vet", label: "Veterinari" },
  { value: "shop", label: "Pet shopovi" },
  { value: "grooming", label: "Grooming" },
  { value: "hotel", label: "Pet hoteli" },
]

// Only partners whose paid-until date has not passed are in this list (FR-52).
const partners: Partner[] = [
  {
    id: "p1",
    name: "Veterinarska ambulanta „Dr Vet“",
    type: "vet",
    address: "Bulevar oslobođenja 45, Novi Sad",
    distanceKm: 1.2,
    phone: "+381 21 455 100",
    message_number: "+381 64 455 1000",
    message_channel: "whatsapp",
    email: "kontakt@drvet.rs",
    website: "drvet.rs",
    featured: true,
    hours: [...weekdays("08:00", "20:00"), { day: "sub", from: "09:00", to: "14:00" }],
  },
  {
    id: "p2",
    name: "Veterinarska stanica „Zdrava šapa“",
    type: "vet",
    address: "Futoška 12, Novi Sad",
    distanceKm: 2.4,
    phone: "+381 21 520 330",
    message_channel: "none",
    email: "info@zdravasapa.rs",
    featured: true,
    hours: weekdays("07:00", "21:00", ["pon", "uto", "sre", "cet", "pet", "sub", "ned"]),
  },
  {
    id: "p3",
    name: "Veterinarska klinika „Liman“",
    type: "vet",
    address: "Narodnog fronta 8, Novi Sad",
    distanceKm: 3.1,
    phone: "+381 21 640 220",
    message_number: "+381 63 640 2200",
    message_channel: "viber",
    website: "vetliman.rs",
    featured: true,
    hours: [...weekdays("09:00", "19:00"), { day: "sub", from: "09:00", to: "13:00" }],
  },
  {
    id: "p4",
    name: "Veterinarska ambulanta „Detelinara“",
    type: "vet",
    address: "Rumenačka 90, Novi Sad",
    distanceKm: 0.8,
    phone: "+381 21 300 900",
    message_number: "+381 64 300 9000",
    message_channel: "sms",
    featured: true,
    hours: weekdays("08:00", "16:00"),
  },
  {
    id: "p5",
    name: "Pet shop „Šapica“",
    type: "shop",
    address: "Zmaj Jovina 20, Novi Sad",
    distanceKm: 0.6,
    phone: "+381 21 662 040",
    message_number: "+381 65 662 0400",
    message_channel: "whatsapp",
    email: "prodaja@sapica.rs",
    website: "sapica.rs",
    featured: true,
    hours: weekdays("09:00", "20:00", ["pon", "uto", "sre", "cet", "pet", "sub"]),
  },
  {
    id: "p6",
    name: "Pet shop „Kod Ćire“",
    type: "shop",
    address: "Kisačka 33, Novi Sad",
    distanceKm: 1.9,
    phone: "+381 21 470 115",
    message_channel: "none",
    featured: false,
    hours: weekdays("09:00", "19:00", ["pon", "uto", "sre", "cet", "pet", "sub"]),
  },
  {
    id: "p7",
    name: "Grooming salon „Čupko“",
    type: "grooming",
    address: "Bulevar Evrope 18, Novi Sad",
    distanceKm: 2.0,
    phone: "+381 21 633 818",
    message_number: "+381 64 633 8180",
    message_channel: "viber",
    email: "zakazivanje@cupko.rs",
    featured: true,
    hours: weekdays("10:00", "18:00", ["uto", "sre", "cet", "pet", "sub"]),
  },
  {
    id: "p8",
    name: "Pet hotel „Kod Mace“",
    type: "hotel",
    address: "Veternička rampa bb, Novi Sad",
    distanceKm: 6.5,
    phone: "+381 21 820 777",
    message_number: "+381 60 820 7770",
    message_channel: "whatsapp",
    email: "rezervacije@kodmace.rs",
    website: "kodmace.rs",
    featured: false,
    hours: weekdays("00:00", "24:00", ["pon", "uto", "sre", "cet", "pet", "sub", "ned"]),
  },
]

const MAX_FEATURED_PER_TYPE = 3

function formatKm(km: number) {
  return `${km.toFixed(1).replace(".", ",")} km`
}

function initials(name: string) {
  const inner = name.match(/„(.+)“/)?.[1] ?? name
  return inner
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function QuickActions({ p }: { p: Partner }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
      <Button asChild variant="outline" size="sm" className="h-11 min-w-0 md:h-8">
        <a href={`tel:${p.phone.replace(/\s/g, "")}`}>
          <Phone className="size-4" aria-hidden />
          Pozovi
        </a>
      </Button>
      {p.message_channel !== "none" && p.message_number && (
        <Button asChild variant="outline" size="sm" className="h-11 min-w-0 md:h-8">
          <a
            href={messageHref(p.message_channel, p.message_number)}
            aria-label={`Poruka preko: ${channelLabel[p.message_channel]}`}
          >
            <MessageCircle className="size-4" aria-hidden />
            Poruka
          </a>
        </Button>
      )}
      {p.email && (
        <Button asChild variant="outline" size="sm" className="h-11 min-w-0 md:h-8">
          <a href={`mailto:${p.email}`}>
            <Mail className="size-4" aria-hidden />
            Mejl
          </a>
        </Button>
      )}
      {p.website && (
        <Button asChild variant="outline" size="sm" className="h-11 min-w-0 md:h-8">
          <a href={`https://${p.website}`}>
            <Globe className="size-4" aria-hidden />
            Sajt
          </a>
        </Button>
      )}
    </div>
  )
}

function PartnerCard({ p, featured }: { p: Partner; featured?: boolean }) {
  return (
    <Card className="gap-4 p-4 hover:shadow-soft md:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="size-12">
          <AvatarFallback className="bg-muted font-heading font-bold text-foreground">{initials(p.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Link href={`/partneri/${p.id}`} className="block truncate font-heading text-lg font-bold hover:underline">
            {p.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{typeLabel[p.type]}</Badge>
            {featured && (
              <Badge variant="outline" className="border-primary bg-card text-primary">
                <Star aria-hidden />
                Istaknuto
              </Badge>
            )}
            <span className="text-xs font-medium text-muted-foreground">{formatKm(p.distanceKm)}</span>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{p.address}</p>
          <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{todayHours(p.hours)}</span>
          </p>
        </div>
      </div>
      <QuickActions p={p} />
    </Card>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Učitavanje">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="gap-4 p-4 md:p-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-8 w-full" />
        </Card>
      ))}
    </div>
  )
}

export default function PartnersScreen() {
  const [view, setView] = useState<ViewState>("default")
  const [filter, setFilter] = useState<Filter>("all")
  const [useLocation, setUseLocation] = useState(false)
  const [showVetBanner, setShowVetBanner] = useState(true)

  const inFilter = view === "empty" ? [] : partners.filter((p) => filter === "all" || p.type === filter)

  // Featured first: max 3 per partner type per city (FR-52 / BR-41); the rest by distance.
  const featuredIds = new Set<string>()
  ;(["vet", "shop", "grooming", "hotel"] as PartnerType[]).forEach((t) => {
    inFilter
      .filter((p) => p.type === t && p.featured)
      .slice(0, MAX_FEATURED_PER_TYPE)
      .forEach((p) => featuredIds.add(p.id))
  })
  const featured = inFilter.filter((p) => featuredIds.has(p.id))
  const others = inFilter.filter((p) => !featuredIds.has(p.id)).sort((a, b) => a.distanceKm - b.distanceKm)

  return (
    <AppShell variant="owner" active="partneri">
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
        <div className="space-y-2">
          <h1 className="font-heading text-[28px] leading-9 font-bold">Partneri u blizini</h1>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span className="truncate">
                {useLocation ? "Udaljenost od tvoje trenutne lokacije" : "Udaljenost od grada iz profila: Novi Sad"}
              </span>
            </p>
            {!useLocation && (
              <Button variant="outline" size="sm" className="h-11 min-w-0 md:h-8" onClick={() => setUseLocation(true)}>
                <LocateFixed className="size-4" aria-hidden />
                Koristi moju lokaciju
              </Button>
            )}
          </div>
        </div>

        {showVetBanner && view === "default" && (
          <Card data-pet-sex="male" className="flex-col gap-3 p-4 md:flex-row md:items-center md:p-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <PetAvatar name="Maks" sex="male" species="dog" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Maks nema upisanog veterinara</p>
                <p className="text-sm text-muted-foreground">Evo veterinara u blizini — izaberi jednog i dodaj ga u karton.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                className="h-11 md:h-9"
                onClick={() => {
                  setFilter("vet")
                  setShowVetBanner(false)
                }}
              >
                Pogledaj veterinare
              </Button>
              <Button variant="ghost" className="h-11 md:h-9" onClick={() => setShowVetBanner(false)}>
                Ne sada
              </Button>
            </div>
          </Card>
        )}

        <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1" role="group" aria-label="Vrsta partnera">
          {filterChips.map((c) => (
            <Button
              key={c.value}
              size="sm"
              variant={filter === c.value ? "default" : "outline"}
              aria-pressed={filter === c.value}
              className="shrink-0"
              onClick={() => setFilter(c.value)}
            >
              {c.label}
            </Button>
          ))}
        </div>

        {view === "loading" && <LoadingGrid />}
        {view === "error" && <ErrorState onRetry={() => setView("default")} />}

        {(view === "default" || view === "empty") && inFilter.length === 0 && (
          <EmptyState
            icon={MapPin}
            title="Još nema partnera u tvom gradu"
            description="Radimo na tome. U međuvremenu probaj drugu vrstu ili uključi lokaciju."
          />
        )}

        {view === "default" && inFilter.length > 0 && (
          <>
            {featured.length > 0 && (
              <section className="space-y-4" aria-labelledby="featured-heading">
                <h2 id="featured-heading" className="font-heading text-[22px] leading-7 font-bold">
                  Istaknuto
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {featured.map((p) => (
                    <PartnerCard key={p.id} p={p} featured />
                  ))}
                </div>
              </section>
            )}
            {others.length > 0 && (
              <section className="space-y-4" aria-labelledby="nearby-heading">
                <h2 id="nearby-heading" className="font-heading text-[22px] leading-7 font-bold">
                  Po udaljenosti
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {others.map((p) => (
                    <PartnerCard key={p.id} p={p} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
