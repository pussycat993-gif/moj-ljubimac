import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetSummary } from "@/lib/actions/pets"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { TreatmentFormClient } from "./treatment-form-client"

// S27 Nova terapija · /ljubimci/[id]/terapije/nova · EP-01 single-pet header (view:pet_summaries_api,
// id filter), EP-10 save. `[]` (pet not found) or a caller who may not add treatments (member, FR-28)
// → the error state.
export default async function NewTreatmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: me }, { data: rows, error }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.from("pet_summaries_api").select("*").eq("id", id),
  ])
  if (error) console.error("[ljubimci/terapije/nova] pet_summaries_api:", error.message)
  const locale = fromProfileLocale((me as Me | null)?.locale)
  const dict = getDictionary(locale)
  const pet = ((rows ?? []) as unknown as PetSummary[])[0]

  if (error || !pet || !pet.access.can_edit) {
    return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />
  }

  return (
    <TreatmentFormClient
      pet={pet}
      locale={locale}
      copy={{ treatmentForm: dict.treatmentForm, pet: dict.pet, petForm: dict.petForm, common: dict.common }}
    />
  )
}
