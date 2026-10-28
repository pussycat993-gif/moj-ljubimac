import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { City, Me } from "@/lib/actions/registration"
import {
  changeListing,
  saveListing,
  type Listing,
  type ListingPhoto,
  type MarketplaceStatus,
} from "@/lib/actions/listings"
import { getFileUrls } from "@/lib/actions/files"
import { confirmUpload, requestUpload } from "@/lib/actions/uploads"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ListingFormClient } from "../../nova/listing-form-client"

export const dynamic = "force-dynamic"

/** Me with the Step 28b fields (EP-43 `display_name`, `marketplace`). */
type SapaMe = Me & { display_name: string | null; marketplace: MarketplaceStatus }
type RawListing = Omit<Listing, "photos"> & { photos: (ListingPhoto & { r2_key?: string })[] }

const fallbackMarketplace: MarketplaceStatus = {
  suspended_at: null,
  active_listings: 0,
  active_listing_limit: null,
  can_post_need: false,
  need_organisation: null,
  unread_conversations: 0,
}

// S34 Izmeni oglas · /sapa-pomoci/[id]/izmeni (signed-in only, request interception) · EP-74 preload with the
// caller's session (rpc:get_listing; internal r2_key stripped, thumbnails signed through EP-15), EP-75 save,
// EP-77 delete, EP-13 new photos. Not the author or not visible → 404. A resolved / hidden listing still opens;
// saving answers listing_not_active (the form-level error).
export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: me, error: meError }, { data: raw, error }, { data: cities, error: citiesError }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.rpc("get_listing", { p_listing_id: id }),
    supabase.from("cities").select("id, name_sr, name_en, latitude, longitude").order("name_sr"),
  ])
  if (meError) console.error("[sapa-pomoci/izmeni] get_me:", meError.message)
  if (citiesError) console.error("[sapa-pomoci/izmeni] cities:", citiesError.message)
  if (error) console.error("[sapa-pomoci/izmeni] get_listing:", error.message)

  const stored = (raw ?? null) as RawListing | null
  if (error || !stored || !stored.viewer?.is_author) notFound()

  // The internal r2_key never reaches the client.
  const photos: ListingPhoto[] = (stored.photos ?? []).map((p) => ({
    id: p.id,
    listing_id: p.listing_id,
    position: p.position,
    file_name: p.file_name,
    url: null,
  }))
  if (photos.length > 0) {
    const urls = await getFileUrls({ items: photos.map((p) => ({ kind: "listing_photo" as const, id: p.id })) }).catch(() => null)
    if (urls?.ok) {
      const byId = new Map(urls.data.map((u) => [u.id, u]))
      for (const p of photos) p.url = byId.get(p.id) ?? null
    }
  }
  const listing: Listing = { ...stored, photos }

  const profile = (me ?? null) as SapaMe | null
  const locale = fromProfileLocale(profile?.locale)
  const dict = getDictionary(locale)

  return (
    <ListingFormClient
      listing={listing}
      marketplace={profile?.marketplace ?? fallbackMarketplace}
      cities={(cities ?? []) as City[]}
      locale={locale}
      copy={{ form: dict.sapa.form, common: dict.sapa.common, app: dict.common }}
      actions={{ saveListing, changeListing, requestUpload, confirmUpload }}
    />
  )
}
