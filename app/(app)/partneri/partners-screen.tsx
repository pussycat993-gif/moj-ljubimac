"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Clock, Globe, LocateFixed, Mail, MapPin, MessageCircle, Phone, Star } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar, type PetSex, type PetSpecies } from "@/components/app/pet-avatar"
import {
  listPartnersNearby,
  recordPartnerClick,
  type City,
  type Partner,
  type PartnerClickAction,
  type PartnerMessageChannel,
  type PartnerType,
} from "@/lib/actions/partners"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S24 — Partneri u blizini · /partneri · FR-52, FR-53, FR-55, FR-56 · EP-64 (rpc:partners_nearby through
// lib/actions/partners.ts: type chips → p_type; "Koristi moju lokaciju" → the browser Geolocation API with
// permission, p_lat / p_lng; otherwise or on denial the EP-43 profile city, E-22), EP-66 (quick actions,
// fire-and-forget before the link opens; a failure never blocks it) and EP-01 (the vet-suggestion banner
// for an active pet with vet_name = null, BR-43). The order — featured first (≤ 3 per type per city), then
// by distance_km — comes from the database (BR-41). States: loading / default / empty (`[]`) / error
// (5xx, network); no profile city and no location → "Dodaj grad u profil" (owner decision, Step 27).

export type PartnersCopy = Pick<Dictionary, "partners" | "common">

type Filter = "all" | PartnerType
type Coordinates = { lat: number; lng: number }
type ViewState = "default" | "loading" | "error"

/** The pet the vet-suggestion banner names (first active EP-01 pet without "moj veterinar"). */
export type VetBannerPet = { id: string; name: string; sex: PetSex; species?: PetSpecies; photoUrl?: string }

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** "1,2 km" (sr-Latn) · "1.2 km" (en-GB). */
export function formatKm(km: number, locale: Locale, template: string) {
  const value = new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(km)
  return format(template, { km: value })
}

export function cityName(city: City, locale: Locale) {
  return locale === "en" ? city.name_en : city.name_sr
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/\s/g, "")}`
}

/** BR-44: "Poruka" opens the partner's chosen channel on its messaging number. */
export function messageHref(channel: PartnerMessageChannel, number: string) {
  const d = number.replace(/\D/g, "")
  if (channel === "whatsapp") return `https://wa.me/${d}`
  if (channel === "viber") return `viber://chat?number=%2B${d}`
  return `sms:+${d}`
}

/** https:// is added only when the stored website has no scheme (owner decision, Step 27). */
export function websiteHref(website: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(website) ? website : `https://${website}`
}

/** The website as people read it: without the scheme and a trailing slash. */
export function websiteLabel(website: string) {
  return website.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/$/, "")
}

/** EP-66 — counted before the link opens; the result (or a failure) is ignored. */
export function trackClick(partnerId: string, action: PartnerClickAction) {
  try {
    void Promise.resolve(recordPartnerClick(partnerId, action)).catch(() => undefined)
  } catch {
    // A failed count never blocks the link.
  }
}

/** Web links open in a new tab so the click count can finish; tel:, mailto:, sms:, viber: stay. */
export function externalProps(href: string) {
  return /^https?:/i.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {}
}

export function channelLabel(channel: Exclude<PartnerMessageChannel, "none">, t: Dictionary["partners"]) {
  return channel === "whatsapp" ? t.channelWhatsapp : channel === "viber" ? t.channelViber : t.channelSms
}

export function typeLabel(type: PartnerType, t: Dictionary["partners"]) {
  switch (type) {
    case "vet":
      return t.typeVet
    case "pet_shop":
      return t.typePetShop
    case "grooming":
      return t.typeGrooming
    case "pet_hotel":
      return t.typePetHotel
  }
}

function QuickActions({ p, t }: { p: Partner; t: Dictionary["partners"] }) {
  const actions: { key: PartnerClickAction; label: string; icon: typeof Phone; href: string; aria?: string }[] = [
    { key: "call", label: t.call, icon: Phone, href: telHref(p.phone) },
  ]
  if (p.message_channel !== "none" && p.message_number) {
    actions.push({
      key: "message",
      label: t.message,
      icon: MessageCircle,
      href: messageHref(p.message_channel, p.message_number),
      aria: format(t.messageVia, { channel: channelLabel(p.message_channel, t) }),
    })
  }
  if (p.email) actions.push({ key: "email", label: t.email, icon: Mail, href: `mailto:${p.email}` })
  if (p.website) actions.push({ key: "website", label: t.website, icon: Globe, href: websiteHref(p.website) })

  return (
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
      {actions.map((a) => {
        const Icon = a.icon
        return (
          <Button key={a.key} asChild variant="outline" size="sm" className="h-11 min-w-0 md:h-8">
            <a href={a.href} aria-label={a.aria} onClick={() => trackClick(p.id, a.key)} {...externalProps(a.href)}>
              <Icon className="size-4" aria-hidden />
              {a.label}
            </a>
          </Button>
        )
      })}
    </div>
  )
}

function PartnerCard({
  p,
  featured,
  href,
  locale,
  t,
}: {
  p: Partner
  featured?: boolean
  href: string
  locale: Locale
  t: Dictionary["partners"]
}) {
  return (
    <Card className="gap-4 p-4 hover:shadow-soft md:p-6" data-testid="partner-card">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="size-12">
          <AvatarFallback className="bg-muted font-heading font-bold text-foreground">{p.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Link href={href} className="block truncate font-heading text-lg font-bold hover:underline">
            {p.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{typeLabel(p.type, t)}</Badge>
            {featured && (
              <Badge variant="outline" className="border-primary bg-card text-primary">
                <Star aria-hidden />
                {t.featured}
              </Badge>
            )}
            {p.distance_km !== null && (
              <span className="text-xs font-medium text-muted-foreground">{formatKm(p.distance_km, locale, t.km)}</span>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{p.address}</p>
          <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {p.today_hours
                ? format(t.todayOpen, { opens: p.today_hours.opens, closes: p.today_hours.closes })
                : t.todayClosed}
            </span>
          </p>
        </div>
      </div>
      <QuickActions p={p} t={t} />
    </Card>
  )
}

function LoadingGrid({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label={label}>
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

/** Suspense fallback while the first EP-64 read is in flight. */
export function PartnersLoading({ copy }: { copy: PartnersCopy }) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] leading-9 font-bold">{copy.partners.title}</h1>
      <LoadingGrid label={copy.partners.loading} />
    </div>
  )
}

export function PartnersScreen({
  initialPartners,
  city,
  vetPet,
  locale,
  copy,
}: {
  /** The first EP-64 read (profile city, all types); null = the read failed. */
  initialPartners: Partner[] | null
  /** EP-43 profile city; null when the profile has none. */
  city: City | null
  vetPet: VetBannerPet | null
  locale: Locale
  copy: PartnersCopy
}) {
  const t = copy.partners
  const [filter, setFilter] = useState<Filter>("all")
  const [coords, setCoords] = useState<Coordinates | null>(null)
  const [partners, setPartners] = useState<Partner[]>(initialPartners ?? [])
  const [view, setView] = useState<ViewState>(city && initialPartners === null ? "error" : "default")
  const [showVetBanner, setShowVetBanner] = useState(vetPet !== null)
  const request = useRef(0)

  const noReference = !coords && !city

  async function load(nextFilter: Filter, nextCoords: Coordinates | null) {
    if (!nextCoords && !city) return
    const id = ++request.current
    setView("loading")
    const result = await Promise.resolve(
      listPartnersNearby({
        ...(nextCoords ? { lat: nextCoords.lat, lng: nextCoords.lng } : { city_id: city?.id }),
        type: nextFilter === "all" ? null : nextFilter,
      }),
    ).catch(() => null)
    if (id !== request.current) return
    if (result?.ok) {
      setPartners(result.data)
      setView("default")
    } else {
      setView("error")
    }
  }

  function chooseFilter(next: Filter) {
    setFilter(next)
    void load(next, coords)
  }

  function locate() {
    // E-22: no Geolocation API or a denied permission keeps the profile city.
    if (typeof navigator === "undefined" || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude }
        setCoords(next)
        void load(filter, next)
      },
      () => undefined,
    )
  }

  // EP-64 already lists the featured (≤ 3 per type per city, BR-41) first, then the rest by distance.
  const featured = partners.filter((p) => p.featured)
  const others = partners.filter((p) => !p.featured)
  const query = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ""

  const chips: { value: Filter; label: string }[] = [
    { value: "all", label: t.filterAll },
    { value: "vet", label: t.filterVet },
    { value: "pet_shop", label: t.filterPetShop },
    { value: "grooming", label: t.filterGrooming },
    { value: "pet_hotel", label: t.filterPetHotel },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {(coords || city) && (
            <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span className="truncate">
                {coords ? t.fromLocation : city ? format(t.fromCity, { city: cityName(city, locale) }) : null}
              </span>
            </p>
          )}
          {!coords && (
            <Button variant="outline" size="sm" className="h-11 min-w-0 md:h-8" onClick={locate}>
              <LocateFixed className="size-4" aria-hidden />
              {t.useLocation}
            </Button>
          )}
        </div>
      </div>

      {vetPet && showVetBanner && view === "default" && partners.length > 0 && (
        <Card data-pet-sex={vetPet.sex} className="flex-col gap-3 p-4 md:flex-row md:items-center md:p-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <PetAvatar name={vetPet.name} sex={vetPet.sex} species={vetPet.species} photoUrl={vetPet.photoUrl} />
            <div className="min-w-0">
              <p className="text-sm font-medium">{format(t.vetBannerTitle, { pet: vetPet.name })}</p>
              <p className="text-sm text-muted-foreground">{t.vetBannerText}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              className="h-11 md:h-9"
              onClick={() => {
                setShowVetBanner(false)
                chooseFilter("vet")
              }}
            >
              {t.vetBannerAction}
            </Button>
            <Button variant="ghost" className="h-11 md:h-9" onClick={() => setShowVetBanner(false)}>
              {t.vetBannerDismiss}
            </Button>
          </div>
        </Card>
      )}

      {noReference ? (
        <EmptyState icon={MapPin} title={t.noCityTitle} description={t.noCityText} action={t.noCityAction} href="/profil" />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1" role="group" aria-label={t.typeGroup}>
            {chips.map((c) => (
              <Button
                key={c.value}
                size="sm"
                variant={filter === c.value ? "default" : "outline"}
                aria-pressed={filter === c.value}
                className="shrink-0"
                onClick={() => chooseFilter(c.value)}
              >
                {c.label}
              </Button>
            ))}
          </div>

          {view === "loading" && <LoadingGrid label={t.loading} />}
          {view === "error" && (
            <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={() => void load(filter, coords)} />
          )}

          {view === "default" && partners.length === 0 && (
            <EmptyState icon={MapPin} title={t.emptyTitle} description={t.emptyText} />
          )}

          {view === "default" && partners.length > 0 && (
            <>
              {featured.length > 0 && (
                <section className="space-y-4" aria-labelledby="featured-heading">
                  <h2 id="featured-heading" className="font-heading text-[22px] leading-7 font-bold">
                    {t.featured}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {featured.map((p) => (
                      <PartnerCard key={p.id} p={p} featured href={`/partneri/${p.id}${query}`} locale={locale} t={t} />
                    ))}
                  </div>
                </section>
              )}
              {others.length > 0 && (
                <section className="space-y-4" aria-labelledby="nearby-heading">
                  <h2 id="nearby-heading" className="font-heading text-[22px] leading-7 font-bold">
                    {t.byDistance}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {others.map((p) => (
                      <PartnerCard key={p.id} p={p} href={`/partneri/${p.id}${query}`} locale={locale} t={t} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
