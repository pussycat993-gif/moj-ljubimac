import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { PetFormClient } from "./pet-form-client"

// S02 Dodaj ljubimca · /ljubimci/novi · EP-03 (create), EP-13 (photo after the pet exists).
export default async function NewPetPage() {
  const supabase = await createClient()
  const { data } = await supabase.rpc("get_me")
  const locale = fromProfileLocale((data as Me | null)?.locale)
  const dict = getDictionary(locale)
  return (
    <PetFormClient
      locale={locale}
      copy={{ petForm: dict.petForm, pet: dict.pet, petsHome: dict.petsHome, common: dict.common }}
    />
  )
}
