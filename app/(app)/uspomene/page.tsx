import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetSummary } from "@/lib/actions/pets"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { MemorialsClient, type MemorialsCopy } from "./memorials-client"

// S06 Uspomene · /uspomene · EP-01 (view:pet_summaries_api, lifecycle = memorial, order lifecycle
// asc, name asc) and EP-43 (locale; Entitlements for the Free counter "n / 2" and the restore lock,
// usage.free_slot_pet for its copy).

function copyFor(locale: Locale): MemorialsCopy {
  const dict = getDictionary(locale)
  return { memorials: dict.memorials, pet: dict.pet, common: dict.common }
}

export default async function MemorialsPage() {
  const supabase = await createClient()
  const { data, error: meError } = await supabase.rpc("get_me")
  if (meError) console.error("[uspomene] get_me:", meError.message)
  const me = (data ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)

  const { data: pets, error } = await supabase
    .from("pet_summaries_api")
    .select("*")
    .eq("lifecycle", "memorial")
    .order("lifecycle", { ascending: true })
    .order("name", { ascending: true })
  if (error) console.error("[uspomene] pet_summaries_api:", error.message)

  return (
    <MemorialsClient
      pets={error || !me ? null : ((pets ?? []) as unknown as PetSummary[])}
      memorialLimit={me ? me.entitlements.limits.memorials : null}
      activePetLimit={me ? me.entitlements.limits.active_pets : null}
      activePets={me?.usage.active_pets ?? 0}
      slotPetName={me?.usage.free_slot_pet?.name ?? null}
      locale={locale}
      copy={copyFor(locale)}
    />
  )
}
