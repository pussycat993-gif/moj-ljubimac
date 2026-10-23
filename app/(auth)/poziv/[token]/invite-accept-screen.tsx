"use client"

import { useState } from "react"
import Link from "next/link"
import { Bell, CalendarClock, Check, CircleX, Eye, Home, SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PetAvatar, type PetSex, type PetSpecies } from "@/components/app/pet-avatar"
import type { InvitationDecision, InvitationView } from "@/lib/actions/invitations"
import type { ActionResult } from "@/lib/server/result"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S14 — Prihvati poziv · /poziv/[token] · FR-26 — household variant (port of
// docs/product/04-design/screens/invite-accept.tsx without the StateSwitcher). Variants from EP-39 /
// EP-40 (API §7.3): household (pending), accepted, declined (invitation_declined), sign-in prompt
// (is_signed_in = false), expired (410 invitation_expired), error (404 / 5xx, and og_ / tr_ tokens until
// Steps 24–25), loading (the page's Suspense fallback). EP-40 409 / 403 answers are inline messages.

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

type Variant = "household" | "accepted" | "declined" | "signin" | "expired" | "error"

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
  return "household"
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
  const [inline, setInline] = useState<string | null>(() => {
    if (!view || !view.is_signed_in) return null
    if (view.status === "accepted" && !view.already_member) return t.used
    if (view.status === "pending" && view.already_member) return t.alreadyMember
    return null
  })

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
        setInline(t.alreadyMember)
        return
      case "household_full":
        setInline(t.full)
        return
      case "household_read_only":
        setInline(t.readOnly)
        return
      default:
        setInline(copy.common.error)
    }
  }

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

      {/* Accepted confirmation */}
      {variant === "accepted" && (
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
          <p className="text-sm text-muted-foreground">{format(t.declinedBody, { household: householdName })}</p>
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
              <Home className="size-4" aria-hidden />
              <span>{t.householdKicker}</span>
            </div>
            <h1 className="font-heading text-[28px] leading-9 font-bold">
              {format(t.signInTitle, { household: householdName })}
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
          <p className="text-sm text-muted-foreground">{t.expiredBody}</p>
          <Separator />
          <Button variant="outline" className="h-11 w-full md:h-9" asChild>
            <Link href="/ljubimci">{t.goHome}</Link>
          </Button>
        </Card>
      )}

      {/* Error — unknown token, 5xx, or an og_ / tr_ token before Steps 24–25 */}
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
