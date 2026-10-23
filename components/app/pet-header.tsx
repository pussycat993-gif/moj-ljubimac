import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { PetAvatar, type PetSex, type PetSpecies } from "@/components/app/pet-avatar"

// labels:start — FR-35: the chip list's accessible name, defaulting to today's Serbian copy; the app passes the dictionary's label.
export type PetHeaderLabels = { chips: string }

export const defaultPetHeaderLabels: PetHeaderLabels = { chips: "Osnovni podaci" }
// labels:end

// Large pastel pet header (design v1.4). The whole top block is the pet's soft accent:
// avatar on a white circle, name in the deep accent, "breed · age" subtitle, chips
// (sex, neutered…) as white pills, optional `meta` line (e.g. microchip). Actions sit below
// on the card surface. Text on the soft tone is only the deep accent or foreground/muted-foreground
// (computed ≥ 4.9:1).
export function PetHeader({
  name,
  sex,
  species,
  photoUrl,
  subtitle,
  chips,
  meta,
  actions,
  labels = defaultPetHeaderLabels,
}: {
  name: string
  sex: PetSex
  species?: PetSpecies
  photoUrl?: string
  subtitle: string
  chips?: string[]
  meta?: ReactNode
  actions?: ReactNode
  labels?: PetHeaderLabels
}) {
  return (
    <Card data-pet-sex={sex} className="gap-0 overflow-hidden py-0">
      <div className="flex min-w-0 flex-col gap-4 bg-pet-accent-soft p-4 md:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <PetAvatar name={name} sex={sex} species={species} photoUrl={photoUrl} size="lg" onSoft />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-[28px] leading-9 font-bold text-pet-accent">{name}</h1>
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            {chips && chips.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label={labels.chips}>
                {chips.map((c) => (
                  <li key={c} className="rounded-full bg-card px-3 py-1 text-xs font-medium text-pet-accent">
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {meta && <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 border-t border-border p-4 md:px-6">{actions}</div>}
    </Card>
  )
}
