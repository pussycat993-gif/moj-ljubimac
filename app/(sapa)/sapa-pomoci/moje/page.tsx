import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { changeListing, listMyListings, type MarketplaceStatus } from "@/lib/actions/listings"
import { getFileUrls } from "@/lib/actions/files"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { MyListingsClient } from "./my-listings-client"

// S35 Moji oglasi · /sapa-pomoci/moje · FR-64, FR-65 · signed-in only (the request-interception file sends a
// Visitor to sign-in with `next`, so the listing_expiring email's "Produži" link comes back here). The page resolves
// the language (EP-43 get_me) and the `?produzi=<id>` parameter; the client reads EP-76 (listMyListings) per tab,
// extends / resolves / deletes through EP-77 (changeListing) and signs thumbnails through EP-15 (getFileUrls).

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Moji oglasi · Moj Ljubimac" }

type SapaMe = Me & { display_name: string | null; marketplace: MarketplaceStatus }

const actions = { listMyListings, changeListing, getFileUrls }

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[sapa-pomoci/moje] get_me:", error.message)
  const locale = fromProfileLocale((data as SapaMe | null)?.locale)
  const dict = getDictionary(locale)
  const produziParam = Array.isArray(query.produzi) ? query.produzi[0] : query.produzi

  return (
    <MyListingsClient
      locale={locale}
      produzi={produziParam || null}
      copy={{ common: dict.common, sapa: dict.sapa.common, mine: dict.sapa.mine }}
      actions={actions}
    />
  )
}
