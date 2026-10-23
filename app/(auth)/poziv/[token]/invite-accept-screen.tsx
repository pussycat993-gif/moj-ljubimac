"use client"

import { useState, type MouseEvent } from "react"
import Link from "next/link"
import {
  Bell,
  CalendarClock,
  Check,
  CircleX,
  ClipboardList,
  Eye,
  FileText,
  Home,
  Paperclip,
  SearchX,
  Syringe,
  UserRound,
  Users,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PetAvatar, type PetSex, type PetSpecies } from "@/components/app/pet-avatar"
import { PremiumLock } from "@/components/app/premium-lock"
import type { InvitationDecision, InvitationView } from "@/lib/actions/invitations"
import type { TransferView } from "@/lib/actions/transfers"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S14 — Prihvati poziv · /poziv/[token] · FR-26, FR-43 — household variant (Step 22) and team-invitation
// variant (Step 24, CR-18; the team / teamAdmin views) of docs/product/04-design/screens/invite-accept.tsx
// without the StateSwitcher. Variants from EP-39 / EP-40 (API §7.3): household or team (pending, chosen by
// InvitationView.kind), accepted, declined (invitation_declined), sign-in prompt (is_signed_in = false),
// expired (410 invitation_expired), error (404 / 5xx; tr_ tokens render TransferAcceptScreen below, Step 25), loading (the page's
// Suspense fallback). EP-40 409 / 403 answers are inline messages.

export type InvitationCopy = {
  invitation: Dictionary["invitation"]
  pet: Dictionary["pet"]
  common: Dictionary["common"]
}

export type InvitationActions = {
  decideHouseholdInvitation: (input: {
    token: string
    decision: "accept" | "decline"
  }) => Promise<ActionResult<InvitationDecision>>
}

type Variant = "household" | "team" | "accepted" | "declined" | "signin" | "expired" | "error"

const SPECIES: PetSpecies[] = ["cat", "dog", "rabbit", "bird", "fish", "turtle", "other"]

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

function SignedInAs({ user, label }: { user: { name: string; email: string }; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
      <Avatar className="size-8">
        <AvatarFallback className="bg-muted text-xs text-foreground">{initialsOf(user.name || user.email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name || user.email}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <Button variant="link" size="sm" className="shrink-0 px-0" asChild>
        <Link href="/prijava">{label}</Link>
      </Button>
    </div>
  )
}

/** S14 loading variant (L). */
export function InvitationLoading({ label }: { label: string }) {
  return (
    <Card className="gap-4 p-4 md:p-6" aria-busy="true" aria-label={label}>
      <h1 className="sr-only">{label}</h1>
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-11 w-full md:h-9" />
    </Card>
  )
}

function initialVariant(initial: ActionResult<InvitationView>): Variant {
  if (!initial.ok) return initial.error.code === "invitation_expired" ? "expired" : "error"
  const v = initial.data
  if (!v.is_signed_in) return "signin"
  if (v.status === "declined") return "declined"
  if (v.status === "accepted" && v.already_member) return "accepted"
  return v.kind === "organisation" ? "team" : "household"
}

export function InviteAcceptScreen({
  token,
  initial,
  user,
  locale,
  copy,
  actions,
}: {
  token: string
  initial: ActionResult<InvitationView>
  /** The signed-in user (EP-43), null for a Visitor. */
  user: { name: string; email: string } | null
  locale: Locale
  copy: InvitationCopy
  actions: InvitationActions
}) {
  const t = copy.invitation
  const [variant, setVariant] = useState<Variant>(() => initialVariant(initial))
  const [busy, setBusy] = useState(false)
  const view = initial.ok ? initial.data : null
  // Team invitations (og_, Step 24): the kind comes from EP-39, or from the token prefix when EP-39 answered 410.
  const isTeam = view ? view.kind === "organisation" : token.startsWith("og_")
  const [inline, setInline] = useState<string | null>(() => {
    if (!view || !view.is_signed_in) return null
    if (view.status === "accepted" && !view.already_member) return t.used
    if (view.status === "pending" && view.already_member && view.kind !== "organisation") return t.alreadyMember
    return null
  })
  // A current team member opening a pending team invitation (or EP-40 already_member): no buttons, a link to S20.
  const [teamMember, setTeamMember] = useState<boolean>(
    () => !!view && view.kind === "organisation" && view.status === "pending" && view.already_member === true,
  )

  const householdName = view?.household_name ?? ""
  const pets = view?.shared_pets ?? []
  const listFormat = new Intl.ListFormat(locale === "en" ? "en-GB" : "sr-Latn", { type: "conjunction" })
  const ownerFirstName = (view?.inviter_name ?? "").split(/\s+/).filter(Boolean)[0] ?? ""

  async function decide(decision: "accept" | "decline") {
    setBusy(true)
    const result = await actions.decideHouseholdInvitation({ token, decision })
    setBusy(false)
    if (result.ok) {
      setInline(null)
      setVariant(result.data.status === "accepted" ? "accepted" : "declined")
      return
    }
    switch (result.error.code) {
      case "unauthenticated":
        setVariant("signin")
        return
      case "invitation_expired":
        setVariant("expired")
        return
      case "not_found":
        setVariant("error")
        return
      case "invitation_used":
        setInline(t.used)
        return
      case "already_member":
        if (isTeam) {
          setInline(null)
          setTeamMember(true)
        } else {
          setInline(t.alreadyMember)
        }
        return
      case "household_full":
        setInline(t.full)
        return
      case "team_full":
        setInline(copy.common.error)
        return
      case "household_read_only":
        setInline(t.readOnly)
        return
      default:
        setInline(copy.common.error)
    }
  }

  const organisationName = view?.organisation_name ?? ""
  const roleLabel = view?.role === "admin" ? t.roleAdmin : t.roleVolunteer
  const cityName = view?.inviter_city
    ? locale === "en"
      ? view.inviter_city.name_en || view.inviter_city.name_sr
      : view.inviter_city.name_sr
    : null
  const teamDetails = [
    view?.organisation_type === "breeder" ? t.orgTypeBreeder : view?.organisation_type === "shelter" ? t.orgTypeShelter : null,
    cityName,
  ]
    .filter(Boolean)
    .join(" · ")
  const validUntil = view
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "sr-Latn", {
        day: "numeric",
        month: locale === "en" ? "short" : "numeric",
        year: "numeric",
        timeZone: "Europe/Belgrade",
      }).format(new Date(view.expires_at))
    : ""
  const teamCan =
    view?.role === "admin" ? [t.adminCan1, t.adminCan2, t.adminCan3] : [t.volunteerCan1, t.volunteerCan2, t.volunteerCan3]

  function acceptedBody() {
    if (pets.length === 0) return t.acceptedBodyNoPets
    const rule = new Intl.PluralRules(locale === "en" ? "en-GB" : "sr-Latn").select(pets.length)
    const key = rule === "one" ? "acceptedBody_one" : rule === "few" ? "acceptedBody_few" : "acceptedBody_other"
    return format(t[key], { pets: listFormat.format(pets.map((p) => p.name)) })
  }

  return (
    <>
      {/* Household invitation (FR-26) */}
      {variant === "household" && view && (
        <Card className="gap-6 p-4 md:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Home className="size-4" aria-hidden />
              <span>{t.householdKicker}</span>
            </div>
            <h1 className="font-heading text-[28px] leading-9 font-bold">{householdName}</h1>
            {view.inviter_name && (
              <p className="text-sm text-muted-foreground">{format(t.invitedBy, { name: view.inviter_name })}</p>
            )}
            <p className="text-sm text-muted-foreground">{t.intro}</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">{t.sharedPets}</p>
            <ul className="space-y-2">
              {pets.map((p) => (
                <li key={p.name} className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
                  <PetAvatar name={p.name} sex={p.sex as PetSex} species={avatarSpecies(p.species)} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[copy.pet.species[p.species as keyof Dictionary["pet"]["species"]] ?? p.species, p.breed]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {view.member_count !== null && view.member_limit !== null && (
              <p className="text-xs text-muted-foreground">
                {format(t.members, { n: view.member_count, limit: view.member_limit })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t.canTitle}</p>
            <ul className="space-y-2 text-sm">
              {[t.canWeight, t.canDoses, t.canMoments].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-muted-foreground">
                <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{format(t.viewOnly, { owner: ownerFirstName })}</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <Bell className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{t.remindersOff}</span>
              </li>
            </ul>
          </div>

          {user && <SignedInAs user={user} label={t.notYou} />}

          {inline && (
            <p role="alert" className="text-sm text-destructive">
              {inline}
            </p>
          )}

          {view.status === "pending" && !view.already_member && (
            <div className="flex flex-col gap-2 md:flex-row-reverse">
              <Button className="h-11 md:h-9 md:flex-1" disabled={busy} onClick={() => void decide("accept")}>
                {t.accept}
              </Button>
              <Button
                variant="outline"
                className="h-11 md:h-9 md:flex-1"
                disabled={busy}
                onClick={() => void decide("decline")}
              >
                {t.decline}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Organisation team invitation (CR-18) — the invitee keeps their own account type (BR-53) */}
      {variant === "team" && view && (
        <Card className="gap-6 p-4 md:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" aria-hidden />
              <span>{t.teamKicker}</span>
            </div>
            <h1 className="font-heading text-[28px] leading-9 font-bold">{organisationName}</h1>
            {view.inviter_name ? (
              <p className="text-sm text-muted-foreground">
                {teamDetails
                  ? format(t.teamSubtitle, { details: teamDetails, name: view.inviter_name })
                  : format(t.invitedBy, { name: view.inviter_name })}
              </p>
            ) : (
              teamDetails && <p className="text-sm text-muted-foreground">{teamDetails}</p>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card">
              <UserRound className="size-5 text-primary" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">{t.yourRole}</p>
              <p className="truncate font-heading text-lg font-bold">{roleLabel}</p>
            </div>
            {view.member_count !== null && view.member_limit !== null && (
              <p className="shrink-0 text-xs font-medium text-muted-foreground">
                {format(t.members, { n: view.member_count, limit: view.member_limit })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {view.role === "admin" ? t.teamCanAdmin : t.teamCanVolunteer}
            </p>
            <ul className="space-y-2 text-sm">
              {teamCan.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-muted-foreground">
                <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{view.role === "admin" ? t.adminCannot : t.volunteerCannot}</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <Home className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{t.keepAccount}</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{format(t.validUntil, { date: validUntil })}</span>
              </li>
            </ul>
          </div>

          {user && <SignedInAs user={user} label={t.notYou} />}

          {inline && (
            <p role="alert" className="text-sm text-destructive">
              {inline}
            </p>
          )}

          {teamMember ? (
            <Button className="h-11 w-full md:h-9" asChild>
              <Link href="/organizacija">{t.goToOrganisation}</Link>
            </Button>
          ) : (
            view.status === "pending" && (
              <div className="flex flex-col gap-2 md:flex-row-reverse">
                <Button className="h-11 md:h-9 md:flex-1" disabled={busy} onClick={() => void decide("accept")}>
                  {t.joinTeam}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 md:h-9 md:flex-1"
                  disabled={busy}
                  onClick={() => void decide("decline")}
                >
                  {t.decline}
                </Button>
              </div>
            )
          )}
        </Card>
      )}

      {/* Accepted confirmation — team */}
      {variant === "accepted" && isTeam && (
        <Card className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <Check className="size-6 text-primary" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">
            {format(t.teamAcceptedTitle, { organisation: organisationName })}
          </h1>
          <p className="text-sm text-muted-foreground">{format(t.teamAcceptedBody, { role: roleLabel })}</p>
          <Button className="h-11 w-full md:h-9" asChild>
            <Link href="/organizacija">{t.goToOrganisation}</Link>
          </Button>
        </Card>
      )}

      {/* Accepted confirmation */}
      {variant === "accepted" && !isTeam && (
        <Card className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <Check className="size-6 text-primary" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">
            {format(t.acceptedTitle, { household: householdName })}
          </h1>
          <p className="text-sm text-muted-foreground">{acceptedBody()}</p>
          <Button className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">{t.goToPets}</Link>
          </Button>
        </Card>
      )}

      {/* Declined */}
      {variant === "declined" && (
        <Card role="status" className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <CircleX className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.declinedTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {isTeam
              ? format(t.teamDeclinedBody, { organisation: organisationName })
              : format(t.declinedBody, { household: householdName })}
          </p>
          <Separator />
          <Button variant="outline" className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">{t.goHome}</Link>
          </Button>
        </Card>
      )}

      {/* Not signed in — must sign in or register first (FR-26) */}
      {variant === "signin" && (
        <Card className="gap-6 p-4 md:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isTeam ? <Users className="size-4" aria-hidden /> : <Home className="size-4" aria-hidden />}
              <span>{isTeam ? t.teamKicker : t.householdKicker}</span>
            </div>
            <h1 className="font-heading text-[28px] leading-9 font-bold">
              {isTeam
                ? format(t.teamSignInTitle, { organisation: organisationName })
                : format(t.signInTitle, { household: householdName })}
            </h1>
            <p className="text-sm text-muted-foreground">{t.signInBody}</p>
          </div>
          {view?.inviter_name && (
            <div className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
              <p className="min-w-0 truncate text-sm">{format(t.invitedBy, { name: view.inviter_name })}</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button className="h-11 md:h-9" asChild>
              <Link href="/registracija">{t.createAccount}</Link>
            </Button>
            <Button variant="outline" className="h-11 md:h-9" asChild>
              <Link href={`/prijava?next=${encodeURIComponent(`/poziv/${token}`)}`}>{t.signIn}</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Expired (E-19) */}
      {variant === "expired" && (
        <Card className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <CalendarClock className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.expiredTitle}</h1>
          <p className="text-sm text-muted-foreground">{isTeam ? t.linkExpiredBody : t.expiredBody}</p>
          <Separator />
          <Button variant="outline" className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">{t.goHome}</Link>
          </Button>
        </Card>
      )}

      {/* Error — unknown token or 5xx */}
      {variant === "error" && (
        <Card role="alert" className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <SearchX className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.notFoundTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.notFoundBody}</p>
          <Separator />
          <Button variant="outline" className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">{t.goHome}</Link>
          </Button>
        </Card>
      )}
    </>
  )
}

// S14 record-transfer variants (Step 25, FR-50, FR-51; invite-accept.tsx transfer / slot views) for tr_ tokens.
// From EP-60 (API §7.3): transfer (pending), accepted (ok with status accepted and new_pet_id), declined
// (invitation_declined), sign-in (no session; accept / decline answer 401), expired (410 invitation_expired, the
// "link no longer works" copy for every non-household kind, Step 24), slot taken (403 premium_required with
// details.limit = transfer_slot → PremiumLock naming details.slot_pet_name), error (404 / 5xx). invitation_used and
// forbidden_role (BR-33) are inline messages.

export type TransferCopy = {
  invitation: Dictionary["invitation"]
  pet: Dictionary["pet"]
  common: Dictionary["common"]
}

export type TransferActions = {
  acceptTransfer: (input: { token: string }) => Promise<ActionResult<TransferView>>
  declineTransfer: (input: { token: string }) => Promise<ActionResult<TransferView>>
}

type TransferVariant = "transfer" | "accepted" | "declined" | "signin" | "expired" | "slot" | "error"

const transferIntl = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

function transferPlural(t: Record<string, unknown>, base: string, n: number, locale: Locale) {
  const rule = new Intl.PluralRules(transferIntl(locale)).select(n)
  const key = `${base}_${rule === "one" || rule === "few" ? rule : "other"}`
  return format(String(t[key]), { n })
}

/** The animal's age: the organisation's approximate age, else from the birth date (Step 13 rule). */
function transferAge(animal: TransferView["animal"], t: Dictionary["pet"], locale: Locale): string | null {
  if (animal.approx_age_text) return animal.approx_age_text
  if (!animal.birth_date) return null
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" })
    .format(new Date())
    .split("-")
    .map(Number)
  const [by, bm, bd] = animal.birth_date.split("-").map(Number)
  const months = Math.max(0, (year - by) * 12 + (month - bm) - (day < bd ? 1 : 0))
  return months >= 12
    ? transferPlural(t, "years", Math.floor(months / 12), locale)
    : transferPlural(t, "months", months, locale)
}

function TransferAnimalCard({ view, copy, locale }: { view: TransferView; copy: TransferCopy; locale: Locale }) {
  const t = copy.invitation
  const a = view.animal
  const species =
    a.species === "other" && a.species_other
      ? a.species_other
      : (copy.pet.species[a.species as keyof Dictionary["pet"]["species"]] ?? a.species)
  const detail = [[species, a.breed].filter(Boolean).join(" · "), transferAge(a, copy.pet, locale)]
    .filter(Boolean)
    .join(" · ")
  const includes = [
    { icon: Syringe, label: transferPlural(t, "vaccinations", view.counts.vaccinations, locale) },
    { icon: ClipboardList, label: transferPlural(t, "visits", view.counts.vet_visits, locale) },
    { icon: Paperclip, label: transferPlural(t, "attachments", view.counts.attachments, locale) },
  ]
  return (
    <div data-pet-sex={a.sex} className="overflow-hidden rounded-md border border-border bg-card">
      <div className="h-3 bg-pet-accent-soft" aria-hidden />
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <PetAvatar
            name={a.name}
            sex={a.sex as PetSex}
            species={avatarSpecies(a.species)}
            photoUrl={a.photo_url?.url ?? undefined}
            size="md"
            ring
          />
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-bold">{a.name}</p>
            {detail && <p className="truncate text-sm text-muted-foreground">{detail}</p>}
            {a.microchip_number && (
              <p className="truncate text-xs text-muted-foreground">{format(t.microchip, { n: a.microchip_number })}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {includes.map((item) => {
            const Icon = item.icon
            return (
              <span
                key={item.label}
                className="inline-flex items-center gap-1 rounded-sm bg-foreground/5 px-2 py-1 text-xs font-medium"
              >
                <Icon className="size-3.5 text-pet-accent" aria-hidden />
                {item.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function initialTransferVariant(initial: ActionResult<TransferView>, signedIn: boolean): TransferVariant {
  if (!initial.ok) return initial.error.code === "invitation_expired" ? "expired" : "error"
  const v = initial.data
  if (v.status === "declined") return "declined"
  if (v.status === "accepted" && v.new_pet_id) return "accepted"
  if (!signedIn && v.status === "pending") return "signin"
  return "transfer"
}

/** S14 for tr_ tokens (EP-60). */
export function TransferAcceptScreen({
  token,
  initial,
  user,
  locale,
  copy,
  actions,
}: {
  token: string
  initial: ActionResult<TransferView>
  /** The signed-in user (EP-43), null for a Visitor. */
  user: { name: string; email: string } | null
  locale: Locale
  copy: TransferCopy
  actions: TransferActions
}) {
  const t = copy.invitation
  const router = useRouter()
  const [view, setView] = useState<TransferView | null>(initial.ok ? initial.data : null)
  const [variant, setVariant] = useState<TransferVariant>(() => initialTransferVariant(initial, user !== null))
  const [busy, setBusy] = useState(false)
  const [slotPet, setSlotPet] = useState("")
  const [inline, setInline] = useState<string | null>(() =>
    initial.ok && initial.data.status === "accepted" && !initial.data.new_pet_id ? t.transferUsed : null,
  )

  const petName = view?.animal.name ?? ""
  const organisationName = view?.organisation.name ?? ""
  const city = view?.organisation.city
    ? locale === "en"
      ? view.organisation.city.name_en || view.organisation.city.name_sr
      : view.organisation.city.name_sr
    : null
  const validUntil = view
    ? new Intl.DateTimeFormat(transferIntl(locale), {
        day: "numeric",
        month: locale === "en" ? "short" : "numeric",
        year: "numeric",
        timeZone: "Europe/Belgrade",
      }).format(new Date(view.expires_at))
    : ""

  async function decide(decision: "accept" | "decline") {
    setBusy(true)
    const result = decision === "accept" ? await actions.acceptTransfer({ token }) : await actions.declineTransfer({ token })
    setBusy(false)
    if (result.ok) {
      setInline(null)
      setView(result.data)
      setVariant(result.data.status === "accepted" ? "accepted" : "declined")
      return
    }
    switch (result.error.code) {
      case "unauthenticated":
        setVariant("signin")
        return
      case "invitation_expired":
        setVariant("expired")
        return
      case "not_found":
        setVariant("error")
        return
      case "invitation_used":
        setInline(t.transferUsed)
        return
      case "forbidden_role":
        setInline(t.transferForbidden)
        return
      case "premium_required":
        if (result.error.details?.limit === "transfer_slot") {
          setSlotPet(String(result.error.details?.slot_pet_name ?? ""))
          setInline(null)
          setVariant("slot")
          return
        }
        setInline(copy.common.error)
        return
      default:
        setInline(copy.common.error)
    }
  }

  // PremiumLock's CTA opens the Premium page (owner decision, Step 22).
  function openPremium(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) router.push("/premium")
  }

  const kicker = (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <FileText className="size-4" aria-hidden />
      <span>{t.transferKicker}</span>
    </div>
  )

  return (
    <>
      {/* Record transfer from an organisation (FR-50) */}
      {variant === "transfer" && view && (
        <Card className="gap-6 p-4 md:p-6">
          <div className="space-y-2">
            {kicker}
            <h1 className="font-heading text-[28px] leading-9 font-bold">{format(t.transferTitle, { pet: petName })}</h1>
            <p className="text-sm text-muted-foreground">
              {city
                ? format(t.transferIntro, { organisation: organisationName, city })
                : format(t.transferIntroNoCity, { organisation: organisationName })}
            </p>
          </div>

          <TransferAnimalCard view={view} copy={copy} locale={locale} />

          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">{format(t.transferKeepsCopy, { organisation: organisationName })}</span>
            </li>
            <li className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">{format(t.validUntil, { date: validUntil })}</span>
            </li>
          </ul>

          {user && <SignedInAs user={user} label={t.notYou} />}

          {inline && (
            <p role="alert" className="text-sm text-destructive">
              {inline}
            </p>
          )}

          {view.status === "pending" && (
            <div className="flex flex-col gap-2 md:flex-row-reverse">
              <Button className="h-11 md:h-9 md:flex-1" disabled={busy} onClick={() => void decide("accept")}>
                {t.acceptRecord}
              </Button>
              <Button
                variant="outline"
                className="h-11 md:h-9 md:flex-1"
                disabled={busy}
                onClick={() => void decide("decline")}
              >
                {t.decline}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Accepted confirmation */}
      {variant === "accepted" && (
        <Card className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <Check className="size-6 text-primary" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">
            {format(t.transferAcceptedTitle, { pet: petName })}
          </h1>
          <p className="text-sm text-muted-foreground">{t.transferAcceptedBody}</p>
          <Button className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">{t.goToPets}</Link>
          </Button>
        </Card>
      )}

      {/* Declined */}
      {variant === "declined" && (
        <Card role="status" className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <CircleX className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.transferDeclinedTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {format(t.transferDeclinedBody, { pet: petName, organisation: organisationName })}
          </p>
          <Separator />
          <Button variant="outline" className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">{t.goHome}</Link>
          </Button>
        </Card>
      )}

      {/* Not signed in — must sign in or register first */}
      {variant === "signin" && (
        <Card className="gap-6 p-4 md:p-6">
          <div className="space-y-2">
            {kicker}
            <h1 className="font-heading text-[28px] leading-9 font-bold">{format(t.transferTitle, { pet: petName })}</h1>
            <p className="text-sm text-muted-foreground">{t.signInBody}</p>
          </div>
          {view && <TransferAnimalCard view={view} copy={copy} locale={locale} />}
          <div className="flex flex-col gap-2">
            <Button className="h-11 md:h-9" asChild>
              <Link href="/registracija">{t.createAccount}</Link>
            </Button>
            <Button variant="outline" className="h-11 md:h-9" asChild>
              <Link href={`/prijava?next=${encodeURIComponent(`/poziv/${token}`)}`}>{t.signIn}</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Free slot taken (FR-51, E-20) */}
      {variant === "slot" && view && (
        <div className="space-y-4">
          <Card className="gap-4 p-4 md:p-6">
            <div className="space-y-2">
              {kicker}
              <h1 className="font-heading text-[28px] leading-9 font-bold">{format(t.slotTitle, { pet: petName })}</h1>
              <p className="text-sm text-muted-foreground">{format(t.slotBody, { slot: slotPet })}</p>
            </div>
            <TransferAnimalCard view={view} copy={copy} locale={locale} />
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">{format(t.slotValidUntil, { date: validUntil })}</span>
            </p>
          </Card>
          <div onClick={openPremium}>
            <PremiumLock title={copy.common.premiumTitle} cta={copy.common.premiumCta} description={t.slotPremium} />
          </div>
        </div>
      )}

      {/* Expired (E-19) */}
      {variant === "expired" && (
        <Card className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <CalendarClock className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.expiredTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.linkExpiredBody}</p>
          <Separator />
          <Button variant="outline" className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">{t.goHome}</Link>
          </Button>
        </Card>
      )}

      {/* Error — unknown token or 5xx */}
      {variant === "error" && (
        <Card role="alert" className="items-center gap-4 p-6 text-center md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
            <SearchX className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.notFoundTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.notFoundBody}</p>
          <Separator />
          <Button variant="outline" className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">{t.goHome}</Link>
          </Button>
        </Card>
      )}
    </>
  )
}
