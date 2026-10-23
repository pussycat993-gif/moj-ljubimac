import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetSummary } from "@/lib/actions/pets"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { VetVisitFormClient } from "./vet-visit-form-client"

// S05 Novi pregled · /ljubimci/[id]/pregledi/novi · EP-01 single-pet header (view:pet_summaries_api,
// id filter; clinic prefilled from vet_name), EP-12 save, EP-13 attachments, EP-43 (counter "n / 10"
// from Me.usage.attachments_by_pet with Entitlements). `[]` (pet not found) or a caller who may not
// add vet visits (member, FR-28) → the error state.
export default async function NewVetVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: meData }, { data: rows, error }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.from("pet_summaries_api").select("*").eq("id", id),
  ])
  if (error) console.error("[ljubimci/pregledi/novi] pet_summaries_api:", error.message)
  const me = (meData ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)
  const dict = getDictionary(locale)
  const pet = ((rows ?? []) as unknown as PetSummary[])[0]

  if (error || !pet || !pet.access.can_edit) {
    return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />
  }

  // The Free limit counts the owner's own pets only (organisation animals have none, BR-01).
  const limit = pet.access.role === "owner" ? (me?.entitlements.limits.attachments_per_pet ?? null) : null
  const count = me?.usage.attachments_by_pet.find((p) => p.pet_id === pet.id)?.count ?? pet.attachment_count

  return (
    <VetVisitFormClient
      pet={pet}
      attachmentLimit={limit}
      attachmentCount={count}
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
