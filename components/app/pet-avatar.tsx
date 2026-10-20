import { Bird, Cat, Dog, Fish, Rabbit, Turtle, type LucideIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export type PetSex = "female" | "male" | "unknown"
export type PetSpecies = "cat" | "dog" | "rabbit" | "bird" | "fish" | "turtle" | "other"

const sizes = { sm: "size-8", md: "size-12", lg: "size-20" } as const
const textSizes = { sm: "text-sm", md: "text-base", lg: "text-[28px]" } as const
const iconSizes = { sm: "size-4", md: "size-6", lg: "size-10" } as const // size-10 = avatar-only icon step (Design §7)

const speciesIcon: Partial<Record<PetSpecies, LucideIcon>> = {
  cat: Cat,
  dog: Dog,
  rabbit: Rabbit,
  bird: Bird,
  fish: Fish,
  turtle: Turtle,
}

// Photo → species icon → first initial, always in the deep pet accent.
// Circle is the soft accent; with `onSoft` (avatar inside a pastel block such as PetHeader
// or the pets-home card top) the circle is white (bg-card) so it stays visible.
export function PetAvatar({
  name,
  sex = "unknown",
  species,
  photoUrl,
  size = "md",
  ring = false,
  onSoft = false,
  className,
}: {
  name: string
  sex?: PetSex
  species?: PetSpecies
  photoUrl?: string
  size?: keyof typeof sizes
  ring?: boolean
  onSoft?: boolean
  className?: string
}) {
  const Icon = species ? speciesIcon[species] : undefined
  return (
    <span data-pet-sex={sex} className="inline-flex shrink-0">
      <Avatar
        className={cn(
          sizes[size],
          ring && "ring-2 ring-pet-accent ring-offset-2",
          ring && (onSoft ? "ring-offset-pet-accent-soft" : "ring-offset-card"),
          className,
        )}
      >
        {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
        <AvatarFallback
          className={cn("font-heading font-bold text-pet-accent", onSoft ? "bg-card" : "bg-pet-accent-soft", textSizes[size])}
        >
          {Icon ? (
            <>
              <Icon className={iconSizes[size]} aria-hidden />
              <span className="sr-only">{name}</span>
            </>
          ) : (
            name.charAt(0).toUpperCase()
          )}
        </AvatarFallback>
      </Avatar>
    </span>
  )
}
