import Link from "next/link"
import { Building2, ImageIcon, MapPin } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  ListingTypeTag,
  formatRsd,
  listingCategoryLabel,
  listingSpeciesLabel,
  listingTypeLabel,
  type ListingCategory,
  type ListingSpecies,
  type ListingType,
} from "@/components/app/listing-type-tag"

export type ListingSummary = {
  id: string
  type: ListingType
  title: string
  city: string
  category: ListingCategory
  species: ListingSpecies
  /** Selling only: amount in RSD, or `negotiable` → "Po dogovoru". */
  priceRsd?: number
  negotiable?: boolean
  /** Display name (nickname or "Ime P."), or the shelter name for needs. */
  author: string
  authorIsShelter?: boolean
  publishedOn: string
  photoCount: number
}

// labels:start — FR-35 (Step 28b): every visible string of the card, defaulting to today's Serbian copy; the app
// passes the dictionary's labels (and Intl formatters). `coverUrl` shows the listing's signed cover photo in place
// of the placeholder.
export type ListingCardLabels = {
  negotiable: string
  free: string
  /** "N fotografije" badge (shown for more than one photo). */
  photos: (count: number) => string
  formatPrice: (amountRsd: number) => string
  type: Record<ListingType, string>
  category: Record<ListingCategory, string>
  species: Record<ListingSpecies, string>
}

export const defaultListingCardLabels: ListingCardLabels = {
  negotiable: "Po dogovoru",
  free: "Besplatno",
  photos: (count) => `${count} fotografije`,
  formatPrice: formatRsd,
  type: listingTypeLabel,
  category: listingCategoryLabel,
  species: listingSpeciesLabel,
}
// labels:end

export function listingPriceLine(
  l: Pick<ListingSummary, "type" | "priceRsd" | "negotiable">,
  labels: ListingCardLabels = defaultListingCardLabels,
) {
  if (l.type === "selling") return l.negotiable || l.priceRsd === undefined ? labels.negotiable : labels.formatPrice(l.priceRsd)
  if (l.type === "giving") return labels.free
  return null
}

// One listing in the Šapa pomoći grid (S32, S37). The whole card is the link to S33; photos are placeholders
// in the mock (no external images). Grid: `grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3`.
export function ListingCard({
  listing,
  className,
  labels = defaultListingCardLabels,
  coverUrl,
}: {
  listing: ListingSummary
  className?: string
  labels?: ListingCardLabels
  coverUrl?: string | null
}) {
  const price = listingPriceLine(listing, labels)
  return (
    <Card className={cn("relative gap-0 overflow-hidden py-0 hover:shadow-soft", className)}>
      <div className="relative flex aspect-[4/3] items-center justify-center bg-foreground/5">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URLs, not optimisable
          <img src={coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
        )}
        <ListingTypeTag type={listing.type} label={labels.type[listing.type]} className="absolute top-3 left-3" />
        {listing.photoCount > 1 && (
          <span className="absolute right-3 bottom-3 rounded-full bg-card px-2 text-xs font-medium">
            {labels.photos(listing.photoCount)}
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-1 p-4">
        <Link
          href={`/sapa-pomoci/${listing.id}`}
          className="line-clamp-2 font-heading text-lg font-bold after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {listing.title}
        </Link>
        {price && <p className="text-base font-medium">{price}</p>}
        <p className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {listing.city} · {labels.category[listing.category]} · {labels.species[listing.species]}
          </span>
        </p>
        <p className="flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">
          {listing.authorIsShelter && <Building2 className="size-3.5 shrink-0" aria-hidden />}
          <span className="truncate">
            {listing.author} · {listing.publishedOn}
          </span>
        </p>
      </div>
    </Card>
  )
}
