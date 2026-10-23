import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetRecord } from "@/lib/actions/pets"
import { getFileUrls } from "@/lib/actions/files"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { PetFormClient } from "../../novi/pet-form-client"

// S02 Izmeni ljubimca · /ljubimci/[id]/izmena · EP-02 preload (`pet`), EP-04 save, EP-13 photo,
// EP-15 photo preview. EP-02 404 (or a caller who may not edit) → the error state.
export default async function EditPetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: me }, { data: record, error }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.rpc("get_pet_record", { p_pet_id: id }),
  ])
  if (error) console.error("[ljubimci/izmena] get_pet_record:", error.message)
  const locale = fromProfileLocale((me as Me | null)?.locale)
  const dict = getDictionary(locale)
  const pet = (record as PetRecord | null)?.access.can_edit ? (record as PetRecord).pet : null

  if (!pet) {
    return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />
  }

  let photoUrl: string | undefined
  if (pet.has_photo) {
    const urls = await getFileUrls({ items: [{ kind: "pet_photo", id: pet.id }] }).catch(() => null)
    photoUrl = urls?.ok ? (urls.data[0]?.url ?? undefined) : undefined
  }

  return (
    <PetFormClient
      pet={pet}
      photoUrl={photoUrl}
      locale={locale}
      copy={{ petForm: dict.petForm, pet: dict.pet, petsHome: dict.petsHome, common: dict.common }}
    />
  )
}
