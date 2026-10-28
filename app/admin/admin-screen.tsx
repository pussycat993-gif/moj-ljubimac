"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
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
import { toast } from "@/components/ui/sonner"
import { AppShell, type AppShellLabels } from "@/components/app/shells"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { StatusBadge } from "@/components/app/status-badge"
import {
  createPartnerLogoUpload,
  decideOrganisation,
  geocodeAddress,
  savePartner,
  setAppSettings,
  type AdminPartner,
  type AppSettings,
  type PartnerClickStatsPage,
  type PendingOrganisation,
  type SavePartnerInput,
} from "@/lib/actions/admin"
import type { City, PartnerMessageChannel, PartnerType } from "@/lib/actions/partners"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S26 — Administracija · /admin · FR-42 (approval), FR-57, FR-58, BR-14b · port of
// docs/product/04-design/screens/admin.tsx without the StateSwitcher. Tabs (?tab=, also the Admin shell's
// sidebar): Azili na čekanju (EP-68: approve / reject with an optional reason, emails sent by the action),
// Partneri (EP-69 table with the Istaknut Switch "n / 3" from featured_count, add/edit Dialog with
// "Pronađi koordinate" (Nominatim), latitude / longitude Inputs, logo upload, hours editor, city Select from
// EP-67), Statistika (EP-70, month Select from available_periods) and Kanali (EP-71 Viber Switch with the
// cost-warning confirm). States from real responses: loading (data null, or a period / "Učitaj još"
// transition), default, empty (`[]`), error (retry = router.refresh()). Moderacija is Step 28c: ?tab=moderacija
// falls back to Azili and the shell gets no moderacija count (owner decision, Step 28).

export type AdminTab = "azili" | "partneri" | "statistika" | "kanali"
export type Loaded<T> = { ok: true; data: T } | { ok: false }
export type AdminData = {
  pending: Loaded<{ items: PendingOrganisation[]; total: number }>
  partners: Loaded<{ items: AdminPartner[]; total: number }>
  stats: Loaded<PartnerClickStatsPage>
  settings: Loaded<AppSettings>
  cities: City[]
}
export type AdminCopy = Pick<Dictionary, "admin" | "common"> & { shell: AppShellLabels }

type T = Dictionary["admin"]

const TABS: readonly AdminTab[] = ["azili", "partneri", "statistika", "kanali"]
const PAGE = 20
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

function tabFrom(value: string | null): AdminTab {
  return TABS.includes(value as AdminTab) ? (value as AdminTab) : "azili"
}

/** "18. 10. 2026." / "18/10/2026" — a date-only value (YYYY-MM-DD) or a timestamp (Europe/Belgrade day). */
function formatDate(value: string, locale: Locale) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "Europe/Belgrade",
  }).format(new Date(dateOnly ? `${value}T00:00:00Z` : value))
}

/** "Oktobar 2026." / "October 2026" for a YYYY-MM period. */
function periodLabel(period: string, locale: Locale) {
  const [y, m] = period.split("-").map(Number)
  const label = new Intl.DateTimeFormat(intlLocale(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function cityLabel(city: City | null | undefined, locale: Locale) {
  if (!city) return ""
  return locale === "en" ? city.name_en : city.name_sr
}

function typeLabel(type: PartnerType, t: T) {
  return { vet: t.typeVet, pet_shop: t.typePetShop, grooming: t.typeGrooming, pet_hotel: t.typePetHotel }[type]
}

function weekdayLabel(day: number, t: T) {
  return [t.weekday1, t.weekday2, t.weekday3, t.weekday4, t.weekday5, t.weekday6, t.weekday7][day - 1]
}

function coordinate(value: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value)
}

function TableSkeleton({ label }: { label: string }) {
  return (
    <Card className="gap-3 p-4 md:p-6" aria-busy="true" aria-label={label}>
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

type HoursRow = { day: number; from: string; to: string; closed: boolean }

function PartnerDialog({
  open,
  onOpenChange,
  partner,
  cities,
  copy,
  locale,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  partner: AdminPartner | null
  cities: City[]
  copy: AdminCopy
  locale: Locale
  onSaved: () => void
}) {
  const t = copy.admin
  const isEdit = partner !== null
  const [name, setName] = useState(partner?.name ?? "")
  const [type, setType] = useState<PartnerType>(partner?.type ?? "vet")
  const [cityId, setCityId] = useState(partner?.city.id ?? "")
  const [address, setAddress] = useState(partner?.address ?? "")
  const [lat, setLat] = useState(partner?.latitude != null ? String(partner.latitude) : "")
  const [lng, setLng] = useState(partner?.longitude != null ? String(partner.longitude) : "")
  const [coords, setCoords] = useState("")
  const [phone, setPhone] = useState(partner?.phone ?? "")
  const [email, setEmail] = useState(partner?.email ?? "")
  const [website, setWebsite] = useState(partner?.website ?? "")
  const [instagram, setInstagram] = useState(partner?.instagram ?? "")
  const [channel, setChannel] = useState<PartnerMessageChannel>(partner?.message_channel ?? "none")
  const [messageNumber, setMessageNumber] = useState(partner?.message_number ?? "")
  const [paidUntil, setPaidUntil] = useState(partner?.paid_until ?? "")
  const [description, setDescription] = useState(partner?.description ?? "")
  const [logo, setLogo] = useState<File | null>(null)
  const [featured, setFeatured] = useState(partner?.featured ?? false)
  const [hours, setHours] = useState<HoursRow[]>(() =>
    WEEKDAYS.map((day) => {
      const row = partner?.hours.find((h) => h.weekday === day)
      return { day, from: row?.opens ?? "09:00", to: row?.closes ?? "17:00", closed: partner ? !row : day === 7 }
    }),
  )
  const [formError, setFormError] = useState("")
  const [invalid, setInvalid] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)

  function setHour(day: number, patch: Partial<HoursRow>) {
    setHours((prev) => prev.map((h) => (h.day === day ? { ...h, ...patch } : h)))
  }

  function parseNumber(value: string): number | null {
    const trimmed = value.trim().replace(",", ".")
    if (trimmed === "") return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : Number.NaN
  }

  async function findCoordinates() {
    setLocating(true)
    setFormError("")
    const result = await geocodeAddress({ address, city_id: cityId })
    setLocating(false)
    if (result.ok) {
      setLat(String(result.data.latitude))
      setLng(String(result.data.longitude))
      setCoords(
        format(t.coordinatesValue, {
          lat: coordinate(result.data.latitude, locale),
          lng: coordinate(result.data.longitude, locale),
        }),
      )
    } else if (result.error.code === "geocoding_failed") {
      toast(t.geocodingFailed)
    } else {
      setInvalid(result.error.fields ?? {})
      setFormError(copy.common.error)
    }
  }

  async function save() {
    setBusy(true)
    setFormError("")
    setInvalid({})
    const input: SavePartnerInput = {
      ...(isEdit ? { id: partner.id } : {}),
      type,
      name,
      address,
      city_id: cityId,
      phone,
      email: email || null,
      website: website || null,
      instagram: instagram || null,
      description: description || null,
      message_channel: channel,
      message_number: channel === "none" ? null : messageNumber || null,
      latitude: parseNumber(lat),
      longitude: parseNumber(lng),
      featured,
      paid_until: paidUntil,
      hours: hours.filter((h) => !h.closed).map((h) => ({ weekday: h.day, opens: h.from, closes: h.to })),
    }
    if (!isEdit && !cityId) delete input.city_id
    if (!isEdit && !paidUntil) delete input.paid_until
    const result = await savePartner(input)
    if (!result.ok) {
      setBusy(false)
      if (result.error.code === "geocoding_failed") toast(t.geocodingFailed)
      else if (result.error.code === "featured_limit_reached") toast(t.featuredLimitReached)
      else if (result.error.code === "validation_failed") {
        setInvalid(result.error.fields ?? {})
        setFormError(copy.common.error)
      } else toast(copy.common.error)
      return
    }

    // Owner decision (Step 28): the logo goes up after the partner exists — ticket, PUT, then save the key.
    let logoFailed = false
    if (logo) {
      const ticket = await createPartnerLogoUpload({
        partner_id: result.data.id,
        file_name: logo.name,
        mime_type: logo.type,
        size_bytes: logo.size,
      })
      if (ticket.ok) {
        try {
          const put = await fetch(ticket.data.put_url, { method: "PUT", headers: ticket.data.headers, body: logo })
          const saved = put.ok ? await savePartner({ id: result.data.id, logo_r2_key: ticket.data.r2_key }) : null
          logoFailed = !saved?.ok
        } catch {
          logoFailed = true
        }
      } else logoFailed = true
    }

    setBusy(false)
    onOpenChange(false)
    toast(logoFailed ? copy.common.error : t.saved)
    onSaved()
  }

  const aria = (field: string) => (invalid[field] ? { "aria-invalid": true as const } : {})

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
          <DialogTitle>{isEdit ? t.dialogEdit : t.dialogNew}</DialogTitle>
          <DialogDescription>{t.dialogText}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pf-name">{t.fieldName}</Label>
            <Input id="pf-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} {...aria("name")} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-type">{t.fieldType}</Label>
              <Select value={type} onValueChange={(v) => setType(v as PartnerType)}>
                <SelectTrigger id="pf-type" className="w-full" {...aria("type")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vet">{t.typeVet}</SelectItem>
                  <SelectItem value="pet_shop">{t.typePetShop}</SelectItem>
                  <SelectItem value="grooming">{t.typeGroomingSalon}</SelectItem>
                  <SelectItem value="pet_hotel">{t.typePetHotel}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-city">{t.fieldCity}</Label>
              <Select value={cityId || undefined} onValueChange={setCityId}>
                <SelectTrigger id="pf-city" className="w-full" {...aria("city_id")}>
                  <SelectValue placeholder={t.cityPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {cityLabel(c, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-address">{t.fieldAddress}</Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                id="pf-address"
                className="min-w-0 flex-1"
                value={address}
                maxLength={200}
                onChange={(e) => setAddress(e.target.value)}
                {...aria("address")}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 md:h-9"
                disabled={locating || busy}
                onClick={findCoordinates}
              >
                <Crosshair className="size-4" aria-hidden />
                {t.findCoordinates}
              </Button>
            </div>
            {coords && <p className="text-sm text-muted-foreground">{format(t.coordinates, { coords })}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-lat">{t.fieldLatitude}</Label>
              <Input
                id="pf-lat"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                {...aria("latitude")}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-lng">{t.fieldLongitude}</Label>
              <Input
                id="pf-lng"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                {...aria("longitude")}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-phone">{t.fieldPhone}</Label>
              <Input id="pf-phone" type="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} {...aria("phone")} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-email">{t.fieldEmail}</Label>
              <Input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} {...aria("email")} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-web">{t.fieldWebsite}</Label>
              <Input id="pf-web" value={website} onChange={(e) => setWebsite(e.target.value)} {...aria("website")} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-ig">{t.fieldInstagram}</Label>
              <Input
                id="pf-ig"
                placeholder={t.instagramPlaceholder}
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                {...aria("instagram")}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-channel">{t.fieldChannel}</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as PartnerMessageChannel)}>
                <SelectTrigger id="pf-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.channelNone}</SelectItem>
                  <SelectItem value="whatsapp">{t.channelWhatsapp}</SelectItem>
                  <SelectItem value="viber">{t.channelViber}</SelectItem>
                  <SelectItem value="sms">{t.channelSms}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-message-number">
                {t.fieldMessageNumber}
                {channel !== "none" ? t.requiredMark : ""}
              </Label>
              <Input
                id="pf-message-number"
                type="tel"
                placeholder={t.messageNumberPlaceholder}
                disabled={channel === "none"}
                aria-describedby="pf-message-number-hint"
                value={messageNumber}
                maxLength={30}
                onChange={(e) => setMessageNumber(e.target.value)}
                {...aria("message_number")}
              />
              <p id="pf-message-number-hint" className="text-xs text-muted-foreground">
                {channel === "none" ? t.messageNumberHintNone : t.messageNumberHint}
              </p>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pf-paid">{t.fieldPaidUntil}</Label>
              <Input id="pf-paid" type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} {...aria("paid_until")} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t.hours}</legend>
            <ul className="space-y-2">
              {hours.map((h) => (
                <li key={h.day} className="flex flex-col gap-2 rounded-sm bg-foreground/5 p-3">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">{weekdayLabel(h.day, t)}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Label htmlFor={`pf-closed-${h.day}`} className="text-xs font-medium">
                        {t.closed}
                      </Label>
                      <Switch
                        id={`pf-closed-${h.day}`}
                        checked={h.closed}
                        onCheckedChange={(v) => setHour(h.day, { closed: v })}
                      />
                    </div>
                  </div>
                  {h.closed ? (
                    <p className="min-w-0 text-sm text-muted-foreground">{t.closedDay}</p>
                  ) : (
                    <div className="grid min-w-0 grid-cols-2 gap-2">
                      <div className="min-w-0 space-y-1">
                        <Label htmlFor={`pf-from-${h.day}`} className="text-xs font-medium">
                          {t.from}
                        </Label>
                        <Input
                          id={`pf-from-${h.day}`}
                          type="time"
                          value={h.from}
                          onChange={(e) => setHour(h.day, { from: e.target.value })}
                          {...aria("hours")}
                        />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <Label htmlFor={`pf-to-${h.day}`} className="text-xs font-medium">
                          {t.to}
                        </Label>
                        <Input
                          id={`pf-to-${h.day}`}
                          type="time"
                          value={h.to}
                          onChange={(e) => setHour(h.day, { to: e.target.value })}
                          {...aria("hours")}
                        />
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="pf-desc">{t.fieldDescription}</Label>
            <Textarea
              id="pf-desc"
              value={description}
              maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
              {...aria("description")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-logo">{t.fieldLogo}</Label>
            <Input id="pf-logo" type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-sm bg-foreground/5 p-3">
            <div className="min-w-0">
              <Label htmlFor="pf-featured">{t.featuredLabel}</Label>
              <p className="text-xs text-muted-foreground">{t.featuredHint}</p>
            </div>
            <Switch id="pf-featured" checked={featured} onCheckedChange={setFeatured} />
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button className="h-11 md:h-9" disabled={busy} onClick={save}>
            {t.savePartner}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AdminScreen({
  data,
  copy,
  locale,
  user,
}: {
  /** null while the reads are in flight (loading state). */
  data: AdminData | null
  copy: AdminCopy
  locale: Locale
  user: { name: string }
}) {
  const t = copy.admin
  const router = useRouter()
  const pathname = usePathname() ?? "/admin"
  const searchParams = useSearchParams()
  const tab = tabFrom(searchParams?.get("tab") ?? null)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState("")
  const [decided, setDecided] = useState<string[]>([])
  const [deciding, setDeciding] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<PendingOrganisation | null>(null)
  const [reason, setReason] = useState("")
  const [editing, setEditing] = useState<AdminPartner | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogKey, setDialogKey] = useState(0)
  const [savingFeatured, setSavingFeatured] = useState<string | null>(null)
  const [viberOverride, setViberOverride] = useState<boolean | null>(null)
  const [confirmViber, setConfirmViber] = useState(false)
  const [savingViber, setSavingViber] = useState(false)

  const loading = data === null || pending
  const ready = loading ? null : data

  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams?.toString() ?? "")
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    const query = next.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  function refresh() {
    startTransition(() => router.refresh())
  }

  function selectTab(value: string) {
    setNotice("")
    const next = new URLSearchParams(searchParams?.toString() ?? "")
    next.set("tab", value)
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`)
  }

  // Azili na čekanju (EP-68) ----------------------------------------------------------------------
  async function decide(org: PendingOrganisation, decision: "approve" | "reject", rejectionReason?: string) {
    setDeciding(org.id)
    const result = await decideOrganisation({
      organisation_id: org.id,
      decision,
      rejection_reason: decision === "reject" ? rejectionReason?.trim() || null : null,
    })
    setDeciding(null)
    if (result.ok) {
      setDecided((prev) => [...prev, org.id])
      setNotice(
        decision === "approve"
          ? format(t.approvedNotice, { name: org.name, email: org.contact_email })
          : format(t.rejectedNotice, { name: org.name }),
      )
    } else {
      toast(copy.common.error)
    }
    refresh()
  }

  // Partneri (EP-69) -------------------------------------------------------------------------------
  function openDialog(partner: AdminPartner | null) {
    setEditing(partner)
    setDialogKey((k) => k + 1)
    setDialogOpen(true)
  }

  async function toggleFeatured(partner: AdminPartner, value: boolean) {
    setSavingFeatured(partner.id)
    const result = await savePartner({ id: partner.id, featured: value })
    setSavingFeatured(null)
    if (result.ok) toast(t.saved)
    else if (result.error.code === "featured_limit_reached") toast(t.featuredLimitReached)
    else toast(copy.common.error)
    refresh()
  }

  // Kanali (EP-71) ---------------------------------------------------------------------------------
  async function switchViber(value: boolean) {
    setSavingViber(true)
    const result = await setAppSettings({ viber_enabled: value })
    setSavingViber(false)
    if (result.ok) setViberOverride(result.data.viber_enabled)
    else toast(copy.common.error)
  }

  const errorState = <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={refresh} />
  const skeleton = <TableSkeleton label={t.loading} />

  const pendingList = data?.pending.ok ? data.pending.data.items.filter((o) => !decided.includes(o.id)) : []
  const partners = data?.partners.ok ? data.partners.data : null
  const stats = data?.stats.ok ? data.stats.data : null
  const periods = stats ? Array.from(new Set([stats.period, ...stats.available_periods])).sort().reverse() : []
  const viberOn = viberOverride ?? (data?.settings.ok ? data.settings.data.viber_enabled : false)

  function loadMore(key: "azili" | "partneri" | "statistika", count: number) {
    return (
      <div className="flex justify-center">
        <Button variant="outline" className="h-11 md:h-9" disabled={pending} onClick={() => navigate({ [key]: String(count + PAGE) })}>
          {t.loadMore}
        </Button>
      </div>
    )
  }

  return (
    <AppShell variant="admin" active={tab} user={user} labels={copy.shell}>
      <div className="space-y-6">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>

        <Tabs value={tab} onValueChange={selectTab}>
          <div className="overflow-x-auto overflow-y-hidden">
            <TabsList>
              <TabsTrigger value="azili">{t.tabPending}</TabsTrigger>
              <TabsTrigger value="partneri">{t.tabPartners}</TabsTrigger>
              <TabsTrigger value="statistika">{t.tabStats}</TabsTrigger>
              <TabsTrigger value="kanali">{t.tabChannels}</TabsTrigger>
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
            {loading && skeleton}
            {ready && !ready.pending.ok && errorState}
            {ready && ready.pending.ok && pendingList.length === 0 && (
              <EmptyState icon={Building2} title={t.pendingEmptyTitle} description={t.pendingEmptyText} />
            )}
            {ready &&
              ready.pending.ok &&
              pendingList.map((s) => (
                <Card key={s.id} className="gap-4 p-4 md:p-6">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate font-heading text-lg font-bold">{s.name}</h2>
                      <p className="truncate text-sm text-muted-foreground">
                        {[cityLabel(s.city, locale), s.contact_full_name, s.contact_email].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {format(t.registeredOn, { date: formatDate(s.registered_at, locale) })}
                    </span>
                  </div>
                  {(s.registration_note || s.tax_id) && (
                    <p className="rounded-sm bg-foreground/5 p-3 text-sm break-words">
                      {[s.tax_id ? format(t.taxId, { taxId: s.tax_id }) : null, s.registration_note].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="flex flex-col gap-2 md:flex-row md:justify-end">
                    <Button
                      variant="outline"
                      className="h-11 md:h-9"
                      disabled={deciding === s.id}
                      onClick={() => {
                        setReason("")
                        setRejecting(s)
                      }}
                    >
                      {t.reject}
                    </Button>
                    <Button className="h-11 md:h-9" disabled={deciding === s.id} onClick={() => decide(s, "approve")}>
                      {t.approve}
                    </Button>
                  </div>
                </Card>
              ))}
            {ready && ready.pending.ok && ready.pending.data.items.length < ready.pending.data.total &&
              loadMore("azili", ready.pending.data.items.length)}
          </TabsContent>

          {/* Partneri */}
          <TabsContent value="partneri" className="mt-4 space-y-4">
            {loading && skeleton}
            {!loading && !partners && errorState}
            {!loading && partners && (
              <>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
                  <Button className="h-11 md:h-9" onClick={() => openDialog(null)}>
                    <Plus className="size-5" aria-hidden />
                    {t.newPartner}
                  </Button>
                </div>
                {partners.items.length === 0 ? (
                  <EmptyState
                    icon={Building2}
                    title={t.partnersEmptyTitle}
                    description={t.partnersEmptyText}
                    action={t.newPartner}
                    onAction={() => openDialog(null)}
                  />
                ) : (
                  <Card className="gap-0 py-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.colName}</TableHead>
                          <TableHead>{t.colType}</TableHead>
                          <TableHead>{t.colCity}</TableHead>
                          <TableHead>{t.colFeatured}</TableHead>
                          <TableHead>{t.colPaidUntil}</TableHead>
                          <TableHead>{t.colStatus}</TableHead>
                          <TableHead className="w-12">
                            <span className="sr-only">{t.colActions}</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {partners.items.map((p) => {
                          const limitReached = !p.featured && p.featured_count >= 3
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell>{typeLabel(p.type, t)}</TableCell>
                              <TableCell>{cityLabel(p.city, locale)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={p.featured}
                                    disabled={limitReached || !p.active || savingFeatured === p.id}
                                    onCheckedChange={(v) => toggleFeatured(p, v)}
                                    aria-label={format(t.featuredAria, { name: p.name })}
                                  />
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {limitReached ? t.featuredLimit : format(t.featuredCount, { count: p.featured_count })}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(p.paid_until, locale)}</TableCell>
                              <TableCell>
                                {p.active ? (
                                  <StatusBadge status="done" label={t.statusActive} />
                                ) : (
                                  <StatusBadge status="missed" label={t.statusExpired} />
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={format(t.editAria, { name: p.name })}
                                  onClick={() => openDialog(p)}
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
                {partners.items.length < partners.total && loadMore("partneri", partners.items.length)}
              </>
            )}
          </TabsContent>

          {/* Statistika */}
          <TabsContent value="statistika" className="mt-4 space-y-4">
            {loading && skeleton}
            {!loading && !stats && errorState}
            {!loading && stats && (
              <>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h2 className="font-heading text-[22px] leading-7 font-bold">{t.statsTitle}</h2>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="stats-period" className="shrink-0">
                      {t.period}
                    </Label>
                    <Select value={stats.period} onValueChange={(v) => navigate({ period: v, statistika: null })}>
                      <SelectTrigger id="stats-period" className="w-full md:w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p} value={p}>
                            {periodLabel(p, locale)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {stats.items.length === 0 ? (
                  <EmptyState icon={Building2} title={t.statsEmptyTitle} description={t.statsEmptyText} />
                ) : (
                  <Card className="gap-0 py-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.colPartner}</TableHead>
                          <TableHead className="text-right">{t.colCall}</TableHead>
                          <TableHead className="text-right">{t.colMessage}</TableHead>
                          <TableHead className="text-right">{t.colEmail}</TableHead>
                          <TableHead className="text-right">{t.colWebsite}</TableHead>
                          <TableHead className="text-right">{t.colTotal}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.items.map((s) => (
                          <TableRow key={s.partner_id}>
                            <TableCell className="font-medium">{s.partner_name}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.call}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.message}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.email}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.website}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{s.total}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
                {stats.items.length < stats.total && loadMore("statistika", stats.items.length)}
              </>
            )}
          </TabsContent>

          {/* Kanali */}
          <TabsContent value="kanali" className="mt-4 space-y-4">
            {loading && skeleton}
            {ready && !ready.settings.ok && errorState}
            {ready && ready.settings.ok && (
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
                            {t.viber}
                          </Label>
                          <Badge variant={viberOn ? "default" : "outline"} className={viberOn ? "" : "bg-card"}>
                            {viberOn ? t.on : t.off}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{t.viberText}</p>
                      </div>
                    </div>
                    <Switch
                      id="viber-switch"
                      checked={viberOn}
                      disabled={savingViber}
                      onCheckedChange={(v) => (v ? setConfirmViber(true) : switchViber(false))}
                    />
                  </div>
                  <p className="flex items-start gap-2 text-sm text-warning">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0">{t.viberCost}</span>
                  </p>
                </Card>

                <Card className="gap-3 p-4 md:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-heading text-lg font-bold">{t.whatsapp}</h2>
                    <StatusBadge status="done" label={t.on} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(t.whatsappText, { cap: ready.settings.data.whatsapp_monthly_cap })}
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
            <AlertDialogTitle>{format(t.rejectTitle, { name: rejecting?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{format(t.rejectText, { email: rejecting?.contact_email ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">{t.rejectReason}</Label>
            <Textarea
              id="reject-reason"
              placeholder={t.rejectReasonPlaceholder}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (rejecting) void decide(rejecting, "reject", reason)
                setRejecting(null)
              }}
            >
              {t.rejectConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmViber} onOpenChange={setConfirmViber}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.viberConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.viberConfirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmViber(false)
                void switchViber(true)
              }}
            >
              {t.viberConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {data && (
        <PartnerDialog
          key={`${editing?.id ?? "new"}-${dialogKey}`}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          partner={editing}
          cities={data.cities}
          copy={copy}
          locale={locale}
          onSaved={refresh}
        />
      )}
    </AppShell>
  )
}
