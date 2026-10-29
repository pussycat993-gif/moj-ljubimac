import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getVisitorLocale, type Me } from "@/lib/actions/registration"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { SignedInShell } from "@/components/app/signed-in-shell"
import { PublicShell } from "@/components/app/shells"
import { Toaster } from "@/components/ui/sonner"

// Šapa pomoći shell (CR-27, Design §5.1–§5.3, §11): S32–S37 are shown both signed out and signed in, so this route
// group picks the shell from the session. No session → PublicShell wide, in the Visitor's language (ml_locale
// cookie). Organisation member → the organisation AppShell with its type; otherwise the owner AppShell — the same
// EP-43 fields as app/(app)/layout.tsx and app/(org)/layout.tsx, and for owners the same Podsetnici badge source
// (EP-25 total for filter=today, Step 17). No profile yet → the S15 completion step. The signed-in-only pages
// (/sapa-pomoci/nova, /sapa-pomoci/moje, /sapa-pomoci/<id>/izmeni, /poruke) are guarded by the request-interception
// file. The Poruke badge = EP-43 Me.marketplace.unread_conversations, read per page load (Step 28c, NFR-11).
// Confirmations are Sonner toasts at bottom centre, 4 s (Design §8).
export default async function SapaLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const dict = getDictionary(await getVisitorLocale())
    return (
      <PublicShell wide labels={dict.shell.public}>
        {children}
        <Toaster position="bottom-center" duration={4000} />
      </PublicShell>
    )
  }

  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[(sapa)/layout] get_me:", error.message)
  const me = (data ?? null) as Me | null
  if (!error && !me) redirect("/registracija")

  const organisation = me?.organisation ?? null
  let todayTotal = 0
  if (!organisation) {
    const today = await supabase.rpc("list_reminder_occurrences", { p_filter: "today" })
    if (today.error) console.error("[(sapa)/layout] list_reminder_occurrences:", today.error.message)
    else todayTotal = Number((today.data as { total?: number } | null)?.total ?? 0)
  }

  const unread = Number((me as { marketplace?: { unread_conversations?: number } | null } | null)?.marketplace?.unread_conversations ?? 0)

  const dict = getDictionary(fromProfileLocale(me?.locale))
  return (
    <SignedInShell
      variant={organisation ? "organisation" : "owner"}
      orgType={organisation?.type}
      user={{ name: me?.full_name || me?.email || user.email || "" }}
      labels={dict.shell.app}
      counts={organisation ? { poruke: unread } : { podsetnici: todayTotal, poruke: unread }}
    >
      {children}
      <Toaster position="bottom-center" duration={4000} />
    </SignedInShell>
  )
}
