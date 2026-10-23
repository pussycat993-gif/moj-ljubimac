"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Archive, CalendarDays, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { toast } from "@/components/ui/sonner"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import { PetAvatar, type PetSpecies } from "@/components/app/pet-avatar"
import { PremiumLock } from "@/components/app/premium-lock"
import { getFileUrls } from "@/lib/actions/files"
import { restorePetFromMemorial } from "@/lib/actions/memorial"
import type { PetSummary } from "@/lib/actions/pets"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S06 — Uspomene · /uspomene · FR-11, FR-12 · EP-01 (view:pet_summaries_api, lifecycle = memorial),
// EP-15 (pet photos), EP-43 (Entitlements, usage.free_slot_pet), EP-07 restore_pet_from_memorial
// ("Vrati među aktivne", reminders re-enabled). States: default / empty (no memorial rows) /
// premium_locked (Free and the active slot taken — checked before the call, and on
// premium_required) / error (EP-01 failed).

export type MemorialsCopy = Pick<Dictionary, "memorials" | "pet" | "common">

const AVATAR_SPECIES: Partial<Record<PetSummary["species"], PetSpecies>> = {
  cat: "cat",
  dog: "dog",
  rabbit: "rabbit",
  bird: "bird",
  fish: "fish",
  turtle: "turtle",
}

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** "YYYY-MM-DD" → sr-Latn "14. 6. 2026." · en-GB "14 Jun 2026" (Design §9). */
function formatDate(value: string, locale: Locale) {
  const [y, m, d] = value.split("-").map(Number)
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(new Date(y, m - 1, d))
}

/** "2022 – 2026": birth year – memorial year; hidden when the birth is unknown (owner decision). */
function yearsLabel(pet: PetSummary): string | null {
  const born = pet.birth_date ? Number(pet.birth_date.slice(0, 4)) : pet.birth_year
  if (!born || !pet.memorial) return null
  return `${born} – ${pet.memorial.date.slice(0, 4)}`
}

function MemorialCard({
  pet,
  photoUrl,
  busy,
  onRestore,
  locale,
  copy,
}: {
  pet: PetSummary
  photoUrl?: string
  busy: boolean
  onRestore: (p: PetSummary) => void
  locale: Locale
  copy: MemorialsCopy
}) {
  const t = copy.memorials
  const speciesLabel = pet.species === "other" && pet.species_other ? pet.species_other : copy.pet.species[pet.species]
  const years = yearsLabel(pet)
  // Sex unknown → masculine forms (owner decision, Steps 13–16).
  const reasons = pet.sex === "female" ? copy.pet.reasonFemale : copy.pet.reasonMale
  const memorial = pet.memorial
  return (
    <Card className="gap-4 bg-muted p-4 md:p-6" data-testid="memorial-card">
      <div className="flex min-w-0 items-center gap-4">
        <PetAvatar name={pet.name} sex="unknown" species={AVATAR_SPECIES[pet.species]} photoUrl={photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-lg font-bold">{pet.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{[speciesLabel, pet.breed].filter(Boolean).join(" · ")}</p>
          {years && <p className="text-sm text-muted-foreground">{years}</p>}
        </div>
      </div>
      {memorial && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {memorial.reason && <Badge variant="outline">{reasons[memorial.reason]}</Badge>}
          <span className="flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden />
            {formatDate(memorial.date, locale)}
          </span>
        </div>
      )}
      {memorial?.note && <p className="text-sm">{memorial.note}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 bg-card md:h-9" onClick={() => onRestore(pet)} disabled={busy}>
          <RotateCcw className="size-4" aria-hidden />
          {t.restore}
        </Button>
        <Button asChild variant="ghost" className="h-11 md:h-9">
          <Link href={`/ljubimci/${pet.id}`}>{t.viewRecord}</Link>
        </Button>
      </div>
    </Card>
  )
}

export function MemorialsClient({
  pets,
  memorialLimit,
  activePetLimit,
  activePets,
  slotPetName,
  locale,
  copy,
}: {
  /** EP-01 memorial rows (lifecycle = memorial), or null when the read failed. */
  pets: PetSummary[] | null
  /** Entitlements.limits.memorials: 2 on Free, null = unlimited. */
  memorialLimit: number | null
  /** Entitlements.limits.active_pets: 1 on Free, null = unlimited. */
  activePetLimit: number | null
  /** Me.usage.active_pets. */
  activePets: number
  /** Me.usage.free_slot_pet.name — the pet holding the Free active slot. */
  slotPetName: string | null
  locale: Locale
  copy: MemorialsCopy
}) {
  const t = copy.memorials
  const router = useRouter()
  // Restored pets leave the list at once; the next EP-01 read (router.refresh) agrees.
  const [restored, setRestored] = useState<string[]>([])
  const [blocked, setBlocked] = useState<PetSummary | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  // EP-15: pet photos render when their URLs arrive; until then the avatar shows the species icon.
  useEffect(() => {
    const withPhoto = (pets ?? []).filter((p) => p.has_photo).slice(0, 50)
    if (withPhoto.length === 0) return
    let cancelled = false
    getFileUrls({ items: withPhoto.map((p) => ({ kind: "pet_photo" as const, id: p.id })) })
      .then((result) => {
        if (cancelled || !result.ok) return
        setPhotoUrls(Object.fromEntries(result.data.flatMap((f) => (f.url ? [[f.id, f.url]] : []))))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pets])

  if (pets === null) {
    return <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} onRetry={() => router.refresh()} />
  }

  const isFree = memorialLimit !== null
  const list = pets.filter((p) => !restored.includes(p.id))

  /** EP-07 with reenable_reminders = true; on Free with the slot taken → PremiumLock (FR-12, E-03). */
  async function restore(pet: PetSummary) {
    if (activePetLimit !== null && activePets >= activePetLimit) {
      setBlocked(pet)
      return
    }
    setBusy(pet.id)
    const result = await restorePetFromMemorial({ pet_id: pet.id, reenable_reminders: true })
    setBusy(null)
    if (!result.ok) {
      if (result.error.code === "premium_required") {
        setBlocked(pet)
        router.refresh()
        return
      }
      toast.error(copy.common.error)
      return
    }
    setBlocked(null)
    setRestored((ids) => [...ids, pet.id])
    toast(format(t.restored, { name: pet.name }))
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="px-2">
          <Link href="/ljubimci">
            <ArrowLeft className="size-4" aria-hidden />
            {t.back}
          </Link>
        </Button>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
            <p className="text-sm text-muted-foreground">{t.subtitle}</p>
          </div>
          {list.length > 0 &&
            (isFree ? (
              <Badge variant="secondary">{format(t.freeCounter, { count: list.length, limit: memorialLimit })}</Badge>
            ) : (
              <Badge variant="outline" className="border-primary text-primary">
                {t.premiumBadge}
              </Badge>
            ))}
        </div>
      </div>

      {blocked && (
        <section aria-label={t.lockLabel}>
          <PremiumLock
            title={copy.common.premiumTitle}
            cta={copy.common.premiumCta}
            description={format(t.lockDescription, { slot: slotPetName ?? "", name: blocked.name })}
          />
        </section>
      )}

      {list.length === 0 ? (
        <EmptyState icon={Archive} title={t.emptyTitle} description={t.emptyDescription} action={t.back} href="/ljubimci" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <MemorialCard
              key={p.id}
              pet={p}
              photoUrl={photoUrls[p.id]}
              busy={busy === p.id}
              onRestore={restore}
              locale={locale}
              copy={copy}
            />
          ))}
        </div>
      )}
    </div>
  )
}
