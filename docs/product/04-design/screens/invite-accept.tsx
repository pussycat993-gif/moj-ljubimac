"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Bell,
  CalendarClock,
  Check,
  CircleX,
  ClipboardList,
  Eye,
  FileText,
  Home,
  Paperclip,
  Syringe,
  UserRound,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { AuthShell } from "../components/shells"
import { PetAvatar } from "../components/pet-avatar"
import { PremiumLock } from "../components/premium-lock"
import { StateSwitcher } from "../components/state-switcher"

// S14 — Prihvati poziv / karton · /poziv/[token] · FR-26, FR-50, FR-51
// Invitation kinds (EP-39/EP-40): household (hh_), organisation team (og_, CR-18), record transfer.
type ViewState = "household" | "team" | "teamAdmin" | "transfer" | "declined" | "signin" | "expired" | "slot" | "loading"
type InviteKind = "household" | "team" | "transfer"
type Decision = "pending" | "accepted" | "declined"

const states: { value: ViewState; label: string }[] = [
  { value: "household", label: "Domaćinstvo" },
  { value: "team", label: "Tim (Volonter)" },
  { value: "teamAdmin", label: "Tim (Admin)" },
  { value: "transfer", label: "Prenos kartona" },
  { value: "declined", label: "Odbijeno" },
  { value: "signin", label: "Nije prijavljen" },
  { value: "expired", label: "Istekao" },
  { value: "slot", label: "Free mesto zauzeto" },
  { value: "loading", label: "L" },
]

const household = {
  name: "Domaćinstvo Petrović",
  inviter: { name: "Ivana Petrović", initials: "IP", city: "Novi Sad" },
  pets: [
    { name: "Luna", sex: "female" as const, kind: "cat" as const, detail: "Mačka · domaća kratkodlaka" },
    { name: "Maks", sex: "male" as const, kind: "dog" as const, detail: "Pas · mešanac" },
  ],
  members: "3 / 6 članova",
}

const transfer = {
  organisation: "Udruženje „Druga šansa”",
  city: "Novi Sad",
  validUntil: "18. 11. 2026.",
  animal: {
    name: "Maks",
    sex: "male" as const,
    kind: "dog" as const,
    species: "Pas · mešanac",
    age: "oko 2 godine",
    microchip: "688 038 100 245 117",
  },
  includes: [
    { icon: Syringe, label: "3 vakcine" },
    { icon: ClipboardList, label: "2 pregleda" },
    { icon: Paperclip, label: "5 priloga" },
  ],
}

const team = {
  organisation: "Udruženje „Druga šansa”",
  kind: "Azil",
  city: "Novi Sad",
  inviter: "Ana Nikolić",
  members: "6 / 20 članova",
  validUntil: "26. 10. 2026.",
}

const roleCopy: Record<"Volonter" | "Admin", { can: string[]; cannot: string }> = {
  Volonter: {
    can: ["da vidiš sve životinje i njihove kartone", "da unosiš negu, težinu i preglede", "da dodaješ nove životinje na prijemu"],
    cannot: "Zahteve za udomljavanje vidiš, ali ih prihvata ili odbija samo Admin.",
  },
  Admin: {
    can: [
      "sve što može i volonter",
      "da prihvataš i odbijaš zahteve i šalješ kartone",
      "da pozivaš članove tima i menjaš javni profil",
    ],
    cannot: "Pretplatu i brisanje organizacije menja samo vlasnik naloga organizacije.",
  },
}

const signedInAs = { name: "Marko Jovanović", email: "marko.jovanovic@gmail.com", initials: "MJ" }

function SignedInAs() {
  return (
    <div className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
      <Avatar className="size-8">
        <AvatarFallback className="bg-muted text-xs text-foreground">{signedInAs.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{signedInAs.name}</p>
        <p className="truncate text-xs text-muted-foreground">{signedInAs.email}</p>
      </div>
      <Button variant="link" size="sm" className="shrink-0 px-0" asChild>
        <Link href="/prijava">Nisi ti?</Link>
      </Button>
    </div>
  )
}

function TransferAnimalCard() {
  const a = transfer.animal
  return (
    <div data-pet-sex={a.sex} className="overflow-hidden rounded-md border border-border bg-card">
      <div className="h-3 bg-pet-accent-soft" aria-hidden />
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <PetAvatar name={a.name} sex={a.sex} species={a.kind} size="md" ring />
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-bold">{a.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {a.species} · {a.age}
            </p>
            <p className="truncate text-xs text-muted-foreground">Mikročip {a.microchip}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {transfer.includes.map((item) => {
            const Icon = item.icon
            return (
              <span
                key={item.label}
                className="inline-flex items-center gap-1 rounded-sm bg-foreground/5 px-2 py-1 text-xs font-medium"
              >
                <Icon className="size-3.5 text-pet-accent" aria-hidden />
                {item.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function InviteAcceptScreen() {
  const [state, setState] = useState<ViewState>("household")
  const [decision, setDecision] = useState<Decision>("pending")
  // Which invitation the "Odbijeno" confirmation refers to (both kinds can be declined).
  const [declinedKind, setDeclinedKind] = useState<InviteKind>("household")

  function changeState(v: ViewState) {
    if (v === "declined") {
      setState("household")
      setDeclinedKind("household")
      setDecision("declined")
      return
    }
    setState(v)
    setDecision("pending")
  }

  function decline(kind: InviteKind) {
    setDeclinedKind(kind)
    setDecision("declined")
  }

  const isTeam = state === "team" || state === "teamAdmin"
  const role: "Volonter" | "Admin" = state === "teamAdmin" ? "Admin" : "Volonter"
  const isInvite = state === "household" || state === "transfer" || isTeam
  const switcherValue: ViewState = isInvite && decision === "declined" ? "declined" : state

  return (
    <AuthShell>
      <StateSwitcher states={states} value={switcherValue} onChange={changeState} />

      {state === "loading" && (
        <Card className="gap-4 p-4 md:p-6" aria-busy="true" aria-label="Učitavanje poziva">
          <h1 className="sr-only">Učitavanje poziva</h1>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-11 w-full md:h-9" />
        </Card>
      )}

      {/* Household invitation (FR-26) */}
      {state === "household" && decision === "pending" && (
        <Card className="gap-6 p-4 md:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Home className="size-4" aria-hidden />
              <span>Poziv u domaćinstvo</span>
            </div>
            <h1 className="font-heading text-[28px] leading-9 font-bold">{household.name}</h1>
            <p className="text-sm text-muted-foreground">Poziva te: {household.inviter.name}</p>
            <p className="text-sm text-muted-foreground">
              Zajedno ćete brinuti o ljubimcima — ti unosiš svakodnevnu negu, a karton ostaje uredan.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Deljeni ljubimci</p>
            <ul className="space-y-2">
              {household.pets.map((p) => (
                <li key={p.name} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
                  <PetAvatar name={p.name} sex={p.sex} species={p.kind} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{household.members}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Kao član možeš</p>
            <ul className="space-y-2 text-sm">
              {[
                "da dodaješ težinu, obroke i stolicu",
                "da označiš datu dozu terapije i urađen podsetnik",
                "da dodaješ trenutke",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">{t}</span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-muted-foreground">
                <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">Vakcine, terapije, preglede i priloge vidiš, ali ih menja samo Ivana.</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <Bell className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">Podsetnici su isključeni dok ih sam ne uključiš (mejl i push).</span>
              </li>
            </ul>
          </div>

          <SignedInAs />

          <div className="flex flex-col gap-2 md:flex-row-reverse">
            <Button className="h-11 md:h-9 md:flex-1" onClick={() => setDecision("accepted")}>
              Prihvati poziv
            </Button>
            <Button variant="outline" className="h-11 md:h-9 md:flex-1" onClick={() => decline("household")}>
              Odbij
            </Button>
          </div>
        </Card>
      )}

      {/* Organisation team invitation (CR-18) — the invitee keeps their own account type (BR-53) */}
      {isTeam && decision === "pending" && (
        <Card className="gap-6 p-4 md:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" aria-hidden />
              <span>Poziv u tim organizacije</span>
            </div>
            <h1 className="font-heading text-[28px] leading-9 font-bold">{team.organisation}</h1>
            <p className="text-sm text-muted-foreground">
              {team.kind} · {team.city} · Poziva te: {team.inviter}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card">
              <UserRound className="size-5 text-primary" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Tvoja uloga</p>
              <p className="truncate font-heading text-lg font-bold">{role}</p>
            </div>
            <p className="shrink-0 text-xs font-medium text-muted-foreground">{team.members}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Kao {role === "Admin" ? "admin" : "volonter"} možeš</p>
            <ul className="space-y-2 text-sm">
              {roleCopy[role].can.map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">{t}</span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-muted-foreground">
                <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{roleCopy[role].cannot}</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <Home className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">Tvoj nalog ostaje kakav je — i dalje vodiš i svoje ljubimce.</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">Poziv važi do {team.validUntil}</span>
              </li>
            </ul>
          </div>

          <SignedInAs />

          <div className="flex flex-col gap-2 md:flex-row-reverse">
            <Button className="h-11 md:h-9 md:flex-1" onClick={() => setDecision("accepted")}>
              Pridruži se timu
            </Button>
            <Button variant="outline" className="h-11 md:h-9 md:flex-1" onClick={() => decline("team")}>
              Odbij
            </Button>
          </div>
        </Card>
      )}

      {/* Record transfer from a shelter (FR-50) */}
      {state === "transfer" && decision === "pending" && (
        <Card className="gap-6 p-4 md:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-4" aria-hidden />
              <span>Prenos kartona</span>
            </div>
            <h1 className="font-heading text-[28px] leading-9 font-bold">Stiže ti karton: {transfer.animal.name}</h1>
            <p className="text-sm text-muted-foreground">
              {transfer.organisation} iz mesta {transfer.city} ti šalje kompletan karton — sa svim vakcinama, pregledima
              i prilozima.
            </p>
          </div>

          <TransferAnimalCard />

          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">Udruženje zadržava kopiju kartona samo za čitanje.</span>
            </li>
            <li className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">Poziv važi do {transfer.validUntil}</span>
            </li>
          </ul>

          <SignedInAs />

          <div className="flex flex-col gap-2 md:flex-row-reverse">
            <Button className="h-11 md:h-9 md:flex-1" onClick={() => setDecision("accepted")}>
              Prihvati karton
            </Button>
            <Button variant="outline" className="h-11 md:h-9 md:flex-1" onClick={() => decline("transfer")}>
              Odbij
            </Button>
          </div>
        </Card>
      )}

      {/* Accepted confirmation */}
      {isInvite && decision === "accepted" && (
        <Card className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <Check className="size-6 text-primary" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">
            {state === "household"
              ? `Sada si član: ${household.name}`
              : isTeam
                ? `Dobro došao/la u tim: ${team.organisation}`
                : `Novi ljubimac: ${transfer.animal.name}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {state === "household"
              ? "Luna i Maks su na tvojoj listi ljubimaca. Uključi podsetnike kad ti odgovara."
              : isTeam
                ? `Uloga: ${role}. Organizaciju otvaraš iz menija, a tvoji ljubimci ostaju gde su bili.`
                : "Ceo karton je prebačen. Podesi podsetnike za sledeću vakcinu."}
          </p>
          <Button className="h-11 w-full md:h-9" asChild>
            <Link href={isTeam ? "/organizacija" : "/ljubimci"}>{isTeam ? "Idi u organizaciju" : "Idi na ljubimce"}</Link>
          </Button>
        </Card>
      )}

      {/* Declined — invitation or record transfer */}
      {isInvite && decision === "declined" && (
        <Card role="status" className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <CircleX className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">
            {declinedKind === "transfer" ? "Prenos kartona je odbijen" : "Poziv je odbijen"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {declinedKind === "household"
              ? `Javili smo da ne prihvataš poziv u „${household.name}”. Link više ne važi; ako se predomisliš, zamoli za novi poziv.`
              : declinedKind === "team"
                ? `Javili smo da ne prihvataš poziv u tim: ${team.organisation}. Ako se predomisliš, zamoli za novi poziv.`
                : `Javili smo da ne prihvataš karton (ljubimac: ${transfer.animal.name}). Karton ostaje kod organizacije ${transfer.organisation}.`}
          </p>
          <Separator />
          <Button variant="outline" className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">Idi na početnu</Link>
          </Button>
        </Card>
      )}

      {/* Not signed in — must sign in or register first (FR-26) */}
      {state === "signin" && (
        <Card className="gap-6 p-4 md:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Home className="size-4" aria-hidden />
              <span>Poziv u domaćinstvo</span>
            </div>
            <h1 className="font-heading text-[28px] leading-9 font-bold">Poziv: {household.name}</h1>
            <p className="text-sm text-muted-foreground">
              Da prihvatiš poziv, prijavi se ili napravi besplatan nalog. Poziv te čeka ovde.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
            <div className="flex -space-x-2">
              {household.pets.map((p) => (
                <PetAvatar key={p.name} name={p.name} sex={p.sex} species={p.kind} size="sm" />
              ))}
            </div>
            <p className="min-w-0 truncate text-sm">
              Luna i Maks · {household.name}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button className="h-11 md:h-9" asChild>
              <Link href="/registracija">Napravi nalog</Link>
            </Button>
            <Button variant="outline" className="h-11 md:h-9" asChild>
              <Link href="/prijava">Već imam nalog — prijavi me</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Expired (E-19) */}
      {state === "expired" && (
        <Card className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <CalendarClock className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">Ovaj poziv je istekao</h1>
          <p className="text-sm text-muted-foreground">
            Pozivi važe 30 dana. Zamoli {transfer.organisation} da ti pošalje novi — za to im treba samo minut.
          </p>
          <Separator />
          <Button variant="outline" className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">Idi na početnu</Link>
          </Button>
        </Card>
      )}

      {/* Free slot taken (FR-51, E-20) */}
      {state === "slot" && (
        <div className="space-y-4">
          <Card className="gap-4 p-4 md:p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="size-4" aria-hidden />
                <span>Prenos kartona</span>
              </div>
              <h1 className="font-heading text-[28px] leading-9 font-bold">Nema slobodnog mesta za karton: {transfer.animal.name}</h1>
              <p className="text-sm text-muted-foreground">
                Na Free planu imaš jednog aktivnog ljubimca, a to mesto već zauzima Luna.
              </p>
            </div>
            <TransferAnimalCard />
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">Poziv važi do {transfer.validUntil} — imaš vremena da odlučiš.</span>
            </p>
          </Card>
          <PremiumLock description="Uz Premium prihvataš ovaj karton i dodaješ ljubimaca koliko želiš. Prvih 7 dana je besplatno." />
        </div>
      )}
    </AuthShell>
  )
}
