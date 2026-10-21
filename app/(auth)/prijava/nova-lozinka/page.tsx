import { createClient } from "@/lib/supabase/server"
import { recoverySessionEmail } from "@/lib/server/gates"
import { NewPasswordForm } from "./new-password-form"

// S28 Nova lozinka · /prijava/nova-lozinka · FR-34, EP-42. Reached from a reset link
// through /auth/callback; without a recovery session the link is used or expired.
export default async function NewPasswordPage() {
  const supabase = await createClient()
  const email = await recoverySessionEmail(supabase)
  return <NewPasswordForm email={email} />
}
