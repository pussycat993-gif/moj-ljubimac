import type { ReminderTypeIconLabels } from "@/components/app/reminder-type-icon"
import type { Dictionary } from "@/lib/i18n"

/** ReminderTypeIcon's sr-only type labels from the active dictionary (Step F1, FR-35). */
export function reminderTypeIconLabels(t: Dictionary["reminders"]): ReminderTypeIconLabels {
  return {
    treatment_dose: t.iconTreatmentDose,
    vaccination: t.iconVaccination,
    vet_follow_up: t.iconVetFollowUp,
    meal: t.iconMeal,
    birthday: t.iconBirthday,
    manual: t.iconManual,
    message: t.iconMessage,
  }
}
