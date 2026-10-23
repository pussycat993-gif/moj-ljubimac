import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import {
  changeHouseholdMembership,
  createHouseholdInvitation,
  getHousehold,
  setMyReminderOptIn,
  setSharedPet,
} from "@/lib/actions/household"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { HouseholdScreen } from "./household-screen"

// S13 Domaćinstvo · /domacinstvo · EP-34 (lib/actions/household.ts getHousehold → rpc:get_household) and
// EP-43 (locale, Entitlements.premium) on the server. The client writes through the server actions of
// lib/actions/household.ts (EP-35 … EP-38); they run on the server because the session lives in httpOnly
// cookies (owner decision, Steps 13–17). A failed read → ErrorState. With several households the default
// one is shown (owner decision, Step 22; a household switcher is a follow-up).

const actions = { getHousehold, createHouseholdInvitation, changeHouseholdMembership, setSharedPet, setMyReminderOptIn }

export default async function HouseholdPage() {
  const supabase = await createClient()
  const [{ data, error }, household] = await Promise.all([supabase.rpc("get_me"), getHousehold()])
  if (error) console.error("[domacinstvo] get_me:", error.message)
  if (!household.ok) console.error("[domacinstvo] get_household:", household.error.message)
  const me = (data ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)
  const dict = getDictionary(locale)

  if (!household.ok || !me) {
    return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />
  }

  return (
    <HouseholdScreen
      initial={household.data}
      premium={me.entitlements.premium}
      me={{ id: me.id, name: me.full_name || me.email, email: me.email }}
      locale={locale}
      copy={{ household: dict.household, pet: dict.pet, common: dict.common }}
      actions={actions}
    />
  )
}
