"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CircleCheck, Inbox, Mail, Phone, Send } from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar"
import { ReadOnlyBanner } from "@/components/app/read-only-banner"
import { cn } from "@/lib/utils"
import type { MyOrganisation } from "@/lib/actions/organisation"
import type {
  OrgRequest,
  OrgRequestKind,
  OrgRequestStatus,
  OrgRequestsPage,
  RecordTransfer,
} from "@/lib/actions/org-requests"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S21 — Zahtevi i upiti · /organizacija/zahtevi · FR-47, FR-49, FR-50 (port of
// docs/product/04-design/screens/org-requests.tsx without the StateSwitchers). Data: EP-53 (organisation name,
// city, approval) and EP-57 (list with status filters and "Učitaj još" offset paging, API §3.4). The Admin
// accepts / rejects (EP-58) and sends the record with re-send (EP-59). States from real responses: default;
// empty (EP-57 items [] with total 0 over every status); read_only (access.can_edit = false — a Volunteer gets
// the volunteer banner, a pending or plan-less organisation the S20 banners); error (ErrorState); loading (the
// page's Suspense fallback).

export type OrgRequestsCopy = {
  orgRequests: Dictionary["orgRequests"]
  orgAnimals: Dictionary["orgAnimals"]
  orgProfile: Dictionary["orgProfile"]
  pet: Dictionary["pet"]
  common: Dictionary["common"]
}

export type OrgRequestsActions = {
  listOrgRequests: (input: {
    status?: OrgRequestStatus | null
    limit?: number
    offset?: number
  }) => Promise<ActionResult<OrgRequestsPage>>
  decideRequest: (input: {
    kind: OrgRequestKind
    id: string
    decision: "accept" | "reject"
  }) => Promise<ActionResult<OrgRequest>>
  sendRecordTransfer: (input: {
    pet_id: string
    recipient_email: string
    idempotency_key: string
  }) => Promise<ActionResult<RecordTransfer>>
  resendRecordTransfer: (input: { transfer_id: string; idempotency_key: string }) => Promise<ActionResult<RecordTransfer>>
}

type Filter = "all" | OrgRequestStatus

const PAGE_SIZE = 20
const TRANSFER_DAYS = 30
const AVATAR_SPECIES: PetSpecies[] = ["cat", "dog", "rabbit", "bird", "fish", "turtle"]
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

function avatarSpecies(species: string): PetSpecies {
  return (AVATAR_SPECIES as string[]).includes(species) ? (species as PetSpecies) : "other"
}

/** A calendar date (YYYY-MM-DD) or a timestamp, in the user's format on the Belgrade calendar. */
function formatDate(value: string | Date, locale: Locale) {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(date)
}

/** A date that ends a sentence: the sr-Latn format already ends with "." ("21. 10. 2026."), so drop it. */
function sentenceEnd(date: string) {
  return date.replace(/\.$/, "")
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(t: Record<string, unknown>, base: string, n: number, locale: Locale) {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  const key = `${base}_${rule === "one" || rule === "few" ? rule : "other"}`
  return format(String(t[key]), { n })
}

/** The approximate age, else from the birth date / year (Step 13 rule); none → null. */
function ageLabel(pet: OrgRequest["pet"], today: string, t: Dictionary["pet"], locale: Locale): string | null {
  if (pet.approx_age_text) return pet.approx_age_text
  const [year, month, day] = today.split("-").map(Number)
  if (pet.birth_date) {
    const [by, bm, bd] = pet.birth_date.split("-").map(Number)
    const months = Math.max(0, (year - by) * 12 + (month - bm) - (day < bd ? 1 : 0))
    return months >= 12 ? plural(t, "years", Math.floor(months / 12), locale) : plural(t, "months", months, locale)
  }
  if (pet.birth_year) {
    const years = year - pet.birth_year
    const age = years >= 1 ? plural(t, "years", years, locale) : plural(t, "months", month - 1, locale)
    return format(t.about, { age })
  }
  return null
}

/** "Mačka · Ženka · oko 2 godine" — the sex is left out when unknown (owner decision, Step 13). */
function animalDetail(pet: OrgRequest["pet"], today: string, copy: OrgRequestsCopy, locale: Locale) {
  const species =
    pet.species === "other" && pet.species_other
      ? pet.species_other
      : (copy.pet.species[pet.species as keyof Dictionary["pet"]["species"]] ?? pet.species)
  const kind = [species, pet.breed].filter(Boolean).join(", ")
  const sex = pet.sex === "female" ? copy.orgAnimals.female : pet.sex === "male" ? copy.orgAnimals.male : null
  return [kind, sex, ageLabel(pet, today, copy.pet, locale)].filter(Boolean).join(" · ")
}

function RequestStatusBadge({ status, t }: { status: OrgRequestStatus; t: Dictionary["orgRequests"] }) {
  if (status === "pending")
    return <Badge className="border-transparent bg-primary text-primary-foreground">{t.statusPending}</Badge>
  if (status === "accepted")
    return <Badge className="border-transparent bg-success text-success-foreground">{t.statusAccepted}</Badge>
  return (
    <Badge variant="outline" className="bg-card">
      {t.statusRejected}
    </Badge>
  )
}

/** S21 loading variant — the page's Suspense fallback. */
export function OrgRequestsLoading({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="gap-4 p-4 md:p-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
        </Card>
      ))}
    </div>
  )
}

function belgradeToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date())
}

export function OrgRequestsScreen({
  initialOrg,
  initialRequests,
  locale,
  copy,
  actions,
}: {
  initialOrg: ActionResult<MyOrganisation>
  initialRequests: ActionResult<OrgRequestsPage>
  locale: Locale
  copy: OrgRequestsCopy
  actions: OrgRequestsActions
}) {
  const t = copy.orgRequests
  const router = useRouter()
  const [page, setPage] = useState<OrgRequestsPage | null>(initialRequests.ok ? initialRequests.data : null)
  const [filter, setFilter] = useState<Filter>("all")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState<OrgRequest | null>(null)
  const [transferFor, setTransferFor] = useState<OrgRequest | null>(null)
  const [transferEmail, setTransferEmail] = useState("")
  const [transferError, setTransferError] = useState("")
  const [transferKey, setTransferKey] = useState("")
  const [transferUntil, setTransferUntil] = useState("")
  const [today] = useState(belgradeToday)

  const org = initialOrg.ok ? initialOrg.data : null
  if (!org || !page) {
    return <ErrorState message={copy.common.error} onRetry={() => router.refresh()} labels={{ retry: copy.common.retry }} />
  }

  const organisation = org.organisation
  const isShelter = page.kind === "adoption_request"
  const canDecide = page.access.can_edit
  const volunteer = page.access.role === "volunteer"
  const pending = organisation.approval_status === "pending"
  const noPlan = organisation.type === "breeder" && !org.breeder_plan_active
  const counts = page.status_counts
  const allCount = counts.pending + counts.accepted + counts.rejected
  const cityName = organisation.city
    ? locale === "en"
      ? organisation.city.name_en || organisation.city.name_sr
      : organisation.city.name_sr
    : null
  const heading = cityName ? format(copy.orgProfile.nameCity, { name: organisation.name, city: cityName }) : organisation.name
  const reservedLabel = isShelter ? copy.orgAnimals.shelterStatus.reserved : copy.orgAnimals.offspringStatus.reserved
  const handedOverLabel = isShelter ? copy.orgAnimals.shelterStatus.adopted : copy.orgAnimals.offspringStatus.sold

  async function load(next: { status?: Filter; offset?: number } = {}) {
    const status = next.status ?? filter
    const offset = next.offset ?? 0
    const result = await actions.listOrgRequests({
      status: status === "all" ? null : status,
      limit: PAGE_SIZE,
      offset,
    })
    if (!result.ok) {
      toast.error(copy.common.error)
      return
    }
    setPage((current) =>
      offset > 0 && current ? { ...result.data, items: [...current.items, ...result.data.items] } : result.data,
    )
  }

  function onFilter(value: Filter) {
    setFilter(value)
    void load({ status: value })
  }

  async function decide(r: OrgRequest, decision: "accept" | "reject") {
    setBusy(true)
    const result = await actions.decideRequest({ kind: page!.kind, id: r.id, decision })
    setBusy(false)
    if (!result.ok) {
      toast.error(copy.common.error)
      if (result.error.code === "already_decided") await load()
      return
    }
    setNotice(
      decision === "accept"
        ? format(t.acceptedNotice, { pet: r.pet.name, status: reservedLabel, name: r.name })
        : format(t.rejectedNotice, { name: r.name }),
    )
    await load()
  }

  async function confirmReject() {
    const r = rejecting
    if (!r) return
    setRejecting(null)
    await decide(r, "reject")
  }

  function openTransfer(r: OrgRequest) {
    setTransferFor(r)
    setTransferEmail(r.transfer?.recipient_email ?? r.email)
    setTransferError("")
    setTransferKey(crypto.randomUUID())
    setTransferUntil(formatDate(new Date(Date.now() + TRANSFER_DAYS * 24 * 60 * 60 * 1000), locale))
  }

  async function sendTransfer() {
    const r = transferFor
    if (!r) return
    const email = transferEmail.trim()
    if (!EMAIL.test(email)) {
      setTransferError(t.errEmail)
      return
    }
    setBusy(true)
    const resend = r.transfer && r.transfer.recipient_email === email.toLowerCase()
    const result = resend
      ? await actions.resendRecordTransfer({ transfer_id: r.transfer!.id, idempotency_key: transferKey })
      : await actions.sendRecordTransfer({ pet_id: r.pet.pet_id, recipient_email: email, idempotency_key: transferKey })
    setBusy(false)
    if (!result.ok) {
      setTransferError(result.error.code === "validation_failed" ? t.errEmail : copy.common.error)
      return
    }
    setNotice(format(t.transferNotice, { pet: r.pet.name, email: result.data.recipient_email }))
    setTransferFor(null)
    await load()
  }

  function transferLine(transfer: RecordTransfer) {
    if (transfer.status === "accepted" && transfer.accepted_at) {
      return { text: format(t.transferAccepted, { date: sentenceEnd(formatDate(transfer.accepted_at, locale)) }), warn: false }
    }
    if (transfer.status === "declined") return { text: t.transferDeclined, warn: true }
    if (transfer.is_expired) {
      return { text: format(t.transferExpired, { date: formatDate(transfer.expires_at, locale) }), warn: true }
    }
    return {
      text: format(t.transferSent, {
        sent: formatDate(transfer.sent_at, locale),
        email: transfer.recipient_email,
        date: sentenceEnd(formatDate(transfer.expires_at, locale)),
      }),
      warn: false,
    }
  }

  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: t.filterAll, count: allCount },
    { value: "pending", label: t.filterPending, count: counts.pending },
    { value: "accepted", label: t.filterAccepted, count: counts.accepted },
    { value: "rejected", label: t.filterRejected, count: counts.rejected },
  ]


  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{heading}</p>
        <h1 className="font-heading text-[28px] leading-9 font-bold">{isShelter ? t.headingShelter : t.headingBreeder}</h1>
      </div>

      {volunteer ? (
        <ReadOnlyBanner reason={isShelter ? t.volunteerShelter : t.volunteerBreeder} />
      ) : pending ? (
        <ReadOnlyBanner reason={copy.orgAnimals.pendingBanner} />
      ) : (
        noPlan && <ReadOnlyBanner reason={copy.orgAnimals.breederPlanBanner} />
      )}

      {notice && (
        <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
          <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
          <p className="min-w-0 text-sm">{notice}</p>
        </Card>
      )}

      {allCount === 0 ? (
        <EmptyState
          icon={Inbox}
          title={isShelter ? t.emptyTitleShelter : t.emptyTitleBreeder}
          description={isShelter ? t.emptyShelter : t.emptyBreeder}
        />
      ) : (
        <section aria-label={isShelter ? t.sectionShelter : t.sectionBreeder} className="space-y-4">
          <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1" role="group" aria-label={t.filterLabel}>
            {filters.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? "default" : "outline"}
                aria-pressed={filter === f.value}
                className="shrink-0"
                onClick={() => onFilter(f.value)}
              >
                {format(t.chip, { label: f.label, count: f.count })}
              </Button>
            ))}
          </div>

          {page.items.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">{t.noneInFilter}</p>
            </Card>
          )}

          <div className="space-y-4">
            {page.items.map((r) => {
              const line = r.status === "accepted" && r.transfer ? transferLine(r.transfer) : null
              const canSend = canDecide && r.status === "accepted" && r.transfer?.status !== "accepted"
              const liveTransfer = r.transfer && r.transfer.status === "pending" && !r.transfer.is_expired
              return (
                <Card key={r.id} className="gap-4 p-4 md:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <PetAvatar name={r.pet.name} species={avatarSpecies(r.pet.species)} />
                      <div className="min-w-0">
                        <h2 className="truncate font-heading text-lg font-bold">{r.pet.name}</h2>
                        <p className="truncate text-sm text-muted-foreground">{animalDetail(r.pet, today, copy, locale)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <RequestStatusBadge status={r.status} t={t} />
                      <span className="text-xs font-medium text-muted-foreground">{formatDate(r.created_at, locale)}</span>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-sm bg-foreground/5 p-3">
                    <p className="text-sm font-medium">{r.name}</p>
                    <div className="flex flex-col gap-1 text-sm md:flex-row md:gap-4">
                      <a
                        href={`tel:${r.phone.replace(/\s/g, "")}`}
                        className="flex min-w-0 items-center gap-2 text-primary hover:underline"
                      >
                        <Phone className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{r.phone}</span>
                      </a>
                      <a href={`mailto:${r.email}`} className="flex min-w-0 items-center gap-2 text-primary hover:underline">
                        <Mail className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{r.email}</span>
                      </a>
                    </div>
                    {r.message && <p className="text-sm text-muted-foreground">„{r.message}“</p>}
                  </div>

                  {line && <p className={cn("text-sm", line.warn ? "text-destructive" : "text-muted-foreground")}>{line.text}</p>}

                  {canDecide && r.status === "pending" && (
                    <div className="flex flex-col gap-2 md:flex-row md:justify-end">
                      <Button variant="outline" className="h-11 md:h-9" disabled={busy} onClick={() => setRejecting(r)}>
                        {t.reject}
                      </Button>
                      <Button className="h-11 md:h-9" disabled={busy} onClick={() => void decide(r, "accept")}>
                        {t.accept}
                      </Button>
                    </div>
                  )}

                  {canSend && (
                    <div className="flex flex-col gap-2 md:flex-row md:justify-end">
                      <Button
                        variant={liveTransfer ? "outline" : "default"}
                        className="h-11 md:h-9"
                        onClick={() => openTransfer(r)}
                      >
                        <Send className="size-5" aria-hidden />
                        {r.transfer ? t.sendAgain : t.sendRecord}
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {page.items.length < page.total && (
            <div className="flex justify-center">
              <Button variant="outline" className="h-11 md:h-9" onClick={() => void load({ offset: page.items.length })}>
                {t.loadMore}
              </Button>
            </div>
          )}
        </section>
      )}

      <AlertDialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isShelter ? t.rejectTitleShelter : t.rejectTitleBreeder}</AlertDialogTitle>
            <AlertDialogDescription>
              {format(isShelter ? t.rejectBodyShelter : t.rejectBodyBreeder, {
                name: rejecting?.name ?? "",
                pet: rejecting?.pet.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmReject()}>
              {t.confirmReject}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={transferFor !== null} onOpenChange={(o) => !o && setTransferFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{format(t.transferTitle, { pet: transferFor?.pet.name ?? "" })}</DialogTitle>
            <DialogDescription>{format(t.transferBody, { status: handedOverLabel })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="transfer-email">{t.transferEmail}</Label>
            <Input
              id="transfer-email"
              type="email"
              value={transferEmail}
              onChange={(e) => {
                setTransferEmail(e.target.value)
                setTransferError("")
                setTransferKey(crypto.randomUUID())
              }}
              aria-invalid={transferError ? true : undefined}
              aria-describedby="transfer-help"
            />
            {transferError && <p className="text-sm text-destructive">{transferError}</p>}
            <p id="transfer-help" className="text-sm text-muted-foreground">
              {format(t.transferHelp, { date: transferUntil })}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setTransferFor(null)}>
              {t.cancel}
            </Button>
            <Button className="h-11 md:h-9" disabled={busy} onClick={() => void sendTransfer()}>
              <Send className="size-5" aria-hidden />
              {t.sendInvite}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
