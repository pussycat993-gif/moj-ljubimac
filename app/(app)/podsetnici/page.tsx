import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { ReminderOccurrenceList } from "@/lib/actions/reminders"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { RemindersClient, RemindersLoading, type RemindersCopy } from "./reminders-client"

// S10 Podsetnici · /podsetnici · EP-25 (rpc:list_reminder_occurrences: today as a whole list, the
// first page of 20 for upcoming / missed / done), EP-01 (active pet names for the subtitle) and EP-43
// (locale). The loading state shows while EP-25 is in flight; a failed read → the error state.

function copyFor(locale: Locale): RemindersCopy {
  const dict = getDictionary(locale)
  return { reminders: dict.reminders, pet: dict.pet, common: dict.common }
}

const FILTERS = ["today", "upcoming", "missed", "done"] as const

async function RemindersView({ locale }: { locale: Locale }) {
  const supabase = await createClient()
  const [pets, ...results] = await Promise.all([
    supabase.from("pet_summaries_api").select("name").eq("lifecycle", "active").order("name", { ascending: true }),
    ...FILTERS.map((filter) => supabase.rpc("list_reminder_occurrences", { p_filter: filter, p_limit: 20, p_offset: 0 })),
  ])
  const failed = results.find((r) => r.error)
  if (failed?.error) console.error("[podsetnici] list_reminder_occurrences:", failed.error.message)
  if (pets.error) console.error("[podsetnici] pet_summaries_api:", pets.error.message)

  const lists = failed
    ? null
    : (Object.fromEntries(FILTERS.map((f, i) => [f, results[i].data as unknown as ReminderOccurrenceList])) as Record<
        (typeof FILTERS)[number],
        ReminderOccurrenceList
      >)

  return (
    <RemindersClient
      lists={lists}
      petNames={(pets.data ?? []).flatMap((p) => (p.name ? [p.name] : []))}
      locale={locale}
      copy={copyFor(locale)}
    />
  )
}

export default async function RemindersPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[podsetnici] get_me:", error.message)
  const locale = fromProfileLocale((data as Me | null)?.locale)
  return (
    <Suspense fallback={<RemindersLoading copy={copyFor(locale)} />}>
      <RemindersView locale={locale} />
    </Suspense>
  )
}
