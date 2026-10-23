import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { postSignInPath } from "@/lib/server/gates"
import { getVisitorLocale, type City } from "@/lib/actions/registration"
import { dictionaries } from "@/lib/i18n"
import { RegisterClient } from "./register-client"

// S15 Registracija · /registracija · FR-33, FR-35 · EP-41, EP-67.
// Visitor → sign-up form; signed in without a profile (first Google sign-in) → the
// completion step; signed in with a profile → where EP-42 sends them.
export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let completion: { email: string } | null = null
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle()
    if (profile) redirect(await postSignInPath(supabase, user, null))
    completion = { email: user.email ?? "" }
  }

  // EP-67: the organisation city Select.
  const { data: cities, error } = await supabase
    .from("cities")
    .select("id, name_sr, name_en, latitude, longitude")
    .order("name_sr")
  if (error) console.error("[registracija] cities:", error.message)

  return (
    <RegisterClient
      initialLocale={await getVisitorLocale()}
      copy={{
        sr: { register: dictionaries.sr.register, common: dictionaries.sr.common },
        en: { register: dictionaries.en.register, common: dictionaries.en.common },
      }}
      cities={(cities ?? []) as City[]}
      citiesFailed={!!error}
      completion={completion}
    />
  )
}
