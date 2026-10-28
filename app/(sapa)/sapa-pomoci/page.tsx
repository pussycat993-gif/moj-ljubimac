import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getVisitorLocale, type City, type Me } from "@/lib/actions/registration"
import type { ListingCategory, ListingSpecies, ListingType, MarketplaceStatus } from "@/lib/actions/listings"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { SapaPomociClient, type SapaFilters } from "./sapa-pomoci-client"

// S32 Šapa pomoći · /sapa-pomoci · FR-61 · public (Visitor and signed-in; the (sapa) layout picks the shell).
// The list itself is read by the client from EP-73 (GET /api/public/listings, not cached — TC ADR-18). This page only
// resolves the session (EP-43 get_me: language and Me.marketplace.suspended_at), the Visitor's language (ml_locale
// cookie), the city list for the Grad filter (EP-67) and the filters kept in the URL query.

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Šapa pomoći · Moj Ljubimac" }

type SapaMe = Me & { display_name: string | null; marketplace: MarketplaceStatus }

const TYPES: readonly ListingType[] = ["need", "giving", "selling", "seeking"]
const CATEGORIES: readonly ListingCategory[] = ["food", "equipment_toys", "furniture", "carriers", "medicine_care", "other"]
const SPECIES: readonly ListingSpecies[] = ["dog", "cat", "other"]

function pick<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | "all" {
  const v = Array.isArray(value) ? value[0] : value
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : "all"
}

async function session(): Promise<{ signedIn: boolean; suspended: boolean; locale: Locale | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { signedIn: false, suspended: false, locale: null }
    const { data, error } = await supabase.rpc("get_me")
    if (error) console.error("[sapa-pomoci] get_me:", error.message)
    const me = (data ?? null) as SapaMe | null
    return {
      signedIn: true,
      suspended: Boolean(me?.marketplace?.suspended_at),
      locale: me ? fromProfileLocale(me.locale) : null,
    }
  } catch (error) {
    console.error("[sapa-pomoci] session:", error instanceof Error ? error.message : error)
    return { signedIn: false, suspended: false, locale: null }
  }
}

async function loadCities(): Promise<City[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("cities")
      .select("id, name_sr, name_en, latitude, longitude")
      .order("name_sr")
    if (error) console.error("[sapa-pomoci] cities:", error.message)
    return (data ?? []) as City[]
  } catch (error) {
    console.error("[sapa-pomoci] cities:", error instanceof Error ? error.message : error)
    return []
  }
}

export default async function SapaPomociPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const [{ signedIn, suspended, locale: profileLocale }, visitorLocale, cities] = await Promise.all([
    session(),
    getVisitorLocale(),
    loadCities(),
  ])
  const locale = profileLocale ?? visitorLocale
  const dict = getDictionary(locale)

  const cityParam = Array.isArray(query.city_id) ? query.city_id[0] : query.city_id
  const pageParam = Number(Array.isArray(query.strana) ? query.strana[0] : query.strana)
  const initialFilters: SapaFilters = {
    type: pick(query.type, TYPES),
    category: pick(query.category, CATEGORIES),
    species: pick(query.species, SPECIES),
    city: cityParam && cities.some((c) => c.id === cityParam) ? cityParam : "all",
  }

  return (
    <SapaPomociClient
      signedIn={signedIn}
      suspended={suspended}
      locale={locale}
      cities={cities}
      initialFilters={initialFilters}
      initialPage={Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1}
      copy={{ common: dict.common, sapa: dict.sapa.common, list: dict.sapa.list }}
    />
  )
}
