import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { getVisitorLocale, type Me } from "@/lib/actions/registration"
import { decideHouseholdInvitation, getHouseholdInvitation } from "@/lib/actions/invitations"
import { acceptTransfer, declineTransfer, getTransfer } from "@/lib/actions/transfers"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { InvitationLoading, InviteAcceptScreen, TransferAcceptScreen } from "./invite-accept-screen"

// S14 Prihvati poziv / karton · /poziv/[token] · household (Step 22), team-invitation (Step 24, og_) and
// record-transfer (Step 25, tr_) variants · auth-free route in the AuthShell. The token's type prefix picks the
// operation (API §9.3): hh_ / og_ → EP-39 (lib/actions/invitations.ts getHouseholdInvitation), tr_ → EP-60
// (lib/actions/transfers.ts getTransfer); both run on the server with or without a session. The signed-in user and
// their language come from EP-43, a Visitor's language from the ml_locale cookie. Invitations are decided through
// EP-40, transfers through EP-60 accept / decline. The loading variant is the Suspense fallback.

export const dynamic = "force-dynamic"

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function InvitationView({ token, locale, me }: { token: string; locale: Locale; me: Me | null }) {
  const dict = getDictionary(locale)
  const user = me ? { name: me.full_name ?? "", email: me.email } : null

  if (token.startsWith("tr_")) {
    const initial = await getTransfer({ token }).catch((error: unknown) => {
      console.error("[poziv/[token]] get_transfer_by_token:", error instanceof Error ? error.message : error)
      return { ok: false as const, error: { code: "internal_error", message: "get_transfer_by_token failed" } }
    })
    if (!initial.ok && initial.error.code !== "not_found" && initial.error.code !== "invitation_expired") {
      console.error("[poziv/[token]] get_transfer_by_token:", initial.error.message)
    }
    return (
      <TransferAcceptScreen
        token={token}
        initial={initial}
        user={user}
        locale={locale}
        copy={{ invitation: dict.invitation, pet: dict.pet, common: dict.common }}
        actions={{ acceptTransfer, declineTransfer }}
      />
    )
  }

  const initial = await getHouseholdInvitation({ token }).catch((error: unknown) => {
    console.error("[poziv/[token]] get_household_invitation:", error instanceof Error ? error.message : error)
    return { ok: false as const, error: { code: "internal_error", message: "get_household_invitation failed" } }
  })
  if (!initial.ok && initial.error.code !== "not_found" && initial.error.code !== "invitation_expired") {
    console.error("[poziv/[token]] get_household_invitation:", initial.error.message)
  }
  return (
    <InviteAcceptScreen
      token={token}
      initial={initial}
      user={user}
      locale={locale}
      copy={{ invitation: dict.invitation, pet: dict.pet, common: dict.common }}
      actions={{ decideHouseholdInvitation }}
    />
  )
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let me: Me | null = null
  if (user) {
    const { data, error } = await supabase.rpc("get_me")
    if (error) console.error("[poziv/[token]] get_me:", error.message)
    me = (data ?? null) as Me | null
  }
  const locale = me ? fromProfileLocale(me.locale) : await getVisitorLocale()
  return (
    <Suspense fallback={<InvitationLoading label={getDictionary(locale).invitation.loading} />}>
      <InvitationView token={safeDecode(token)} locale={locale} me={me} />
    </Suspense>
  )
}
