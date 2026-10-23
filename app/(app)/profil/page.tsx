import { createClient } from "@/lib/supabase/server"
import type { City, Me } from "@/lib/actions/registration"
import { dictionaries } from "@/lib/i18n"
import { ProfileClient } from "./profile-client"

// S18 Profil · /profil · FR-35 · EP-43 get, EP-67 cities. Name, city and language part
// (the subscription card is Step 23). A failed read shows the error state.
export default async function ProfilePage() {
  const supabase = await createClient()
  const [{ data: me, error: meError }, { data: cities, error: citiesError }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.from("cities").select("id, name_sr, name_en, latitude, longitude").order("name_sr"),
  ])
  if (meError) console.error("[profil] get_me:", meError.message)
  if (citiesError) console.error("[profil] cities:", citiesError.message)

  return (
    <ProfileClient
      me={meError ? null : ((me ?? null) as Me | null)}
      cities={(cities ?? []) as City[]}
      copy={{
        sr: { profile: dictionaries.sr.profile, common: dictionaries.sr.common },
        en: { profile: dictionaries.en.profile, common: dictionaries.en.common },
      }}
    />
  )
}
