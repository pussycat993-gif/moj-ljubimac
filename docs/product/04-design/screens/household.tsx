"use client"

import { useState } from "react"
import { Bell, Check, Copy, LogOut, Mail, Trash2, UserPlus, Users } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { PetAvatar, type PetSex, type PetSpecies } from "../components/pet-avatar"
import { PremiumLock } from "../components/premium-lock"
import { ReadOnlyBanner } from "../components/read-only-banner"
import { StateSwitcher } from "../components/state-switcher"

// S13 — Domaćinstvo · /domacinstvo · FR-26, FR-27, FR-28, FR-29, FR-30, FR-32
// D = Premium owner · G = Free owner (BR-19) · R = owner's Premium lapsed (FR-32) · E = no members yet
// M = member view (FR-29 own reminder opt-in; members cannot invite, remove or change shared pets)

type ViewState = "D" | "G" | "R" | "E" | "M"

type Member = { id: string; name: string; initials: string; role: "owner" | "member"; joined: string; email: string }
type SharedPet = { id: string; name: string; sex: PetSex; species: string; kind: PetSpecies; shared: boolean }

const MAX_MEMBERS = 6

const initialMembers: Member[] = [
  { id: "u1", name: "Ivana Petrović", initials: "IP", role: "owner", joined: "12. 3. 2026.", email: "ivana.petrovic@gmail.com" },
  { id: "u2", name: "Marko Jovanović", initials: "MJ", role: "member", joined: "15. 4. 2026.", email: "marko.jovanovic@gmail.com" },
  { id: "u3", name: "Ana Petrović", initials: "AP", role: "member", joined: "10. 9. 2026.", email: "ana.petrovic@yahoo.com" },
]

const initialPets: SharedPet[] = [
  { id: "luna", name: "Luna", sex: "female", species: "Mačka", kind: "cat", shared: true },
  { id: "maks", name: "Maks", sex: "male", species: "Pas", kind: "dog", shared: true },
  { id: "kiki", name: "Kiki", sex: "female", species: "Zec", kind: "rabbit", shared: false },
]

function PersonAvatar({ initials }: { initials: string }) {
  return (
    <Avatar className="size-12">
      <AvatarFallback className="bg-muted text-sm text-foreground">{initials}</AvatarFallback>
    </Avatar>
  )
}

export default function HouseholdScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [pets, setPets] = useState<SharedPet[]>(initialPets)
  const [memberReminders, setMemberReminders] = useState(false)

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSent, setInviteSent] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const isOwner = view !== "M"
  const canEdit = view === "D" || view === "E"
  const shownMembers = view === "E" ? initialMembers.filter((m) => m.role === "owner") : members
  const full = shownMembers.length >= MAX_MEMBERS

  function sendInvite() {
    const email = inviteEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError("Unesi ispravnu mejl adresu.")
      return
    }
    if (shownMembers.some((m) => m.email === email)) {
      setInviteError("Ova osoba je već član domaćinstva.")
      return
    }
    setInviteError(null)
    setInviteSent(email)
    setInviteEmail("")
  }

  function closeInvite(o: boolean) {
    setInviteOpen(o)
    if (!o) {
      setInviteEmail("")
      setInviteError(null)
      setInviteSent(null)
      setLinkCopied(false)
    }
  }

  const membersCard = (
    <Card className="gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold">Članovi</h2>
          <p className="text-sm text-muted-foreground">
            {shownMembers.length} / {MAX_MEMBERS} članova
          </p>
        </div>
        {isOwner && canEdit && !full && (
          <Button className="h-11 md:h-9" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-5" aria-hidden />
            Pozovi člana
          </Button>
        )}
      </div>
      <Progress value={(shownMembers.length / MAX_MEMBERS) * 100} aria-label={`${shownMembers.length} od ${MAX_MEMBERS} članova`} />
      {isOwner && canEdit && full && (
        <p className="text-sm text-destructive">Domaćinstvo ima najviše 6 članova. Ukloni nekog da pozoveš novog.</p>
      )}

      {view === "E" ? (
        <EmptyState
          icon={Users}
          title="Još nema članova"
          description="Pozovi ukućane da zajedno brinete o ljubimcima."
          action="Pozovi člana"
          onAction={() => setInviteOpen(true)}
        />
      ) : (
        <ul className="space-y-2">
          {shownMembers.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
              <PersonAvatar initials={m.initials} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">
                    {m.name}
                    {view === "M" && m.id === "u2" ? " (ti)" : ""}
                  </p>
                  <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                    {m.role === "owner" ? "Vlasnik" : "Član"}
                  </Badge>
                </div>
                <p className="truncate text-xs font-medium text-muted-foreground">Pridružen/a {m.joined}</p>
              </div>
              {isOwner && canEdit && m.role === "member" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Ukloni člana ${m.name}`}>
                      <Trash2 className="size-5" aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Ukloniti člana iz domaćinstva?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {m.name.split(" ")[0]} više neće videti deljene ljubimce. Sve što je uneo/la ostaje u kartonu.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Otkaži</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => setMembers((prev) => prev.filter((x) => x.id !== m.id))}
                      >
                        Da, ukloni
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )

  const petsCard = (
    <Card className="gap-4 p-4 md:p-6">
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-bold">Deljeni ljubimci</h2>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Članovi vide samo ljubimce koje ovde uključiš."
            : "Ivana deli sa tobom ove ljubimce. Možeš da beležiš obroke, stolicu, težinu, doze i trenutke."}
        </p>
      </div>
      <ul className="space-y-2">
        {(isOwner ? pets : pets.filter((p) => p.shared)).map((p) => {
          const id = `share-${p.id}`
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
              <PetAvatar name={p.name} sex={p.sex} species={p.kind} size="sm" />
              <div className="min-w-0 flex-1">
                {isOwner && canEdit ? (
                  <Label htmlFor={id} className="truncate">
                    {p.name}
                  </Label>
                ) : (
                  <p className="truncate text-sm font-medium">{p.name}</p>
                )}
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {p.species} · {p.shared ? "deljen/a" : "nije deljen/a"}
                </p>
              </div>
              {isOwner && canEdit && (
                <Switch
                  id={id}
                  checked={p.shared}
                  onCheckedChange={(v) => setPets((prev) => prev.map((x) => (x.id === p.id ? { ...x, shared: v } : x)))}
                />
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )

  return (
    <AppShell active="domacinstvo" user={{ name: view === "M" ? "Marko Jovanović" : "Ivana Petrović" }}>
      <StateSwitcher
        states={[
          { value: "D", label: "Podrazumevano" },
          { value: "G", label: "Premium zaključano" },
          { value: "R", label: "Samo čitanje" },
          { value: "E", label: "Prazno" },
          { value: "M", label: "Pogled člana" },
        ]}
        value={view}
        onChange={setView}
      />

      <div className="space-y-6">
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-9 font-bold">Domaćinstvo</h1>
          <p className="text-sm text-muted-foreground">
            {view === "M" ? "Domaćinstvo Ivane Petrović" : "Zajedno brinete o ljubimcima, svako sa svog naloga."}
          </p>
        </div>

        {view === "R" && (
          <div className="space-y-3">
            <ReadOnlyBanner reason="Tvoj Premium je istekao 5. 10. 2026. Članovi i dalje vide deljene ljubimce, ali niko ne može ništa da menja dok ne obnoviš Premium." />
            <Button className="h-11 md:h-9">Obnovi Premium</Button>
          </div>
        )}

        {view === "G" ? (
          <PremiumLock description="Pozovi do 5 ukućana da zajedno beležite obroke, doze i trenutke. Deljenje je deo Premiuma.">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              {membersCard}
              {petsCard}
            </div>
          </PremiumLock>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              {membersCard}

              {/* FR-29 — member's own opt-in; off by default, email and push only regardless of owner's Premium */}
              {view === "M" && (
                <Card className="gap-4 p-4 md:p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                      <Bell className="size-5 text-primary" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Label htmlFor="member-reminders" className="font-heading text-lg font-bold">
                        Moji podsetnici za deljene ljubimce
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Uključi ako želiš da i tebi stižu podsetnici za deljene ljubimce (Luna, Maks). Stižu samo mejlom i push-om.
                      </p>
                    </div>
                    <Switch
                      id="member-reminders"
                      checked={memberReminders}
                      onCheckedChange={setMemberReminders}
                      className="shrink-0"
                    />
                  </div>
                  <p role="status" className="text-sm text-muted-foreground">
                    {memberReminders ? "Podsetnici su uključeni." : "Podsetnici su isključeni."}
                  </p>
                </Card>
              )}

              {view === "M" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="h-11 md:h-9">
                      <LogOut className="size-5" aria-hidden />
                      Napusti domaćinstvo
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Napustiti domaćinstvo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Više nećeš videti kartone deljenih ljubimaca (Luna, Maks). Sve što si uneo/la ostaje u njihovim kartonima.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Otkaži</AlertDialogCancel>
                      <AlertDialogAction variant="destructive">Da, napusti</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <aside className="min-w-0" aria-label="Deljeni ljubimci">
              {petsCard}
            </aside>
          </div>
        )}
      </div>

      {/* Invite (FR-26) */}
      <Dialog open={inviteOpen} onOpenChange={closeInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pozovi člana</DialogTitle>
            <DialogDescription>Član se pridružuje kad se prijavi na svoj nalog. Ako ga nema, napraviće ga.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="mejl">
            <TabsList className="w-full">
              <TabsTrigger value="mejl">
                <Mail className="size-4" aria-hidden />
                Mejlom
              </TabsTrigger>
              <TabsTrigger value="link">
                <Copy className="size-4" aria-hidden />
                Linkom
              </TabsTrigger>
            </TabsList>
            <TabsContent value="mejl" className="mt-4 space-y-2">
              <Label htmlFor="invite-email">Mejl adresa</Label>
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="npr. jelena.markovic@gmail.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  aria-invalid={!!inviteError}
                  aria-describedby={inviteError ? "invite-email-error" : undefined}
                  className="min-w-0 flex-1"
                />
                <Button className="h-11 md:h-9" onClick={sendInvite}>
                  Pošalji poziv
                </Button>
              </div>
              {inviteError && (
                <p id="invite-email-error" className="text-sm text-destructive">
                  {inviteError}
                </p>
              )}
              {inviteSent && (
                <p role="status" className="flex items-center gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-success" aria-hidden />
                  <span className="min-w-0 truncate">Poziv je poslat na {inviteSent}.</span>
                </p>
              )}
            </TabsContent>
            <TabsContent value="link" className="mt-4 space-y-2">
              <Label htmlFor="invite-link">Link za poziv</Label>
              <div className="flex gap-2">
                <Input id="invite-link" readOnly value="mojljubimac.rs/poziv/h7Kq2mP9" className="min-w-0 flex-1" />
                <Button variant="outline" onClick={() => setLinkCopied(true)}>
                  {linkCopied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {linkCopied ? "Kopirano" : "Kopiraj"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Pošalji link sam/a, npr. porukom.</p>
              <p role="status" className="sr-only">
                {linkCopied ? "Link je kopiran" : ""}
              </p>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => closeInvite(false)}>
              Zatvori
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
