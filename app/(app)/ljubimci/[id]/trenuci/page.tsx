import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetSummary } from "@/lib/actions/pets"
import { getFileUrls } from "@/lib/actions/files"
import { confirmMoment, deleteMoment, listMoments, prepareMoment, setMomentPublicLink } from "@/lib/actions/moments"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { MomentsClient, MomentsLoading, type MomentsCopy } from "./moments-client"

// S08 Trenuci · /ljubimci/[id]/trenuci · EP-01 single-pet header (view:pet_summaries_api, id filter),
// EP-20 first page (lib/actions/moments.ts listMoments → view:moments_api), EP-15 cover photos
// (moment_photo) and EP-43 (locale, Entitlements) on the server. The client creates, deletes, publishes
// and pages through the server actions of lib/actions/moments.ts; they run on the server because the
// session lives in httpOnly cookies (owner decision, Steps 13–17). No pet, or a pet without moments
// (organisation animals: EP-20 rows absent) → ErrorState.

function copyFor(locale: Locale): MomentsCopy {
  const dict = getDictionary(locale)
  return { moments: dict.moments, pet: dict.pet, petForm: dict.petForm, common: dict.common }
}

const actions = { listMoments, prepareMoment, confirmMoment, deleteMoment, setMomentPublicLink, getFileUrls }

async function MomentsView({ id, me }: { id: string; me: Me | null }) {
  const locale = fromProfileLocale(me?.locale)
  const copy = copyFor(locale)
  const supabase = await createClient()
  const [pets, moments] = await Promise.all([
    supabase.from("pet_summaries_api").select("*").eq("id", id),
    listMoments({ pet_id: id }),
  ])
  if (pets.error) console.error("[ljubimci/[id]/trenuci] pet_summaries_api:", pets.error.message)
  if (!moments.ok) console.error("[ljubimci/[id]/trenuci] moments_api:", moments.error.message)

  const pet = ((pets.data ?? []) as unknown as PetSummary[])[0]
  // Moments are personal: only the owner and household members have them (EP-20).
  const hasMoments = pet && (pet.access.role === "owner" || pet.access.role === "member")
  if (pets.error || !moments.ok || !hasMoments) {
    return <ErrorState message={copy.common.error} labels={{ retry: copy.common.retry }} />
  }

  const covers = moments.data.items.flatMap((m) => (m.photos[0] ? [{ kind: "moment_photo" as const, id: m.photos[0].id }] : []))
  const items = [...(pet.has_photo ? [{ kind: "pet_photo" as const, id: pet.id }] : []), ...covers]
  const urls = items.length > 0 ? await getFileUrls({ items }).catch(() => null) : null
  const files = urls?.ok ? urls.data : []
  const photoUrl = files.find((f) => f.kind === "pet_photo")?.url ?? undefined
  const photoUrls = Object.fromEntries(files.filter((f) => f.kind === "moment_photo").map((f) => [f.id, f.url]))

  return (
    <MomentsClient
      pet={pet}
      photoUrl={photoUrl}
      moments={moments.data}
      photoUrls={photoUrls}
      entitlements={{
        premium: me?.entitlements.premium ?? false,
        logo_removal: me?.entitlements.logo_removal ?? false,
      }}
      today={new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date())}
      locale={locale}
      copy={copy}
      actions={actions}
    />
  )
}

export default async function MomentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[ljubimci/[id]/trenuci] get_me:", error.message)
  const me = (data ?? null) as Me | null
  return (
    <Suspense fallback={<MomentsLoading />}>
      <MomentsView id={id} me={me} />
    </Suspense>
  )
}
