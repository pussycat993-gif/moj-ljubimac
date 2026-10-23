"use client"

import { useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, ExternalLink, Globe, ImageIcon, Mail, Phone, Upload, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { ErrorState } from "@/components/app/error-state"
import { ReadOnlyBanner } from "@/components/app/read-only-banner"
import type { MyOrganisation, Organisation } from "@/lib/actions/organisation"
import type { UploadRequest, UploadTicket } from "@/lib/actions/uploads"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S29 — Javni profil organizacije · /organizacija/profil · FR-60 (port of
// docs/product/04-design/screens/org-profile.tsx without the StateSwitcher). Data: EP-53. The Admin edits
// description, phone, email and website (EP-72 save) and the logo (EP-13 purpose organisation_logo: ticket →
// PUT → confirm, which stores the key at once; "X" removes it on save). access.can_edit = false (Volunteer,
// pending shelter, breeder without a plan) → the read-only view. The Donacije card is FR-72 (Step 28b).

export type OrgProfileCopy = {
  orgProfile: Dictionary["orgProfile"]
  orgAnimals: Dictionary["orgAnimals"]
  common: Dictionary["common"]
}

export type OrgProfileActions = {
  updateOrganisationProfile: (input: {
    organisation_id: string
    description?: string | null
    phone?: string | null
    email?: string | null
    website?: string | null
    logo_r2_key?: null
  }) => Promise<ActionResult<Organisation>>
  requestUpload: (input: UploadRequest) => Promise<ActionResult<UploadTicket>>
  confirmUpload: (input: { upload_token: string }) => Promise<ActionResult<unknown>>
}

type Fields = { description: string; phone: string; email: string; website: string }
type Errors = Partial<Record<keyof Fields, string>>
type Logo = { name: string; size: string | null; url: string | null } | null

// EP-72 (contract wins over the mockup's 600, owner decision).
const DESCRIPTION_MAX = 1000
const LOGO_TYPES = "image/png,image/jpeg,image/webp"
const MAX_BYTES = 10_485_760

function fieldsOf(o: Organisation): Fields {
  return { description: o.description ?? "", phone: o.phone ?? "", email: o.email ?? "", website: o.website ?? "" }
}

/** The saved logo: the file name is the last part of its presigned URL path (the R2 key). */
function logoOf(o: Organisation): Logo {
  if (!o.logo_url) return null
  let name = "logo"
  try {
    if (o.logo_url.url) name = decodeURIComponent(new URL(o.logo_url.url).pathname.split("/").pop() || "logo")
  } catch {
    name = "logo"
  }
  return { name, size: null, url: o.logo_url.url }
}

function validate(p: Fields, t: Dictionary["orgProfile"]): Errors {
  const e: Errors = {}
  if (p.description.length > DESCRIPTION_MAX) e.description = format(t.errDescription, { max: DESCRIPTION_MAX })
  if (p.phone && (!/^[0-9 +/-]{6,}$/.test(p.phone) || p.phone.length > 30)) e.phone = t.errPhone
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) e.email = t.errEmail
  if (p.website && !/^https:\/\/[^\s.]+\.[^\s]+$/.test(p.website)) e.website = t.errWebsite
  return e
}

function sizeLabel(bytes: number, locale: Locale) {
  return `${new Intl.NumberFormat(locale === "en" ? "en-GB" : "sr-Latn", { maximumFractionDigits: 1 }).format(bytes / 1_048_576)} MB`
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

export function OrgProfileScreen({
  initial,
  locale,
  copy,
  actions,
}: {
  initial: ActionResult<MyOrganisation>
  locale: Locale
  copy: OrgProfileCopy
  actions: OrgProfileActions
}) {
  const t = copy.orgProfile
  const router = useRouter()
  const view = initial.ok ? initial.data : null
  const [organisation, setOrganisation] = useState<Organisation | null>(view?.organisation ?? null)
  const [profile, setProfile] = useState<Fields>(() => (view ? fieldsOf(view.organisation) : fieldsOf({} as Organisation)))
  const [logo, setLogo] = useState<Logo>(() => (view ? logoOf(view.organisation) : null))
  const [removeLogo, setRemoveLogo] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  if (!view || !organisation) {
    return <ErrorState message={copy.common.error} onRetry={() => router.refresh()} labels={{ retry: copy.common.retry }} />
  }

  const canEdit = view.access.can_edit
  const isVolunteer = view.access.role === "volunteer"
  const pending = organisation.approval_status === "pending"
  const noPlan = organisation.type === "breeder" && !view.breeder_plan_active
  const cityName = organisation.city
    ? locale === "en"
      ? organisation.city.name_en || organisation.city.name_sr
      : organisation.city.name_sr
    : null
  const shownLogo = removeLogo ? null : logo
  const initials = organisation.name
    .replace(/[„“”"]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("")

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setProfile((p) => ({ ...p, [key]: value }))
    setSaved(false)
  }

  function reset() {
    if (!organisation) return
    setProfile(fieldsOf(organisation))
    setLogo(logoOf(organisation))
    setRemoveLogo(false)
    setErrors({})
    setSaved(false)
  }

  async function uploadLogo(file: File) {
    if (!organisation) return
    if (!LOGO_TYPES.split(",").includes(file.type) || file.size > MAX_BYTES || file.size < 1) {
      toast.error(copy.common.error)
      return
    }
    setBusy(true)
    try {
      const ticket = await actions.requestUpload({
        purpose: "organisation_logo",
        target_id: organisation.id,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      if (!ticket.ok) throw new Error(ticket.error.code)
      const put = await fetch(ticket.data.put_url, { method: "PUT", headers: ticket.data.headers, body: file })
      if (!put.ok) throw new Error(`put ${put.status}`)
      const confirmed = await actions.confirmUpload({ upload_token: ticket.data.upload_token })
      if (!confirmed.ok) throw new Error(confirmed.error.code)
      const updated = confirmed.data as Organisation
      setOrganisation(updated)
      setLogo({ name: file.name, size: sizeLabel(file.size, locale), url: updated.logo_url?.url ?? null })
      setRemoveLogo(false)
      setSaved(false)
    } catch {
      toast.error(copy.common.error)
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!organisation) return
    const e = validate(profile, t)
    setErrors(e)
    setSaved(false)
    if (Object.keys(e).length > 0) return
    setBusy(true)
    const result = await actions.updateOrganisationProfile({
      organisation_id: organisation.id,
      description: profile.description,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      ...(removeLogo ? { logo_r2_key: null } : {}),
    })
    setBusy(false)
    if (!result.ok) {
      const fields = result.error.code === "validation_failed" ? (result.error.fields ?? {}) : {}
      const mapped: Errors = {}
      if (fields.description) mapped.description = format(t.errDescription, { max: DESCRIPTION_MAX })
      if (fields.phone) mapped.phone = t.errPhone
      if (fields.email) mapped.email = t.errEmail
      if (fields.website) mapped.website = t.errWebsite
      if (Object.keys(mapped).length > 0) setErrors(mapped)
      else toast.error(copy.common.error)
      return
    }
    setOrganisation(result.data)
    setProfile(fieldsOf(result.data))
    if (removeLogo) {
      setLogo(null)
      setRemoveLogo(false)
    }
    setSaved(true)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">
            {cityName ? format(t.nameCity, { name: organisation.name, city: cityName }) : organisation.name}
          </p>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button asChild variant="outline" className="h-11 shrink-0 md:h-9">
          <Link href={organisation.public_path}>
            <ExternalLink className="size-4" aria-hidden />
            {t.viewPublic}
          </Link>
        </Button>
      </div>

      {isVolunteer && <ReadOnlyBanner reason={t.volunteerBanner} />}
      {!isVolunteer && pending && <ReadOnlyBanner reason={copy.orgAnimals.pendingBanner} />}
      {!isVolunteer && !pending && noPlan && <ReadOnlyBanner reason={copy.orgAnimals.breederPlanBanner} />}

      {saved && (
        <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
          <Check className="size-5 shrink-0 text-success" aria-hidden />
          <p className="min-w-0 text-sm">{t.saved}</p>
        </Card>
      )}

      {canEdit ? (
        <form noValidate onSubmit={(ev) => void onSubmit(ev)} className="space-y-6">
          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">{t.logo}</h2>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
              <Avatar className="size-12 rounded-sm">
                {shownLogo?.url && <AvatarImage src={shownLogo.url} alt={organisation.name} className="rounded-sm" />}
                <AvatarFallback className="rounded-sm bg-muted font-heading font-bold text-foreground">{initials}</AvatarFallback>
              </Avatar>
              {shownLogo ? (
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-sm bg-foreground/5 py-1 pr-1 pl-3">
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{shownLogo.name}</span>
                  {shownLogo.size && (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{shownLogo.size}</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={format(t.removeLogo, { name: shownLogo.name })}
                    onClick={() => {
                      setRemoveLogo(true)
                      setSaved(false)
                    }}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 md:h-9"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="size-4" aria-hidden />
                  {t.addLogo}
                </Button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept={LOGO_TYPES}
                className="hidden"
                data-testid="logo-input"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) void uploadLogo(file)
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">{t.logoHint}</p>
          </Card>

          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">{t.about}</h2>
            <div className="space-y-2">
              <Label htmlFor="org-description">{t.description}</Label>
              <Textarea
                id="org-description"
                rows={5}
                value={profile.description}
                onChange={(e) => set("description", e.target.value)}
                aria-invalid={!!errors.description}
                aria-describedby={errors.description ? "org-description-error org-description-count" : "org-description-count"}
                placeholder={organisation.type === "shelter" ? t.descriptionPlaceholderShelter : t.descriptionPlaceholderBreeder}
              />
              <p id="org-description-count" className="text-right text-xs font-medium text-muted-foreground">
                {format(t.count, { n: profile.description.length, max: DESCRIPTION_MAX })}
              </p>
              {errors.description && (
                <p id="org-description-error" className="text-sm text-destructive">
                  {errors.description}
                </p>
              )}
            </div>
          </Card>

          <Card className="gap-4 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">{t.contact}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="org-phone">{t.phone}</Label>
                <Input
                  id="org-phone"
                  type="tel"
                  autoComplete="tel"
                  value={profile.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  onBlur={() => setErrors((er) => ({ ...er, phone: validate(profile, t).phone }))}
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
                <Label htmlFor="org-email">{t.email}</Label>
                <Input
                  id="org-email"
                  type="email"
                  autoComplete="email"
                  value={profile.email}
                  onChange={(e) => set("email", e.target.value)}
                  onBlur={() => setErrors((er) => ({ ...er, email: validate(profile, t).email }))}
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
                <Label htmlFor="org-website">{t.website}</Label>
                <Input
                  id="org-website"
                  type="url"
                  autoComplete="url"
                  placeholder="https://"
                  value={profile.website}
                  onChange={(e) => set("website", e.target.value)}
                  onBlur={() => setErrors((er) => ({ ...er, website: validate(profile, t).website }))}
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
                    {t.websiteHint}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button type="button" variant="outline" className="h-11 md:h-9" onClick={reset}>
              {t.reset}
            </Button>
            <Button type="submit" className="h-11 md:h-9" disabled={busy}>
              {t.save}
            </Button>
          </div>
        </form>
      ) : (
        <Card className="gap-6 p-4 md:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-12 rounded-sm">
              {logo?.url && <AvatarImage src={logo.url} alt={organisation.name} className="rounded-sm" />}
              <AvatarFallback className="rounded-sm bg-muted font-heading font-bold text-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="truncate font-heading text-lg font-bold">{organisation.name}</h2>
              {cityName && <p className="truncate text-sm text-muted-foreground">{cityName}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t.description}</p>
            <p className="text-sm">{organisation.description || "—"}</p>
          </div>
          <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ReadOnlyField label={t.phone} value={organisation.phone ?? ""} icon={Phone} />
            <ReadOnlyField label={t.email} value={organisation.email ?? ""} icon={Mail} />
            <ReadOnlyField label={t.website} value={organisation.website ?? ""} icon={Globe} />
            <ReadOnlyField label={t.logo} value={logo ? logo.name : t.logoNotAdded} icon={ImageIcon} />
          </dl>
        </Card>
      )}
    </div>
  )
}
