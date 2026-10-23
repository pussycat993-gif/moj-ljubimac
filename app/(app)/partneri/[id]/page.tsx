import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { getPartner } from "@/lib/actions/partners"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { PartnerProfileLoading, PartnerProfileScreen, type PartnerProfileCopy } from "./partner-profile-screen"

// S25 Profil partnera · /partneri/[id] · EP-43 (locale, profile city) and EP-65 (getPartner). distance_km
// is measured from ?lat=&lng= when S24 used the browser location, otherwise from the profile city (owner
// decision, Step 27). The loading state shows while EP-65 is in flight; 404 / 5xx → the error state.

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

function copyFor(locale: Locale): PartnerProfileCopy {
  const dict = getDictionary(locale)
  return { partnerProfile: dict.partnerProfile, partners: dict.partners, common: dict.common }
}

function coordinate(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.trim() === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

async function PartnerProfileView({
  id,
  lat,
  lng,
  me,
  locale,
}: {
  id: string
  lat: number | null
  lng: number | null
  me: Me | null
  locale: Locale
}) {
  const withCoordinates = lat !== null && lng !== null
  const result = await getPartner({
    partner_id: id,
    ...(withCoordinates ? { lat, lng } : { city_id: me?.city?.id ?? null }),
  })
  if (!result.ok && result.error.code !== "not_found") console.error("[partneri/[id]] getPartner:", result.error.message)
  const todayWeekday = WEEKDAYS[new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Belgrade", weekday: "short" }).format(new Date())]
  return (
    <PartnerProfileScreen
      partner={result.ok ? result.data : null}
      todayWeekday={todayWeekday}
      locale={locale}
      copy={copyFor(locale)}
    />
  )
}

export default async function PartnerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[partneri/[id]] get_me:", error.message)
  const me = (data ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)
  return (
    <Suspense fallback={<PartnerProfileLoading copy={copyFor(locale)} />}>
      <PartnerProfileView id={id} lat={coordinate(query.lat)} lng={coordinate(query.lng)} me={me} locale={locale} />
    </Suspense>
  )
}
