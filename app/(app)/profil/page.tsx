import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { City, Me } from "@/lib/actions/registration"
import { setAutoRenew, type Subscription } from "@/lib/actions/subscription"
import { dictionaries, fromProfileLocale } from "@/lib/i18n"
import { ProfileClient, ProfileLoading } from "./profile-client"

// S18 Profil · /profil · FR-25, FR-35, FR-38, FR-39 · EP-43 get, EP-67 cities and, for owner accounts,
// EP-47 rpc:get_my_subscription (the Premium card; owner decision Step 23: the card only for
// account_type = owner). EP-48 runs through the setAutoRenew server action. The loading state shows while
// the reads are in flight; a failed read (EP-43 or EP-47) shows the error state.

const copy = {
  sr: { profile: dictionaries.sr.profile, common: dictionaries.sr.common, subscription: dictionaries.sr.subscription },
  en: { profile: dictionaries.en.profile, common: dictionaries.en.common, subscription: dictionaries.en.subscription },
}

async function ProfileView() {
  const supabase = await createClient()
  const [{ data: me, error: meError }, { data: cities, error: citiesError }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.from("cities").select("id, name_sr, name_en, latitude, longitude").order("name_sr"),
  ])
  if (meError) console.error("[profil] get_me:", meError.message)
  if (citiesError) console.error("[profil] cities:", citiesError.message)
  const profile = meError ? null : ((me ?? null) as Me | null)

  let subscription: Subscription | null = null
  let failed = false
  if (profile?.account_type === "owner") {
    const { data, error } = await supabase.rpc("get_my_subscription")
    if (error) console.error("[profil] get_my_subscription:", error.message)
    failed = !!error
    subscription = error ? null : (data as unknown as Subscription)
  }

  return (
    <ProfileClient
      me={failed ? null : profile}
      cities={(cities ?? []) as City[]}
      subscription={subscription}
      setAutoRenew={setAutoRenew}
      copy={copy}
    />
  )
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[profil] get_me:", error.message)
  const locale = fromProfileLocale((data as Me | null)?.locale)
  return (
    <Suspense fallback={<ProfileLoading copy={copy[locale]} />}>
      <ProfileView />
    </Suspense>
  )
}
