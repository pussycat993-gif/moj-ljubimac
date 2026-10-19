import { Bell, Cake, Droplet, Stethoscope, Syringe, UtensilsCrossed, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PetSex } from "./pet-avatar"

export type ReminderType = "treatment_dose" | "vaccination" | "vet_follow_up" | "meal" | "birthday" | "manual"

const typeIcon: Record<ReminderType, LucideIcon> = {
  treatment_dose: Droplet,
  vaccination: Syringe,
  vet_follow_up: Stethoscope,
  meal: UtensilsCrossed,
  birthday: Cake,
  manual: Bell,
}

export const reminderTypeLabel: Record<ReminderType, string> = {
  treatment_dose: "Doza terapije",
  vaccination: "Vakcina",
  vet_follow_up: "Kontrola",
  meal: "Obrok",
  birthday: "Rođendan",
  manual: "Moj podsetnik",
}

const sizes = { sm: "size-8", md: "size-12" } as const
const iconSizes = { sm: "size-4", md: "size-5" } as const

// Square tile with the reminder-type icon. Pet reminders: deep accent on the pet's soft accent
// (pass `sex`). "Za mene" reminders (no pet): neutral `bg-foreground/5` tile.
export function ReminderTypeIcon({
  type = "manual",
  sex,
  forMe = false,
  size = "sm",
  className,
}: {
  type?: ReminderType
  sex?: PetSex
  forMe?: boolean
  size?: keyof typeof sizes
  className?: string
}) {
  const Icon = typeIcon[type]
  return (
    <span
      data-pet-sex={forMe ? undefined : (sex ?? "unknown")}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-sm",
        forMe ? "bg-foreground/5 text-muted-foreground" : "bg-pet-accent-soft text-pet-accent",
        sizes[size],
        className,
      )}
    >
      <Icon className={iconSizes[size]} aria-hidden />
      <span className="sr-only">{reminderTypeLabel[type]}</span>
    </span>
  )
}
