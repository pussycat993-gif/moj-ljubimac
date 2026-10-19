"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { Check, ExternalLink, Globe, ImageIcon, Mail, Phone, Upload, X } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AppShell } from "../components/shells"
import { ReadOnlyBanner } from "../components/read-only-banner"
import { StateSwitcher } from "../components/state-switcher"

// S29 — Javni profil organizacije · /organizacija/profil · FR-60
// Admin edits description, phone, email, website and logo; Volunteer sees the same fields read-only.

type OrgType = "shelter" | "breeder"
type Role = "admin" | "volunteer"

type Profile = {
  name: string
  city: string
  slug: string
  description: string
  phone: string
  email: string
  website: string
  logo: { name: string; size: string } | null
}

const profiles: Record<OrgType, Profile> = {
  shelter: {
    name: "Azil „Druga šansa“",
    city: "Novi Sad",
    slug: "druga-sansa",
    description:
      "Mali azil na Telepu. Brinemo o 40-ak pasa i mačaka, sve životinje su čipovane, vakcinisane i sterilisane pre udomljavanja. Posete subotom od 10:00 do 14:00.",
    phone: "021 123 456",
    email: "kontakt@drugasansa.rs",
    website: "https://drugasansa.rs",
    logo: { name: "logo-druga-sansa.png", size: "0,3 MB" },
  },
  breeder: {
    name: "Odgajivačnica „Zlatna šapa“",
    city: "Bečej",
    slug: "zlatna-sapa",
    description:
      "Registrovana odgajivačnica zlatnih retrivera (FCI). Štenci odrastaju u kući, sa decom i mačkama. Uz svako štene dobijaš karton sa vakcinama i pedigre.",
    phone: "021 6915 220",
    email: "zlatnasapa@gmail.com",
    website: "",
    logo: null,
  },
}

type Errors = Partial<Record<"description" | "phone" | "email" | "website", string>>

const DESCRIPTION_MAX = 600

function validate(p: Profile): Errors {
  const e: Errors = {}
  if (p.description.length > DESCRIPTION_MAX) e.description = `Opis može imati najviše ${DESCRIPTION_MAX} znakova.`
  if (p.phone && !/^[0-9 +/-]{6,}$/.test(p.phone)) e.phone = "Upiši ispravan broj telefona, npr. 021 123 456."
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) e.email = "Upiši ispravnu mejl adresu."
  if (p.website && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(p.website)) e.website = "Adresa sajta počinje sa https://"
  return e
}

function ReadOnlyField({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Phone }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-sm">
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <span className="min-w-0 truncate">{value || "—"}</span>
      </dd>
    </div>
  )
}

export default function OrgProfileScreen() {
  const [orgType, setOrgType] = useState<OrgType>("shelter")
  const [role, setRole] = useState<Role>("admin")
  const [profile, setProfile] = useState<Profile>(profiles.shelter)
  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState(false)

  const isAdmin = role === "admin"

  function changeOrgType(t: OrgType) {
    setOrgType(t)
    setProfile(profiles[t])
    setErrors({})
    setSaved(false)
  }

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((p) => ({ ...p, [key]: value }))
    setSaved(false)
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(profile)
    setErrors(e)
    setSaved(Object.keys(e).length === 0)
  }

  const initials = profile.name
    .replace(/[„“”"]/g, "")
    .split(" ")
    .slice(1, 3)
    .map((w) => w.charAt(0).toUpperCase())
    .join("")

  return (
    <AppShell variant="organisation" orgType={orgType} active="javni-profil">
      <StateSwitcher
        states={[
          { value: "shelter", label: "Azil" },
          { value: "breeder", label: "Odgajivačnica" },
        ]}
        value={orgType}
        onChange={changeOrgType}
      />
      <StateSwitcher
        states={[
          { value: "admin", label: "Admin" },
          { value: "volunteer", label: "Volonter (samo pregled)" },
        ]}
        value={role}
        onChange={(r) => {
          setRole(r)
          setErrors({})
          setSaved(false)
        }}
      />

      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">
              {profile.name}, {profile.city}
            </p>
            <h1 className="font-heading text-[28px] leading-9 font-bold">Javni profil</h1>
            <p className="text-sm text-muted-foreground">Ovo vide posetioci na javnoj stranici i uz svaku životinju.</p>
          </div>
          <Button asChild variant="outline" className="h-11 shrink-0 md:h-9">
            <Link href={`/o/${profile.slug}`}>
              <ExternalLink className="size-4" aria-hidden />
              Pogledaj javnu stranicu
            </Link>
          </Button>
        </div>

        {!isAdmin && (
          <ReadOnlyBanner reason="Ti si volonter u ovoj organizaciji. Javni profil menjaju samo admini — javi se Ivani Petrović ako nešto treba ispraviti." />
        )}

        {saved && (
          <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
            <Check className="size-5 shrink-0 text-success" aria-hidden />
            <p className="min-w-0 text-sm">Sačuvano. Javna stranica prikazuje izmene za najviše 5 minuta.</p>
          </Card>
        )}

        {isAdmin ? (
          <form noValidate onSubmit={onSubmit} className="space-y-6">
            <Card className="gap-4 p-4 md:p-6">
              <h2 className="font-heading text-lg font-bold">Logo</h2>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                <Avatar className="size-12 rounded-sm">
                  <AvatarFallback className="rounded-sm bg-muted font-heading font-bold text-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {profile.logo ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-sm bg-foreground/5 py-1 pr-1 pl-3">
                    <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{profile.logo.name}</span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{profile.logo.size}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Ukloni logo ${profile.logo.name}`}
                      onClick={() => set("logo", null)}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 md:h-9"
                    onClick={() => set("logo", { name: "logo-zlatna-sapa.png", size: "0,2 MB" })}
                  >
                    <Upload className="size-4" aria-hidden />
                    Dodaj logo
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">PNG ili JPG, najviše 2 MB. Najbolje kvadratna slika.</p>
            </Card>

            <Card className="gap-4 p-4 md:p-6">
              <h2 className="font-heading text-lg font-bold">O nama</h2>
              <div className="space-y-2">
                <Label htmlFor="org-description">Opis</Label>
                <Textarea
                  id="org-description"
                  rows={5}
                  value={profile.description}
                  onChange={(e) => set("description", e.target.value)}
                  aria-invalid={!!errors.description}
                  aria-describedby={errors.description ? "org-description-error org-description-count" : "org-description-count"}
                  placeholder={
                    orgType === "shelter"
                      ? "Ko ste, gde ste i kako izgleda udomljavanje kod vas."
                      : "Koje rase gajite, kako odrastaju mladunci i šta dobija novi vlasnik."
                  }
                />
                <p id="org-description-count" className="text-right text-xs font-medium text-muted-foreground">
                  {profile.description.length} / {DESCRIPTION_MAX}
                </p>
                {errors.description && (
                  <p id="org-description-error" className="text-sm text-destructive">
                    {errors.description}
                  </p>
                )}
              </div>
            </Card>

            <Card className="gap-4 p-4 md:p-6">
              <h2 className="font-heading text-lg font-bold">Kontakt</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="org-phone">Telefon</Label>
                  <Input
                    id="org-phone"
                    type="tel"
                    autoComplete="tel"
                    value={profile.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    onBlur={() => setErrors((er) => ({ ...er, phone: validate(profile).phone }))}
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? "org-phone-error" : undefined}
                    className="h-11 md:h-9"
                  />
                  {errors.phone && (
                    <p id="org-phone-error" className="text-sm text-destructive">
                      {errors.phone}
                    </p>
                  )}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="org-email">Mejl</Label>
                  <Input
                    id="org-email"
                    type="email"
                    autoComplete="email"
                    value={profile.email}
                    onChange={(e) => set("email", e.target.value)}
                    onBlur={() => setErrors((er) => ({ ...er, email: validate(profile).email }))}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "org-email-error" : undefined}
                    className="h-11 md:h-9"
                  />
                  {errors.email && (
                    <p id="org-email-error" className="text-sm text-destructive">
                      {errors.email}
                    </p>
                  )}
                </div>
                <div className="min-w-0 space-y-2 md:col-span-2">
                  <Label htmlFor="org-website">Sajt</Label>
                  <Input
                    id="org-website"
                    type="url"
                    autoComplete="url"
                    placeholder="https://"
                    value={profile.website}
                    onChange={(e) => set("website", e.target.value)}
                    onBlur={() => setErrors((er) => ({ ...er, website: validate(profile).website }))}
                    aria-invalid={!!errors.website}
                    aria-describedby={errors.website ? "org-website-error" : "org-website-hint"}
                    className="h-11 md:h-9"
                  />
                  {errors.website ? (
                    <p id="org-website-error" className="text-sm text-destructive">
                      {errors.website}
                    </p>
                  ) : (
                    <p id="org-website-hint" className="text-sm text-muted-foreground">
                      Nije obavezno. Bez sajta dugme „Sajt“ se ne prikazuje.
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => changeOrgType(orgType)}>
                Poništi izmene
              </Button>
              <Button type="submit" className="h-11 md:h-9">
                Sačuvaj profil
              </Button>
            </div>
          </form>
        ) : (
          <Card className="gap-6 p-4 md:p-6">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-12 rounded-sm">
                <AvatarFallback className="rounded-sm bg-muted font-heading font-bold text-foreground">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="truncate font-heading text-lg font-bold">{profile.name}</h2>
                <p className="truncate text-sm text-muted-foreground">{profile.city}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Opis</p>
              <p className="text-sm">{profile.description}</p>
            </div>
            <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ReadOnlyField label="Telefon" value={profile.phone} icon={Phone} />
              <ReadOnlyField label="Mejl" value={profile.email} icon={Mail} />
              <ReadOnlyField label="Sajt" value={profile.website} icon={Globe} />
              <ReadOnlyField label="Logo" value={profile.logo ? profile.logo.name : "Nije dodat"} icon={ImageIcon} />
            </dl>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
