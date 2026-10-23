import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetRecord } from "@/lib/actions/pets"
import type { Treatment } from "@/lib/actions/treatments"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { TreatmentFormClient } from "../nova/treatment-form-client"

// Izmeni terapiju · /ljubimci/[id]/terapije/[terapijaId] (owner decision, Step 15) · EP-02 preload
// (`pet`, `treatments`), EP-10 update, reusing the S27 form. EP-02 404, an unknown treatment, or a
// caller who may not change treatments (member, FR-28) → the error state.
export default async function EditTreatmentPage({
  params,
}: {
  params: Promise<{ id: string; terapijaId: string }>
}) {
  const { id, terapijaId } = await params
  const supabase = await createClient()
  const [{ data: me }, { data, error }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.rpc("get_pet_record", { p_pet_id: id }),
  ])
  if (error) console.error("[ljubimci/terapije/[terapijaId]] get_pet_record:", error.message)
  const locale = fromProfileLocale((me as Me | null)?.locale)
  const dict = getDictionary(locale)
  const record = error ? null : ((data ?? null) as PetRecord | null)
  const treatment = (record?.treatments as unknown as Treatment[] | undefined)?.find((t) => t.id === terapijaId)

  if (!record || !record.access.can_edit || !treatment) {
    return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />
  }

  return (
    <TreatmentFormClient
      pet={record.pet}
      treatment={treatment}
      locale={locale}
      copy={{ treatmentForm: dict.treatmentForm, pet: dict.pet, petForm: dict.petForm, common: dict.common }}
    />
  )
}
