import { Gift, HandHeart, Search, Tag, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Šapa pomoći (CAP-08) — listing types, categories and species, shared by S32–S37.
export type ListingType = "need" | "giving" | "selling" | "seeking"
export type ListingCategory = "food" | "equipment_toys" | "furniture" | "carriers" | "medicine_care" | "other"
export type ListingSpecies = "dog" | "cat" | "other"
export type ListingStatus = "active" | "resolved" | "expired" | "hidden"
export type ResolvedOutcome = "given" | "sold" | "donated" | "found"

const config: Record<ListingType, { label: string; icon: LucideIcon; surface: string }> = {
  need: { label: "Potreba", icon: HandHeart, surface: "bg-destructive-soft" },
  giving: { label: "Poklanjam", icon: Gift, surface: "bg-success-soft" },
  selling: { label: "Prodajem", icon: Tag, surface: "bg-warning-soft" },
  seeking: { label: "Tražim", icon: Search, surface: "bg-info-soft" },
}

export const listingTypeLabel: Record<ListingType, string> = {
  need: "Potreba",
  giving: "Poklanjam",
  selling: "Prodajem",
  seeking: "Tražim",
}

export const listingCategoryLabel: Record<ListingCategory, string> = {
  food: "Hrana",
  equipment_toys: "Oprema i igračke",
  furniture: "Nameštaj za ljubimce",
  carriers: "Transporteri",
  medicine_care: "Lekovi i nega",
  other: "Ostalo",
}

export const listingSpeciesLabel: Record<ListingSpecies, string> = {
  dog: "Psi",
  cat: "Mačke",
  other: "Ostale životinje",
}

// One outcome per type when the author marks a listing "Rešeno" (FR-64).
export const outcomeForType: Record<ListingType, { outcome: ResolvedOutcome; label: string }> = {
  need: { outcome: "donated", label: "Donirano" },
  giving: { outcome: "given", label: "Poklonjeno" },
  selling: { outcome: "sold", label: "Prodato" },
  seeking: { outcome: "found", label: "Pronađeno" },
}

/** Money format from Design §9: 2.500 RSD. */
export function formatRsd(amount: number) {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} RSD`
}

// Pastel type tag (Design v1.6 §6): existing status soft surfaces + the new `--info-soft`, always with
// `text-foreground` (≥ 11.5:1). Type is never colour-only — every tag carries an icon and its label.
// FR-35 (Step 28b): an optional `label` replaces the Serbian type label, so screens can pass the active dictionary.
export function ListingTypeTag({ type, className, label: labelOverride }: { type: ListingType; className?: string; label?: string }) {
  const { label: defaultLabel, icon: Icon, surface } = config[type]
  const label = labelOverride ?? defaultLabel
  return (
    <Badge className={cn("rounded-full border-transparent text-foreground", surface, className)}>
      <Icon aria-hidden />
      {label}
    </Badge>
  )
}
