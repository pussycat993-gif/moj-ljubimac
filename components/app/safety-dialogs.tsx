"use client"

import { useState } from "react"
import { CircleCheck } from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"

// Šapa pomoći report and block (FR-70, EP-84, EP-85) — shared by S33, S36, S37.
export type ReportReason = "spam" | "scam" | "inappropriate" | "animal_welfare" | "other"

export const reportReasonLabel: Record<ReportReason, string> = {
  spam: "Spam ili reklama",
  scam: "Prevara",
  inappropriate: "Neprimeren sadržaj",
  animal_welfare: "Dobrobit životinja",
  other: "Drugo",
}

const NOTE_MAX = 500

// labels:start — FR-35: every string, defaulting to today's Serbian copy; the app passes the dictionary's labels.
export type ReportDialogLabels = {
  reasons: Record<ReportReason, string>
  titleListing: string
  titleUser: string
  /** "{name}" is the listing title or the user's display name. */
  targetListing: string
  targetUser: string
  reason: string
  note: string
  noteRequired: string
  noteOptional: string
  notePlaceholder: string
  errReason: string
  errNote: string
  cancel: string
  submit: string
  sentTitle: string
  sentText: string
  sentHint: string
  ok: string
  alreadyListing: string
  alreadyUser: string
}

export const defaultReportDialogLabels: ReportDialogLabels = {
  reasons: reportReasonLabel,
  titleListing: "Prijavi oglas",
  titleUser: "Prijavi korisnika",
  targetListing: "Oglas: {name}",
  targetUser: "Korisnik: {name}",
  reason: "Razlog *",
  note: "Napomena",
  noteRequired: " *",
  noteOptional: " (opciono)",
  notePlaceholder: "npr. Traži uplatu unapred, a predmet ne postoji.",
  errReason: "Izaberi razlog prijave.",
  errNote: "Napiši ukratko šta nije u redu.",
  cancel: "Otkaži",
  submit: "Pošalji prijavu",
  sentTitle: "Prijava je poslata",
  sentText:
    "Hvala ti. Operater pregleda prijavu i po potrebi sakriva oglas ili isključuje korisnika iz Šape pomoći.",
  sentHint: "Ako ti ova osoba piše i dalje, možeš i da je blokiraš.",
  ok: "U redu",
  alreadyListing: "Već si prijavio/la ovaj oglas.",
  alreadyUser: "Već si prijavio/la ovog korisnika.",
}

export type BlockDialogLabels = { title: string; text: string; cancel: string; confirm: string }

export const defaultBlockDialogLabels: BlockDialogLabels = {
  title: "Blokirati korisnika {name}?",
  text: "Ta osoba više neće moći da ti šalje poruke, a ti više nećeš videti njene oglase. Ne dobija obaveštenje o blokadi. Blokadu skidaš na profilu te osobe.",
  cancel: "Otkaži",
  confirm: "Da, blokiraj",
}
// labels:end

/** What the EP-84 call answered: sent, already submitted (FR-70 #2), or an error message to show. */
export type ReportOutcome = { status: "sent" } | { status: "already_submitted" } | { status: "error"; message: string }

const fill = (template: string, name: string) => template.replace("{name}", name)

export function ReportDialog({
  open,
  onOpenChange,
  target,
  name,
  onSubmit,
  labels = defaultReportDialogLabels,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What is reported: a listing (title in `name`) or a user (display name in `name`). */
  target: "listing" | "user"
  name: string
  /** EP-84; without it the dialog only confirms (mockup behaviour). */
  onSubmit?: (input: { reason: ReportReason; note: string | null }) => Promise<ReportOutcome>
  labels?: ReportDialogLabels
}) {
  const [reason, setReason] = useState<ReportReason | "">("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [sent, setSent] = useState<false | "sent" | "already_submitted">(false)
  const [busy, setBusy] = useState(false)

  function close(o: boolean) {
    onOpenChange(o)
    if (!o) {
      setReason("")
      setNote("")
      setError("")
      setSent(false)
    }
  }

  async function submit() {
    if (!reason) {
      setError(labels.errReason)
      return
    }
    if (reason === "other" && note.trim().length === 0) {
      setError(labels.errNote)
      return
    }
    setError("")
    if (!onSubmit) {
      setSent("sent")
      return
    }
    setBusy(true)
    const outcome = await onSubmit({ reason, note: note.trim() || null })
    setBusy(false)
    if (outcome.status === "error") setError(outcome.message)
    else setSent(outcome.status)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {sent === "already_submitted" ? (
          <>
            <DialogHeader>
              <DialogTitle>{target === "listing" ? labels.titleListing : labels.titleUser}</DialogTitle>
              <DialogDescription className="break-words">
                {fill(target === "listing" ? labels.targetListing : labels.targetUser, name)}
              </DialogDescription>
            </DialogHeader>
            <p role="status" className="flex items-center gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
              <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
              <span className="min-w-0">{target === "listing" ? labels.alreadyListing : labels.alreadyUser}</span>
            </p>
            <DialogFooter>
              <Button className="h-11 md:h-9" onClick={() => close(false)}>
                {labels.ok}
              </Button>
            </DialogFooter>
          </>
        ) : sent ? (
          <>
            <DialogHeader>
              <DialogTitle>{labels.sentTitle}</DialogTitle>
              <DialogDescription>{labels.sentText}</DialogDescription>
            </DialogHeader>
            <p role="status" className="flex items-center gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
              <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
              <span className="min-w-0">{labels.sentHint}</span>
            </p>
            <DialogFooter>
              <Button className="h-11 md:h-9" onClick={() => close(false)}>
                {labels.ok}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{target === "listing" ? labels.titleListing : labels.titleUser}</DialogTitle>
              <DialogDescription className="break-words">
                {fill(target === "listing" ? labels.targetListing : labels.targetUser, name)}
              </DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">{labels.reason}</legend>
              <RadioGroup
                value={reason}
                onValueChange={(v) => setReason(v as ReportReason)}
                aria-invalid={!!error && !reason}
              >
                {(Object.keys(reportReasonLabel) as ReportReason[]).map((r) => (
                  <div key={r} className="flex min-h-11 items-center gap-3 rounded-sm bg-foreground/5 px-3">
                    <RadioGroupItem id={`report-${r}`} value={r} />
                    <Label htmlFor={`report-${r}`} className="min-w-0 flex-1">
                      {labels.reasons[r]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="report-note">
                {labels.note}
                {reason === "other" ? labels.noteRequired : labels.noteOptional}
              </Label>
              <Textarea
                id="report-note"
                rows={3}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={labels.notePlaceholder}
                aria-describedby="report-note-count"
              />
              <p id="report-note-count" className="text-right text-xs font-medium text-muted-foreground">
                {note.length} / {NOTE_MAX}
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" className="h-11 md:h-9" onClick={() => close(false)}>
                {labels.cancel}
              </Button>
              <Button className="h-11 md:h-9" disabled={busy} onClick={() => void submit()}>
                {labels.submit}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function BlockDialog({
  open,
  onOpenChange,
  name,
  onConfirm,
  labels = defaultBlockDialogLabels,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  onConfirm: () => void
  labels?: BlockDialogLabels
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{fill(labels.title, name)}</AlertDialogTitle>
          <AlertDialogDescription>{labels.text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {labels.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
