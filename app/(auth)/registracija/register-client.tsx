"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { resendVerification, signInWithGoogle } from "@/lib/actions/auth"
import {
  completeRegistration,
  setVisitorLocale,
  signUp,
  type AccountType,
  type City,
} from "@/lib/actions/registration"
import { interpolate, toProfileLocale, type Dictionary, type Locale } from "@/lib/i18n"
import { TERMS_VERSION } from "@/lib/legal"

// S15 — Registracija · /registracija · FR-33, FR-35 · EP-41 (sign-up, resend, complete_registration),
// EP-42 (Google), EP-67 (cities). States: form, inline field errors (422), "Proveri mejl" (email_sent).
// `completion`: a signed-in user without a profile (first Google sign-in) chooses the account type here.

type ViewState = "form" | "check"
type RegisterCopy = Pick<Dictionary, "register" | "common">

const typeIcon = { owner: PawPrint, shelter: Building2, breeder: Sprout } as const

type Errors = { email?: string; password?: string; terms?: string; orgName?: string; city?: string; form?: string }

export function RegisterClient({
  initialLocale,
  copy,
  cities,
  citiesFailed = false,
  completion = null,
}: {
  initialLocale: Locale
  copy: Record<Locale, RegisterCopy>
  cities: City[]
  citiesFailed?: boolean
  completion?: { email: string } | null
}) {
  const router = useRouter()
  const [state, setState] = useState<ViewState>("form")
  const [lang, setLang] = useState<Locale>(initialLocale)
  const [accountType, setAccountType] = useState<AccountType>("owner")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [terms, setTerms] = useState(false)
  const [orgName, setOrgName] = useState("")
  const [city, setCity] = useState("")
  const [pib, setPib] = useState("")
  const [pibInvalid, setPibInvalid] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)
  const [resent, setResent] = useState(false)
  const t = copy[lang].register
  const common = copy[lang].common
  const isOrg = accountType === "shelter" || accountType === "breeder"
  const isCompletion = completion !== null

  function validate(): Errors {
    const e: Errors = {}
    if (!isCompletion) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = t.errEmail
      if (password.length < 8) e.password = t.errPassword
    }
    if (!terms) e.terms = t.errTerms
    if (isOrg) {
      if (!orgName.trim()) e.orgName = t.errOrgName
      if (!city) e.city = citiesFailed ? common.error : t.errCity
    }
    return e
  }

  // 422 field codes (EP-41) → the inline errors of the mockup.
  function fieldErrors(fields: Record<string, string>): Errors {
    const e: Errors = {}
    if (fields.email) e.email = fields.email === "taken" ? t.errTaken : t.errEmail
    if (fields.password) e.password = t.errPassword
    if (fields.terms_version) e.terms = t.errTerms
    if (fields.org_name) e.orgName = t.errOrgName
    if (fields.city_id) e.city = t.errCity
    if (fields.account_type || fields.locale || fields.registration_note) e.form = common.error
    return e
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    setPibInvalid(false)
    if (Object.keys(e).length > 0) return

    const registration = {
      account_type: accountType,
      locale: toProfileLocale(lang),
      terms_version: TERMS_VERSION,
      org_name: isOrg ? orgName.trim() : null,
      city_id: isOrg ? city : null,
      tax_id: isOrg && pib.trim() ? pib.trim() : null,
      registration_note: null,
    }
    setPending(true)
    if (isCompletion) {
      const result = await completeRegistration(registration)
      if (result.ok) {
        router.push(result.data.organisation ? "/organizacija" : "/ljubimci")
        return
      }
      setPending(false)
      showError(result.error)
      return
    }
    const result = await signUp({ ...registration, email, password })
    setPending(false)
    if (result.ok) {
      setResent(false)
      setState("check")
    } else showError(result.error)
  }

  function showError(error: { code: string; fields?: Record<string, string> }) {
    if (error.code === "validation_failed" && error.fields) {
      setErrors(fieldErrors(error.fields))
      setPibInvalid(!!error.fields.tax_id)
    } else setErrors({ form: common.error })
  }

  async function onGoogle() {
    setPending(true)
    const result = await signInWithGoogle({})
    if (result.ok) {
      window.location.assign(result.data.url)
      return
    }
    setPending(false)
    setErrors({ form: common.error })
  }

  async function onResend() {
    setPending(true)
    const result = await resendVerification({ email })
    setPending(false)
    setResent(result.ok)
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
            setPibInvalid(false)
            void setVisitorLocale(l)
          }}
        >
          {l.toUpperCase()}
        </Button>
      ))}
    </div>
  )

  // Terms label: "uslove korišćenja" → S31, "politiku privatnosti" → S30 (owner instruction, Build Plan v1.1),
  // with the PublicShell footer's link markup.
  const termsLabel = interpolate(t.terms, {
    terms: (
      <Link href="/uslovi" className="hover:text-foreground">
        {t.termsLink}
      </Link>
    ),
    privacy: (
      <Link href="/privatnost" className="hover:text-foreground">
        {t.privacyLink}
      </Link>
    ),
  })

  return (
    <>
      {state === "check" ? (
        <Card className="items-center gap-4 p-6 text-center md:p-8">
          <div className="flex w-full justify-end">{langSwitch}</div>
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <Mail className="size-6 text-primary" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.checkTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {t.checkBody} <span className="font-medium break-all text-foreground">{email}</span>.{" "}
            {t.checkBody2}
          </p>
          {accountType === "shelter" && (
            <p className="flex items-start gap-2 rounded-sm bg-foreground/5 p-3 text-left text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">{t.checkShelter}</span>
            </p>
          )}
          <div className="flex w-full flex-col gap-2">
            <Button className="h-11 md:h-9" disabled={pending} onClick={onResend}>
              {t.resend}
            </Button>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setState("form")}>
              {t.changeEmail}
            </Button>
          </div>
          {resent && (
            <p role="status" className="text-sm text-muted-foreground">
              {interpolate(t.resent, { email: <span className="font-medium text-foreground">{email}</span> })}
            </p>
          )}
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
                          <SelectItem key={c.id} value={c.id}>
                            {lang === "en" ? c.name_en : c.name_sr}
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
                      aria-invalid={pibInvalid || undefined}
                      aria-describedby="reg-pib-hint"
                      onChange={(e) => setPib(e.target.value)}
                    />
                    <p
                      id="reg-pib-hint"
                      className={pibInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
                    >
                      {t.pibHint}
                    </p>
                  </div>
                </div>
              </fieldset>
            )}

            {!isCompletion && (
              <>
                {/* Google only — Apple sign-in is deferred beyond v1 (BR-29) */}
                <Button type="button" variant="outline" className="h-11 w-full md:h-9" disabled={pending} onClick={onGoogle}>
                  {t.google}
                </Button>

                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">{t.or}</span>
                  <Separator className="flex-1" />
                </div>
              </>
            )}

            <div className="space-y-4">
              {!isCompletion && (
                <>
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
                </>
              )}
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
                    <span>{termsLabel}</span>
                  </Label>
                </div>
                {errors.terms && <p className="text-sm text-destructive">{errors.terms}</p>}
              </div>
            </div>

            {errors.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}

            <Button type="submit" className="h-11 w-full md:h-9" disabled={pending}>
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
    </>
  )
}
