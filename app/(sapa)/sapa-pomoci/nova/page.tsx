import { createClient } from "@/lib/supabase/server"
import type { City, Me } from "@/lib/actions/registration"
import { changeListing, saveListing, type MarketplaceStatus } from "@/lib/actions/listings"
import { confirmUpload, requestUpload } from "@/lib/actions/uploads"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ListingFormClient } from "./listing-form-client"

export const dynamic = "force-dynamic"

/** Me with the Step 28b fields (EP-43 `display_name`, `marketplace`). */
type SapaMe = Me & { display_name: string | null; marketplace: MarketplaceStatus }

/** Me.marketplace when get_me did not answer — the form stays usable and the server answers the rules. */
const fallbackMarketplace: MarketplaceStatus = {
  suspended_at: null,
  active_listings: 0,
  active_listing_limit: null,
  can_post_need: false,
  need_organisation: null,
  unread_conversations: 0,
}

// S34 Novi oglas · /sapa-pomoci/nova (signed-in only, request interception) · EP-43 Me.marketplace (type tiles,
// counter, G, S), EP-67 cities, EP-75 save, EP-13 photos after the listing exists.
export default async function NewListingPage() {
  const supabase = await createClient()
  const [{ data: me, error: meError }, { data: cities, error: citiesError }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.from("cities").select("id, name_sr, name_en, latitude, longitude").order("name_sr"),
  ])
  if (meError) console.error("[sapa-pomoci/nova] get_me:", meError.message)
  if (citiesError) console.error("[sapa-pomoci/nova] cities:", citiesError.message)
  const profile = (me ?? null) as SapaMe | null
  const locale = fromProfileLocale(profile?.locale)
  const dict = getDictionary(locale)

  return (
    <ListingFormClient
      marketplace={profile?.marketplace ?? fallbackMarketplace}
      defaultCityId={profile?.city?.id ?? ""}
      cities={(cities ?? []) as City[]}
      locale={locale}
      copy={{ form: dict.sapa.form, common: dict.sapa.common, app: dict.common }}
      actions={{ saveListing, changeListing, requestUpload, confirmUpload }}
    />
  )
}
