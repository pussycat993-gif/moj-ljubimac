"use client"

import { useState, type ChangeEvent, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bell, CalendarDays, FileText, ImageIcon, Paperclip, X } from "lucide-react"
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
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar"
import { PremiumLock } from "@/components/app/premium-lock"
import type { PetSummary } from "@/lib/actions/pets"
import { deleteAttachment } from "@/lib/actions/attachments"
import { confirmUpload, requestUpload } from "@/lib/actions/uploads"
import { createVetVisit, updateVetVisit, type Attachment, type VetVisit } from "@/lib/actions/vet-visits"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S05 — Novi pregled · /ljubimci/[id]/pregledi/novi (EP-01 header with the id filter, EP-12 insert,
// then EP-13 per file) and its edit route /ljubimci/[id]/pregledi/[pregledId] (EP-02 preload, EP-12
// update; owner decision, Step 15) · FR-07, FR-08, FR-36. The visit is saved first, then each file
// gets its own ticket → PUT to R2 → confirm. Type and size are checked in the browser too (NFR-09).
// Counter "n / 10" from Me.usage.attachments_by_pet and Entitlements; PremiumLock on the limit or
// premium_required. Once the visit exists, saving again updates it, so a failed upload can be retried
// without a second visit. States: D → toast + back to S03; inline field / file errors; X
// (ErrorState) when the visit cannot be saved; G (PremiumLock).

export type VetVisitFormCopy = Pick<Dictionary, "vetVisitForm" | "petRecord" | "pet" | "petForm" | "common">

/** The pet fields the S05 header and prefill need (PetSummary or Pet). */
export type VetVisitFormPet = Pick<PetSummary, "id" | "name" | "sex" | "species" | "species_other" | "breed" | "vet_name">

const AVATAR_SPECIES: Partial<Record<PetSummary["species"], PetSpecies>> = {
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

const MAX_BYTES = 10 * 1024 * 1024 // BR-05, NFR-09

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

function formatDate(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(d)
}

/** "0,8 MB" · "0.8 MB". */
function formatSize(bytes: number, locale: Locale) {
  const mb = new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    bytes / (1024 * 1024),
  )
  return `${mb} MB`
}

/** Local calendar date → "YYYY-MM-DD" (API §3.5). */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function parseIsoDate(value: string | null) {
  if (!value) return undefined
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Amount separators per locale: sr-Latn "2.990,50", en-GB "2,990.50". */
function separators(locale: Locale) {
  return locale === "en" ? { group: ",", decimal: "." } : { group: ".", decimal: "," }
}

/** The mockup's amount rule, in the locale's separators. */
function costValid(value: string, locale: Locale) {
  const { group, decimal } = separators(locale)
  const g = `\\${group}`
  const d = `\\${decimal}`
  return new RegExp(`^\\d{1,3}(${g}\\d{3})*(${d}\\d{1,2})?$|^\\d+(${d}\\d{1,2})?$`).test(value)
}

/** EP-12: "2.990" → 299000 RSD para. */
function costMinor(value: string, locale: Locale): number {
  const { group, decimal } = separators(locale)
  const normalised = value.split(group).join("").replace(decimal, ".")
  return Math.round(Number(normalised) * 100)
}

/** 299000 → "2.990" (sr-Latn) · "2,990" (en-GB); para shown only when present. */
function costText(amountMinor: number, locale: Locale) {
  const fractional = amountMinor % 100 !== 0
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}

function DateField({
  id,
  label,
  value,
  onChange,
  helper,
  error,
  disabled,
  locale,
  copy,
}: {
  id: string
  label: string
  value?: Date
  onChange: (d?: Date) => void
  helper?: string
  error?: string
  disabled: { after: Date } | { before: Date } | undefined
  locale: Locale
  copy: VetVisitFormCopy["petForm"]
}) {
  const monthNames = copy.calendarMonths.split(",")
  const weekdayNames = copy.calendarWeekdays.split(",")
  const describedBy = [helper ? `${id}-pomoc` : "", error ? `${id}-greska` : ""].filter(Boolean).join(" ") || undefined
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={cn("h-11 w-full justify-start font-normal md:h-9", !value && "text-muted-foreground")}
          >
            <CalendarDays className="size-4" aria-hidden />
            {value ? formatDate(value, locale) : copy.pickDate}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            weekStartsOn={1}
            // EP-12: visited_on not in the future, follow_up_on after visited_on — invalid days cannot be picked (owner decision).
            disabled={disabled}
            formatters={{
              formatCaption: (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
              formatWeekdayName: (d: Date) => weekdayNames[d.getDay()],
            }}
          />
        </PopoverContent>
      </Popover>
      {helper && (
        <p id={`${id}-pomoc`} className="flex items-center gap-1 text-sm text-muted-foreground">
          <Bell className="size-3.5 shrink-0" aria-hidden />
          {helper}
        </p>
      )}
      {error && (
        <p id={`${id}-greska`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** A file picked in this session, not uploaded yet. */
type PendingFile = { id: string; file: File }

type FormData = {
  date?: Date
  clinic: string
  reason: string
  findings: string
  recommendations: string
  cost: string
  checkup?: Date
}

type Errors = Partial<Record<"date" | "reason" | "cost" | "checkup", string>>

function validate(f: FormData, t: VetVisitFormCopy["vetVisitForm"], locale: Locale): Errors {
  const e: Errors = {}
  if (!f.date) e.date = t.errDate
  if (!f.reason.trim()) e.reason = t.errReason
  if (f.cost.trim() && !costValid(f.cost.trim(), locale)) e.cost = t.errCost
  if (f.date && f.checkup && f.checkup <= f.date) e.checkup = t.errFollowUp
  return e
}

/** 422 `fields` → the inline messages the mockup has; any other field code → null (form-level error). */
function fieldErrors(fields: Record<string, string>, t: VetVisitFormCopy["vetVisitForm"]): Errors | null {
  const e: Errors = {}
  for (const [field, code] of Object.entries(fields)) {
    if (field === "visited_on" && code === "required") e.date = t.errDate
    else if (field === "reason" && code === "required") e.reason = t.errReason
    else if (field === "cost_minor" && code === "out_of_range") e.cost = t.errCost
    else if (field === "follow_up_on" && code === "before_start") e.checkup = t.errFollowUp
    else return null
  }
  return e
}

function isPdf(type: string) {
  return type === "application/pdf"
}

export function VetVisitFormClient({
  pet,
  visit = null,
  attachmentLimit,
  attachmentCount,
  locale,
  copy,
}: {
  pet: VetVisitFormPet
  /** Edit route: the EP-02 vet visit. New: null. */
  visit?: VetVisit | null
  /** Entitlements.limits.attachments_per_pet for the owner's own pet; null = no limit. */
  attachmentLimit: number | null
  /** The pet's attachments so far (Me.usage.attachments_by_pet), this visit's included. */
  attachmentCount: number
  locale: Locale
  copy: VetVisitFormCopy
}) {
  const t = copy.vetVisitForm
  const router = useRouter()
  const isEdit = visit !== null
  const [form, setForm] = useState<FormData>(() =>
    visit
      ? {
          date: parseIsoDate(visit.visited_on),
          clinic: visit.clinic ?? "",
          reason: visit.reason,
          findings: visit.findings ?? "",
          recommendations: visit.recommendations ?? "",
          cost: visit.cost ? costText(visit.cost.amount_minor, locale) : "",
          checkup: parseIsoDate(visit.follow_up_on),
        }
      : {
          date: new Date(),
          clinic: pet.vet_name ?? "",
          reason: "",
          findings: "",
          recommendations: "",
          cost: "",
          checkup: undefined,
        },
  )
  const [errors, setErrors] = useState<Errors>({})
  const [savedVisitId, setSavedVisitId] = useState<string | null>(visit?.id ?? null)
  const [confirmed, setConfirmed] = useState<Attachment[]>(visit?.attachments ?? [])
  const [files, setFiles] = useState<PendingFile[]>([])
  const [fileError, setFileError] = useState("")
  const [limitHit, setLimitHit] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<Attachment | null>(null)

  const recordHref = `/ljubimci/${pet.id}`
  const speciesLabel = pet.species === "other" && pet.species_other ? pet.species_other : copy.pet.species[pet.species]
  const subtitle = [pet.name, speciesLabel, pet.breed].filter(Boolean).join(" · ")

  const isFree = attachmentLimit !== null
  const limit = attachmentLimit ?? 0
  const existingOnPet = Math.max(0, attachmentCount - (visit?.attachments.length ?? 0))
  const total = existingOnPet + confirmed.length + files.length

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function onFiles(ev: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(ev.target.files ?? [])
    ev.target.value = ""
    let count = total
    const accepted: PendingFile[] = []
    let error = ""
    for (const f of picked) {
      if (!isPdf(f.type) && !f.type.startsWith("image/")) {
        error = format(t.errFileType, { file: f.name })
        continue
      }
      if (f.size > MAX_BYTES) {
        error = format(t.errFileSize, { file: f.name, size: formatSize(f.size, locale) })
        continue
      }
      if (isFree && count >= limit) {
        setLimitHit(true)
        break
      }
      accepted.push({ id: `${f.name}-${count}-${f.lastModified}`, file: f })
      count += 1
    }
    setFileError(error)
    if (accepted.length) setFiles((list) => [...list, ...accepted])
  }

  function removeFile(id: string) {
    setFiles((list) => list.filter((f) => f.id !== id))
    setLimitHit(false)
  }

  async function confirmRemove() {
    if (!pendingRemove) return
    const target = pendingRemove
    setPendingRemove(null)
    const result = await deleteAttachment({ attachment_id: target.id })
    if (!result.ok) {
      toast.error(copy.common.error)
      return
    }
    setConfirmed((list) => list.filter((a) => a.id !== target.id))
    setLimitHit(false)
  }

  /** EP-13 for one file: ticket → PUT to R2 → confirm. Returns the error code on failure. */
  async function upload(visitId: string, file: File): Promise<{ ok: true; attachment: Attachment } | { ok: false; code: string }> {
    const ticket = await requestUpload({
      purpose: "attachment",
      target_id: visitId,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    })
    if (!ticket.ok) return { ok: false, code: ticket.error.code }
    try {
      const put = await fetch(ticket.data.put_url, { method: "PUT", headers: ticket.data.headers, body: file })
      if (!put.ok) return { ok: false, code: "internal_error" }
    } catch {
      return { ok: false, code: "internal_error" }
    }
    const confirmedUpload = await confirmUpload({ upload_token: ticket.data.upload_token })
    if (!confirmedUpload.ok) return { ok: false, code: confirmedUpload.error.code }
    return { ok: true, attachment: confirmedUpload.data as Attachment }
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form, t, locale)
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setPending(true)
    setSaveFailed(false)
    const opt = (v: string) => (v.trim() === "" ? null : v.trim())
    const input = {
      visited_on: isoDate(form.date!),
      clinic: opt(form.clinic),
      reason: form.reason.trim(),
      findings: opt(form.findings),
      recommendations: opt(form.recommendations),
      cost_minor: form.cost.trim() ? costMinor(form.cost.trim(), locale) : null,
      follow_up_on: form.checkup ? isoDate(form.checkup) : null,
    }
    const result = savedVisitId
      ? await updateVetVisit(savedVisitId, input)
      : await createVetVisit({ pet_id: pet.id, ...input })

    if (!result.ok) {
      setPending(false)
      const { code, fields } = result.error
      const inline = code === "validation_failed" && fields ? fieldErrors(fields, t) : null
      if (inline) setErrors(inline)
      else setSaveFailed(true)
      return
    }
    const visitId = result.data.id
    setSavedVisitId(visitId)

    // Attachments after the visit exists: one ticket per file (EP-13).
    let failed = false
    for (const item of files) {
      const uploaded = await upload(visitId, item.file)
      if (uploaded.ok) {
        setConfirmed((list) => [...list, uploaded.attachment])
        setFiles((list) => list.filter((f) => f.id !== item.id))
        continue
      }
      failed = true
      if (uploaded.code === "premium_required") {
        setLimitHit(true)
        break
      }
      if (uploaded.code === "file_too_large") {
        setFileError(format(t.errFileSize, { file: item.file.name, size: formatSize(item.file.size, locale) }))
      } else if (uploaded.code === "file_type_not_allowed") {
        setFileError(format(t.errFileType, { file: item.file.name }))
      } else {
        toast.error(format(t.errUpload, { file: item.file.name }))
      }
    }

    if (failed) {
      setPending(false)
      return
    }
    toast(form.checkup ? format(t.savedWithFollowUp, { date: formatDate(form.checkup, locale) }) : t.saved)
    router.push(recordHref)
    router.refresh()
  }

  const listed = [
    ...confirmed.map((a) => ({
      key: a.id,
      name: a.file_name ?? "",
      pdf: isPdf(a.mime_type),
      bytes: a.size_bytes,
      onRemove: () => setPendingRemove(a),
    })),
    ...files.map((f) => ({
      key: f.id,
      name: f.file.name,
      pdf: isPdf(f.file.type),
      bytes: f.file.size,
      onRemove: () => removeFile(f.id),
    })),
  ]

  return (
    <div data-pet-sex={pet.sex} className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="px-2">
          <Link href={recordHref}>
            <ArrowLeft className="size-4" aria-hidden />
            {t.backToRecord}
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-3">
          <PetAvatar name={pet.name} sex={pet.sex} species={AVATAR_SPECIES[pet.species]} size="md" ring />
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-9 font-bold">{isEdit ? t.titleEdit : t.titleNew}</h1>
            <p className="truncate text-sm text-pet-accent">{subtitle}</p>
          </div>
        </div>
      </div>

      {saveFailed && (
        <ErrorState message={t.saveError} labels={{ retry: copy.common.retry }} onRetry={() => setSaveFailed(false)} />
      )}

      <form noValidate onSubmit={submit} className="space-y-6">
        <Card className="gap-4 p-4 md:p-6">
          <h2 className="font-heading text-lg font-bold">{t.details}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DateField
              id="pregled-datum"
              label={t.date}
              value={form.date}
              onChange={(d) => {
                set("date", d)
                setErrors((prev) => ({ ...prev, date: undefined }))
              }}
              error={errors.date}
              disabled={{ after: new Date() }}
              locale={locale}
              copy={copy.petForm}
            />
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pregled-ambulanta">{t.clinic}</Label>
              <Input
                id="pregled-ambulanta"
                className="h-11 md:h-9"
                value={form.clinic}
                maxLength={100}
                onChange={(e) => set("clinic", e.target.value)}
              />
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="pregled-razlog">{t.reason}</Label>
            <Input
              id="pregled-razlog"
              className="h-11 md:h-9"
              value={form.reason}
              maxLength={200}
              onChange={(e) => set("reason", e.target.value)}
              onBlur={() => setErrors((prev) => ({ ...prev, reason: validate(form, t, locale).reason }))}
              aria-invalid={!!errors.reason}
              aria-describedby={errors.reason ? "pregled-razlog-greska" : undefined}
              placeholder={t.reasonPlaceholder}
            />
            {errors.reason && (
              <p id="pregled-razlog-greska" className="text-sm text-destructive">
                {errors.reason}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pregled-nalaz">{t.findings}</Label>
            <Textarea
              id="pregled-nalaz"
              value={form.findings}
              maxLength={4000}
              onChange={(e) => set("findings", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pregled-preporuke">{t.recommendations}</Label>
            <Textarea
              id="pregled-preporuke"
              value={form.recommendations}
              maxLength={4000}
              onChange={(e) => set("recommendations", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pregled-cena">{t.cost}</Label>
              <Input
                id="pregled-cena"
                inputMode="decimal"
                className="h-11 md:h-9"
                value={form.cost}
                onChange={(e) => set("cost", e.target.value)}
                onBlur={() => setErrors((prev) => ({ ...prev, cost: validate(form, t, locale).cost }))}
                aria-invalid={!!errors.cost}
                aria-describedby={errors.cost ? "pregled-cena-greska" : undefined}
                placeholder={t.costPlaceholder}
              />
              {errors.cost && (
                <p id="pregled-cena-greska" className="text-sm text-destructive">
                  {errors.cost}
                </p>
              )}
            </div>
            <DateField
              id="pregled-kontrola"
              label={t.followUp}
              value={form.checkup}
              onChange={(d) => {
                set("checkup", d)
                setErrors((prev) => ({ ...prev, checkup: undefined }))
              }}
              helper={t.followUpHelper}
              error={errors.checkup}
              disabled={
                form.date
                  ? { before: new Date(form.date.getFullYear(), form.date.getMonth(), form.date.getDate() + 1) }
                  : undefined
              }
              locale={locale}
              copy={copy.petForm}
            />
          </div>
        </Card>

        {/* Attachments */}
        <Card className="gap-4 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-bold">{t.attachments}</h2>
            {isFree && (
              <Badge variant="secondary" aria-live="polite">
                {format(t.counter, { n: total, limit })}
              </Badge>
            )}
          </div>
          {isFree && (
            <div className="space-y-1">
              <Progress value={(total / limit) * 100} aria-label={format(t.counterLabel, { n: total, limit })} />
              <p className="text-xs font-medium text-muted-foreground">
                {format(t.freeNote, { limit, name: pet.name, n: existingOnPet })}
              </p>
            </div>
          )}

          {listed.length > 0 && (
            <ul className="space-y-2" aria-label={t.addedFiles}>
              {listed.map((f) => {
                const Icon = f.pdf ? FileText : ImageIcon
                return (
                  <li key={f.key} className="flex min-w-0 items-center gap-3 rounded-sm bg-foreground/5 p-3">
                    <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{formatSize(f.bytes, locale)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0 md:size-9"
                      aria-label={format(t.removeFile, { file: f.name })}
                      onClick={f.onRemove}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {limitHit ? (
            <PremiumLock title={copy.common.premiumTitle} description={t.lockDescription} cta={copy.common.premiumCta} />
          ) : (
            <div className="space-y-2">
              <div className="rounded-sm border border-dashed border-border p-6 text-center focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <input
                  id="prilozi"
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={onFiles}
                  aria-describedby={fileError ? "prilozi-pomoc prilozi-greska" : "prilozi-pomoc"}
                  aria-invalid={!!fileError}
                />
                <Label htmlFor="prilozi" className="flex cursor-pointer flex-col items-center gap-2">
                  <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
                    <Paperclip className="size-5 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="text-sm font-medium">{t.pickFiles}</span>
                </Label>
                <p id="prilozi-pomoc" className="mt-1 text-sm text-muted-foreground">
                  {t.pickHelp}
                </p>
              </div>
              {fileError && (
                <p id="prilozi-greska" className="text-sm text-destructive">
                  {fileError}
                </p>
              )}
            </div>
          )}
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild type="button" variant="outline" className="h-11 md:h-9">
            <Link href={recordHref}>{t.cancel}</Link>
          </Button>
          <Button type="submit" className="h-11 md:h-9" disabled={pending}>
            {isEdit ? t.saveEdit : t.save}
          </Button>
        </div>
      </form>

      {/* Remove a saved attachment (EP-14; owner decision, Step 15) */}
      <AlertDialog open={pendingRemove !== null} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <AlertDialogContent className="shadow-raised">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.petRecord.deleteEntryTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.petRecord.deleteEntryDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 md:h-9">{copy.petRecord.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="h-11 md:h-9" onClick={confirmRemove}>
              {copy.petRecord.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
