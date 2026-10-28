"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, ListChecks, MapPin, UserX } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { ListingCard } from "@/components/app/listing-card"
import type { PublicProfile } from "@/lib/actions/listings"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import { listingCardLabels, toListingCard } from "../../sapa-pomoci/sapa-pomoci-client"

// S37 — Profil korisnika · /korisnik/[id] · FR-67 (EP-79). Port of docs/product/04-design/screens/user-profile.tsx
// without the StateSwitcher; the (sapa) layout gives the shell. States per API §7.3 from GET /api/public/users/:id:
// loading → default (header card: display name, initials, city, member since, active count; Aktivni oglasi grid);
// signed_out (viewer.signed_in = false) renders the same content; empty when listings_total = 0; unavailable on 404;
// error on any other failure (retry). Email and phone are never part of the response nor rendered (FR-67).
// Step 28c adds the ⋯ menu (report / block) and the blocked state; until then a viewer.i_blocked response simply
// renders what it carries (listings []).

/** Up to 50 active listings (API page maximum); a Free user has far fewer. */
const LIMIT = 50

export type UserProfileCopy = {
  common: Dictionary["common"]
  sapa: Dictionary["sapa"]["common"]
  profile: Dictionary["sapa"]["profile"]
}

type Loaded =
  | { key: number; status: "ready"; profile: PublicProfile }
  | { key: number; status: "unavailable" }
  | { key: number; status: "error" }

/** "Član od septembra 2026." · "Member since September 2026" — month and year on the Belgrade calendar. */
function memberSince(iso: string, t: Dictionary["sapa"]["profile"]) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).formatToParts(new Date(iso))
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1")
  const year = parts.find((p) => p.type === "year")?.value ?? ""
  const name = t.memberSinceMonths[`m${month}` as keyof typeof t.memberSinceMonths] ?? ""
  return format(t.memberSince, { month: name, year })
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

function ProfileSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={label}>
      <Card className="flex-row items-center gap-4 p-4 md:p-6">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-md" />
        ))}
      </div>
    </div>
  )
}

export function UserProfileClient({
  userId,
  locale,
  copy,
}: {
  userId: string
  locale: Locale
  copy: UserProfileCopy
}) {
  const t = copy.profile
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const current = loaded?.key === attempt ? loaded : null
  const labels = useMemo(() => listingCardLabels(copy.sapa, locale), [copy.sapa, locale])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(`/api/public/users/${encodeURIComponent(userId)}?limit=${LIMIT}&offset=0`, {
          cache: "no-store",
        })
        if (response.status === 404) {
          if (!cancelled) setLoaded({ key: attempt, status: "unavailable" })
          return
        }
        if (!response.ok) throw new Error(`EP-79 ${response.status}`)
        const profile = (await response.json()) as PublicProfile
        if (!cancelled) setLoaded({ key: attempt, status: "ready", profile })
      } catch (error) {
        console.error("[korisnik/[id]]", error instanceof Error ? error.message : error)
        if (!cancelled) setLoaded({ key: attempt, status: "error" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, attempt])

  const profile = current?.status === "ready" ? current.profile : null
  const name = profile?.display_name || copy.sapa.userFallback
  const cityName = profile?.city ? (locale === "en" ? profile.city.name_en : profile.city.name_sr) : null

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 md:h-8">
        <Link href="/sapa-pomoci">
          <ArrowLeft className="size-4" aria-hidden />
          {copy.sapa.title}
        </Link>
      </Button>

      {!current && (
        <>
          <h1 className="sr-only">{t.title}</h1>
          <ProfileSkeleton label={t.loading} />
        </>
      )}
      {current?.status === "error" && (
        <>
          <h1 className="sr-only">{t.title}</h1>
          <ErrorState
            message={copy.common.error}
            labels={{ retry: copy.common.retry }}
            onRetry={() => setAttempt((a) => a + 1)}
          />
        </>
      )}
      {current?.status === "unavailable" && (
        <>
          <h1 className="sr-only">{t.unavailableTitle}</h1>
          <EmptyState
            icon={UserX}
            title={t.unavailableTitle}
            description={t.unavailableText}
            action={t.back}
            href="/sapa-pomoci"
          />
        </>
      )}

      {profile && (
        <>
          <Card className="gap-4 p-4 md:p-6">
            <div className="flex min-w-0 items-start gap-4">
              <Avatar className="size-20 shrink-0">
                <AvatarFallback className="bg-muted font-heading text-[28px] font-bold text-foreground">
                  {profile.initials || initialsOf(name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1">
                <h1 className="truncate font-heading text-[28px] leading-9 font-bold">{name}</h1>
                {cityName && (
                  <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{cityName}</span>
                  </p>
                )}
                <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{memberSince(profile.member_since, t)}</span>
                </p>
                <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  <ListChecks className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{format(t.activeCount, { n: profile.active_listing_count })}</span>
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{t.privacy}</p>
          </Card>

          <section aria-labelledby="active-heading" className="space-y-4">
            <h2 id="active-heading" className="font-heading text-[22px] leading-7 font-bold">
              {t.activeHeading}
            </h2>
            {profile.listings.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title={t.emptyTitle}
                description={format(t.emptyText, { name })}
                action={t.browse}
                href="/sapa-pomoci"
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {profile.listings.map((l) => (
                  <ListingCard
                    key={l.id}
                    listing={toListingCard(l, copy.sapa, locale)}
                    labels={labels}
                    coverUrl={l.cover_photo?.url ?? null}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
