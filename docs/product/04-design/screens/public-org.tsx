"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, CircleCheck, Globe, ImageIcon, LogIn, Mail, MapPin, PawPrint, Phone, X } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PublicShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { StateSwitcher } from "../components/state-switcher"

type OrgType = "shelter" | "breeder"
type ViewState = "guest" | "signedIn" | "empty"

type PublicAnimal = {
  id: string
  name: string
  species: string
  sex: string
  age: string
  description: string
  sterilised: boolean
  vaccinated: boolean
  price?: string
}

const org = {
  shelter: {
    name: "Azil „Druga šansa“",
    initials: "DŠ",
    city: "Novi Sad",
    about: "Udruženje za zaštitu životinja. Brinemo o napuštenim psima i mačkama i tražimo im dom.",
    phone: "+381 21 400 500",
    email: "kontakt@drugasansa.rs",
    website: "drugasansa.rs",
    sectionTitle: "Traže dom",
    action: "Pošalji zahtev",
    animals: [
      {
        id: "a1",
        name: "Luna",
        species: "Mačka",
        sex: "Ženka",
        age: "oko 2 godine",
        description: "Mazna i mirna, voli sunčana mesta pored prozora. Slaže se sa drugim mačkama.",
        sterilised: true,
        vaccinated: true,
      },
      {
        id: "a2",
        name: "Mrvica",
        species: "Mačka",
        sex: "Ženka",
        age: "oko 8 nedelja",
        description: "Razigrana mala istraživačica. Navikla na posudu za pesak.",
        sterilised: false,
        vaccinated: true,
      },
      {
        id: "a3",
        name: "Rocko",
        species: "Pas, mešanac",
        sex: "Mužjak",
        age: "oko 5 godina",
        description: "Veliki dobričina srednje veličine. Lepo hoda na povocu, voli decu.",
        sterilised: true,
        vaccinated: true,
      },
    ] as PublicAnimal[],
  },
  breeder: {
    name: "Odgajivačnica „Zlatna šapa“",
    initials: "ZŠ",
    city: "Bečej",
    about: "Registrovana odgajivačnica zlatnih retrivera. Štenci odrastaju u kući, uz decu i druge pse.",
    phone: "+381 21 690 100",
    email: "info@zlatnasapa.rs",
    website: "zlatnasapa.rs",
    sectionTitle: "Dostupni štenci",
    action: "Pošalji upit",
    animals: [
      {
        id: "b1",
        name: "Zlatko",
        species: "Zlatni retriver",
        sex: "Mužjak",
        age: "9 nedelja",
        description: "Najhrabriji u leglu, prvi stiže do činije. Majka Bela, otac Rex.",
        sterilised: false,
        vaccinated: true,
        price: "120.000 RSD",
      },
      {
        id: "b2",
        name: "Lola",
        species: "Zlatni retriver",
        sex: "Ženka",
        age: "9 nedelja",
        description: "Mirna i nežna, voli da spava u krilu. Majka Bela, otac Rex.",
        sterilised: false,
        vaccinated: true,
        price: "130.000 RSD",
      },
      {
        id: "b3",
        name: "Feđa",
        species: "Zlatni retriver",
        sex: "Mužjak",
        age: "9 nedelja",
        description: "Razigran i radoznao, već zna da donese lopticu.",
        sterilised: false,
        vaccinated: true,
        price: "120.000 RSD",
      },
    ] as PublicAnimal[],
  },
} as const

function YesNoBadge({ yes, yesLabel, noLabel }: { yes: boolean; yesLabel: string; noLabel: string }) {
  return (
    <Badge variant="outline" className="bg-card">
      {yes ? <Check aria-hidden /> : <X aria-hidden />}
      {yes ? yesLabel : noLabel}
    </Badge>
  )
}

export default function PublicOrgScreen() {
  const [orgType, setOrgType] = useState<OrgType>("shelter")
  const [view, setView] = useState<ViewState>("guest")
  const [requestFor, setRequestFor] = useState<PublicAnimal | null>(null)
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: "Ivana Petrović", phone: "", email: "ivana.petrovic@primer.rs", message: "" })
  const [submitted, setSubmitted] = useState(false)

  const o = org[orgType]
  const animals = view === "empty" ? [] : o.animals
  const isShelter = orgType === "shelter"
  const noun = isShelter ? "zahtev" : "upit"

  const errors = {
    name: submitted && !form.name.trim() ? "Upiši ime i prezime." : "",
    phone: submitted && !form.phone.trim() ? "Upiši broj telefona." : "",
    email: submitted && !/^\S+@\S+\.\S+$/.test(form.email) ? "Upiši ispravnu mejl adresu." : "",
  }

  function openRequest(a: PublicAnimal) {
    setRequestFor(a)
    setSent(false)
    setSubmitted(false)
  }

  function submit() {
    setSubmitted(true)
    if (!form.name.trim() || !form.phone.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) return
    setSent(true)
  }

  return (
    <PublicShell>
      <StateSwitcher
        states={[
          { value: "shelter", label: "Azil" },
          { value: "breeder", label: "Odgajivačnica" },
        ]}
        value={orgType}
        onChange={setOrgType}
      />
      <StateSwitcher
        states={[
          { value: "guest", label: "Posetilac (bez naloga)" },
          { value: "signedIn", label: "Prijavljen korisnik" },
          { value: "empty", label: "Prazno" },
        ]}
        value={view}
        onChange={setView}
      />

      <div className="space-y-6">
        <Card className="gap-4 p-4 md:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-20">
              <AvatarFallback className="bg-muted font-heading text-[22px] leading-7 font-bold text-foreground">
                {o.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="font-heading text-[28px] leading-9 font-bold">{o.name}</h1>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden />
                <span className="truncate">
                  {isShelter ? "Azil" : "Odgajivačnica"} · {o.city}
                </span>
              </p>
            </div>
          </div>
          <p className="text-base">{o.about}</p>
          <div className="flex flex-col gap-2 text-sm md:flex-row md:flex-wrap md:gap-4">
            <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="flex min-w-0 items-center gap-2 text-primary hover:underline">
              <Phone className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{o.phone}</span>
            </a>
            <a href={`mailto:${o.email}`} className="flex min-w-0 items-center gap-2 text-primary hover:underline">
              <Mail className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{o.email}</span>
            </a>
            <a href={`https://${o.website}`} className="flex min-w-0 items-center gap-2 text-primary hover:underline">
              <Globe className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{o.website}</span>
            </a>
          </div>
        </Card>

        <section className="space-y-4" aria-labelledby="animals-heading">
          <h2 id="animals-heading" className="font-heading text-[22px] leading-7 font-bold">
            {o.sectionTitle}
          </h2>

          {animals.length === 0 ? (
            <EmptyState
              icon={PawPrint}
              title={isShelter ? "Trenutno nema životinja za udomljavanje" : "Trenutno nema dostupnih štenaca"}
              description={
                isShelter
                  ? "Svi naši štićenici su našli dom ili su još na oporavku. Svrati ponovo uskoro."
                  : "Novo leglo se očekuje uskoro. Javi se odgajivačnici za listu čekanja."
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {animals.map((a) => (
                <Card key={a.id} className="gap-0 overflow-hidden py-0">
                  <div
                    role="img"
                    aria-label={a.name}
                    className="flex aspect-square items-center justify-center bg-foreground/5"
                  >
                    <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="min-w-0 truncate font-heading text-lg font-bold">{a.name}</h3>
                        {a.price && (
                          <span className="shrink-0 text-sm font-medium">{a.price}</span>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {a.species} · {a.sex} · {a.age}
                      </p>
                    </div>
                    <p className="text-sm">{a.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <YesNoBadge
                        yes={a.sterilised}
                        yesLabel={a.sex === "Ženka" ? "Sterilisana" : "Sterilisan"}
                        noLabel={a.sex === "Ženka" ? "Nije sterilisana" : "Nije sterilisan"}
                      />
                      <YesNoBadge
                        yes={a.vaccinated}
                        yesLabel={a.sex === "Ženka" ? "Vakcinisana" : "Vakcinisan"}
                        noLabel={a.sex === "Ženka" ? "Nije vakcinisana" : "Nije vakcinisan"}
                      />
                    </div>
                    <Button className="mt-auto h-11 w-full md:h-9" onClick={() => openRequest(a)}>
                      {o.action}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog open={requestFor !== null} onOpenChange={(open) => !open && setRequestFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {view === "guest" ? (
            <>
              <DialogHeader>
                <DialogTitle>Prijavi se da pošalješ {noun}</DialogTitle>
                <DialogDescription>
                  {isShelter ? "Azil" : "Odgajivačnica"} odgovara mejlom, zato ti treba nalog. Traje manje od minuta, a{" "}
                  {requestFor?.name} te čeka.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button asChild variant="outline" className="h-11 md:h-9">
                  <Link href="/prijava">
                    <LogIn className="size-5" aria-hidden />
                    Prijavi se
                  </Link>
                </Button>
                <Button asChild className="h-11 md:h-9">
                  <Link href="/registracija">Napravi nalog</Link>
                </Button>
              </DialogFooter>
            </>
          ) : sent ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CircleCheck className="size-5 text-success" aria-hidden />
                  {isShelter ? "Zahtev je poslat" : "Upit je poslat"}
                </DialogTitle>
                <DialogDescription>
                  {o.name} će ti odgovoriti mejlom na {form.email}. Javićemo ti i ako {noun} bude prihvaćen ili
                  odbijen.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button className="h-11 md:h-9" onClick={() => setRequestFor(null)}>
                  U redu
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {isShelter ? "Zahtev za udomljavanje" : "Upit"} — {requestFor?.name}
                </DialogTitle>
                <DialogDescription>
                  Tvoji podaci idu samo {isShelter ? "azilu" : "odgajivačnici"}, da može da te kontaktira.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="req-name">Ime i prezime *</Label>
                  <Input
                    id="req-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-invalid={errors.name ? true : undefined}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="req-phone">Telefon *</Label>
                    <Input
                      id="req-phone"
                      type="tel"
                      placeholder="+381 64 123 4567"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      aria-invalid={errors.phone ? true : undefined}
                    />
                    {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="req-email">Mejl *</Label>
                    <Input
                      id="req-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      aria-invalid={errors.email ? true : undefined}
                    />
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="req-message">Poruka</Label>
                  <Textarea
                    id="req-message"
                    placeholder={
                      isShelter
                        ? "Napiši nešto o sebi i domu koji nudiš."
                        : "Pitaj šta te zanima — vakcine, pedigre, preuzimanje."
                    }
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="h-11 md:h-9" onClick={() => setRequestFor(null)}>
                  Otkaži
                </Button>
                <Button className="h-11 md:h-9" onClick={submit}>
                  {o.action}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PublicShell>
  )
}
