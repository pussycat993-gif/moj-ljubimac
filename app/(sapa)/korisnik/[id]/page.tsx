import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getVisitorLocale, type Me } from "@/lib/actions/registration"
import { blockUser, submitReport, unblockUser } from "@/lib/actions/reports"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { UserProfileClient } from "./user-profile-client"

// S37 Profil korisnika · /korisnik/[id] · FR-67 · public (Visitor and signed-in; the (sapa) layout picks the shell).
// The profile is read by the client from EP-79 (GET /api/public/users/:id, not cached — TC ADR-18); this page only
// resolves the language: the signed-in user's profile locale (EP-43 get_me), else the Visitor's ml_locale cookie.

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Šapa pomoći · Moj Ljubimac" }

async function profileLocale(): Promise<Locale | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase.rpc("get_me")
    if (error) console.error("[korisnik/[id]] get_me:", error.message)
    const me = (data ?? null) as Me | null
    return me ? fromProfileLocale(me.locale) : null
  } catch (error) {
    console.error("[korisnik/[id]] session:", error instanceof Error ? error.message : error)
    return null
  }
}

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [signedInLocale, visitorLocale] = await Promise.all([profileLocale(), getVisitorLocale()])
  const locale = signedInLocale ?? visitorLocale
  const dict = getDictionary(locale)

  return (
    <UserProfileClient
      userId={id}
      locale={locale}
      copy={{ common: dict.common, sapa: dict.sapa.common, profile: dict.sapa.profile }}
      actions={{ submitReport, blockUser, unblockUser }}
    />
  )
}
