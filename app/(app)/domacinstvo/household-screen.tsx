"use client"

import { useState, type MouseEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Check, Copy, Link2, LogOut, Mail, Trash2, UserPlus, Users } from "lucide-react"
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
import { toast } from "@/components/ui/sonner"
import { EmptyState } from "@/components/app/empty-state"
import { PetAvatar, type PetSex, type PetSpecies } from "@/components/app/pet-avatar"
import { PremiumLock } from "@/components/app/premium-lock"
import { ReadOnlyBanner } from "@/components/app/read-only-banner"
import type {
  ChangeMembershipInput,
  CreateInvitationInput,
  CreatedInvitation,
  Household,
  HouseholdMember,
  HouseholdView,
} from "@/lib/actions/household"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S13 — Domaćinstvo · /domacinstvo · FR-26, FR-27, FR-28, FR-29, FR-30, FR-32 (port of
// docs/product/04-design/screens/household.tsx without the StateSwitcher). The state comes from EP-34
// (API EP-34 "States", §7.3): household = null and no Premium (or a 403 premium_required) → G (PremiumLock);
// household = null with Premium, or only the owner → E; read_only → R (banner, controls hidden); my_role =
// member → M; otherwise D. Writes: EP-35 invite Dialog, EP-36 revoke / remove / leave, EP-37 shared-pets
// Switch, EP-38 member opt-in Switch — server actions from lib/actions/household.ts.

type ViewState = "D" | "G" | "R" | "E" | "M"

export type HouseholdCopy = {
  household: Dictionary["household"]
  pet: Dictionary["pet"]
  common: Dictionary["common"]
}

export type HouseholdActions = {
  getHousehold: (input?: { household_id?: string }) => Promise<ActionResult<HouseholdView>>
  createHouseholdInvitation: (input: CreateInvitationInput) => Promise<ActionResult<CreatedInvitation>>
  changeHouseholdMembership: (input: ChangeMembershipInput) => Promise<ActionResult<Household | { left: true }>>
  setSharedPet: (input: {
    household_id: string
    pet_id: string
    shared: boolean
  }) => Promise<ActionResult<{ household_id: string; pet_id: string; shared: boolean }>>
  setMyReminderOptIn: (input: {
    household_id: string
    reminders_enabled: boolean
  }) => Promise<ActionResult<{ household_id: string; reminders_enabled: boolean }>>
}

const SPECIES: PetSpecies[] = ["cat", "dog", "rabbit", "bird", "fish", "turtle", "other"]
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function avatarSpecies(species: string): PetSpecies {
  return (SPECIES as string[]).includes(species) ? (species as PetSpecies) : "other"
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function firstNameOf(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] ?? name
}

function PersonAvatar({ initials }: { initials: string }) {
  return (
    <Avatar className="size-12">
      <AvatarFallback className="bg-muted text-sm text-foreground">{initials}</AvatarFallback>
    </Avatar>
  )
}

export function HouseholdScreen({
  initial,
  premium,
  me,
  locale,
  copy,
  actions,
}: {
  initial: HouseholdView
  /** Me.entitlements.premium (EP-43). */
  premium: boolean
  /** The signed-in user, for the owner row of the locked preview (household = null). */
  me: { id: string; name: string; email: string }
  locale: Locale
  copy: HouseholdCopy
  actions: HouseholdActions
}) {
  const t = copy.household
  const router = useRouter()
  const [household, setHousehold] = useState<Household | null>(initial.household)
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false)
  const [householdName, setHouseholdName] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSent, setInviteSent] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "sr-Latn", {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  })
  const formatDate = (iso: string) => dateFormat.format(new Date(iso))
  const listFormat = new Intl.ListFormat(locale === "en" ? "en-GB" : "sr-Latn", { type: "conjunction" })

  const view: ViewState =
    locked || (!household && !premium)
      ? "G"
      : !household
        ? "E"
        : household.my_role === "member"
          ? "M"
          : household.read_only
            ? "R"
            : household.members.length <= 1
              ? "E"
              : "D"
  const isOwner = view !== "M"
  const canEdit = isOwner && (household ? household.access.can_edit : view === "E")

  const ownerOnly: HouseholdMember = {
    user_id: me.id,
    full_name: me.name,
    email: me.email,
    role: "owner",
    joined_at: new Date().toISOString(),
    reminders_enabled: null,
    is_me: true,
  }
  const members = household?.members ?? [ownerOnly]
  const memberLimit = household?.member_limit ?? 6
  const full = members.length >= memberLimit
  const pets = household?.pets ?? []
  const sharedNames = pets.filter((p) => p.shared).map((p) => p.name)
  const ownerName = household?.owner_name ?? ""

  async function refresh(id = household?.id) {
    const result = await actions.getHousehold(id ? { household_id: id } : {})
    if (result.ok) setHousehold(result.data.household)
    return result
  }

  function failed(code: string) {
    if (code === "premium_required") {
      setLocked(true)
      return
    }
    if (code === "household_read_only" || code === "forbidden_role") {
      void refresh()
      return
    }
    toast(copy.common.error)
  }

  async function invite(email: string | null) {
    const name = householdName.trim()
    if (!household) {
      if (!name) {
        setNameError(t.householdNameRequired)
        return
      }
      if (name.length > 60) {
        setNameError(t.householdNameTooLong)
        return
      }
    }
    setNameError(null)
    setBusy(true)
    const result = await actions.createHouseholdInvitation({
      email,
      household_name: household ? null : name,
      idempotency_key: crypto.randomUUID(),
    })
    setBusy(false)
    if (result.ok) {
      if (email) {
        setInviteSent(email)
        setInviteEmail("")
      } else {
        setInviteUrl(result.data.invite_url)
      }
      await refresh(result.data.invitation.household_id)
      return
    }
    const { code, fields } = result.error
    const setError = email ? setInviteError : setLinkError
    if (code === "validation_failed" && fields?.household_name) {
      setNameError(fields.household_name === "too_long" ? t.householdNameTooLong : t.householdNameRequired)
    } else if (code === "validation_failed" && fields?.email) {
      setInviteError(t.emailInvalid)
    } else if (code === "already_member") {
      setError(t.alreadyMember)
    } else if (code === "household_full") {
      setError(t.full)
    } else if (code === "rate_limited") {
      setError(t.rateLimited)
    } else if (code === "premium_required") {
      closeInvite(false)
      setLocked(true)
    } else {
      setError(copy.common.error)
    }
  }

  function sendInvite() {
    const email = inviteEmail.trim().toLowerCase()
    setInviteSent(null)
    if (!EMAIL.test(email)) {
      setInviteError(t.emailInvalid)
      return
    }
    if (members.some((m) => m.email.toLowerCase() === email)) {
      setInviteError(t.alreadyMember)
      return
    }
    setInviteError(null)
    void invite(email)
  }

  async function copyLink() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
    } catch {
      // The address stays selectable in the field.
    }
    setLinkCopied(true)
  }

  function closeInvite(o: boolean) {
    setInviteOpen(o)
    if (!o) {
      setInviteEmail("")
      setInviteError(null)
      setInviteSent(null)
      setInviteUrl(null)
      setLinkError(null)
      setLinkCopied(false)
      setNameError(null)
    }
  }

  async function removeMember(m: HouseholdMember) {
    if (!household) return
    const result = await actions.changeHouseholdMembership({ op: "remove_member", household_id: household.id, user_id: m.user_id })
    if (result.ok && "id" in result.data) setHousehold(result.data)
    else if (!result.ok) failed(result.error.code)
  }

  async function revoke(invitationId: string) {
    const result = await actions.changeHouseholdMembership({ op: "revoke_invitation", invitation_id: invitationId })
    if (result.ok && "id" in result.data) {
      setHousehold(result.data)
      toast(t.revoked)
    } else if (!result.ok) {
      if (result.error.code === "invitation_used") void refresh()
      else failed(result.error.code)
    }
  }

  async function leave() {
    if (!household) return
    const result = await actions.changeHouseholdMembership({ op: "leave", household_id: household.id })
    if (result.ok) router.push("/ljubimci")
    else failed(result.error.code)
  }

  async function toggleShared(petId: string, shared: boolean) {
    if (!household) return
    const previous = household
    setHousehold({ ...household, pets: household.pets.map((p) => (p.pet_id === petId ? { ...p, shared } : p)) })
    const result = await actions.setSharedPet({ household_id: household.id, pet_id: petId, shared })
    if (!result.ok) {
      setHousehold(previous)
      failed(result.error.code)
    }
  }

  async function toggleReminders(enabled: boolean) {
    if (!household) return
    const previous = household
    setHousehold({ ...household, my_reminders_enabled: enabled })
    const result = await actions.setMyReminderOptIn({ household_id: household.id, reminders_enabled: enabled })
    if (!result.ok) {
      setHousehold(previous)
      failed(result.error.code)
    }
  }

  // PremiumLock's CTA and "Obnovi Premium" open the Premium page (owner decision, Step 22).
  function openPremium(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) router.push("/premium")
  }

  const pending = isOwner && household ? household.pending_invitations : []

  const membersCard = (
    <Card className="gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold">{t.membersTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {format(t.membersCount, { n: members.length, limit: memberLimit })}
          </p>
        </div>
        {isOwner && canEdit && !full && view !== "G" && (
          <Button className="h-11 md:h-9" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-5" aria-hidden />
            {t.invite}
          </Button>
        )}
      </div>
      <Progress
        value={(members.length / memberLimit) * 100}
        aria-label={format(t.membersProgress, { n: members.length, limit: memberLimit })}
      />
      {isOwner && canEdit && full && <p className="text-sm text-destructive">{t.full}</p>}

      {view === "E" ? (
        <EmptyState
          icon={Users}
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={t.invite}
          onAction={() => setInviteOpen(true)}
        />
      ) : (
        <ul className="space-y-2">
          {members.map((m) => {
            const name = m.full_name || m.email
            return (
              <li key={m.user_id} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
                <PersonAvatar initials={initialsOf(name)} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">
                      {name}
                      {view === "M" && m.is_me ? t.you : ""}
                    </p>
                    <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                      {m.role === "owner" ? t.owner : t.member}
                    </Badge>
                  </div>
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {format(t.joined, { date: formatDate(m.joined_at) })}
                  </p>
                </div>
                {isOwner && canEdit && m.role === "member" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={format(t.removeAria, { name })}>
                        <Trash2 className="size-5" aria-hidden />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t.removeTitle}</AlertDialogTitle>
                        <AlertDialogDescription>{format(t.removeDescription, { name: firstNameOf(name) })}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => void removeMember(m)}>
                          {t.removeConfirm}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Sent invitations (owner decision, Step 22): pending, newest first; revoke = EP-36. */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">{t.pendingTitle}</h3>
          <ul className="space-y-2">
            {pending.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
                {inv.kind === "email" ? (
                  <Mail className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Link2 className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{inv.email ?? t.linkInvitation}</p>
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {format(t.validUntil, { date: formatDate(inv.expires_at) })}
                  </p>
                </div>
                {canEdit && (
                  <Button variant="outline" className="h-11 shrink-0 md:h-9" onClick={() => void revoke(inv.id)}>
                    {t.revoke}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )

  const shownPets = isOwner ? pets : pets.filter((p) => p.shared)
  const petsCard = (
    <Card className="gap-4 p-4 md:p-6">
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-bold">{t.petsTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {isOwner ? t.petsOwnerHint : format(t.petsMemberHint, { owner: firstNameOf(ownerName) })}
        </p>
      </div>
      <ul className="space-y-2">
        {shownPets.map((p) => {
          const id = `share-${p.pet_id}`
          return (
            <li key={p.pet_id} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
              <PetAvatar name={p.name} sex={p.sex as PetSex} species={avatarSpecies(p.species)} size="sm" />
              <div className="min-w-0 flex-1">
                {isOwner && canEdit ? (
                  <Label htmlFor={id} className="truncate">
                    {p.name}
                  </Label>
                ) : (
                  <p className="truncate text-sm font-medium">{p.name}</p>
                )}
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {copy.pet.species[p.species as keyof Dictionary["pet"]["species"]] ?? p.species} ·{" "}
                  {p.shared ? t.shared : t.notShared}
                </p>
              </div>
              {isOwner && canEdit && (
                <Switch id={id} checked={p.shared} onCheckedChange={(v) => void toggleShared(p.pet_id, v)} />
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )

  const readOnlyReason =
    view === "M"
      ? t.readOnlyMember
      : household?.owner_premium_until
        ? format(t.readOnlyOwner, { date: formatDate(household.owner_premium_until) })
        : t.readOnlyOwnerNoDate

  return (
    <>
      <div className="space-y-6">
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">
            {view === "M" && household
              ? format(t.memberSubtitle, { household: household.name, owner: ownerName })
              : t.subtitle}
          </p>
        </div>

        {(view === "R" || (view === "M" && household?.read_only)) && (
          <div className="space-y-3">
            <ReadOnlyBanner reason={readOnlyReason} />
            {view === "R" && (
              <Button className="h-11 md:h-9" asChild>
                <Link href="/premium">{t.renew}</Link>
              </Button>
            )}
          </div>
        )}

        {view === "G" ? (
          <div onClick={openPremium}>
            <PremiumLock
              title={copy.common.premiumTitle}
              cta={copy.common.premiumCta}
              description={t.premiumDescription}
            >
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                {membersCard}
                {petsCard}
              </div>
            </PremiumLock>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              {membersCard}

              {/* FR-29 — member's own opt-in; off by default, email and push only regardless of owner's Premium */}
              {view === "M" && household && (
                <Card className="gap-4 p-4 md:p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                      <Bell className="size-5 text-primary" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Label htmlFor="member-reminders" className="font-heading text-lg font-bold">
                        {t.remindersTitle}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {sharedNames.length > 0
                          ? format(t.remindersDescription, { pets: listFormat.format(sharedNames) })
                          : t.remindersDescriptionNoPets}
                      </p>
                    </div>
                    <Switch
                      id="member-reminders"
                      checked={household.my_reminders_enabled === true}
                      onCheckedChange={(v) => void toggleReminders(v)}
                      className="shrink-0"
                    />
                  </div>
                  <p role="status" className="text-sm text-muted-foreground">
                    {household.my_reminders_enabled ? t.remindersOn : t.remindersOff}
                  </p>
                </Card>
              )}

              {view === "M" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="h-11 md:h-9">
                      <LogOut className="size-5" aria-hidden />
                      {t.leave}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t.leaveTitle}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {sharedNames.length > 0
                          ? format(t.leaveDescription, { pets: listFormat.format(sharedNames) })
                          : t.leaveDescriptionNoPets}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void leave()}>
                        {t.leaveConfirm}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <aside className="min-w-0" aria-label={t.petsTitle}>
              {petsCard}
            </aside>
          </div>
        )}
      </div>

      {/* Invite (FR-26) */}
      <Dialog open={inviteOpen} onOpenChange={closeInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.inviteTitle}</DialogTitle>
            <DialogDescription>{t.inviteDescription}</DialogDescription>
          </DialogHeader>
          {/* The first invitation creates the household, so it needs a name (EP-35, owner decision). */}
          {!household && (
            <div className="space-y-2">
              <Label htmlFor="household-name">{t.householdName}</Label>
              <Input
                id="household-name"
                value={householdName}
                maxLength={60}
                onChange={(e) => setHouseholdName(e.target.value)}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "household-name-error" : undefined}
              />
              {nameError && (
                <p id="household-name-error" className="text-sm text-destructive">
                  {nameError}
                </p>
              )}
            </div>
          )}
          <Tabs defaultValue="mejl">
            <TabsList className="w-full">
              <TabsTrigger value="mejl">
                <Mail className="size-4" aria-hidden />
                {t.tabEmail}
              </TabsTrigger>
              <TabsTrigger value="link">
                <Copy className="size-4" aria-hidden />
                {t.tabLink}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="mejl" className="mt-4 space-y-2">
              <Label htmlFor="invite-email">{t.emailLabel}</Label>
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  id="invite-email"
                  type="email"
                  placeholder={t.emailPlaceholder}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  aria-invalid={!!inviteError}
                  aria-describedby={inviteError ? "invite-email-error" : undefined}
                  className="min-w-0 flex-1"
                />
                <Button className="h-11 md:h-9" onClick={sendInvite} disabled={busy}>
                  {t.send}
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
                  <span className="min-w-0 truncate">{format(t.sent, { email: inviteSent })}</span>
                </p>
              )}
            </TabsContent>
            <TabsContent value="link" className="mt-4 space-y-2">
              {inviteUrl ? (
                <>
                  <Label htmlFor="invite-link">{t.linkLabel}</Label>
                  <div className="flex gap-2">
                    <Input id="invite-link" readOnly value={inviteUrl} className="min-w-0 flex-1" />
                    <Button variant="outline" onClick={() => void copyLink()}>
                      {linkCopied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {linkCopied ? t.copied : t.copy}
                    </Button>
                  </div>
                </>
              ) : (
                <Button className="h-11 md:h-9" onClick={() => void invite(null)} disabled={busy}>
                  {t.createLink}
                </Button>
              )}
              {linkError && <p className="text-sm text-destructive">{linkError}</p>}
              <p className="text-sm text-muted-foreground">{t.linkHint}</p>
              <p role="status" className="sr-only">
                {linkCopied ? t.linkCopied : ""}
              </p>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => closeInvite(false)}>
              {t.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
