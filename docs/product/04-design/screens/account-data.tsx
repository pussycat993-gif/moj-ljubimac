"use client"

import { useState } from "react"
import Link from "next/link"
import { Archive, ChevronLeft, Clock, Download, FileArchive, Trash2, Undo2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { AppShell } from "../components/shells"
import { ErrorState } from "../components/error-state"
import { StateSwitcher } from "../components/state-switcher"

type ViewState = "default" | "preparing" | "ready" | "pending" | "error"
type ExportState = "idle" | "preparing" | "ready"

const states: { value: ViewState; label: string }[] = [
  { value: "default", label: "D" },
  { value: "preparing", label: "Arhiva se priprema" },
  { value: "ready", label: "Arhiva spremna" },
  { value: "pending", label: "Brisanje na čekanju" },
  { value: "error", label: "X" },
]

const archiveContents = ["Kartoni: Luna, Maks", "Vakcine, terapije i pregledi", "27 priloga", "12 trenutaka", "Podsetnici i dnevnik nege"]

const deletion = {
  requestedOn: "19. 10. 2026.",
  deleteOn: "18. 11. 2026.",
  daysLeft: 30,
  heir: "Marka Jovanovića",
}

function ExportCard({
  exportState,
  onRequest,
}: {
  exportState: ExportState
  onRequest: () => void
}) {
  return (
    <Card className="gap-4 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
          <Archive className="size-5 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold">Preuzmi sve moje podatke</h2>
          <p className="text-sm text-muted-foreground">
            Jedna ZIP arhiva sa svim ličnim podacima i kartonima, uključujući priloge i fotografije.
          </p>
        </div>
      </div>

      <ul className="flex flex-wrap gap-2">
        {archiveContents.map((c) => (
          <li key={c} className="rounded-sm bg-foreground/5 px-2 py-1 text-xs font-medium">
            {c}
          </li>
        ))}
      </ul>

      {exportState === "idle" && (
        <Button className="h-11 md:h-9 md:self-start" onClick={onRequest}>
          <Download className="size-5" aria-hidden />
          Pripremi arhivu
        </Button>
      )}

      {exportState === "preparing" && (
        <div className="space-y-2" role="status">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="size-4 text-primary" aria-hidden />
            Pripremamo arhivu…
          </div>
          <Progress value={40} aria-label="Priprema arhive, 40 odsto" />
          <p className="text-sm text-muted-foreground">
            Može da potraje nekoliko minuta. Poslaćemo ti mejl na ivana.petrovic@gmail.com kad bude spremna — ne moraš da
            čekaš na ovoj stranici.
          </p>
        </div>
      )}

      {exportState === "ready" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
            <FileArchive className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">moj-ljubimac-ivana-petrovic-19-10-2026.zip</p>
              <p className="text-xs text-muted-foreground">248 MB · link važi do 26. 10. 2026.</p>
            </div>
          </div>
          <Button className="h-11 md:h-9 md:self-start">
            <Download className="size-5" aria-hidden />
            Preuzmi ZIP
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function AccountDataScreen() {
  const [state, setState] = useState<ViewState>("default")
  const [confirmed, setConfirmed] = useState(false)

  const exportState: ExportState = state === "preparing" ? "preparing" : state === "ready" ? "ready" : "idle"

  return (
    <AppShell variant="owner" active="profil">
      <StateSwitcher
        states={states}
        value={state}
        onChange={(v) => {
          setState(v)
          setConfirmed(false)
        }}
      />

      <div className="space-y-6">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/profil">
              <ChevronLeft className="size-4" aria-hidden />
              Profil
            </Link>
          </Button>
          <h1 className="font-heading text-[28px] leading-9 font-bold">Moji podaci</h1>
          <p className="text-sm text-muted-foreground">Tvoji podaci su tvoji — preuzmi ih ili obriši nalog kad god želiš.</p>
        </div>

        {state === "error" && <ErrorState onRetry={() => setState("default")} />}

        {state === "pending" && (
          <Card role="status" className="gap-4 border-destructive p-4 md:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                <Trash2 className="size-5 text-destructive" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold">Nalog će biti obrisan {deletion.deleteOn}</h2>
                <p className="text-sm text-muted-foreground">
                  Zahtev je poslat {deletion.requestedOn} Nalog je deaktiviran — podsetnici ne stižu, a Premium se
                  neće obnoviti.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 text-sm font-medium">Još {deletion.daysLeft} dana da se predomisliš</p>
                <p className="shrink-0 text-xs text-muted-foreground">{deletion.daysLeft} / 30</p>
              </div>
              <Progress value={100} aria-label={`Preostalo ${deletion.daysLeft} od 30 dana`} />
            </div>
            <Button className="h-11 md:h-9 md:self-start" onClick={() => setState("default")}>
              <Undo2 className="size-5" aria-hidden />
              Otkaži brisanje
            </Button>
            <p className="text-xs text-muted-foreground">Ako otkažeš, nalog se vraća tačno onakav kakav je bio.</p>
          </Card>
        )}

        {state !== "error" && <ExportCard exportState={exportState} onRequest={() => setState("preparing")} />}

        {state !== "error" && state !== "pending" && (
          <Card className="gap-4 p-4 md:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                <Trash2 className="size-5 text-destructive" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold">Obriši nalog</h2>
                <p className="text-sm text-muted-foreground">
                  Nalog se odmah deaktivira, a trajno ga brišemo posle 30 dana. Do tada možeš da se prijaviš i otkažeš
                  brisanje.
                </p>
              </div>
            </div>
            <AlertDialog onOpenChange={(open) => !open && setConfirmed(false)}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="h-11 md:h-9 md:self-start">
                  Obriši nalog
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Obrisati nalog?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Nalog se odmah deaktivira i trajno se briše {deletion.deleteOn} — sa svim kartonima ljubimaca (Luna, Maks),
                    prilozima i trenucima. Do tada se samo prijavi i otkaži brisanje.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Premium pretplata se neće obnoviti.</li>
                  <li>
                    Domaćinstvo ostaje: deljeni ljubimci prelaze na {deletion.heir}, člana koji se prvi pridružio.
                  </li>
                  <li>Savet: pre brisanja preuzmi arhivu svojih podataka.</li>
                </ul>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="confirm-delete"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="confirm-delete" className="min-w-0 text-sm font-normal">
                    Razumem da se posle 30 dana podaci ne mogu vratiti.
                  </Label>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Odustani</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" disabled={!confirmed} onClick={() => setState("pending")}>
                    Da, obriši
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
