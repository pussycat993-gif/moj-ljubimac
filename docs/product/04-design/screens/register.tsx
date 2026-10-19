"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { Building2, Info, Mail, PawPrint, Sprout } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { AuthShell } from "../components/shells"
import { StateSwitcher } from "../components/state-switcher"

type ViewState = "form" | "error" | "check"
type Lang = "sr" | "en"
type AccountType = "owner" | "shelter" | "breeder"

// Shared city list — same in profile (S18) and admin partner form (S26).
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

const states: { value: ViewState; label: string }[] = [
  { value: "form", label: "D" },
  { value: "error", label: "Greške u formi" },
  { value: "check", label: "Proveri mejl" },
]

// Every UI string exists in Serbian (Latin) and English (FR-35, NFR-05).
const copy = {
  sr: {
    title: "Napravi nalog",
    subtitle: "Karton, podsetnici i trenuci tvog ljubimca na jednom mestu.",
    accountType: "Vrsta naloga",
    types: {
      owner: { label: "Vlasnik", desc: "Vodim karton svog ljubimca i podsetnike." },
      shelter: { label: "Azil", desc: "Brinem o više životinja i tražim im novi dom." },
      breeder: { label: "Odgajivačnica", desc: "Vodim legla i prodaju mladunaca." },
    },
    shelterNote: "Azil odobravamo ručno, obično u roku od 2 dana.",
    breederNote: "Odgajivačnica koristi poseban plaćeni plan — izabraćeš ga posle potvrde mejla.",
    google: "Nastavi sa Google-om",
    or: "ili mejlom",
    email: "Mejl adresa",
    password: "Lozinka",
    passwordHint: "Najmanje 8 znakova.",
    terms: "Prihvatam uslove korišćenja i politiku privatnosti.",
    submit: "Napravi nalog",
    haveAccount: "Već imaš nalog?",
    signIn: "Prijavi se",
    errEmail: "Upiši ispravnu mejl adresu, npr. ivana@gmail.com.",
    errPassword: "Lozinka mora imati najmanje 8 znakova.",
    errTerms: "Potrebno je da prihvatiš uslove.",
    errTaken: "Ovaj mejl već ima nalog. Prijavi se ili resetuj lozinku.",
    checkTitle: "Proveri mejl",
    checkBody: "Poslali smo link za potvrdu na",
    checkBody2: "Klikni na link da aktiviraš nalog. Dok ga ne potvrdiš, aplikacija čeka.",
    checkShelter: "Kad potvrdiš mejl, tvoj azil ide na odobrenje — obično u roku od 2 dana.",
    resend: "Pošalji link ponovo",
    changeEmail: "Promeni mejl adresu",
    spam: "Ne vidiš mejl? Pogledaj i folder Spam ili Promocije.",
    language: "Jezik",
    orgTitle: "Podaci o organizaciji",
    orgName: "Naziv organizacije *",
    orgNamePlaceholder: "npr. Udruženje „Druga šansa”",
    city: "Grad *",
    cityPlaceholder: "Izaberi grad",
    pib: "PIB",
    pibHint: "Nije obavezno. Upiši ako je organizacija registrovana.",
    errOrgName: "Upiši naziv organizacije.",
    errCity: "Izaberi grad.",
  },
  en: {
    title: "Create an account",
    subtitle: "Your pet's record, reminders and moments in one place.",
    accountType: "Account type",
    types: {
      owner: { label: "Owner", desc: "I keep my pet's record and reminders." },
      shelter: { label: "Shelter", desc: "I care for many animals and find them new homes." },
      breeder: { label: "Breeder", desc: "I manage litters and sell offspring." },
    },
    shelterNote: "Shelters are approved manually, usually within 2 days.",
    breederNote: "Breeders use a separate paid plan — you'll choose it after confirming your email.",
    google: "Continue with Google",
    or: "or with email",
    email: "Email address",
    password: "Password",
    passwordHint: "At least 8 characters.",
    terms: "I accept the terms of use and privacy policy.",
    submit: "Create account",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    errEmail: "Enter a valid email address, e.g. ivana@gmail.com.",
    errPassword: "Password must be at least 8 characters.",
    errTerms: "Please accept the terms.",
    errTaken: "This email already has an account. Sign in or reset your password.",
    checkTitle: "Check your email",
    checkBody: "We sent a confirmation link to",
    checkBody2: "Click the link to activate your account. The app waits until you confirm.",
    checkShelter: "Once you confirm, your shelter goes to review — usually within 2 days.",
    resend: "Resend link",
    changeEmail: "Change email address",
    spam: "Can't see it? Check your Spam or Promotions folder.",
    language: "Language",
    orgTitle: "Organisation details",
    orgName: "Organisation name *",
    orgNamePlaceholder: "e.g. Udruženje „Druga šansa”",
    city: "City *",
    cityPlaceholder: "Choose a city",
    pib: "Tax ID (PIB)",
    pibHint: "Optional. Enter it if the organisation is registered.",
    errOrgName: "Enter the organisation name.",
    errCity: "Choose a city.",
  },
} as const

const typeIcon = { owner: PawPrint, shelter: Building2, breeder: Sprout } as const

type Errors = { email?: string; password?: string; terms?: string; orgName?: string; city?: string; form?: string }

export default function RegisterScreen() {
  const [state, setState] = useState<ViewState>("form")
  const [lang, setLang] = useState<Lang>("sr")
  const [accountType, setAccountType] = useState<AccountType>("owner")
  const [email, setEmail] = useState("ivana.petrovic@gmail.com")
  const [password, setPassword] = useState("")
  const [terms, setTerms] = useState(false)
  const [orgName, setOrgName] = useState("")
  const [city, setCity] = useState("")
  const [pib, setPib] = useState("")
  const [errors, setErrors] = useState<Errors>({})
  const t = copy[lang]
  const isOrg = accountType === "shelter" || accountType === "breeder"

  function validate(): Errors {
    const e: Errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = t.errEmail
    if (password.length < 8) e.password = t.errPassword
    if (!terms) e.terms = t.errTerms
    if (isOrg) {
      if (!orgName.trim()) e.orgName = t.errOrgName
      if (!city) e.city = t.errCity
    }
    return e
  }

  function changeState(v: ViewState) {
    setState(v)
    if (v === "error") {
      setEmail("marko.jovanovic@gmail")
      setPassword("maks")
      setTerms(false)
      setAccountType("shelter")
      setOrgName("")
      setCity("")
      setPib("")
      setErrors({ email: t.errEmail, password: t.errPassword, terms: t.errTerms, orgName: t.errOrgName, city: t.errCity })
    } else {
      setErrors({})
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length === 0) setState("check")
  }

  const langSwitch = (
    <div role="group" aria-label={t.language} className="flex shrink-0 rounded-sm border border-border p-1">
      {(["sr", "en"] as const).map((l) => (
        <Button
          key={l}
          type="button"
          size="sm"
          variant={lang === l ? "default" : "ghost"}
          aria-pressed={lang === l}
          className="h-8 px-3"
          onClick={() => {
            setLang(l)
            setErrors({})
          }}
        >
          {l.toUpperCase()}
        </Button>
      ))}
    </div>
  )

  return (
    <AuthShell>
      <StateSwitcher states={states} value={state} onChange={changeState} />

      {state === "check" ? (
        <Card className="items-center gap-4 p-6 text-center md:p-8">
          <div className="flex w-full justify-end">{langSwitch}</div>
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <Mail className="size-6 text-primary" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.checkTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {t.checkBody} <span className="font-medium break-all text-foreground">{email || "ivana.petrovic@gmail.com"}</span>.{" "}
            {t.checkBody2}
          </p>
          {accountType === "shelter" && (
            <p className="flex items-start gap-2 rounded-sm bg-foreground/5 p-3 text-left text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">{t.checkShelter}</span>
            </p>
          )}
          <div className="flex w-full flex-col gap-2">
            <Button className="h-11 md:h-9">{t.resend}</Button>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setState("form")}>
              {t.changeEmail}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.spam}</p>
        </Card>
      ) : (
        <Card className="gap-6 p-4 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
              <p className="text-sm text-muted-foreground">{t.subtitle}</p>
            </div>
            {langSwitch}
          </div>

          <form className="space-y-6" noValidate onSubmit={onSubmit}>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-xs font-medium">{t.accountType}</legend>
              <RadioGroup value={accountType} onValueChange={(v) => setAccountType(v as AccountType)} className="gap-2">
                {(["owner", "shelter", "breeder"] as const).map((type) => {
                  const Icon = typeIcon[type]
                  const selected = accountType === type
                  return (
                    <Label
                      key={type}
                      htmlFor={`type-${type}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-sm border p-3 font-normal",
                        selected ? "border-primary bg-foreground/5" : "border-border",
                      )}
                    >
                      <RadioGroupItem id={`type-${type}`} value={type} className="mt-1" />
                      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{t.types[type].label}</span>
                        <span className="block text-sm text-muted-foreground">{t.types[type].desc}</span>
                      </span>
                    </Label>
                  )
                })}
              </RadioGroup>
              {accountType === "shelter" && (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">{t.shelterNote}</span>
                </p>
              )}
              {accountType === "breeder" && (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">{t.breederNote}</span>
                </p>
              )}
            </fieldset>

            {isOrg && (
              <fieldset className="space-y-4">
                <legend className="mb-2 text-xs font-medium">{t.orgTitle}</legend>
                <div className="space-y-2">
                  <Label htmlFor="reg-org-name">{t.orgName}</Label>
                  <Input
                    id="reg-org-name"
                    autoComplete="organization"
                    className="h-11 md:h-9"
                    value={orgName}
                    placeholder={t.orgNamePlaceholder}
                    aria-invalid={!!errors.orgName}
                    aria-describedby={errors.orgName ? "reg-org-name-error" : undefined}
                    onChange={(e) => setOrgName(e.target.value)}
                    onBlur={() => setErrors((p) => ({ ...p, orgName: validate().orgName }))}
                  />
                  {errors.orgName && (
                    <p id="reg-org-name-error" className="text-sm text-destructive">
                      {errors.orgName}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="reg-city">{t.city}</Label>
                    <Select
                      value={city}
                      onValueChange={(v) => {
                        setCity(v)
                        setErrors((p) => ({ ...p, city: undefined }))
                      }}
                    >
                      <SelectTrigger
                        id="reg-city"
                        className="h-11 w-full md:h-9"
                        aria-invalid={!!errors.city}
                        aria-describedby={errors.city ? "reg-city-error" : undefined}
                      >
                        <SelectValue placeholder={t.cityPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.city && (
                      <p id="reg-city-error" className="text-sm text-destructive">
                        {errors.city}
                      </p>
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="reg-pib">{t.pib}</Label>
                    <Input
                      id="reg-pib"
                      inputMode="numeric"
                      className="h-11 md:h-9"
                      value={pib}
                      placeholder="108765432"
                      aria-describedby="reg-pib-hint"
                      onChange={(e) => setPib(e.target.value)}
                    />
                    <p id="reg-pib-hint" className="text-xs text-muted-foreground">
                      {t.pibHint}
                    </p>
                  </div>
                </div>
              </fieldset>
            )}

            {/* Google only — Apple sign-in is deferred beyond v1 (BR-29) */}
            <Button type="button" variant="outline" className="h-11 w-full md:h-9">
              {t.google}
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="shrink-0 text-xs font-medium text-muted-foreground">{t.or}</span>
              <Separator className="flex-1" />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-email">{t.email}</Label>
                <Input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "reg-email-error" : undefined}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setErrors((p) => ({ ...p, email: validate().email }))}
                />
                {errors.email && (
                  <p id="reg-email-error" className="text-sm text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">{t.password}</Label>
                <Input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  aria-invalid={!!errors.password}
                  aria-describedby="reg-password-hint"
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setErrors((p) => ({ ...p, password: validate().password }))}
                />
                {errors.password ? (
                  <p id="reg-password-hint" className="text-sm text-destructive">
                    {errors.password}
                  </p>
                ) : (
                  <p id="reg-password-hint" className="text-xs text-muted-foreground">
                    {t.passwordHint}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="reg-terms"
                    checked={terms}
                    aria-invalid={!!errors.terms}
                    onCheckedChange={(v) => setTerms(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="reg-terms" className="min-w-0 text-sm font-normal">
                    {t.terms}
                  </Label>
                </div>
                {errors.terms && <p className="text-sm text-destructive">{errors.terms}</p>}
              </div>
            </div>

            <Button type="submit" className="h-11 w-full md:h-9">
              {t.submit}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {t.haveAccount}{" "}
            <Link href="/prijava" className="font-medium text-primary hover:underline">
              {t.signIn}
            </Link>
          </p>
        </Card>
      )}
    </AuthShell>
  )
}
