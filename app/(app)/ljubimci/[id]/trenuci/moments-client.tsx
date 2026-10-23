"use client"

import { useRef, useState, type Ref } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, Check, Copy, Globe, ImageIcon, Link2, MoreVertical, Plus, Share2, Trash2, X } from "lucide-react"
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
import { Calendar } from "@/components/ui/calendar"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/app/empty-state"
import { LogoMark } from "@/components/app/logo-mark"
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar"
import { PremiumLock } from "@/components/app/premium-lock"
import { StatusBadge } from "@/components/app/status-badge"
import type { PetSummary } from "@/lib/actions/pets"
import type { FileKind, FileUrl } from "@/lib/actions/files"
import type { Moment, MomentPublicLink, MomentsPage, PrepareMomentInput, PreparedMoment } from "@/lib/actions/moments"
import type { UploadTicket } from "@/lib/actions/uploads"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import { photoDataUrl, shareMomentImage, showsLogo } from "./share-image"

// S08 — Trenuci · /ljubimci/[id]/trenuci · FR-17, FR-18, FR-19 · EP-01 header (view:pet_summaries_api, id
// filter), EP-20 grid (view:moments_api, pages of 20, "Učitaj još"), EP-15 photos (moment_photo, the
// photo at position 1 per card), EP-21 new-moment Dialog (prepare → PUT per photo with progress →
// confirm), EP-22 card menu "Obriši" → AlertDialog, EP-23 "Javni link" Switch + copy, FR-18 "Podeli kao
// sliku" preview composed by ./share-image.ts in the browser. Free counter "n / 5" and the PremiumLock in
// place of "Novi trenutak" follow the caller's Entitlements (BR-01, BR-24). "Novi trenutak" follows
// PetSummary.can_log (FR-28, BR-22); the card menu and "Javni link" follow the moment's access (BR-23).
// States: loading (MomentsLoading) / default / empty (total = 0) / premium_locked; the page shows
// ErrorState when the pet is missing.

export type MomentsCopy = Pick<Dictionary, "moments" | "pet" | "petForm" | "common">

/** The pet fields the S08 header and controls need (PetSummary, EP-01). */
export type MomentsPet = Pick<
  PetSummary,
  "id" | "name" | "sex" | "species" | "species_other" | "breed" | "lifecycle" | "access" | "can_log"
>

export type MomentsActions = {
  listMoments: (input: { pet_id: string; limit?: number; offset?: number }) => Promise<ActionResult<MomentsPage>>
  prepareMoment: (input: PrepareMomentInput) => Promise<ActionResult<PreparedMoment>>
  confirmMoment: (input: { draft_token: string }) => Promise<ActionResult<Moment>>
  deleteMoment: (input: { moment_id: string }) => Promise<ActionResult<{ deleted_moment_id: string }>>
  setMomentPublicLink: (input: { moment_id: string; active: boolean }) => Promise<ActionResult<MomentPublicLink>>
  getFileUrls: (input: { items: { kind: FileKind; id: string }[] }) => Promise<ActionResult<FileUrl[]>>
}

/** PUT one photo to its presigned URL, reporting progress 0–100; true when R2 accepted it. */
export type UploadPhoto = (ticket: UploadTicket, file: File, onProgress: (percent: number) => void) => Promise<boolean>

const FREE_MOMENT_LIMIT = 5 // BR-01
const MAX_PHOTOS = 5 // BR-06
const MAX_BYTES = 10_485_760 // BR-05
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"]
const PAGE_SIZE = 20

const AVATAR_SPECIES: Partial<Record<PetSummary["species"], PetSpecies>> = {
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

function parseDay(value: string) {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function dayOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** sr-Latn "19. 10. 2026." · en-GB "19 Oct 2026" (Design §9). */
function formatDay(day: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(parseDay(day))
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(t: Record<string, unknown>, base: string, n: number, locale: Locale) {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  const key = `${base}_${rule === "one" || rule === "few" ? rule : "other"}`
  return format(String(t[key]), { n })
}

/** Newest first: moment_date desc, created_at desc (EP-20 order). */
function sortMoments(items: Moment[]) {
  return [...items].sort((a, b) =>
    a.moment_date === b.moment_date ? b.created_at.localeCompare(a.created_at) : b.moment_date.localeCompare(a.moment_date),
  )
}

/** Default photo upload: XMLHttpRequest PUT, so the Dialog can show per-photo progress. */
const xhrUpload: UploadPhoto = (ticket, file, onProgress) =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open(ticket.method, ticket.put_url)
    // Content-Length is set by the browser from the body and must not be set by script.
    xhr.setRequestHeader("Content-Type", ticket.headers["Content-Type"])
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
    xhr.onerror = () => resolve(false)
    xhr.send(file)
  })

function PhotoPlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex aspect-square items-center justify-center rounded-sm bg-foreground/5", className)}
    >
      <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
    </div>
  )
}

/** A moment photo (Design §7: aspect-square object-cover rounded-sm, alt "<pet name>, <date>"). */
function MomentPhotoImage({ src, label, className }: { src: string | null | undefined; label: string; className?: string }) {
  if (!src) return <PhotoPlaceholder label={label} className={className} />
  // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URLs / local previews, not optimisable
  return <img src={src} alt={label} className={cn("aspect-square w-full rounded-sm object-cover", className)} />
}

/**
 * FR-18 — the card the shared image is composed from (preview in the "Podeli kao sliku" Dialog): the
 * photo at position 1, the pet's name, the date and, unless removed on Premium, the LogoMark.
 */
export function ShareCard({
  petName,
  petSex,
  dateLabel,
  photoSrc,
  withLogo,
  cardRef,
}: {
  petName: string
  petSex: PetSummary["sex"]
  dateLabel: string
  photoSrc: string | null
  withLogo: boolean
  cardRef?: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={cardRef}
      data-pet-sex={petSex}
      data-testid="share-card"
      className="mx-auto w-full max-w-xs overflow-hidden rounded-md border border-border bg-card"
    >
      <MomentPhotoImage src={photoSrc} label={`${petName}, ${dateLabel}`} className="rounded-none" />
      <div className="flex items-end justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-bold text-pet-accent">{petName}</p>
          <p className="text-xs font-medium text-muted-foreground">{dateLabel}</p>
        </div>
        {withLogo && <LogoMark variant="mark" className="shrink-0" />}
      </div>
    </div>
  )
}

/** S08 loading state (Suspense fallback while EP-01 / EP-20 are in flight). */
export function MomentsLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <Card className="gap-3 p-4">
              <Skeleton className="aspect-square w-full rounded-sm" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

type NewPhoto = { key: string; file: File; preview: string; progress: number | null }

export function MomentsClient({
  pet,
  photoUrl,
  moments: initial,
  photoUrls: initialPhotoUrls,
  entitlements,
  today,
  locale,
  copy,
  actions,
  upload = xhrUpload,
}: {
  pet: MomentsPet
  photoUrl?: string
  moments: MomentsPage
  /** EP-15 URLs of the cover photos, keyed by moment_photos.id. */
  photoUrls: Record<string, string | null>
  entitlements: { premium: boolean; logo_removal: boolean }
  /** Today in Europe/Belgrade, YYYY-MM-DD. */
  today: string
  locale: Locale
  copy: MomentsCopy
  actions: MomentsActions
  upload?: UploadPhoto
}) {
  const t = copy.moments
  const [items, setItems] = useState<Moment[]>(initial.items)
  const [total, setTotal] = useState(initial.total)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>(initialPhotoUrls)
  const [loadingMore, setLoadingMore] = useState(false)
  const [serverLocked, setServerLocked] = useState(false)

  // New-moment Dialog (EP-21)
  const [newOpen, setNewOpen] = useState(false)
  const [newDate, setNewDate] = useState(today)
  const [dateOpen, setDateOpen] = useState(false)
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([])
  const [newText, setNewText] = useState("")
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Delete (EP-22), share as image (FR-18), public link (EP-23)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [shareImageId, setShareImageId] = useState<string | null>(null)
  const [sharePhoto, setSharePhoto] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [sharing, setSharing] = useState(false)
  const shareCard = useRef<HTMLDivElement>(null)
  const shareRequest = useRef(0)
  const [linkId, setLinkId] = useState<string | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const canAdd = pet.can_log && pet.lifecycle === "active"
  const freeCounter = !entitlements.premium
  const atLimit = (freeCounter && total >= FREE_MOMENT_LIMIT) || serverLocked
  const speciesLabel = pet.species === "other" && pet.species_other ? pet.species_other : copy.pet.species[pet.species]
  const subtitle = [pet.name, speciesLabel, pet.breed].filter(Boolean).join(" · ")
  const bySex = <T,>(female: T, male: T, unknown: T) => (pet.sex === "female" ? female : pet.sex === "male" ? male : unknown)
  const shareImageMoment = items.find((m) => m.id === shareImageId)
  const linkMoment = items.find((m) => m.id === linkId)
  const monthNames = copy.petForm.calendarMonths.split(",")
  const weekdayNames = copy.petForm.calendarWeekdays.split(",")
  const withLogo = showsLogo({ logoRemoval: entitlements.logo_removal, removeLogo })

  function failed() {
    toast(copy.common.error)
  }

  /** Opens the share preview; the photo is embedded as a data URL (CORS fetch), so the image is complete. */
  function openShare(m: Moment) {
    const request = ++shareRequest.current
    setRemoveLogo(false)
    setSharePhoto(null)
    setShareImageId(m.id)
    const url = m.photos[0] ? photoUrls[m.photos[0].id] : null
    if (!url) return
    photoDataUrl(url)
      .then((data) => request === shareRequest.current && setSharePhoto(data))
      .catch(() => undefined)
  }

  async function loadCovers(list: Moment[]) {
    const ids = list.flatMap((m) => (m.photos[0] ? [m.photos[0].id] : [])).filter((id) => !(id in photoUrls))
    if (ids.length === 0) return
    const result = await actions.getFileUrls({ items: ids.map((id) => ({ kind: "moment_photo" as const, id })) }).catch(() => null)
    if (!result?.ok) return
    setPhotoUrls((prev) => ({ ...prev, ...Object.fromEntries(result.data.map((f) => [f.id, f.url])) }))
  }

  function resetNew() {
    for (const photo of newPhotos) URL.revokeObjectURL(photo.preview)
    setNewPhotos([])
    setNewText("")
    setPhotoError(null)
    setNewDate(today)
  }

  function openNew() {
    resetNew()
    setNewOpen(true)
  }

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const picked = Array.from(files)
    if (picked.some((file) => !PHOTO_TYPES.includes(file.type))) {
      setPhotoError(t.errFileType)
      return
    }
    if (picked.some((file) => file.size > MAX_BYTES)) {
      setPhotoError(t.errTooLarge)
      return
    }
    const room = MAX_PHOTOS - newPhotos.length
    const accepted = picked.slice(0, Math.max(room, 0))
    setPhotoError(picked.length > room ? t.errTooManyPhotos : null)
    setNewPhotos((prev) => [
      ...prev,
      ...accepted.map((file, i) => ({
        key: `${Date.now()}-${prev.length + i}`,
        file,
        preview: URL.createObjectURL(file),
        progress: null,
      })),
    ])
  }

  function removePhoto(key: string) {
    setPhotoError(null)
    setNewPhotos((prev) => {
      const gone = prev.find((p) => p.key === key)
      if (gone) URL.revokeObjectURL(gone.preview)
      return prev.filter((p) => p.key !== key)
    })
  }

  function newMomentError(code: string, fields?: Record<string, string>) {
    switch (code) {
      case "too_many_photos":
        setPhotoError(t.errTooManyPhotos)
        return
      case "file_too_large":
        setPhotoError(t.errTooLarge)
        return
      case "file_type_not_allowed":
        setPhotoError(t.errFileType)
        return
      case "premium_required":
        setServerLocked(true)
        setNewOpen(false)
        return
      case "validation_failed":
        if (fields?.text === "required") {
          setPhotoError(t.errEmpty)
          return
        }
    }
    failed()
  }

  async function saveMoment() {
    if (newPhotos.length > MAX_PHOTOS) {
      setPhotoError(t.errTooManyPhotos)
      return
    }
    if (newPhotos.length === 0 && newText.trim() === "") {
      setPhotoError(t.errEmpty)
      return
    }
    setPhotoError(null)
    setSaving(true)
    try {
      const prepared = await actions.prepareMoment({
        pet_id: pet.id,
        moment_date: newDate,
        text: newText.trim() || null,
        photos: newPhotos.map((p) => ({ file_name: p.file.name, mime_type: p.file.type, size_bytes: p.file.size })),
      })
      if (!prepared.ok) {
        newMomentError(prepared.error.code, prepared.error.fields)
        return
      }

      for (const ticket of prepared.data.tickets) {
        const index = (ticket.position ?? 1) - 1
        const photo = newPhotos[index]
        if (!photo) continue
        const setProgress = (progress: number) =>
          setNewPhotos((prev) => prev.map((p) => (p.key === photo.key ? { ...p, progress } : p)))
        setProgress(0)
        const uploaded = await upload(ticket, photo.file, setProgress)
        if (!uploaded) {
          failed()
          return
        }
        setProgress(100)
      }

      const confirmed = await actions.confirmMoment({ draft_token: prepared.data.draft_token })
      if (!confirmed.ok) {
        newMomentError(confirmed.error.code, confirmed.error.fields)
        return
      }
      const moment = confirmed.data
      setItems((prev) => sortMoments([moment, ...prev]))
      setTotal((n) => n + 1)
      void loadCovers([moment])
      setNewOpen(false)
      resetNew()
      toast(t.saved)
    } catch {
      failed()
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    const id = deleteId
    setDeleteId(null)
    if (!id) return
    const result = await actions.deleteMoment({ moment_id: id }).catch(() => null)
    if (!result?.ok) {
      failed()
      return
    }
    setItems((prev) => prev.filter((m) => m.id !== id))
    setTotal((n) => Math.max(0, n - 1))
    toast(t.deleted)
  }

  async function loadMore() {
    setLoadingMore(true)
    const result = await actions.listMoments({ pet_id: pet.id, offset: items.length, limit: PAGE_SIZE }).catch(() => null)
    setLoadingMore(false)
    if (!result?.ok) {
      failed()
      return
    }
    const known = new Set(items.map((m) => m.id))
    const fresh = result.data.items.filter((m) => !known.has(m.id))
    setItems((prev) => [...prev, ...fresh])
    setTotal(result.data.total)
    void loadCovers(fresh)
  }

  async function togglePublic(id: string, active: boolean) {
    setCopied(false)
    setLinkBusy(true)
    const result = await actions.setMomentPublicLink({ moment_id: id, active }).catch(() => null)
    setLinkBusy(false)
    if (!result?.ok) {
      failed()
      return
    }
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, public_link: result.data } : m)))
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      failed()
    }
  }

  async function shareImage(moment: Moment) {
    if (!shareCard.current) return
    setSharing(true)
    try {
      await shareMomentImage({ node: shareCard.current, momentDate: moment.moment_date, title: pet.name })
    } catch (error) {
      // The user closing the share sheet is not an error.
      if (!(error instanceof DOMException && error.name === "AbortError")) failed()
    } finally {
      setSharing(false)
    }
  }

  return (
    <div data-pet-sex={pet.sex} className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/ljubimci/${pet.id}`}>
            <ArrowLeft className="size-4" aria-hidden />
            {format(t.backToRecord, { name: pet.name })}
          </Link>
        </Button>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <PetAvatar
              name={pet.name}
              sex={pet.sex}
              species={AVATAR_SPECIES[pet.species]}
              photoUrl={photoUrl}
              size="md"
              ring
            />
            <div className="min-w-0">
              <h1 className="truncate font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {canAdd && !atLimit && (
            <Button className="h-11 md:h-9" onClick={openNew}>
              <Plus className="size-5" aria-hidden />
              {t.newMoment}
            </Button>
          )}
        </div>
      </div>

      {/* Free counter (BR-01: 5 moments per pet) */}
      {freeCounter && total > 0 && (
        <Card className="gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm font-medium">{t.freePlan}</p>
            <p className="shrink-0 text-sm text-muted-foreground">
              {format(t.counter, { n: total, max: FREE_MOMENT_LIMIT })}
            </p>
          </div>
          <Progress
            value={Math.min(100, (total / FREE_MOMENT_LIMIT) * 100)}
            aria-label={format(t.counterLabel, { n: total, max: FREE_MOMENT_LIMIT })}
          />
        </Card>
      )}

      {canAdd && atLimit && (
        <PremiumLock title={copy.common.premiumTitle} description={t.lockDescription} cta={copy.common.premiumCta} />
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={t.emptyTitle}
          description={format(bySex(t.emptyDescriptionFemale, t.emptyDescriptionMale, t.emptyDescriptionUnknown), {
            name: pet.name,
          })}
          action={canAdd && !atLimit ? t.newMoment : undefined}
          onAction={openNew}
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => {
              const dateLabel = formatDay(m.moment_date, locale)
              const cover = m.photos[0]
              return (
                <li key={m.id} className="min-w-0">
                  <Card className="h-full gap-3 p-4">
                    <div className="relative">
                      <MomentPhotoImage src={cover ? photoUrls[cover.id] : null} label={`${pet.name}, ${dateLabel}`} />
                      {m.photo_count > 1 && (
                        <span className="absolute right-2 bottom-2 rounded-full bg-card px-2 text-xs font-medium">
                          {plural(t, "photos", m.photo_count, locale)}
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-muted-foreground">{dateLabel}</p>
                        <p className="line-clamp-2 text-sm">{m.text || t.noText}</p>
                      </div>
                      {m.access.can_delete && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={t.moreOptions}>
                              <MoreVertical className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteId(m.id)}>
                              <Trash2 className="size-4" aria-hidden />
                              {t.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {m.public_link?.active && (
                      <p className="flex items-center gap-1 text-xs font-medium text-pet-accent">
                        <Globe className="size-3.5" aria-hidden />
                        {t.publicOn}
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openShare(m)}
                      >
                        <Share2 className="size-4" aria-hidden />
                        {t.shareAsImage}
                      </Button>
                      {m.access.can_edit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCopied(false)
                            setLinkId(m.id)
                          }}
                        >
                          <Link2 className="size-4" aria-hidden />
                          {t.publicLink}
                        </Button>
                      )}
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
          {items.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" className="h-11 md:h-9" onClick={loadMore} disabled={loadingMore}>
                {t.loadMore}
              </Button>
            </div>
          )}
        </>
      )}

      {/* New moment (FR-17, EP-21) */}
      <Dialog
        open={newOpen}
        onOpenChange={(open) => {
          if (saving) return
          setNewOpen(open)
          if (!open) resetNew()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.newTitle}</DialogTitle>
            <DialogDescription>{t.newDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="moment-date">{t.date}</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button id="moment-date" variant="outline" className="h-11 w-full justify-start font-normal md:h-9">
                    <CalendarDays className="size-4" aria-hidden />
                    {formatDay(newDate, locale)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDay(newDate)}
                    onSelect={(d) => {
                      if (d) setNewDate(dayOf(d))
                      setDateOpen(false)
                    }}
                    weekStartsOn={1}
                    // EP-21: not in the future — later days cannot be picked (owner decision).
                    disabled={{ after: parseDay(today) }}
                    formatters={{
                      formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
                      formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <fieldset className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <legend className="text-sm font-medium">{t.photosLegend}</legend>
                <span className="text-xs font-medium text-muted-foreground">
                  {format(t.photoCounter, { n: newPhotos.length, max: MAX_PHOTOS })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                {newPhotos.map((p, i) => (
                  <div key={p.key} className="relative">
                    <MomentPhotoImage src={p.preview} label={`${pet.name}, ${formatDay(newDate, locale)}`} />
                    {p.progress !== null && (
                      <Progress
                        value={p.progress}
                        aria-label={format(t.uploading, { n: i + 1 })}
                        className="absolute right-1 bottom-1 left-1 w-auto"
                      />
                    )}
                    {!saving && (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="absolute top-1 right-1 size-6"
                        aria-label={format(t.removePhoto, { n: i + 1 })}
                        onClick={() => removePhoto(p.key)}
                      >
                        <X className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </div>
                ))}
                {newPhotos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => fileInput.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border text-xs font-medium text-muted-foreground hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <Plus className="size-5" aria-hidden />
                    {t.add}
                  </button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept={PHOTO_TYPES.join(",")}
                multiple
                hidden
                data-testid="moment-photo-input"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ""
                }}
              />
              {photoError && <p className="text-sm text-destructive">{photoError}</p>}
              {newPhotos.length === MAX_PHOTOS && !photoError && (
                <p className="text-sm text-muted-foreground">{t.maxPhotos}</p>
              )}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="moment-text">{t.text}</Label>
              <Textarea
                id="moment-text"
                maxLength={280}
                placeholder={format(bySex(t.textPlaceholderFemale, t.textPlaceholderMale, t.textPlaceholderUnknown), {
                  name: pet.name,
                })}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
              <p className="text-xs font-medium text-muted-foreground">{format(t.textCounter, { n: newText.length })}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" disabled={saving} onClick={() => setNewOpen(false)}>
              {t.cancel}
            </Button>
            <Button className="h-11 md:h-9" disabled={saving} onClick={saveMoment}>
              {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete (EP-22) */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelDelete}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              {t.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share as image (FR-18) */}
      <Dialog open={!!shareImageMoment} onOpenChange={(open) => !open && setShareImageId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.shareTitle}</DialogTitle>
            <DialogDescription>{t.shareDescription}</DialogDescription>
          </DialogHeader>
          {shareImageMoment && (
            <div className="space-y-4">
              <ShareCard
                cardRef={shareCard}
                petName={pet.name}
                petSex={pet.sex}
                dateLabel={formatDay(shareImageMoment.moment_date, locale)}
                photoSrc={sharePhoto}
                withLogo={withLogo}
              />

              {entitlements.logo_removal ? (
                <div className="flex items-center justify-between gap-3 rounded-sm bg-foreground/5 p-3">
                  <Label htmlFor="remove-logo" className="min-w-0">
                    {t.removeLogo}
                  </Label>
                  <Switch id="remove-logo" checked={removeLogo} onCheckedChange={setRemoveLogo} />
                </div>
              ) : (
                <>
                  {/* Free: the logo is always on the shared image (FR-18, FR-36, BR-01) */}
                  <div className="flex items-center justify-between gap-3 rounded-sm bg-foreground/5 p-3">
                    <div className="min-w-0">
                      <Label htmlFor="remove-logo">{t.removeLogo}</Label>
                      <p className="text-xs font-medium text-muted-foreground">{t.removeLogoHint}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status="premium" label={copy.common.premium} />
                      <Switch id="remove-logo" checked={false} disabled aria-describedby="remove-logo-lock" />
                    </div>
                  </div>
                  <p id="remove-logo-lock" className="sr-only">
                    {copy.common.premiumTitle}
                  </p>
                  <Button asChild variant="link" className="h-auto p-0">
                    <Link href="/premium">{copy.common.premiumCta}</Link>
                  </Button>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setShareImageId(null)}>
              {t.close}
            </Button>
            <Button
              className="h-11 md:h-9"
              disabled={sharing || !shareImageMoment}
              onClick={() => shareImageMoment && shareImage(shareImageMoment)}
            >
              <Share2 className="size-5" aria-hidden />
              {t.shareImage}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Public link (FR-19, EP-23) */}
      <Dialog open={!!linkMoment} onOpenChange={(open) => !open && setLinkId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.linkTitle}</DialogTitle>
            <DialogDescription>{t.linkDescription}</DialogDescription>
          </DialogHeader>
          {linkMoment && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-sm bg-foreground/5 p-3">
                <Label htmlFor="public-link" className="min-w-0">
                  {linkMoment.public_link?.active ? t.linkOn : t.linkOff}
                </Label>
                <Switch
                  id="public-link"
                  checked={!!linkMoment.public_link?.active}
                  disabled={linkBusy}
                  onCheckedChange={(v) => togglePublic(linkMoment.id, v)}
                />
              </div>
              {linkMoment.public_link?.active ? (
                <div className="space-y-2">
                  <Label htmlFor="public-link-url">{t.address}</Label>
                  <div className="flex gap-2">
                    <Input id="public-link-url" readOnly value={linkMoment.public_link.url} className="min-w-0 flex-1" />
                    <Button variant="outline" onClick={() => copyLink(linkMoment.public_link!.url)}>
                      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copied ? t.copied : t.copy}
                    </Button>
                  </div>
                  <p role="status" className="sr-only">
                    {copied ? t.copiedStatus : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.linkOffHint}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setLinkId(null)}>
              {t.done}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
