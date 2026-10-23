import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetRecord } from "@/lib/actions/pets"
import type { Vaccination } from "@/lib/actions/vaccinations"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { VaccinationFormClient } from "../nova/vaccination-form-client"

// Izmeni vakcinu · /ljubimci/[id]/vakcine/[vakcinaId] (owner decision, Step 14) · EP-02 preload (`pet`,
// `vaccinations`), EP-09 update, reusing the S04 form. EP-02 404, an unknown vaccination, or a caller
// who may not change vaccinations (member, FR-28) → the error state.
export default async function EditVaccinationPage({
  params,
}: {
  params: Promise<{ id: string; vakcinaId: string }>
}) {
  const { id, vakcinaId } = await params
  const supabase = await createClient()
  const [{ data: me }, { data, error }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.rpc("get_pet_record", { p_pet_id: id }),
  ])
  if (error) console.error("[ljubimci/vakcine/[vakcinaId]] get_pet_record:", error.message)
  const locale = fromProfileLocale((me as Me | null)?.locale)
  const dict = getDictionary(locale)
  const record = error ? null : ((data ?? null) as PetRecord | null)
  const vaccination = (record?.vaccinations as unknown as Vaccination[] | undefined)?.find((v) => v.id === vakcinaId)

  if (!record || !record.access.can_edit || !vaccination) {
    return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />
  }

  return (
    <VaccinationFormClient
      pet={record.pet}
      vaccination={vaccination}
      locale={locale}
      copy={{ vaccinationForm: dict.vaccinationForm, pet: dict.pet, petForm: dict.petForm, common: dict.common }}
    />
  )
}
