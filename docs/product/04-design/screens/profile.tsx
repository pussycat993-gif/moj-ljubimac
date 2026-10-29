"use client"

import { useState } from "react"
import Link from "next/link"
import { Bell, ChevronRight, Database, LogOut, Sparkles } from "lucide-react"
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
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell } from "../components/shells"
import { StateSwitcher } from "../components/state-switcher"
import { StatusBadge } from "../components/status-badge"
import { ErrorState } from "../components/error-state"

type ViewState = "active" | "cancelled" | "expired" | "loading" | "error"

const states: { value: ViewState; label: string }[] = [
  { value: "active", label: "D" },
  { value: "cancelled", label: "Obnova otkazana" },
  { value: "expired", label: "Isteklo (FR-39)" },
  { value: "loading", label: "L" },
  { value: "error", label: "X" },
]

const subscription = {
  plan: "Mesečni plan",
  price: "3 €",
  periodDays: 30,
  daysLeft: 23,
  endsOn: "11. 11. 2026.",
  expiredOn: "12. 9. 2026.",
  card: "Visa •••• 4821",
}

// What the user had above Free limits when Premium ended (FR-39, BR-10, BR-16, BR-28).
const overLimits = [
  { label: "Aktivni ljubimci", value: "2 od 1", detail: "Luna i Maks ostaju vidljivi; novog ljubimca ne možeš da dodaš." },
  { label: "Prilozi — Maks", value: "14 od 10", detail: "Svi prilozi ostaju; novi su blokirani." },
  { label: "Domaćinstvo", value: "3 člana", detail: "Članovi vide deljene ljubimce samo za čitanje." },
  { label: "WhatsApp podsetnici", value: "Isključeno", detail: "Stižu mejlom i push-om." },
]

function DaysRemaining({ cancelled }: { cancelled: boolean }) {
  const pct = Math.round((subscription.daysLeft / subscription.periodDays) * 100)
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 text-sm font-medium">Još {subscription.daysLeft} dana Premiuma</p>
        <p className="shrink-0 text-xs text-muted-foreground">
          {subscription.daysLeft} / {subscription.periodDays}
        </p>
      </div>
      <Progress value={pct} aria-label={`Preostalo ${subscription.daysLeft} od ${subscription.periodDays} dana`} />
      <p className={cancelled ? "text-sm text-warning" : "text-sm text-muted-foreground"}>
        {cancelled
          ? `Premium ističe ${subscription.endsOn} Posle toga prelaziš na Free.`
          : `Sledeća naplata ${subscription.endsOn} · ${subscription.price} · ${subscription.card}`}
      </p>
    </div>
  )
}

// Shared city list — same in registration (S15) and admin partner form (S26).
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

export default function ProfileScreen() {
  const [state, setState] = useState<ViewState>("active")
  const [name, setName] = useState("Ivana Petrović")
  const [city, setCity] = useState("Novi Sad")
  const [language, setLanguage] = useState("sr")

  return (
    <AppShell variant="owner" active="profil">
      <StateSwitcher states={states} value={state} onChange={setState} />

      <div className="space-y-6">
        <h1 className="font-heading text-[28px] leading-9 font-bold">Profil</h1>

        {state === "loading" && (
          <div className="space-y-4" aria-busy="true" aria-label="Učitavanje profila">
            {[0, 1].map((i) => (
              <Card key={i} className="gap-4 p-4 md:p-6">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </Card>
            ))}
          </div>
        )}

        {state === "error" && <ErrorState onRetry={() => setState("active")} />}

        {(state === "active" || state === "cancelled" || state === "expired") && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              {/* Subscription */}
              <Card className="gap-4 p-4 md:p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-heading text-lg font-bold">Pretplata</h2>
                    <p className="text-sm text-muted-foreground">
                      {state === "expired" ? "Free plan" : `${subscription.plan} · ${subscription.price}`}
                    </p>
                  </div>
                  {state === "expired" ? (
                    <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-1 text-xs font-medium">Free</span>
                  ) : (
                    <StatusBadge status="premium" className="shrink-0" />
                  )}
                </div>

                {state !== "expired" && (
                  <>
                    <DaysRemaining cancelled={state === "cancelled"} />
                    <Separator />
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Automatska obnova</p>
                        <p className="text-sm text-muted-foreground">
                          {state === "active" ? "Uključena" : "Isključena — nećemo te ponovo naplatiti"}
                        </p>
                      </div>
                      {state === "active" ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" className="h-11 md:h-9">
                              Otkaži obnovu
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Otkazati automatsku obnovu?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Premium ostaje aktivan do {subscription.endsOn} i više te nećemo naplaćivati. Posle toga
                                prelaziš na Free: svi ljubimci, prilozi i trenuci ostaju vidljivi, ali novi unosi preko
                                Free limita biće blokirani, a WhatsApp podsetnici stižu mejlom i push-om.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Ne, zadrži Premium</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => setState("cancelled")}>
                                Da, otkaži obnovu
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <Button className="h-11 md:h-9" onClick={() => setState("active")}>
                          Uključi obnovu
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {state === "expired" && (
                  <div className="space-y-4">
                    <p className="text-sm">
                      Premium je istekao {subscription.expiredOn} Ništa nije obrisano — sve uneto i dalje
                      vidiš. Novi unosi preko Free limita traže Premium.
                    </p>
                    <ul className="space-y-2">
                      {overLimits.map((item) => (
                        <li key={item.label} className="rounded-sm bg-foreground/5 p-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-medium">{item.label}</p>
                            <p className="shrink-0 text-xs font-medium text-muted-foreground">{item.value}</p>
                          </div>
                          <p className="text-sm text-muted-foreground">{item.detail}</p>
                        </li>
                      ))}
                    </ul>
                    <Button className="h-11 w-full md:h-9 md:w-auto" asChild>
                      <Link href="/premium">
                        <Sparkles className="size-5" aria-hidden />
                        Obnovi Premium
                      </Link>
                    </Button>
                  </div>
                )}
              </Card>

              {/* Personal details */}
              <Card className="gap-4 p-4 md:p-6">
                <h2 className="font-heading text-lg font-bold">Lični podaci</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="profile-name">Ime i prezime</Label>
                    <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="profile-city">Grad</Label>
                    <Select value={city} onValueChange={setCity}>
                      <SelectTrigger id="profile-city" className="w-full">
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
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="profile-email">Mejl adresa</Label>
                    <Input id="profile-email" type="email" value="ivana.petrovic@gmail.com" readOnly />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="profile-language">Jezik</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger id="profile-language" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sr">Srpski (latinica)</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="h-11 md:h-9 md:self-start">Sačuvaj</Button>
              </Card>
            </div>

            {/* Aside — links */}
            <aside className="min-w-0 space-y-4">
              <Card className="gap-0 py-0">
                <Link
                  href="/podesavanja/podsetnici"
                  className="flex items-center gap-3 p-4 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Bell className="size-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Podešavanja podsetnika</span>
                    <span className="block truncate text-xs text-muted-foreground">Kanali, vreme i unapred</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
                <Separator />
                <Link
                  href="/profil/podaci"
                  className="flex items-center gap-3 p-4 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Database className="size-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Moji podaci i brisanje naloga</span>
                    <span className="block truncate text-xs text-muted-foreground">Preuzmi arhivu ili obriši nalog</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </Card>
              <Button variant="outline" className="h-11 w-full md:h-9">
                <LogOut className="size-5" aria-hidden />
                Odjavi se
              </Button>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  )
}
