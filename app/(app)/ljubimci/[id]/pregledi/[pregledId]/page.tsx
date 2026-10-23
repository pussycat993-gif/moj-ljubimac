import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetRecord } from "@/lib/actions/pets"
import type { VetVisit } from "@/lib/actions/vet-visits"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { VetVisitFormClient } from "../novi/vet-visit-form-client"

// Izmeni pregled · /ljubimci/[id]/pregledi/[pregledId] (owner decision, Step 15) · EP-02 preload
// (`pet`, `vet_visits`, `attachment_count`), EP-12 update and EP-13 / EP-14 attachments, reusing the
// S05 form. EP-02 404, an unknown visit, or a caller who may not change vet visits (member, FR-28)
// → the error state.
export default async function EditVetVisitPage({
  params,
}: {
  params: Promise<{ id: string; pregledId: string }>
}) {
  const { id, pregledId } = await params
  const supabase = await createClient()
  const [{ data: meData }, { data, error }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.rpc("get_pet_record", { p_pet_id: id }),
  ])
  if (error) console.error("[ljubimci/pregledi/[pregledId]] get_pet_record:", error.message)
  const me = (meData ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)
  const dict = getDictionary(locale)
  const record = error ? null : ((data ?? null) as PetRecord | null)
  const visit = (record?.vet_visits as unknown as VetVisit[] | undefined)?.find((v) => v.id === pregledId)

  if (!record || !record.access.can_edit || !visit) {
    return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />
  }

  const limit = record.access.role === "owner" ? (me?.entitlements.limits.attachments_per_pet ?? null) : null

  return (
    <VetVisitFormClient
      pet={record.pet}
      visit={visit}
      attachmentLimit={limit}
      attachmentCount={record.attachment_count}
      locale={locale}
      copy={{
        vetVisitForm: dict.vetVisitForm,
        petRecord: dict.petRecord,
        pet: dict.pet,
        petForm: dict.petForm,
        common: dict.common,
      }}
    />
  )
}
