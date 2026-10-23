import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetSummary } from "@/lib/actions/pets"
import { listReminderOccurrences } from "@/lib/actions/reminders"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { PetsHomeClient, PetsHomeLoading, type PetsHomeCopy } from "./pets-home-client"

// S01 Moji ljubimci · /ljubimci · EP-01 (view:pet_summaries_api, active rows, order
// lifecycle asc, name asc), EP-25 (the "Danas" strip, filter=today, through
// lib/actions/reminders.ts — owner decision, Step 17) and EP-43 (locale, Entitlements for the
// Free counter). The loading state shows while EP-01 is in flight.

function copyFor(locale: Locale): PetsHomeCopy {
  const dict = getDictionary(locale)
  return { petsHome: dict.petsHome, pet: dict.pet, common: dict.common, reminders: dict.reminders }
}

async function PetsHome({ me, locale }: { me: Me | null; locale: Locale }) {
  const supabase = await createClient()
  const [{ data: pets, error }, today] = await Promise.all([
    supabase
      .from("pet_summaries_api")
      .select("*")
      .eq("lifecycle", "active")
      .order("lifecycle", { ascending: true })
      .order("name", { ascending: true }),
    listReminderOccurrences({ filter: "today" }),
  ])
  if (error) console.error("[ljubimci] pet_summaries_api:", error.message)
  if (!today.ok) console.error("[ljubimci] list_reminder_occurrences:", today.error.message)

  return (
    <PetsHomeClient
      pets={error || !me ? null : ((pets ?? []) as unknown as PetSummary[])}
      today={today.ok ? { items: today.data.items, total: today.data.total } : null}
      activePetLimit={me ? me.entitlements.limits.active_pets : null}
      now={new Date().toISOString()}
      locale={locale}
      copy={copyFor(locale)}
    />
  )
}

export default async function PetsHomePage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[ljubimci] get_me:", error.message)
  const me = (data ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)
  return (
    <Suspense fallback={<PetsHomeLoading copy={copyFor(locale)} />}>
      <PetsHome me={me} locale={locale} />
    </Suspense>
  )
}
