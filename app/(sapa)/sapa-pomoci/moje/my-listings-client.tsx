"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CircleCheck,
  EyeOff,
  ImageIcon,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { ListingTypeTag, formatRsd } from "@/components/app/listing-type-tag"
import { PremiumLock } from "@/components/app/premium-lock"
import { StatusBadge } from "@/components/app/status-badge"
import type {
  ChangeListingInput,
  Listing,
  ListingOutcome,
  ListingType,
  MyListing,
  MyListingsPage,
} from "@/lib/actions/listings"
import type { FileKind, FileUrl } from "@/lib/actions/files"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S35 — Moji oglasi · /sapa-pomoci/moje · FR-64, FR-65 (port of docs/product/04-design/screens/my-listings.tsx
// without the StateSwitcher). Data: EP-76 per tab (active incl. hidden / expired / resolved, counts, usage); EP-77
// extend / resolve (default outcome by type) / delete with toasts; thumbnails through EP-15 (listing_photo).
// `?produzi=<id>` (listing_expiring email) extends once on load, then the parameter is cleared (FR-65 #2).
// States: L (skeleton), D, E (per tab), X (ErrorState), G (usage limit reached or premium_required → PremiumLock,
// "Objavi ponovo" disabled), S (usage.suspended_at → banner; edit / extend / resolve hidden, delete allowed).
// OQ-17 interim: the resolved date is MyListing.resolved_at (listings.updated_at); the hidden card is
// MyListing.hidden_at / hidden_reason from the actioned report.

type TabKey = "active" | "expired" | "resolved"

export type MyListingsActions = {
  listMyListings: (input: { group: TabKey; limit?: number; offset?: number }) => Promise<ActionResult<MyListingsPage>>
  changeListing: (input: ChangeListingInput) => Promise<ActionResult<Listing | { deleted_listing_id: string }>>
  getFileUrls: (input: { items: { kind: FileKind; id: string }[] }) => Promise<ActionResult<FileUrl[]>>
}

export type MyListingsCopy = {
  common: Dictionary["common"]
  sapa: Dictionary["sapa"]["common"]
  mine: Dictionary["sapa"]["mine"]
}

const PAGE_SIZE = 50
const SOON_DAYS = 3
const MY_LISTINGS_PATH = "/sapa-pomoci/moje"

/** EP-77 resolve: the default outcome by type (FR-64 #5). */
const OUTCOME_FOR_TYPE: Record<ListingType, ListingOutcome> = {
  giving: "given",
  selling: "sold",
  need: "donated",
  seeking: "found",
}

function intlLocale(locale: Locale) {
  return locale === "en" ? "en-GB" : "sr-Latn"
}

/** sr-Latn "19. 10. 2026." · en-GB "19 Oct 2026", on the Belgrade calendar. */
function formatDate(value: string | null, locale: Locale) {
  if (!value) return ""
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date(value))
}

function formatPrice(amountRsd: number, locale: Locale) {
  return locale === "en" ? `${amountRsd.toLocaleString("en-GB")} RSD` : formatRsd(amountRsd)
}

function plural(
  m: MyListingsCopy["mine"],
  key: "expiresIn",
  n: number,
  locale: Locale,
): string {
  const category = new Intl.PluralRules(intlLocale(locale)).select(n)
  const forms = { one: m[`${key}_one`], few: m[`${key}_few`], other: m[`${key}_other`] } as Record<string, string>
  return format(forms[category] ?? forms.other, { n })
}

function RowsSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex-row items-center gap-3 p-4">
          <Skeleton className="size-16 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export function MyListingsClient({
  locale,
  produzi,
  copy,
  actions,
}: {
  locale: Locale
  produzi: string | null
  copy: MyListingsCopy
  actions: MyListingsActions
}) {
  const m = copy.mine
  const s = copy.sapa
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>("active")
  const [page, setPage] = useState<MyListingsPage | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [premiumBlocked, setPremiumBlocked] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resolving, setResolving] = useState<MyListing | null>(null)
  const [deleting, setDeleting] = useState<MyListing | null>(null)
  const request = useRef(0)
  const started = useRef(false)

  async function load(group: TabKey, quiet = false) {
    const id = ++request.current
    if (!quiet) setStatus("loading")
    const result = await actions.listMyListings({ group, limit: PAGE_SIZE })
    if (id !== request.current) return
    if (!result.ok) {
      if (!quiet) setStatus("error")
      else toast.error(copy.common.error)
      return
    }
    setPage(result.data)
    setStatus("ready")
    const covers = result.data.items.filter((l) => l.cover_photo_id)
    if (covers.length === 0) return
    const urls = await actions.getFileUrls({
      items: covers.map((l) => ({ kind: "listing_photo" as const, id: l.cover_photo_id as string })),
    })
    if (!urls.ok) return
    const byPhoto = new Map(urls.data.map((u) => [u.id, u.url]))
    setThumbs((prev) => {
      const next = { ...prev }
      for (const l of covers) {
        const url = byPhoto.get(l.cover_photo_id as string)
        if (url) next[l.id] = url
      }
      return next
    })
  }

  /** EP-77 extend. true = extended (toast shown). */
  async function extendListing(listingId: string): Promise<boolean> {
    const result = await actions.changeListing({ listing_id: listingId, op: "extend" })
    if (result.ok) {
      const listing = result.data as Listing
      toast.success(format(m.extended, { date: formatDate(listing.expires_at, locale) }))
      return true
    }
    if (result.error.code === "premium_required") setPremiumBlocked(true)
    else toast.error(copy.common.error)
    return false
  }

  // First load; `?produzi=<id>` (FR-65 #2) extends once before it, then the parameter is cleared.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      if (produzi) {
        await extendListing(produzi)
        router.replace(MY_LISTINGS_PATH, { scroll: false })
      }
      await load("active")
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [])

  function changeTab(next: TabKey) {
    setTab(next)
    void load(next)
  }

  async function extend(l: MyListing) {
    setBusyId(l.id)
    await extendListing(l.id)
    setBusyId(null)
    await load(tab, true)
  }

  async function resolve() {
    const l = resolving
    setResolving(null)
    if (!l) return
    setBusyId(l.id)
    const outcome = OUTCOME_FOR_TYPE[l.type]
    const result = await actions.changeListing({ listing_id: l.id, op: "resolve", outcome })
    setBusyId(null)
    if (result.ok) toast.success(format(m.resolved, { outcome: s.outcome[outcome] }))
    else toast.error(copy.common.error)
    await load(tab, true)
  }

  async function remove() {
    const l = deleting
    setDeleting(null)
    if (!l) return
    setBusyId(l.id)
    const result = await actions.changeListing({ listing_id: l.id, op: "delete", confirm: true })
    setBusyId(null)
    if (!result.ok) {
      toast.error(copy.common.error)
      return
    }
    setPage((p) =>
      p
        ? {
            ...p,
            items: p.items.filter((x) => x.id !== l.id),
            total: Math.max(0, p.total - 1),
            counts: { ...p.counts, [tab]: Math.max(0, p.counts[tab] - 1) },
          }
        : p,
    )
    toast.success(format(m.deleted, { title: l.title }))
    await load(tab, true)
  }

  const usage = page?.usage ?? null
  const suspended = Boolean(usage?.suspended_at)
  const limit = usage?.active_listing_limit ?? null
  const activeCount = usage?.active_listings ?? 0
  const limitReached = premiumBlocked || (limit !== null && activeCount >= limit)
  const counts = page?.counts ?? { active: 0, expired: 0, resolved: 0 }
  const rows = page?.items ?? []

  function priceLine(l: MyListing): string | null {
    if (l.type === "selling") {
      return l.price_negotiable || !l.price ? s.negotiable : formatPrice(l.price.amount_minor / 100, locale)
    }
    if (l.type === "giving") return s.free
    return null
  }

  function expiryLine(l: MyListing): string {
    if (l.status === "resolved") {
      const outcome = s.outcome[l.resolved_outcome ?? OUTCOME_FOR_TYPE[l.type]]
      return l.resolved_at ? format(m.resolvedOn, { outcome, date: formatDate(l.resolved_at, locale) }) : outcome
    }
    if (l.status === "expired") return format(m.expiredOn, { date: formatDate(l.expires_at, locale) })
    return format(m.activeUntil, { date: formatDate(l.expires_at, locale) })
  }

  function hiddenText(l: MyListing): string {
    const date = formatDate(l.hidden_at, locale)
    if (!l.hidden_reason) return format(m.hiddenNoReason, { date })
    const label = s.reportReason[l.hidden_reason]
    const reason = label.charAt(0).toLocaleLowerCase(intlLocale(locale)) + label.slice(1)
    return format(m.hidden, { date, reason })
  }

  function renderRow(l: MyListing) {
    const price = priceLine(l)
    const soon = l.status === "active" && l.days_left !== null && l.days_left <= SOON_DAYS
    const showExtend = !suspended && (l.status === "active" || l.status === "expired")
    const extendBlocked = l.status === "expired" && limitReached
    const thumb = thumbs[l.id]
    return (
      <Card key={l.id} className="gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-foreground/5 md:size-16">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URLs, not optimisable
              <img src={thumb} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ListingTypeTag type={l.type} label={s.type[l.type]} />
              {soon && <StatusBadge status="soon" label={plural(m, "expiresIn", l.days_left ?? 0, locale)} />}
              {l.status === "active" && !soon && <StatusBadge status="done" label={m.statusActive} />}
              {l.status === "hidden" && <StatusBadge status="missed" label={m.statusHidden} />}
              {l.status === "expired" && <StatusBadge status="missed" label={m.statusExpired} />}
              {l.status === "resolved" && <StatusBadge status="done" label={m.statusResolved} />}
            </div>
            <Link
              href={`/sapa-pomoci/${l.id}`}
              className="line-clamp-2 font-heading text-lg font-bold break-words hover:underline"
            >
              {l.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {price ? `${price} · ` : ""}
              {expiryLine(l)}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 md:size-9"
                aria-label={format(m.actionsFor, { title: l.title })}
                disabled={busyId === l.id}
              >
                <MoreHorizontal className="size-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!suspended && (l.status === "active" || l.status === "expired") && (
                <DropdownMenuItem asChild>
                  <Link href={`/sapa-pomoci/${l.id}/izmeni`}>
                    <Pencil className="size-4" aria-hidden />
                    {m.edit}
                  </Link>
                </DropdownMenuItem>
              )}
              {!suspended && l.status === "active" && (
                <DropdownMenuItem onSelect={() => setResolving(l)}>
                  <CircleCheck className="size-4" aria-hidden />
                  {m.resolve}
                </DropdownMenuItem>
              )}
              {!suspended && (l.status === "active" || l.status === "expired") && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(l)}>
                <Trash2 className="size-4" aria-hidden />
                {m.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {l.status === "hidden" && (
          <p className="flex items-start gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">{hiddenText(l)}</span>
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/poruke"
            className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground md:min-h-9"
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            <span className="truncate">
              {l.conversation_count === 0 ? m.noMessages : format(m.conversations, { n: l.conversation_count })}
              {l.unread_count > 0 && (
                <span className="font-medium text-foreground"> · {format(m.unread, { n: l.unread_count })}</span>
              )}
            </span>
          </Link>
          {showExtend && (
            <Button
              variant={l.status === "expired" || soon ? "default" : "outline"}
              size="sm"
              className="h-11 md:h-8"
              disabled={!l.can_extend || extendBlocked || busyId === l.id}
              aria-describedby={extendBlocked ? `ext-${l.id}` : undefined}
              onClick={() => void extend(l)}
            >
              <RefreshCw className="size-4" aria-hidden />
              {l.status === "expired" ? m.republish : m.extend}
            </Button>
          )}
        </div>
        {showExtend && extendBlocked && (
          <p id={`ext-${l.id}`} className="text-sm text-muted-foreground">
            {m.limitReached}
          </p>
        )}
      </Card>
    )
  }

  const empty: Record<TabKey, { title: string; text: string }> = {
    active: { title: m.emptyActiveTitle, text: m.emptyActiveText },
    expired: { title: m.emptyExpiredTitle, text: m.emptyExpiredText },
    resolved: { title: m.emptyResolvedTitle, text: m.emptyResolvedText },
  }

  function body(key: TabKey) {
    if (status === "loading") return <RowsSkeleton label={m.loading} />
    if (status === "error")
      return <ErrorState message={copy.common.error} onRetry={() => void load(tab)} labels={{ retry: copy.common.retry }} />
    if (rows.length === 0)
      return (
        <EmptyState
          icon={ListChecks}
          title={empty[key].title}
          description={empty[key].text}
          action={key === "active" && !suspended && !limitReached ? m.newListing : undefined}
          href="/sapa-pomoci/nova"
        />
      )
    return (
      <div className="space-y-3">
        {rows.map((l) => renderRow(l))}
      </div>
    )
  }

  const resolvingOutcome = resolving ? s.outcome[OUTCOME_FOR_TYPE[resolving.type]] : ""

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-9 font-bold">{m.title}</h1>
          <p className="text-sm text-muted-foreground">{m.subtitle}</p>
        </div>
        {page && !suspended && !limitReached && (
          <Button asChild className="h-11 md:h-9">
            <Link href="/sapa-pomoci/nova">
              <Plus className="size-5" aria-hidden />
              {m.newListing}
            </Link>
          </Button>
        )}
      </div>

      {suspended && (
        <Card role="status" className="flex-row items-start gap-3 px-4 py-3">
          <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 text-sm">{m.suspended}</p>
        </Card>
      )}

      {page && !suspended && limit !== null && (
        <Card className="gap-3 p-4 md:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-bold">{m.counterTitle}</h2>
            <span className="text-sm font-medium">{format(m.counterValue, { n: activeCount, limit })}</span>
          </div>
          <Progress
            value={limit > 0 ? (Math.min(activeCount, limit) / limit) * 100 : 100}
            aria-label={format(m.counterAria, { n: activeCount, limit })}
          />
          <p className="text-sm text-muted-foreground">{m.counterNote}</p>
        </Card>
      )}

      {page && !suspended && limitReached && (
        <PremiumLock title={copy.common.premiumTitle} cta={copy.common.premiumCta} description={m.premiumLock} />
      )}

      <Tabs value={tab} onValueChange={(v) => changeTab(v as TabKey)}>
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList>
            <TabsTrigger value="active">{format(m.tabActive, { n: counts.active })}</TabsTrigger>
            <TabsTrigger value="expired">{format(m.tabExpired, { n: counts.expired })}</TabsTrigger>
            <TabsTrigger value="resolved">{format(m.tabResolved, { n: counts.resolved })}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="active" className="mt-4">
          {body("active")}
        </TabsContent>
        <TabsContent value="expired" className="mt-4">
          {body("expired")}
        </TabsContent>
        <TabsContent value="resolved" className="mt-4">
          {body("resolved")}
        </TabsContent>
      </Tabs>

      <AlertDialog open={resolving !== null} onOpenChange={(o) => !o && setResolving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{format(m.resolveTitle, { outcome: resolvingOutcome })}</AlertDialogTitle>
            <AlertDialogDescription>{format(m.resolveText, { title: resolving?.title ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void resolve()}>{m.resolveConfirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{format(m.deleteText, { title: deleting?.title ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              {m.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
