"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Ban,
  Building2,
  CalendarClock,
  Clock,
  Copy,
  ExternalLink,
  Flag,
  HandHeart,
  ImageIcon,
  Landmark,
  LogIn,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  CircleCheck,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { ListingTypeTag, formatRsd } from "@/components/app/listing-type-tag"
import { BlockDialog, ReportDialog, type ReportOutcome } from "@/components/app/safety-dialogs"
import { StatusBadge } from "@/components/app/status-badge"
import type { ChangeListingInput, Listing, ListingOutcome, ListingType } from "@/lib/actions/listings"
import type { DonationInfo } from "@/lib/actions/organisation"
import type { SendMessageInput, SendMessageResult } from "@/lib/actions/messages"
import type { SubmitReportInput, SubmitReportResult, UserBlock } from "@/lib/actions/reports"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { blockDialogLabels, reportDialogLabels, sendErrorMessage } from "../../poruke/messages-client"

// S33 — Oglas · /sapa-pomoci/[id] · FR-62, FR-66, FR-67 #3 (Step 28b; port of
// docs/product/04-design/screens/listing-detail.tsx without the StateSwitcher). States from EP-74 (API §7.3):
// loading → default / need; 404 → unavailable (resolved, expired, hidden, suspended or blocked author — and, per
// OQ-17 (g), a resolved listing for anyone but its author); 5xx → error with retry. signed_out from
// viewer.signed_in; own from viewer.is_author (edit, extend, resolve, delete via EP-77; no message button);
// the author's resolved variant (Rešeno — <outcome>, date from resolved_at = updated_at, OQ-17 (a)); suspended from
// Me.marketplace.suspended_at. Doniraj (need with has_donation_info) opens a Dialog loaded from EP-78: each block is
// omitted when its field is null; has_any = false → the "no donation info yet" message; recipient =
// organisations.name and purpose "Donacija — <title>" (OQ-17 (c)). No money is collected (BR-58): no amount field,
// no payment call; the only outbound link is the shelter's payment_url.
// Step 28c: "Pošalji poruku" / "Pošalji poruku azilu" (also in the Doniraj Dialog) open the message Dialog (EP-82 with
// listing_id; sent → "Poruka je poslata…" + Otvori razgovor) or, when viewer.my_conversation_id is set, the existing
// thread /poruke/<id> (BR-61); the ⋯ menu (signed in, not the author) has Prijavi oglas → ReportDialog (EP-84) and —
// not on shelter needs — Blokiraj korisnika → BlockDialog (EP-85), after which the listing is unavailable.

export type ListingDetailCopy = {
  detail: Dictionary["sapa"]["detail"]
  sapa: Dictionary["sapa"]["common"]
  common: Dictionary["common"]
}

export type ListingDetailActions = {
  changeListing: (input: ChangeListingInput) => Promise<ActionResult<Listing | { deleted_listing_id: string }>>
  getDonationInfo: (input: { listing_id: string }) => Promise<ActionResult<DonationInfo>>
  /** EP-82, EP-84, EP-85 (Step 28c). */
  sendMessage?: (input: SendMessageInput) => Promise<ActionResult<SendMessageResult>>
  submitReport?: (input: SubmitReportInput) => Promise<ActionResult<SubmitReportResult>>
  blockUser?: (userId: string) => Promise<ActionResult<UserBlock>>
}

type LoadState = { kind: "loading" } | { kind: "ready"; listing: Listing } | { kind: "unavailable" } | { kind: "error" }

type DonateState = { kind: "closed" } | { kind: "loading" } | { kind: "signin" } | { kind: "ready"; info: DonationInfo }

const DEFAULT_OUTCOME: Record<ListingType, ListingOutcome> = {
  giving: "given",
  selling: "sold",
  need: "donated",
  seeking: "found",
}

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** "19. 10. 2026." · "19 Oct 2026" (Belgrade). */
function formatDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso))
}

/** "član od septembra 2026." — the month from the dictionary (Serbian genitive). */
function memberSince(iso: string, t: ListingDetailCopy["detail"]) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "numeric", timeZone: "Europe/Belgrade" })
    .formatToParts(new Date(iso))
  const year = parts.find((p) => p.type === "year")?.value ?? ""
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1)
  return format(t.memberSince, { month: t.months[`m${month}` as keyof typeof t.months] ?? "", year })
}

/** Money.amount_minor is para: 250000 → "2.500 RSD" · "2,500 RSD". */
function formatPrice(amountMinor: number, locale: Locale) {
  const rsd = Math.round(amountMinor / 100)
  return locale === "en" ? `${rsd.toLocaleString("en-GB")} RSD` : formatRsd(rsd)
}

/** Price line: selling → amount or "Po dogovoru"; giving → "Besplatno"; need / seeking → none. */
function priceLine(listing: Listing, copy: ListingDetailCopy, locale: Locale) {
  if (listing.type === "selling") {
    return listing.price_negotiable || !listing.price ? copy.sapa.negotiable : formatPrice(listing.price.amount_minor, locale)
  }
  if (listing.type === "giving") return copy.sapa.free
  return null
}

function plural(t: Record<string, unknown>, base: string, n: number, locale: Locale) {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  const key = `${base}_${rule === "one" || rule === "few" ? rule : "other"}`
  return format(String(t[key]), { n })
}

function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy="true" aria-label={label}>
      <Card className="gap-4 p-4 md:p-6">
        <Skeleton className="aspect-[4/3] w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-16 w-full" />
      </Card>
      <Card className="gap-3 p-4 md:p-6">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
    </div>
  )
}

function Gallery({ listing, t }: { listing: Listing; t: ListingDetailCopy["detail"] }) {
  const [active, setActive] = useState(0)
  const photos = [...listing.photos].sort((a, b) => a.position - b.position)
  const count = Math.max(photos.length, 1)
  const current = photos[active]?.url?.url ?? null
  return (
    <div className="space-y-2">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm bg-foreground/5">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URLs, not optimisable
          <img
            src={current}
            alt={format(t.photoOf, { n: active + 1, count, title: listing.title })}
            className="size-full object-cover"
          />
        ) : (
          <>
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
            <span className="sr-only">{format(t.photoOf, { n: active + 1, count, title: listing.title })}</span>
          </>
        )}
        {count > 1 && (
          <span className="absolute right-3 bottom-3 rounded-full bg-card px-2 text-xs font-medium" aria-hidden>
            {active + 1} / {count}
          </span>
        )}
      </div>
      {count > 1 && (
        <div className="grid grid-cols-5 gap-2 md:max-w-md">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={format(t.showPhoto, { n: i + 1 })}
              aria-pressed={active === i}
              className={cn(
                "flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-sm bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active === i && "ring-2 ring-primary",
              )}
            >
              {photo.url?.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URLs, not optimisable
                <img src={photo.url.url} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const MESSAGE_MAX = 2000

/** The S33 "Pošalji poruku" Dialog (EP-82 with listing_id). One idempotency key per opened Dialog (API §3.3). */
function MessageDialog({
  open,
  onOpenChange,
  author,
  title,
  copy,
  onSend,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  author: string
  title: string
  copy: ListingDetailCopy
  onSend: (body: string, key: string) => Promise<ActionResult<SendMessageResult>>
}) {
  const t = copy.detail
  const [text, setText] = useState(t.messageDefault)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(() => crypto.randomUUID())

  async function send() {
    if (!text.trim()) {
      setError(copy.sapa.sendEmpty)
      return
    }
    setBusy(true)
    try {
      const result = await onSend(text, key)
      if (result.ok) {
        setError("")
        setSentTo(result.data.conversation.id)
      } else {
        setError(sendErrorMessage(result.error, copy.sapa, copy.common))
      }
    } catch {
      setError(copy.common.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          if (sentTo) {
            setText(t.messageDefault)
            setKey(crypto.randomUUID())
          }
          setSentTo(null)
          setError("")
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{format(t.messageTitle, { name: author })}</DialogTitle>
          <DialogDescription className="break-words">{format(t.messageListing, { title })}</DialogDescription>
        </DialogHeader>
        {sentTo ? (
          <p role="status" className="flex items-center gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
            <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0">{t.messageSent}</span>
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="first-message">{t.messageLabel}</Label>
            <Textarea
              id="first-message"
              rows={4}
              maxLength={MESSAGE_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "first-message-error" : "first-message-count"}
            />
            {error ? (
              <p id="first-message-error" className="text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p id="first-message-count" className="text-right text-xs font-medium text-muted-foreground">
                {text.length} / {MESSAGE_MAX}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          {sentTo ? (
            <Button asChild className="h-11 md:h-9">
              <Link href={`/poruke/${sentTo}`}>{t.openConversation}</Link>
            </Button>
          ) : (
            <>
              <Button variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
                {t.cancel}
              </Button>
              <Button className="h-11 md:h-9" disabled={busy} onClick={() => void send()}>
                {t.send}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DonationDialog({
  state,
  shelterName,
  signInHref,
  t,
  onClose,
  onMessage,
}: {
  state: DonateState
  shelterName: string
  signInHref: string
  t: ListingDetailCopy["detail"]
  onClose: () => void
  /** "Pošalji poruku azilu" — opens the message Dialog or the existing thread (Step 28c). */
  onMessage: () => void
}) {
  const [copied, setCopied] = useState(false)
  const info = state.kind === "ready" ? state.info : null

  function copyAccount(account: string) {
    void Promise.resolve(navigator.clipboard?.writeText(account))
      .then(() => setCopied(true))
      .catch(() => undefined)
  }

  return (
    <Dialog
      open={state.kind !== "closed"}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{format(t.donateTitle, { name: info?.organisation_name ?? shelterName })}</DialogTitle>
          <DialogDescription>{t.donateNote}</DialogDescription>
        </DialogHeader>

        {state.kind === "loading" && (
          <div className="space-y-3" aria-busy="true" aria-label={t.loading}>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {state.kind === "signin" && (
          <Button asChild className="h-11 w-full md:h-9">
            <Link href={signInHref}>
              <LogIn className="size-4" aria-hidden />
              {t.signInShort}
            </Link>
          </Button>
        )}

        {info && !info.has_any && <p className="rounded-sm bg-foreground/5 p-3 text-sm">{t.noDonationInfo}</p>}

        {info && info.has_any && (
          <div className="space-y-4">
            {info.bank_account && (
              <section aria-labelledby="don-account" className="space-y-2 rounded-sm bg-foreground/5 p-3">
                <h3 id="don-account" className="flex items-center gap-2 text-sm font-medium">
                  <Landmark className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {t.bankTitle}
                </h3>
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-heading text-lg font-bold tabular-nums">{info.bank_account}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 shrink-0 md:h-8"
                    onClick={() => copyAccount(info.bank_account ?? "")}
                    aria-label={t.copyLabel}
                  >
                    <Copy className="size-4" aria-hidden />
                    {copied ? t.copied : t.copy}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">{format(t.recipient, { name: info.organisation_name })}</p>
                {info.payment_purpose && (
                  <p className="text-sm text-muted-foreground">{format(t.purpose, { purpose: info.payment_purpose })}</p>
                )}
              </section>
            )}
            {info.payment_url && (
              <section aria-labelledby="don-online" className="space-y-2 rounded-sm bg-foreground/5 p-3">
                <h3 id="don-online" className="flex items-center gap-2 text-sm font-medium">
                  <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {t.onlineTitle}
                </h3>
                <p className="text-sm text-muted-foreground">{t.onlineText}</p>
                <Button asChild variant="outline" className="h-11 w-full md:h-9 md:w-auto">
                  <a href={info.payment_url} target="_blank" rel="noopener noreferrer">
                    {t.payOnline}
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                </Button>
              </section>
            )}
            {(info.dropoff_address || info.dropoff_hours) && (
              <section aria-labelledby="don-dropoff" className="space-y-2 rounded-sm bg-foreground/5 p-3">
                <h3 id="don-dropoff" className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {t.dropoffTitle}
                </h3>
                {info.dropoff_address && <p className="text-sm">{info.dropoff_address}</p>}
                {info.dropoff_hours && (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0">{info.dropoff_hours}</span>
                  </p>
                )}
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          {info && (
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => {
                setCopied(false)
                onMessage()
              }}
            >
              <MessageCircle className="size-4" aria-hidden />
              {t.messageShelter}
            </Button>
          )}
          <Button
            className="h-11 md:h-9"
            onClick={() => {
              setCopied(false)
              onClose()
            }}
          >
            {t.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ListingDetailClient({
  listingId,
  locale,
  suspended,
  copy,
  actions,
}: {
  listingId: string
  locale: Locale
  suspended: boolean
  copy: ListingDetailCopy
  actions: ListingDetailActions
}) {
  const router = useRouter()
  const t = copy.detail
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [reload, setReload] = useState(0)
  const [donate, setDonate] = useState<DonateState>({ kind: "closed" })
  const [resolveOpen, setResolveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [messageOpen, setMessageOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/public/listings/${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!active) return
        if (response.status === 404) return setState({ kind: "unavailable" })
        if (!response.ok) return setState({ kind: "error" })
        const listing = (await response.json()) as Listing
        if (active) setState({ kind: "ready", listing })
      })
      .catch(() => {
        if (active) setState({ kind: "error" })
      })
    return () => {
      active = false
    }
  }, [listingId, reload])

  const selfPath = `/sapa-pomoci/${listingId}`
  const signInHref = `/prijava?next=${encodeURIComponent(selfPath)}`

  function retry() {
    setState({ kind: "loading" })
    setReload((n) => n + 1)
  }

  function showError(code: string) {
    if (code === "premium_required") toast.error(t.premiumLimit)
    else if (code === "marketplace_suspended") toast.error(t.suspendedOwnText)
    else toast.error(copy.common.error)
  }

  async function change(input: ChangeListingInput) {
    setBusy(true)
    try {
      return await actions.changeListing(input)
    } catch {
      return null
    } finally {
      setBusy(false)
    }
  }

  async function extend(listing: Listing) {
    const result = await change({ listing_id: listing.id, op: "extend" })
    if (!result) return toast.error(copy.common.error)
    if (!result.ok) return showError(result.error.code)
    const updated = result.data as Listing
    setState({ kind: "ready", listing: updated })
    toast.success(format(t.extended, { date: formatDate(updated.expires_at, locale) }))
  }

  async function resolve(listing: Listing) {
    const result = await change({ listing_id: listing.id, op: "resolve" })
    if (!result) return toast.error(copy.common.error)
    if (!result.ok) return showError(result.error.code)
    const updated = result.data as Listing
    setState({ kind: "ready", listing: updated })
    const outcome = updated.resolved_outcome ?? DEFAULT_OUTCOME[listing.type]
    toast.success(format(t.resolvedToast, { outcome: copy.sapa.outcome[outcome] }))
  }

  async function remove(listing: Listing) {
    const result = await change({ listing_id: listing.id, op: "delete", confirm: true })
    if (!result) return toast.error(copy.common.error)
    if (!result.ok) return showError(result.error.code)
    toast.success(format(t.deletedToast, { title: listing.title }))
    router.push("/sapa-pomoci/moje")
  }

  // EP-82 — the existing conversation opens instead of the Dialog (BR-61).
  function openMessage(listing: Listing) {
    if (listing.viewer.my_conversation_id) {
      router.push(`/poruke/${listing.viewer.my_conversation_id}`)
      return
    }
    setMessageOpen(true)
  }

  async function report(listing: Listing, input: { reason: SubmitReportInput["reason"]; note: string | null }): Promise<ReportOutcome> {
    if (!actions.submitReport) return { status: "error", message: copy.common.error }
    try {
      const result = await actions.submitReport({ listing_id: listing.id, reason: input.reason, note: input.note })
      if (result.ok) return { status: result.data.already_submitted ? "already_submitted" : "sent" }
    } catch {
      // falls through to the error message
    }
    return { status: "error", message: copy.common.error }
  }

  // EP-85 — after blocking from the menu the listing is hidden for the caller (unavailable).
  async function block(listing: Listing, name: string) {
    setBlockOpen(false)
    if (!actions.blockUser) return
    try {
      const result = await actions.blockUser(listing.author.user_id)
      if (result.ok) {
        toast.success(format(copy.sapa.blockedToast, { name }))
        setState({ kind: "unavailable" })
        return
      }
    } catch {
      // falls through to the error toast
    }
    toast.error(copy.common.error)
  }

  async function openDonate(listing: Listing) {
    setDonate({ kind: "loading" })
    try {
      const result = await actions.getDonationInfo({ listing_id: listing.id })
      if (result.ok) return setDonate({ kind: "ready", info: result.data })
      if (result.error.code === "unauthenticated") return setDonate({ kind: "signin" })
    } catch {
      // falls through to the error toast
    }
    setDonate({ kind: "closed" })
    toast.error(copy.common.error)
  }

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 md:h-8">
      <Link href="/sapa-pomoci">
        <ArrowLeft className="size-4" aria-hidden />
        {t.back}
      </Link>
    </Button>
  )

  if (state.kind !== "ready") {
    return (
      <div className="space-y-6">
        {back}
        {state.kind === "loading" && (
          <>
            <h1 className="sr-only">{t.heading}</h1>
            <DetailSkeleton label={t.loading} />
          </>
        )}
        {state.kind === "error" && (
          <>
            <h1 className="sr-only">{t.heading}</h1>
            <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={retry} />
          </>
        )}
        {state.kind === "unavailable" && (
          <>
            <h1 className="sr-only">{t.unavailableTitle}</h1>
            <EmptyState
              icon={SearchX}
              title={t.unavailableTitle}
              description={t.unavailableText}
              action={t.unavailableAction}
              href="/sapa-pomoci"
            />
          </>
        )}
      </div>
    )
  }

  const listing = state.listing
  const { viewer, author } = listing
  const isAuthor = viewer.is_author
  const isShelter = author.kind === "shelter"
  const authorName = author.display_name ?? copy.sapa.userFallback
  const cityName = (city: { name_sr: string; name_en: string } | null) =>
    city ? (locale === "en" ? city.name_en : city.name_sr) : ""
  const price = priceLine(listing, copy, locale)
  const outcomeLabel = copy.sapa.outcome[listing.resolved_outcome ?? DEFAULT_OUTCOME[listing.type]]
  const resolvedLabel = copy.sapa.outcome[DEFAULT_OUTCOME[listing.type]]
  const canDonate = listing.type === "need" && listing.has_donation_info
  const isNeed = listing.type === "need"
  const statusLine =
    listing.status === "resolved"
      ? format(t.resolvedOn, { date: formatDate(listing.resolved_at ?? listing.updated_at, locale) })
      : listing.status === "expired"
        ? format(t.expiredOn, { date: formatDate(listing.expires_at, locale) })
        : format(t.activeUntil, { date: formatDate(listing.expires_at, locale) })
  const authorMeta = [cityName(author.city), memberSince(author.member_since, t)].filter(Boolean).join(" · ")
  // The ⋯ report / block menu: signed in and not the author (hidden signed out, Design S33).
  const showSafety = viewer.signed_in && !isAuthor

  const conversationsLink =
    viewer.conversation_count !== null ? (
      <Button asChild variant="outline" className="h-11 w-full md:h-9">
        <Link href="/poruke">
          <MessageCircle className="size-4" aria-hidden />
          {plural(t, "conversations", viewer.conversation_count, locale)}
        </Link>
      </Button>
    ) : null

  const deleteButton = (
    <Button
      variant="ghost"
      className="h-11 w-full text-destructive md:h-9"
      disabled={busy}
      onClick={() => setDeleteOpen(true)}
    >
      <Trash2 className="size-4" aria-hidden />
      {t.delete}
    </Button>
  )

  let actionCard: ReactNode
  if (!viewer.signed_in) {
    actionCard = (
      <>
        <h2 className="font-heading text-lg font-bold">{isNeed ? t.helpShelter : t.interested}</h2>
        <p className="text-sm text-muted-foreground">{t.signedOutNote}</p>
        {canDonate && (
          <Button asChild className="h-11 w-full md:h-9">
            <Link href={signInHref}>
              <HandHeart className="size-4" aria-hidden />
              {t.donate}
            </Link>
          </Button>
        )}
        <Button asChild variant={canDonate ? "outline" : "default"} className="h-11 w-full md:h-9">
          <Link href={signInHref}>
            <LogIn className="size-4" aria-hidden />
            {t.signIn}
          </Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t.noAccount}{" "}
          <Link href="/registracija" className="font-medium text-primary hover:underline">
            {t.register}
          </Link>
        </p>
      </>
    )
  } else if (isAuthor && listing.status === "resolved") {
    actionCard = (
      <>
        <h2 className="font-heading text-lg font-bold">{t.inactiveTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.inactiveText}</p>
        {conversationsLink}
        <Button asChild variant="outline" className="h-11 w-full md:h-9">
          <Link href="/sapa-pomoci">{t.otherListings}</Link>
        </Button>
        {deleteButton}
      </>
    )
  } else if (isAuthor) {
    const isActive = listing.status === "active"
    const isExpired = listing.status === "expired"
    actionCard = (
      <>
        <h2 className="font-heading text-lg font-bold">{t.ownTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {isExpired
            ? format(t.ownExpired, { date: formatDate(listing.expires_at, locale) })
            : format(t.ownActiveUntil, { date: formatDate(listing.expires_at, locale) })}
        </p>
        {suspended && (
          <p className="flex items-start gap-2 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <span className="min-w-0">{t.suspendedOwnText}</span>
          </p>
        )}
        {conversationsLink}
        {!suspended && (isActive || isExpired) && (
          <>
            <Button asChild variant="outline" className="h-11 w-full md:h-9">
              <Link href={`/sapa-pomoci/${listing.id}/izmeni`}>
                <Pencil className="size-4" aria-hidden />
                {t.edit}
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full md:h-9"
              disabled={busy}
              onClick={() => void extend(listing)}
            >
              <RefreshCw className="size-4" aria-hidden />
              {isExpired ? t.republish : t.extend}
            </Button>
          </>
        )}
        {!suspended && isActive && (
          <Button className="h-11 w-full md:h-9" disabled={busy} onClick={() => setResolveOpen(true)}>
            <CircleCheck className="size-4" aria-hidden />
            {t.resolve}
          </Button>
        )}
        {deleteButton}
      </>
    )
  } else if (suspended) {
    actionCard = (
      <>
        <h2 className="font-heading text-lg font-bold">{t.suspendedTitle}</h2>
        <p className="flex items-start gap-2 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0">{t.suspendedText}</span>
        </p>
      </>
    )
  } else if (listing.status !== "active") {
    actionCard = (
      <>
        <h2 className="font-heading text-lg font-bold">{t.inactiveTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.inactiveText}</p>
        <Button asChild variant="outline" className="h-11 w-full md:h-9">
          <Link href="/sapa-pomoci">{t.otherListings}</Link>
        </Button>
      </>
    )
  } else {
    actionCard = (
      <>
        <h2 className="font-heading text-lg font-bold">{isNeed ? t.helpShelter : t.interested}</h2>
        {canDonate && (
          <Button className="h-11 w-full md:h-9" onClick={() => void openDonate(listing)}>
            <HandHeart className="size-4" aria-hidden />
            {t.donate}
          </Button>
        )}
        <Button
          type="button"
          variant={canDonate ? "outline" : "default"}
          className="h-11 w-full md:h-9"
          onClick={() => openMessage(listing)}
        >
          <MessageCircle className="size-4" aria-hidden />
          {isNeed ? t.messageShelter : t.message}
        </Button>
        <p className="text-sm text-muted-foreground">{t.messageNote}</p>
      </>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {back}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="min-w-0 gap-4 p-4 md:p-6">
            <Gallery key={listing.id} listing={listing} t={t} />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ListingTypeTag type={listing.type} label={copy.sapa.type[listing.type]} />
              <Badge variant="secondary">{copy.sapa.category[listing.category]}</Badge>
              <Badge variant="secondary">{copy.sapa.species[listing.species]}</Badge>
              {listing.status === "resolved" && (
                <StatusBadge status="done" label={format(t.resolvedPill, { outcome: outcomeLabel })} />
              )}
            </div>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h1 className="min-w-0 font-heading text-[28px] leading-9 font-bold break-words">{listing.title}</h1>
              {showSafety && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0 md:size-9"
                      aria-label={copy.sapa.moreActions}
                    >
                      <MoreHorizontal className="size-5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                      <Flag className="size-4" aria-hidden />
                      {copy.sapa.reportListing}
                    </DropdownMenuItem>
                    {listing.type !== "need" && (
                      <DropdownMenuItem variant="destructive" onSelect={() => setBlockOpen(true)}>
                        <Ban className="size-4" aria-hidden />
                        {copy.sapa.blockUser}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {price && <p className="font-heading text-[22px] leading-7 font-bold">{price}</p>}
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {cityName(listing.city)}
            </p>
            <Separator />
            <div className="space-y-2">
              <h2 className="font-heading text-lg font-bold">{t.description}</h2>
              <p className="text-base break-words whitespace-pre-line">{listing.description}</p>
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden />
              <span>{format(t.published, { date: formatDate(listing.published_at, locale) })}</span>
              <span aria-hidden>·</span>
              <span>{statusLine}</span>
            </p>
          </Card>

          <div className="min-w-0 space-y-4">
            <Card className="gap-3 p-4 md:p-6">{actionCard}</Card>

            <Card className="gap-3 p-4 md:p-6">
              <h2 className="text-xs font-medium text-muted-foreground">
                {isShelter ? t.postedByShelter : t.postedBy}
              </h2>
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className={cn("size-12", isShelter && "rounded-sm")}>
                  <AvatarFallback
                    className={cn("bg-muted font-heading font-bold text-foreground", isShelter && "rounded-sm")}
                  >
                    {author.initials ?? ""}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-1 font-heading text-lg font-bold">
                    {isShelter && <Building2 className="size-4 shrink-0" aria-hidden />}
                    <span className="truncate">{authorName}</span>
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{authorMeta}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {format(t.activeListings, { n: author.active_listing_count })}
              </p>
              <Button asChild variant="outline" className="h-11 w-full md:h-9">
                <Link
                  href={
                    isShelter && author.organisation_slug ? `/o/${author.organisation_slug}` : `/korisnik/${author.user_id}`
                  }
                >
                  {isShelter && author.organisation_slug ? t.shelterPage : t.viewProfile}
                </Link>
              </Button>
            </Card>

            {!isAuthor && (
              <Card className="flex-row items-start gap-3 p-4">
                <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />
                <p className="min-w-0 text-sm text-muted-foreground">{t.safety}</p>
              </Card>
            )}
          </div>
        </div>
      </div>

      {canDonate && (
        <DonationDialog
          state={donate}
          shelterName={authorName}
          signInHref={signInHref}
          t={t}
          onClose={() => setDonate({ kind: "closed" })}
          onMessage={() => {
            setDonate({ kind: "closed" })
            openMessage(listing)
          }}
        />
      )}

      {actions.sendMessage && viewer.signed_in && !isAuthor && (
        <MessageDialog
          key={listing.id}
          open={messageOpen}
          onOpenChange={setMessageOpen}
          author={authorName}
          title={listing.title}
          copy={copy}
          onSend={(body, key) =>
            actions.sendMessage!({ listing_id: listing.id, body, idempotency_key: key })
          }
        />
      )}
      {showSafety && (
        <>
          <ReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            target="listing"
            name={listing.title}
            labels={reportDialogLabels(copy.sapa)}
            onSubmit={(input) => report(listing, input)}
          />
          <BlockDialog
            open={blockOpen}
            onOpenChange={setBlockOpen}
            name={authorName}
            labels={blockDialogLabels(copy.sapa)}
            onConfirm={() => void block(listing, authorName)}
          />
        </>
      )}

      <AlertDialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{format(t.resolveTitle, { outcome: resolvedLabel })}</AlertDialogTitle>
            <AlertDialogDescription>{t.resolveText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void resolve(listing)}>{t.resolveConfirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{format(t.deleteText, { title: listing.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove(listing)}>
              {t.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
