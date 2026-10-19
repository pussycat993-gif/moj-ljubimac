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

export function ReportDialog({
  open,
  onOpenChange,
  target,
  name,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What is reported: a listing (title in `name`) or a user (display name in `name`). */
  target: "listing" | "user"
  name: string
}) {
  const [reason, setReason] = useState<ReportReason | "">("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)

  function close(o: boolean) {
    onOpenChange(o)
    if (!o) {
      setReason("")
      setNote("")
      setError("")
      setSent(false)
    }
  }

  function submit() {
    if (!reason) {
      setError("Izaberi razlog prijave.")
      return
    }
    if (reason === "other" && note.trim().length === 0) {
      setError("Napiši ukratko šta nije u redu.")
      return
    }
    setError("")
    setSent(true)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Prijava je poslata</DialogTitle>
              <DialogDescription>
                Hvala ti. Operater pregleda prijavu i po potrebi sakriva oglas ili isključuje korisnika iz Šape pomoći.
              </DialogDescription>
            </DialogHeader>
            <p role="status" className="flex items-center gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
              <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
              <span className="min-w-0">Ako ti ova osoba piše i dalje, možeš i da je blokiraš.</span>
            </p>
            <DialogFooter>
              <Button className="h-11 md:h-9" onClick={() => close(false)}>
                U redu
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{target === "listing" ? "Prijavi oglas" : "Prijavi korisnika"}</DialogTitle>
              <DialogDescription className="break-words">
                {target === "listing" ? `Oglas: ${name}` : `Korisnik: ${name}`}
              </DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">Razlog *</legend>
              <RadioGroup
                value={reason}
                onValueChange={(v) => setReason(v as ReportReason)}
                aria-invalid={!!error && !reason}
              >
                {(Object.keys(reportReasonLabel) as ReportReason[]).map((r) => (
                  <div key={r} className="flex min-h-11 items-center gap-3 rounded-sm bg-foreground/5 px-3">
                    <RadioGroupItem id={`report-${r}`} value={r} />
                    <Label htmlFor={`report-${r}`} className="min-w-0 flex-1">
                      {reportReasonLabel[r]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="report-note">Napomena{reason === "other" ? " *" : " (opciono)"}</Label>
              <Textarea
                id="report-note"
                rows={3}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="npr. Traži uplatu unapred, a predmet ne postoji."
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
                Otkaži
              </Button>
              <Button className="h-11 md:h-9" onClick={submit}>
                Pošalji prijavu
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Blokirati korisnika {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Ta osoba više neće moći da ti šalje poruke, a ti više nećeš videti njene oglase. Ne dobija obaveštenje o
            blokadi. Blokadu skidaš na profilu te osobe.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Otkaži</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Da, blokiraj
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
