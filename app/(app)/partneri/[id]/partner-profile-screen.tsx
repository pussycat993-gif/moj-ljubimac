"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, AtSign, Clock, Globe, Mail, MapPin, MessageCircle, Navigation, Phone } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/app/error-state"
import type { Partner, PartnerClickAction } from "@/lib/actions/partners"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import {
  channelLabel,
  cityName,
  externalProps,
  formatKm,
  messageHref,
  telHref,
  trackClick,
  typeLabel,
  websiteHref,
  websiteLabel,
} from "../partners-screen"

// S25 — Profil partnera · /partneri/[id] · FR-54, FR-55 · EP-65 (getPartner: full hours, today_hours, the
// presigned logo, distance_km from ?lat=&lng= when S24 used the browser location, else from the EP-43
// profile city — owner decision, Step 27) and EP-66 (the four quick actions, fire-and-forget before the
// link opens). States: default / minimal (optional fields null → their quick actions and contact rows are
// hidden, E-24) / loading (PartnerProfileLoading) / error (404 — unknown or paid_until passed, E-23 — or 5xx).

export type PartnerProfileCopy = Pick<Dictionary, "partnerProfile" | "partners" | "common">

function BackLink({ label }: { label: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/partneri">
        <ArrowLeft className="size-4" aria-hidden />
        {label}
      </Link>
    </Button>
  )
}

export function PartnerProfileLoading({ copy }: { copy: PartnerProfileCopy }) {
  const t = copy.partnerProfile
  return (
    <div className="space-y-6">
      <BackLink label={t.back} />
      <h1 className="sr-only">{t.srTitle}</h1>
      <div className="space-y-6" aria-busy="true" aria-label={t.loading}>
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
    </div>
  )
}

/** "{address}, {city}" — the city is not repeated when the address already ends with it. */
function fullAddress(p: Partner, locale: Locale) {
  const city = cityName(p.city, locale)
  return p.address.toLowerCase().endsWith(city.toLowerCase()) ? p.address : `${p.address}, ${city}`
}

export function PartnerProfileScreen({
  partner: p,
  todayWeekday,
  locale,
  copy,
}: {
  /** EP-65 Partner; null = 404 / 5xx (error state). */
  partner: Partner | null
  /** Today's ISO weekday in Europe/Belgrade (1 = Monday), for the "· danas" mark. */
  todayWeekday: number
  locale: Locale
  copy: PartnerProfileCopy
}) {
  const router = useRouter()
  const t = copy.partnerProfile

  if (!p) {
    return (
      <div className="space-y-6">
        <BackLink label={t.back} />
        <h1 className="sr-only">{t.srTitle}</h1>
        <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={() => router.refresh()} />
      </div>
    )
  }

  const address = fullAddress(p, locale)
  const actions: { key: PartnerClickAction; label: string; icon: typeof Phone; href: string }[] = [
    { key: "call", label: t.call, icon: Phone, href: telHref(p.phone) },
  ]
  if (p.message_channel !== "none" && p.message_number) {
    actions.push({
      key: "message",
      label: format(t.messageVia, { channel: channelLabel(p.message_channel, copy.partners) }),
      icon: MessageCircle,
      href: messageHref(p.message_channel, p.message_number),
    })
  }
  if (p.email) actions.push({ key: "email", label: t.email, icon: Mail, href: `mailto:${p.email}` })
  if (p.website) actions.push({ key: "website", label: t.website, icon: Globe, href: websiteHref(p.website) })

  const weekdays = [t.weekday1, t.weekday2, t.weekday3, t.weekday4, t.weekday5, t.weekday6, t.weekday7]
  const instagram = p.instagram?.replace(/^@/, "") ?? null
  const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(address)}`

  return (
    <div className="space-y-6">
      <BackLink label={t.back} />

      <Card className="gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <Avatar className="size-20">
            {p.logo_url && <AvatarImage src={p.logo_url} alt="" />}
            <AvatarFallback className="bg-muted font-heading text-[22px] leading-7 font-bold text-foreground">
              {p.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="font-heading text-[28px] leading-9 font-bold">{p.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{typeLabel(p.type, copy.partners)}</Badge>
              {p.distance_km !== null && (
                <span className="text-xs font-medium text-muted-foreground">
                  {format(t.distance, { distance: formatKm(p.distance_km, locale, copy.partners.km) })}
                </span>
              )}
            </div>
            <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{address}</span>
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="actions-heading" className="space-y-3">
            <h2 id="actions-heading" className="sr-only">
              {t.actionsHeading}
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {actions.map((a, i) => {
                const Icon = a.icon
                return (
                  <Button key={a.key} asChild variant={i === 0 ? "default" : "outline"} className="h-12 justify-start text-base">
                    <a href={a.href} onClick={() => trackClick(p.id, a.key)} {...externalProps(a.href)}>
                      <Icon className="size-5" aria-hidden />
                      {a.label}
                    </a>
                  </Button>
                )
              })}
            </div>
          </section>

          {p.description && (
            <Card className="gap-3 p-4 md:p-6">
              <h2 className="font-heading text-lg font-bold">{t.about}</h2>
              <p className="text-base">{p.description}</p>
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <Card className="gap-3 p-4 md:p-6">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
              <Clock className="size-5 text-muted-foreground" aria-hidden />
              {t.hours}
            </h2>
            <dl className="space-y-2">
              {weekdays.map((label, i) => {
                const weekday = i + 1
                const row = p.hours.find((h) => h.weekday === weekday)
                const isToday = weekday === todayWeekday
                return (
                  <div key={weekday} className="flex items-center justify-between gap-2 text-sm">
                    <dt className={isToday ? "min-w-0 truncate font-medium" : "min-w-0 truncate text-muted-foreground"}>
                      {label}
                      {isToday && <span className="text-muted-foreground">{t.today}</span>}
                    </dt>
                    <dd className={row ? "shrink-0 font-medium" : "shrink-0 text-muted-foreground"}>
                      {row ? format(t.hoursRange, { opens: row.opens, closes: row.closes }) : t.closed}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </Card>

          <Card className="gap-3 p-4 md:p-6">
            <h2 className="font-heading text-lg font-bold">{t.contact}</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex min-w-0 items-center gap-2">
                <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{p.phone}</span>
              </li>
              {p.message_channel !== "none" && p.message_number && (
                <li className="flex min-w-0 items-center gap-2">
                  <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">
                    {p.message_number} · {channelLabel(p.message_channel, copy.partners)}
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
                  <a
                    href={websiteHref(p.website)}
                    onClick={() => trackClick(p.id, "website")}
                    className="truncate text-primary hover:underline"
                    {...externalProps(websiteHref(p.website))}
                  >
                    {websiteLabel(p.website)}
                  </a>
                </li>
              )}
              {instagram && (
                <li className="flex min-w-0 items-center gap-2">
                  <AtSign className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a
                    href={`https://instagram.com/${instagram}`}
                    aria-label={format(t.instagram, { handle: instagram })}
                    className="truncate text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {instagram}
                  </a>
                </li>
              )}
            </ul>
            <Separator />
            <Button asChild variant="outline" className="h-11 md:h-9">
              <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                <Navigation className="size-4" aria-hidden />
                {t.directions}
              </a>
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  )
}
