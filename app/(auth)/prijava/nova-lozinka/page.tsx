import { createClient } from "@/lib/supabase/server"
import { recoverySessionEmail } from "@/lib/server/gates"
import { getVisitorLocale } from "@/lib/actions/registration"
import { getDictionary } from "@/lib/i18n"
import { NewPasswordForm } from "./new-password-form"

// S28 Nova lozinka · /prijava/nova-lozinka · FR-34, EP-42. Reached from a reset link
// through /auth/callback; without a recovery session the link is used or expired.
// Language: the visitor's ml_locale cookie (FR-35).
export default async function NewPasswordPage() {
  const supabase = await createClient()
  const email = await recoverySessionEmail(supabase)
  const dict = getDictionary(await getVisitorLocale())
  return <NewPasswordForm email={email} dict={{ newPassword: dict.newPassword, common: dict.common }} />
}
