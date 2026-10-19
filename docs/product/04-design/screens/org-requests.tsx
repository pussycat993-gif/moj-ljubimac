"use client"

import { useState } from "react"
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
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { PetAvatar, type PetSpecies } from "../components/pet-avatar"
import { ReadOnlyBanner } from "../components/read-only-banner"
import { StateSwitcher } from "../components/state-switcher"

const animalKind: Record<string, PetSpecies> = { Luna: "cat", Maks: "dog", Garfild: "cat", Kiki: "rabbit", Zlatko: "dog", Mila: "dog" }

type OrgType = "shelter" | "breeder"
type ViewState = "admin" | "empty" | "volunteer"
type RequestStatus = "new" | "accepted" | "rejected"
type Transfer = { sentOn: string; validUntil: string; email: string; expired: boolean }

type Request = {
  id: string
  name: string
  phone: string
  email: string
  message: string
  animal: string
  animalDetail: string
  receivedOn: string
  status: RequestStatus
  transfer?: Transfer
}

const shelterRequests: Request[] = [
  {
    id: "r1",
    name: "Ivana Petrović",
    phone: "+381 64 123 4567",
    email: "ivana.petrovic@primer.rs",
    message: "Imam iskustva sa mačkama i stan sa zaštićenom terasom. Luna mi je odmah prirasla srcu.",
    animal: "Luna",
    animalDetail: "Mačka · Ženka · oko 2 godine",
    receivedOn: "18. 10. 2026.",
    status: "new",
  },
  {
    id: "r2",
    name: "Marko Jovanović",
    phone: "+381 63 765 4321",
    email: "marko.jovanovic@primer.rs",
    message: "Živim u kući sa dvorištem u Bečeju. Maks bi imao puno prostora i društvo.",
    animal: "Maks",
    animalDetail: "Pas, mešanac · Mužjak · oko 4 godine",
    receivedOn: "12. 10. 2026.",
    status: "accepted",
  },
  {
    id: "r3",
    name: "Jelena Nikolić",
    phone: "+381 65 222 3344",
    email: "jelena.nikolic@primer.rs",
    message: "Garfild bi bio naš prvi ljubimac, ćerka ga obožava.",
    animal: "Garfild",
    animalDetail: "Mačka · Mužjak · oko 3 godine",
    receivedOn: "01. 09. 2026.",
    status: "accepted",
    transfer: { sentOn: "15. 09. 2026.", validUntil: "15. 10. 2026.", email: "jelena.nikolic@primer.rs", expired: true },
  },
  {
    id: "r4",
    name: "Nikola Stanković",
    phone: "+381 60 111 2233",
    email: "nikola.stankovic@primer.rs",
    message: "Zainteresovan sam za Kiki.",
    animal: "Kiki",
    animalDetail: "Zec · Ženka · oko 1 godine",
    receivedOn: "05. 10. 2026.",
    status: "rejected",
  },
]

const breederRequests: Request[] = [
  {
    id: "q1",
    name: "Ivana Petrović",
    phone: "+381 64 123 4567",
    email: "ivana.petrovic@primer.rs",
    message: "Da li je Zlatko vakcinisan i kada može da pređe kod nas?",
    animal: "Zlatko",
    animalDetail: "Zlatni retriver · Mužjak · 9 nedelja",
    receivedOn: "18. 10. 2026.",
    status: "new",
  },
  {
    id: "q2",
    name: "Marko Jovanović",
    phone: "+381 63 765 4321",
    email: "marko.jovanovic@primer.rs",
    message: "Zanima nas Mila, možemo doći po nju u subotu.",
    animal: "Mila",
    animalDetail: "Zlatni retriver · Ženka · 9 nedelja",
    receivedOn: "14. 10. 2026.",
    status: "accepted",
  },
]

const statusLabel: Record<OrgType, Record<RequestStatus, string>> = {
  shelter: { new: "Novi", accepted: "Prihvaćen", rejected: "Odbijen" },
  breeder: { new: "Novi", accepted: "Prihvaćen", rejected: "Odbijen" },
}

function RequestStatusBadge({ status, label }: { status: RequestStatus; label: string }) {
  if (status === "new") return <Badge className="border-transparent bg-primary text-primary-foreground">{label}</Badge>
  if (status === "accepted")
    return <Badge className="border-transparent bg-success text-success-foreground">{label}</Badge>
  return (
    <Badge variant="outline" className="bg-card">
      {label}
    </Badge>
  )
}

export default function OrgRequestsScreen() {
  const [orgType, setOrgType] = useState<OrgType>("shelter")
  const [view, setView] = useState<ViewState>("admin")
  const [filter, setFilter] = useState<"all" | RequestStatus>("all")
  const [requests, setRequests] = useState<Record<OrgType, Request[]>>({
    shelter: shelterRequests,
    breeder: breederRequests,
  })
  const [notice, setNotice] = useState("")
  const [rejecting, setRejecting] = useState<Request | null>(null)
  const [transferFor, setTransferFor] = useState<Request | null>(null)
  const [transferEmail, setTransferEmail] = useState("")
  const [transferError, setTransferError] = useState("")

  const isAdmin = view === "admin"
  const noun = orgType === "shelter" ? "Zahtevi za udomljavanje" : "Upiti kupaca"
  const list = view === "empty" ? [] : requests[orgType]
  const visible = filter === "all" ? list : list.filter((r) => r.status === filter)
  const reservedWord = orgType === "shelter" ? "rezervisan(a)" : "rezervisano"

  function update(id: string, patch: Partial<Request>) {
    setRequests((prev) => ({
      ...prev,
      [orgType]: prev[orgType].map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }))
  }

  function accept(r: Request) {
    update(r.id, { status: "accepted" })
    setNotice(`${r.animal} je sada ${reservedWord}. Poslali smo mejl osobi ${r.name}.`)
  }

  function confirmReject() {
    if (!rejecting) return
    update(rejecting.id, { status: "rejected" })
    setNotice(`Odbijeno. Poslali smo mejl osobi ${rejecting.name}.`)
    setRejecting(null)
  }

  function openTransfer(r: Request) {
    setTransferFor(r)
    setTransferEmail(r.transfer?.email ?? r.email)
    setTransferError("")
  }

  function sendTransfer() {
    if (!transferFor) return
    if (!/^\S+@\S+\.\S+$/.test(transferEmail)) {
      setTransferError("Upiši ispravnu mejl adresu.")
      return
    }
    update(transferFor.id, {
      transfer: { sentOn: "19. 10. 2026.", validUntil: "18. 11. 2026.", email: transferEmail, expired: false },
    })
    setNotice(`Karton za ${transferFor.animal} je poslat na ${transferEmail}.`)
    setTransferFor(null)
  }

  const filters: { value: "all" | RequestStatus; label: string }[] = [
    { value: "all", label: "Svi" },
    { value: "new", label: "Novi" },
    { value: "accepted", label: "Prihvaćeni" },
    { value: "rejected", label: "Odbijeni" },
  ]

  return (
    <AppShell variant="organisation" orgType={orgType} active="zahtevi">
      <StateSwitcher
        states={[
          { value: "shelter", label: "Azil" },
          { value: "breeder", label: "Odgajivačnica" },
        ]}
        value={orgType}
        onChange={(v) => {
          setOrgType(v)
          setNotice("")
        }}
      />
      <StateSwitcher
        states={[
          { value: "admin", label: "Admin" },
          { value: "empty", label: "Prazno" },
          { value: "volunteer", label: "Volonter (samo čitanje)" },
        ]}
        value={view}
        onChange={(v) => {
          setView(v)
          setNotice("")
        }}
      />

      <div className="space-y-6">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">
            {orgType === "shelter" ? "Azil „Druga šansa“, Novi Sad" : "Odgajivačnica „Zlatna šapa“, Bečej"}
          </p>
          <h1 className="font-heading text-[28px] leading-9 font-bold">
            {orgType === "shelter" ? "Zahtevi" : "Upiti"}
          </h1>
        </div>

        {view === "volunteer" && (
          <ReadOnlyBanner
            reason={`Kao volonter vidiš ${orgType === "shelter" ? "zahteve" : "upite"}, ali o njima odlučuje administrator.`}
          />
        )}

        {notice && (
          <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
            <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
            <p className="min-w-0 text-sm">{notice}</p>
          </Card>
        )}

        {list.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={orgType === "shelter" ? "Još nema zahteva" : "Još nema upita"}
            description={
              orgType === "shelter"
                ? "Kad neko zatraži udomljavanje sa tvoje javne stranice, zahtev stiže ovde."
                : "Kad kupac pošalje upit za mladunče, videćeš ga ovde."
            }
          />
        ) : (
          <section aria-label={noun} className="space-y-4">
            <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1" role="group" aria-label="Filter po statusu">
              {filters.map((f) => {
                const count = f.value === "all" ? list.length : list.filter((r) => r.status === f.value).length
                return (
                  <Button
                    key={f.value}
                    size="sm"
                    variant={filter === f.value ? "default" : "outline"}
                    aria-pressed={filter === f.value}
                    className="shrink-0"
                    onClick={() => setFilter(f.value)}
                  >
                    {f.label} · {count}
                  </Button>
                )
              })}
            </div>

            {visible.length === 0 && (
              <Card className="p-6 text-center">
                <p className="text-sm text-muted-foreground">Nema stavki u ovom filteru.</p>
              </Card>
            )}

            <div className="space-y-4">
              {visible.map((r) => (
                <Card key={r.id} className="gap-4 p-4 md:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <PetAvatar name={r.animal} species={animalKind[r.animal]} />
                      <div className="min-w-0">
                        <h2 className="truncate font-heading text-lg font-bold">{r.animal}</h2>
                        <p className="truncate text-sm text-muted-foreground">{r.animalDetail}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <RequestStatusBadge status={r.status} label={statusLabel[orgType][r.status]} />
                      <span className="text-xs font-medium text-muted-foreground">{r.receivedOn}</span>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-sm bg-foreground/5 p-3">
                    <p className="text-sm font-medium">{r.name}</p>
                    <div className="flex flex-col gap-1 text-sm md:flex-row md:gap-4">
                      <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="flex min-w-0 items-center gap-2 text-primary hover:underline">
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

                  {r.status === "accepted" && r.transfer && (
                    <p className={cn("text-sm", r.transfer.expired ? "text-destructive" : "text-muted-foreground")}>
                      {r.transfer.expired
                        ? `Poziv za karton je istekao ${r.transfer.validUntil} — nije prihvaćen.`
                        : `Karton poslat ${r.transfer.sentOn} na ${r.transfer.email} · važi do ${r.transfer.validUntil}.`}
                    </p>
                  )}

                  {isAdmin && r.status === "new" && (
                    <div className="flex flex-col gap-2 md:flex-row md:justify-end">
                      <Button variant="outline" className="h-11 md:h-9" onClick={() => setRejecting(r)}>
                        Odbij
                      </Button>
                      <Button className="h-11 md:h-9" onClick={() => accept(r)}>
                        Prihvati
                      </Button>
                    </div>
                  )}

                  {isAdmin && r.status === "accepted" && (
                    <div className="flex flex-col gap-2 md:flex-row md:justify-end">
                      <Button
                        variant={r.transfer && !r.transfer.expired ? "outline" : "default"}
                        className="h-11 md:h-9"
                        onClick={() => openTransfer(r)}
                      >
                        <Send className="size-5" aria-hidden />
                        {r.transfer ? "Pošalji ponovo" : "Pošalji karton"}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>

      <AlertDialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odbiti {orgType === "shelter" ? "zahtev" : "upit"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejecting?.name} će dobiti mejl da {orgType === "shelter" ? "zahtev" : "upit"} za {rejecting?.animal} nije
              prihvaćen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmReject}>
              Da, odbij
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={transferFor !== null} onOpenChange={(o) => !o && setTransferFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pošalji karton — {transferFor?.animal}</DialogTitle>
            <DialogDescription>
              Novi vlasnik dobija ceo karton sa prilozima. Tebi ostaje kopija samo za čitanje, a{" "}
              {transferFor?.animal} se označava kao {orgType === "shelter" ? "udomljen(a)" : "prodato"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="transfer-email">Mejl novog vlasnika *</Label>
            <Input
              id="transfer-email"
              type="email"
              value={transferEmail}
              onChange={(e) => {
                setTransferEmail(e.target.value)
                setTransferError("")
              }}
              aria-invalid={transferError ? true : undefined}
              aria-describedby="transfer-help"
            />
            {transferError && <p className="text-sm text-destructive">{transferError}</p>}
            <p id="transfer-help" className="text-sm text-muted-foreground">
              Poziv važi 30 dana (do 18. 11. 2026.). Ako ga ne prihvati, možeš da ga pošalješ ponovo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setTransferFor(null)}>
              Otkaži
            </Button>
            <Button className="h-11 md:h-9" onClick={sendTransfer}>
              <Send className="size-5" aria-hidden />
              Pošalji poziv
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
