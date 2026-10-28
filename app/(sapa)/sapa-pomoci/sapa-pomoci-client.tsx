"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, HandHeart, ListChecks, LogIn, Plus, SearchX, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import {
  ListingCard,
  type ListingCardLabels,
  type ListingSummary as ListingCardModel,
} from "@/components/app/listing-card"
import { formatRsd } from "@/components/app/listing-type-tag"
import type { City } from "@/lib/actions/registration"
import type { ListingCategory, ListingSpecies, ListingSummary, ListingType } from "@/lib/actions/listings"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S32 — Šapa pomoći · /sapa-pomoci · FR-61 (EP-73). Port of docs/product/04-design/screens/sapa-pomoci.tsx without
// the StateSwitcher; the (sapa) layout gives the shell (PublicShell wide signed out, AppShell signed in). States per
// API §7.3: loading → default from GET /api/public/listings (limit 18, offset paging, newest first); total 0 → empty
// (with filters "Nema oglasa za ove filtere" + Poništi filtere, without "Još nema oglasa"); non-2xx → error with
// retry. signed_out and suspended come from the session and Me.marketplace.suspended_at (EP-43), passed by the page.
// Filters are mirrored into the URL query (type, category, species, city_id, strana) so a link keeps them.

export const PAGE_SIZE = 18

export type SapaListCopy = {
  common: Dictionary["common"]
  sapa: Dictionary["sapa"]["common"]
  list: Dictionary["sapa"]["list"]
}

export type SapaFilters = {
  type: "all" | ListingType
  category: "all" | ListingCategory
  species: "all" | ListingSpecies
  /** cities.id or "all". */
  city: string
}

const NO_FILTERS: SapaFilters = { type: "all", category: "all", species: "all", city: "all" }
const TYPES: ("all" | ListingType)[] = ["all", "need", "giving", "selling", "seeking"]
const CATEGORIES: ListingCategory[] = ["food", "equipment_toys", "furniture", "carriers", "medicine_care", "other"]

export const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
export function pluralFormat(t: Record<string, unknown>, base: string, n: number, locale: Locale) {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  const key = `${base}_${rule === "one" || rule === "few" ? rule : "other"}`
  return format(String(t[key]), { n })
}

/** ListingCard labels from the active dictionary: "2.500 RSD" (sr) · "2,500 RSD" (en). */
export function listingCardLabels(t: Dictionary["sapa"]["common"], locale: Locale): ListingCardLabels {
  return {
    negotiable: t.negotiable,
    free: t.free,
    photos: (count) => pluralFormat(t, "photos", count, locale),
    formatPrice: (amount) => (locale === "en" ? `${amount.toLocaleString("en-GB")} RSD` : formatRsd(amount)),
    type: t.type,
    category: t.category,
    species: t.species,
  }
}

/** "19. 10. 2026." (sr-Latn) · "19 Oct 2026" (en-GB), Belgrade calendar day. */
export function formatListingDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso))
}

/** API ListingSummary (EP-73 / EP-79) → the ListingCard view model. */
export function toListingCard(l: ListingSummary, t: Dictionary["sapa"]["common"], locale: Locale): ListingCardModel {
  return {
    id: l.id,
    type: l.type,
    title: l.title,
    city: locale === "en" ? l.city.name_en : l.city.name_sr,
    category: l.category,
    species: l.species,
    priceRsd: l.price ? l.price.amount_minor / 100 : undefined,
    negotiable: l.price_negotiable,
    author: l.author.display_name ?? t.userFallback,
    authorIsShelter: l.author.kind === "shelter",
    publishedOn: formatListingDate(l.published_at, locale),
    photoCount: l.photo_count,
  }
}

function queryString(filters: SapaFilters, page: number) {
  const q = new URLSearchParams()
  if (filters.type !== "all") q.set("type", filters.type)
  if (filters.category !== "all") q.set("category", filters.category)
  if (filters.species !== "all") q.set("species", filters.species)
  if (filters.city !== "all") q.set("city_id", filters.city)
  if (page > 1) q.set("strana", String(page))
  return q.toString()
}

function apiUrl(filters: SapaFilters, page: number) {
  const q = new URLSearchParams()
  if (filters.type !== "all") q.set("type", filters.type)
  if (filters.category !== "all") q.set("category", filters.category)
  if (filters.species !== "all") q.set("species", filters.species)
  if (filters.city !== "all") q.set("city_id", filters.city)
  q.set("limit", String(PAGE_SIZE))
  q.set("offset", String((page - 1) * PAGE_SIZE))
  return `/api/public/listings?${q.toString()}`
}

type Loaded =
  | { key: string; status: "ready"; items: ListingSummary[]; total: number }
  | { key: string; status: "error" }

function LoadingGrid({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label={label}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="gap-0 overflow-hidden py-0">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export function SapaPomociClient({
  signedIn,
  suspended,
  locale,
  cities,
  initialFilters = NO_FILTERS,
  initialPage = 1,
  copy,
}: {
  signedIn: boolean
  suspended: boolean
  locale: Locale
  cities: City[]
  initialFilters?: SapaFilters
  initialPage?: number
  copy: SapaListCopy
}) {
  const t = copy.list
  const [filters, setFilters] = useState<SapaFilters>(initialFilters)
  const [page, setPage] = useState(initialPage)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  const url = apiUrl(filters, page)
  const key = `${url}#${attempt}`
  const current = loaded?.key === key ? loaded : null
  const labels = useMemo(() => listingCardLabels(copy.sapa, locale), [copy.sapa, locale])

  const qs = queryString(filters, page)
  const currentPath = `/sapa-pomoci${qs ? `?${qs}` : ""}`
  const signInHref = `/prijava?next=${encodeURIComponent(currentPath)}`

  useEffect(() => {
    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` !== currentPath) {
      window.history.replaceState(window.history.state, "", currentPath)
    }
  }, [currentPath])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(url, { cache: "no-store" })
        if (!response.ok) throw new Error(`EP-73 ${response.status}`)
        const body = (await response.json()) as { items: ListingSummary[]; total: number }
        if (!cancelled) setLoaded({ key, status: "ready", items: body.items, total: body.total })
      } catch (error) {
        console.error("[sapa-pomoci]", error instanceof Error ? error.message : error)
        if (!cancelled) setLoaded({ key, status: "error" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url, key])

  const hasFilters =
    filters.type !== "all" || filters.category !== "all" || filters.species !== "all" || filters.city !== "all"
  const total = current?.status === "ready" ? current.total : 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function update(next: Partial<SapaFilters>) {
    setFilters((f) => ({ ...f, ...next }))
    setPage(1)
  }

  function resetFilters() {
    setFilters(NO_FILTERS)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-9 font-bold">{copy.sapa.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        {signedIn && !suspended && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="h-11 md:h-9">
              <Link href="/sapa-pomoci/moje">
                <ListChecks className="size-4" aria-hidden />
                {t.myListings}
              </Link>
            </Button>
            <Button asChild className="h-11 md:h-9">
              <Link href="/sapa-pomoci/nova">
                <Plus className="size-5" aria-hidden />
                {t.newListing}
              </Link>
            </Button>
          </div>
        )}
      </div>

      {!signedIn && (
        <Card className="flex-col gap-3 p-4 md:flex-row md:items-center md:p-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
            <HandHeart className="size-5 text-primary" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-sm">{t.signedOutPrompt}</p>
          <Button asChild className="h-11 shrink-0 md:h-9">
            <Link href={signInHref}>
              <LogIn className="size-4" aria-hidden />
              {t.signIn}
            </Link>
          </Button>
        </Card>
      )}

      {signedIn && suspended && (
        <Card role="status" className="flex-row items-start gap-3 px-4 py-3">
          <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 text-sm">{t.suspended}</p>
        </Card>
      )}

      <section aria-label={t.filters} className="space-y-3">
        <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1" role="group" aria-label={t.typeGroup}>
          {TYPES.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filters.type === value ? "default" : "outline"}
              aria-pressed={filters.type === value}
              className="shrink-0"
              onClick={() =>
                update({
                  type: value,
                  ...(value !== "all" && value !== "need" && filters.category === "medicine_care"
                    ? { category: "all" as const }
                    : {}),
                })
              }
            >
              {t.chips[value]}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="f-category" className="text-xs font-medium text-muted-foreground">
              {t.category}
            </Label>
            <Select value={filters.category} onValueChange={(v) => update({ category: v as SapaFilters["category"] })}>
              <SelectTrigger id="f-category" className="h-11 w-full bg-card md:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allCategories}</SelectItem>
                {CATEGORIES.filter((k) => k !== "medicine_care" || filters.type === "all" || filters.type === "need").map(
                  (k) => (
                    <SelectItem key={k} value={k}>
                      {copy.sapa.category[k]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="f-species" className="text-xs font-medium text-muted-foreground">
              {t.species}
            </Label>
            <Select value={filters.species} onValueChange={(v) => update({ species: v as SapaFilters["species"] })}>
              <SelectTrigger id="f-species" className="h-11 w-full bg-card md:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allSpecies}</SelectItem>
                <SelectItem value="dog">{copy.sapa.species.dog}</SelectItem>
                <SelectItem value="cat">{copy.sapa.species.cat}</SelectItem>
                <SelectItem value="other">{copy.sapa.species.other}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="f-city" className="text-xs font-medium text-muted-foreground">
              {t.city}
            </Label>
            <Select value={filters.city} onValueChange={(v) => update({ city: v })}>
              <SelectTrigger id="f-city" className="h-11 w-full bg-card md:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allCities}</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {locale === "en" ? c.name_en : c.name_sr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {!current && <LoadingGrid label={t.loading} />}
      {current?.status === "error" && (
        <ErrorState
          message={copy.common.error}
          labels={{ retry: copy.common.retry }}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      )}

      {current?.status === "ready" && current.total === 0 && (
        <EmptyState
          icon={SearchX}
          title={hasFilters ? t.emptyFilteredTitle : t.emptyTitle}
          description={hasFilters ? t.emptyFilteredText : t.emptyText}
          action={hasFilters ? t.clearFilters : signedIn && !suspended ? t.newListing : undefined}
          onAction={hasFilters ? resetFilters : undefined}
          href={hasFilters ? undefined : "/sapa-pomoci/nova"}
        />
      )}

      {current?.status === "ready" && current.total > 0 && (
        <>
          <p className="text-sm text-muted-foreground">{pluralFormat(t, "results", current.total, locale)}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {current.items.map((l) => (
              <ListingCard
                key={l.id}
                listing={toListingCard(l, copy.sapa, locale)}
                labels={labels}
                coverUrl={l.cover_photo?.url ?? null}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <nav aria-label={t.pages} className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                className="h-11 md:h-9"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" aria-hidden />
                {t.previous}
              </Button>
              <span className="text-sm text-muted-foreground">
                {format(t.pageOf, { page, total: totalPages })}
              </span>
              <Button
                variant="outline"
                className="h-11 md:h-9"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t.next}
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
