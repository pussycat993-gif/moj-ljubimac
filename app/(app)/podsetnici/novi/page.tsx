import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetSummary } from "@/lib/actions/pets"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { ReminderFormClient, type ReminderFormPet } from "./reminder-form-client"

// S11 Novi podsetnik · /podsetnici/novi · EP-01 (the caller's own active pets for "Za koga", plus
// "Samo za mene"), EP-27 create. A failed pet read → the error state.
export default async function NewReminderPage() {
  const supabase = await createClient()
  const [{ data: me }, { data: rows, error }] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.from("pet_summaries_api").select("*").eq("lifecycle", "active").order("name", { ascending: true }),
  ])
  if (error) console.error("[podsetnici/novi] pet_summaries_api:", error.message)
  const locale = fromProfileLocale((me as Me | null)?.locale)
  const dict = getDictionary(locale)
  if (error) return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />

  const pets: ReminderFormPet[] = ((rows ?? []) as unknown as PetSummary[])
    .filter((p) => p.access.role === "owner")
    .map(({ id, name, sex, species }) => ({ id, name, sex, species }))

  return (
    <ReminderFormClient
      pets={pets}
      locale={locale}
      copy={{ reminderForm: dict.reminderForm, petForm: dict.petForm, common: dict.common }}
    />
  )
}
