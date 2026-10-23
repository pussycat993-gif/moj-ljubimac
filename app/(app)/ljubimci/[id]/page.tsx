import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetRecord } from "@/lib/actions/pets"
import { getFileUrls } from "@/lib/actions/files"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { PetRecordClient, PetRecordError, PetRecordLoading, type PetRecordCopy } from "./pet-record-client"

// S03 Karton ljubimca · /ljubimci/[id] · EP-02 (rpc:get_pet_record), EP-15 (pet photo) and EP-43
// (locale; Entitlements passed on for the Pregledi counter and the PDF lock, Steps 15–16).
// The loading state shows while EP-02 is in flight; 404 / 5xx → the error state.

function copyFor(locale: Locale): PetRecordCopy {
  const dict = getDictionary(locale)
  return { petRecord: dict.petRecord, pet: dict.pet, petForm: dict.petForm, common: dict.common, reminders: dict.reminders }
}

async function PetRecordView({ id, me, locale }: { id: string; me: Me | null; locale: Locale }) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_pet_record", { p_pet_id: id })
  if (error) console.error("[ljubimci/[id]] get_pet_record:", error.message)
  const record = error ? null : ((data ?? null) as PetRecord | null)
  if (!record) return <PetRecordError copy={copyFor(locale)} />

  let photoUrl: string | undefined
  if (record.pet.has_photo) {
    const urls = await getFileUrls({ items: [{ kind: "pet_photo", id: record.pet.id }] }).catch(() => null)
    photoUrl = urls?.ok ? (urls.data[0]?.url ?? undefined) : undefined
  }

  return (
    <PetRecordClient
      record={record}
      photoUrl={photoUrl}
      now={new Date().toISOString()}
      entitlements={me?.entitlements}
      locale={locale}
      copy={copyFor(locale)}
    />
  )
}

export default async function PetRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[ljubimci/[id]] get_me:", error.message)
  const me = (data ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)
  return (
    <Suspense fallback={<PetRecordLoading copy={copyFor(locale)} />}>
      <PetRecordView id={id} me={me} locale={locale} />
    </Suspense>
  )
}
