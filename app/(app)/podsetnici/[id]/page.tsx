import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { PetSummary } from "@/lib/actions/pets"
import { getManualReminder } from "@/lib/actions/reminders"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { ReminderFormClient, type ReminderFormPet } from "../novi/reminder-form-client"

// S11 Izmeni podsetnik · /podsetnici/[id] (id = reminders.id, the ReminderOccurrence.reminder_id of a
// manual row on S10 — owner decision, Step 17) · EP-27 get (prefill), update and delete; EP-01 for
// "Za koga". Unknown, another user's or a generated reminder (404) or a failed read → the error state.
export default async function EditReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: me }, { data: rows, error }, reminder] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.from("pet_summaries_api").select("*").eq("lifecycle", "active").order("name", { ascending: true }),
    getManualReminder(id),
  ])
  if (error) console.error("[podsetnici/[id]] pet_summaries_api:", error.message)
  const locale = fromProfileLocale((me as Me | null)?.locale)
  const dict = getDictionary(locale)
  if (error || !reminder.ok) return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />

  const pets: ReminderFormPet[] = ((rows ?? []) as unknown as PetSummary[])
    .filter((p) => p.access.role === "owner")
    .map(({ id: petId, name, sex, species }) => ({ id: petId, name, sex, species }))

  return (
    <ReminderFormClient
      pets={pets}
      reminder={reminder.data}
      locale={locale}
      copy={{ reminderForm: dict.reminderForm, petForm: dict.petForm, common: dict.common }}
    />
  )
}
