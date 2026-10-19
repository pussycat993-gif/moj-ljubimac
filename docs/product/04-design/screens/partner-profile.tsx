"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, AtSign, Clock, Globe, Mail, MapPin, MessageCircle, Navigation, Phone } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell } from "../components/shells"
import { ErrorState } from "../components/error-state"
import { StateSwitcher } from "../components/state-switcher"

type ViewState = "default" | "minimal" | "loading" | "error"

type DayKey = "pon" | "uto" | "sre" | "cet" | "pet" | "sub" | "ned"
// Working hours are structured rows; a day without a row is closed.
type HoursRow = { day: DayKey; from: string; to: string }
// Partner messaging uses its own number, separate from the call phone.
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

// Mock "today" is Monday, 19. 10. 2026.
const TODAY: DayKey = "pon"

const channelLabel: Record<Exclude<MessageChannel, "none">, string> = {
  whatsapp: "WhatsApp",
  viber: "Viber",
  sms: "SMS",
}

function messageHref(channel: MessageChannel, number: string) {
  const d = digits(number)
  if (channel === "whatsapp") return `https://wa.me/${d}`
  if (channel === "viber") return `viber://chat?number=%2B${d}`
  return `sms:+${d}`
}

function weekdays(from: string, to: string, days: DayKey[]): HoursRow[] {
  return days.map((day) => ({ day, from, to }))
}

type PartnerDetail = {
  name: string
  initials: string
  type: string
  address: string
  city: string
  distance: string
  phone: string
  message_number?: string
  message_channel: MessageChannel
  email?: string
  website?: string
  instagram?: string
  description: string
  hours: HoursRow[]
}

const full: PartnerDetail = {
  name: "Veterinarska ambulanta „Dr Vet“",
  initials: "DV",
  type: "Veterinar",
  address: "Bulevar oslobođenja 45",
  city: "Novi Sad",
  distance: "1,2 km",
  phone: "+381 21 455 100",
  message_number: "+381 64 455 1000",
  message_channel: "whatsapp",
  email: "kontakt@drvet.rs",
  website: "drvet.rs",
  instagram: "drvet.ns",
  description:
    "Ambulanta za male životinje sa 15 godina iskustva. Vakcinacije, čipovanje, pasoši, interna medicina, ultrazvuk i stomatologija. Hitni slučajevi radnim danima do 22:00.",
  hours: [...weekdays("08:00", "20:00", ["pon", "uto", "sre", "cet", "pet"]), { day: "sub", from: "09:00", to: "14:00" }],
}

// Partner with only the required fields — quick actions without data are hidden (FR-55).
const minimal: PartnerDetail = {
  name: "Pet shop „Kod Ćire“",
  initials: "KĆ",
  type: "Pet shop",
  address: "Kisačka 33",
  city: "Novi Sad",
  distance: "1,9 km",
  phone: "+381 21 470 115",
  message_channel: "none",
  description: "Hrana, oprema i igračke za pse, mačke i male ljubimce. Dostava po Novom Sadu.",
  hours: weekdays("09:00", "19:00", ["pon", "uto", "sre", "cet", "pet", "sub"]),
}

function digits(s: string) {
  return s.replace(/\D/g, "")
}

export default function PartnerProfileScreen() {
  const [view, setView] = useState<ViewState>("default")
  const p = view === "minimal" ? minimal : full

  const actions = [
    { key: "call", label: "Pozovi", icon: Phone, href: `tel:${p.phone.replace(/\s/g, "")}`, show: true },
    {
      key: "message",
      label: p.message_channel !== "none" ? `Poruka (${channelLabel[p.message_channel]})` : "Poruka",
      icon: MessageCircle,
      href: p.message_channel !== "none" && p.message_number ? messageHref(p.message_channel, p.message_number) : "",
      show: p.message_channel !== "none" && !!p.message_number,
    },
    { key: "email", label: "Pošalji mejl", icon: Mail, href: `mailto:${p.email ?? ""}`, show: !!p.email },
    { key: "web", label: "Poseti sajt", icon: Globe, href: `https://${p.website ?? ""}`, show: !!p.website },
  ].filter((a) => a.show)

  return (
    <AppShell variant="owner" active="partneri">
      <StateSwitcher
        states={[
          { value: "default", label: "Podrazumevano" },
          { value: "minimal", label: "Bez mejla i sajta" },
          { value: "loading", label: "Učitavanje" },
          { value: "error", label: "Greška" },
        ]}
        value={view}
        onChange={setView}
      />

      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/partneri">
            <ArrowLeft className="size-4" aria-hidden />
            Partneri
          </Link>
        </Button>

        {(view === "loading" || view === "error") && <h1 className="sr-only">Profil partnera</h1>}

        {view === "loading" && (
          <div className="space-y-6" aria-busy="true" aria-label="Učitavanje">
            <Card className="flex-row items-center gap-4 p-4 md:p-6">
              <Skeleton className="size-20 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-sm" />
              ))}
            </div>
          </div>
        )}

        {view === "error" && <ErrorState onRetry={() => setView("default")} />}

        {(view === "default" || view === "minimal") && (
          <>
            <Card className="gap-4 p-4 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <Avatar className="size-20">
                  <AvatarFallback className="bg-muted font-heading text-[22px] leading-7 font-bold text-foreground">
                    {p.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-1">
                  <h1 className="font-heading text-[28px] leading-9 font-bold">{p.name}</h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{p.type}</Badge>
                    <span className="text-xs font-medium text-muted-foreground">{p.distance} od tebe</span>
                  </div>
                  <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">
                      {p.address}, {p.city}
                    </span>
                  </p>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-6">
                <section aria-labelledby="actions-heading" className="space-y-3">
                  <h2 id="actions-heading" className="sr-only">
                    Brzi kontakt
                  </h2>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {actions.map((a, i) => {
                      const Icon = a.icon
                      return (
                        <Button
                          key={a.key}
                          asChild
                          variant={i === 0 ? "default" : "outline"}
                          className="h-12 justify-start text-base"
                        >
                          <a href={a.href}>
                            <Icon className="size-5" aria-hidden />
                            {a.label}
                          </a>
                        </Button>
                      )
                    })}
                  </div>
                </section>

                <Card className="gap-3 p-4 md:p-6">
                  <h2 className="font-heading text-lg font-bold">O nama</h2>
                  <p className="text-base">{p.description}</p>
                </Card>
              </div>

              <aside className="min-w-0 space-y-4">
                <Card className="gap-3 p-4 md:p-6">
                  <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
                    <Clock className="size-5 text-muted-foreground" aria-hidden />
                    Radno vreme
                  </h2>
                  <dl className="space-y-2">
                    {dayOrder.map((d) => {
                      const row = p.hours.find((h) => h.day === d.key)
                      const isToday = d.key === TODAY
                      return (
                        <div key={d.key} className="flex items-center justify-between gap-2 text-sm">
                          <dt className={isToday ? "min-w-0 truncate font-medium" : "min-w-0 truncate text-muted-foreground"}>
                            {d.label}
                            {isToday && <span className="text-muted-foreground"> · danas</span>}
                          </dt>
                          <dd className={row ? "shrink-0 font-medium" : "shrink-0 text-muted-foreground"}>
                            {row ? `${row.from} – ${row.to}` : "Zatvoreno"}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>
                </Card>

                <Card className="gap-3 p-4 md:p-6">
                  <h2 className="font-heading text-lg font-bold">Kontakt</h2>
                  <ul className="space-y-2 text-sm">
                    <li className="flex min-w-0 items-center gap-2">
                      <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{p.phone}</span>
                    </li>
                    {p.message_channel !== "none" && p.message_number && (
                      <li className="flex min-w-0 items-center gap-2">
                        <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">
                          {p.message_number} · {channelLabel[p.message_channel]}
                        </span>
                      </li>
                    )}
                    {p.email && (
                      <li className="flex min-w-0 items-center gap-2">
                        <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{p.email}</span>
                      </li>
                    )}
                    {p.website && (
                      <li className="flex min-w-0 items-center gap-2">
                        <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <a href={`https://${p.website}`} className="truncate text-primary hover:underline">
                          {p.website}
                        </a>
                      </li>
                    )}
                    {p.instagram && (
                      <li className="flex min-w-0 items-center gap-2">
                        <AtSign className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <a
                          href={`https://instagram.com/${p.instagram}`}
                          aria-label={`Instagram: ${p.instagram}`}
                          className="truncate text-primary hover:underline"
                        >
                          {p.instagram}
                        </a>
                      </li>
                    )}
                  </ul>
                  <Separator />
                  <Button asChild variant="outline" className="h-11 md:h-9">
                    <a href={`https://maps.google.com/?q=${encodeURIComponent(`${p.address}, ${p.city}`)}`}>
                      <Navigation className="size-4" aria-hidden />
                      Uputstva do adrese
                    </a>
                  </Button>
                </Card>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
