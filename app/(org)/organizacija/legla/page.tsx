import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { getMyOrganisation } from "@/lib/actions/organisation"
import { createLitter, listLitters, updateOffspring } from "@/lib/actions/litters"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { LittersLoading, LittersScreen } from "./litters-screen"

// S22 Legla · /organizacija/legla · EP-53 (getMyOrganisation: organisation name, city, approval, breeder plan) and
// EP-61 (listLitters) on the server; the language from EP-43. Creating a litter (EP-61 createLitter) and changing an
// offspring's status or price (EP-61 updateOffspring) are server actions because the session lives in httpOnly
// cookies. The loading variant is the Suspense fallback.

export const dynamic = "force-dynamic"

const actions = { listLitters, createLitter, updateOffspring }

async function Litters({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale)
  const [organisation, litters] = await Promise.all([getMyOrganisation(), listLitters()])
  if (!organisation.ok) console.error("[organizacija/legla] get_my_organisation:", organisation.error.message)
  if (!litters.ok) console.error("[organizacija/legla] list_litters:", litters.error.message)
  return (
    <LittersScreen
      initialOrg={organisation}
      initialLitters={litters}
      locale={locale}
      copy={{
        litters: dict.litters,
        orgAnimals: dict.orgAnimals,
        orgProfile: dict.orgProfile,
        petForm: dict.petForm,
        pet: dict.pet,
        common: dict.common,
      }}
      actions={actions}
    />
  )
}

export default async function LittersPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[organizacija/legla] get_me:", error.message)
  const locale = fromProfileLocale((data as Me | null)?.locale)
  return (
    <Suspense fallback={<LittersLoading label={getDictionary(locale).litters.loading} />}>
      <Litters locale={locale} />
    </Suspense>
  )
}
