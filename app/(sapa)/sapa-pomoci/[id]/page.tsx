import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getVisitorLocale, type Me } from "@/lib/actions/registration"
import { changeListing, getDonationInfo, type MarketplaceStatus } from "@/lib/actions/listings"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { ListingDetailClient } from "./listing-detail-client"

// S33 Oglas · /sapa-pomoci/[id] · FR-62, FR-66, FR-67 (Step 28b). Public: the (sapa) layout picks the shell from
// the session. The client reads EP-74 (GET /api/public/listings/:id, not cached) so its states follow the
// response (200 → content, 404 → unavailable, 5xx → error). The session only decides the language (EP-43 locale,
// or the ml_locale cookie for Visitors) and the suspended state (Me.marketplace.suspended_at). EP-77 changeListing
// and EP-78 getDonationInfo are server actions passed as props.

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Moj Ljubimac" }

const actions = { changeListing, getDonationInfo }

type SapaMe = Me & { display_name: string | null; marketplace: MarketplaceStatus | null }

async function session(): Promise<{ locale: Locale | null; suspended: boolean }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { locale: null, suspended: false }
    const { data, error } = await supabase.rpc("get_me")
    if (error) console.error("[sapa-pomoci/[id]] get_me:", error.message)
    const me = (data ?? null) as SapaMe | null
    return {
      locale: me ? fromProfileLocale(me.locale) : null,
      suspended: Boolean(me?.marketplace?.suspended_at),
    }
  } catch (error) {
    console.error("[sapa-pomoci/[id]] session:", error instanceof Error ? error.message : error)
    return { locale: null, suspended: false }
  }
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [{ locale: profileLocale, suspended }, visitorLocale] = await Promise.all([session(), getVisitorLocale()])
  const locale = profileLocale ?? visitorLocale
  const dict = getDictionary(locale)
  return (
    <ListingDetailClient
      listingId={id}
      locale={locale}
      suspended={suspended}
      copy={{ detail: dict.sapa.detail, sapa: dict.sapa.common, common: dict.common }}
      actions={actions}
    />
  )
}
