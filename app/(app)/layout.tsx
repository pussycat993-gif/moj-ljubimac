import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { SignedInShell } from "@/components/app/signed-in-shell"
import { Toaster } from "@/components/ui/sonner"

// App shell (Design §5.1). User, role and language come from EP-43 (profiles.locale, FR-35).
// No profile yet → the S15 completion step. The Podsetnici count badge = EP-25 `total` for
// filter=today (today's pending reminders); zero → no badge (Step 17).
// Confirmations are Sonner toasts at bottom centre, 4 s (Design §8; owner decision, Step 13).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/prijava")

  const [{ data, error }, today] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.rpc("list_reminder_occurrences", { p_filter: "today" }),
  ])
  if (error) console.error("[(app)/layout] get_me:", error.message)
  if (today.error) console.error("[(app)/layout] list_reminder_occurrences:", today.error.message)
  const me = (data ?? null) as Me | null
  if (!error && !me) redirect("/registracija")
  const todayTotal = today.error ? 0 : Number((today.data as { total?: number } | null)?.total ?? 0)

  const dict = getDictionary(fromProfileLocale(me?.locale))
  return (
    <SignedInShell
      variant={me?.organisation ? "organisation" : "owner"}
      orgType={me?.organisation?.type}
      user={{ name: me?.full_name || me?.email || user.email || "" }}
      labels={dict.shell.app}
      counts={{ podsetnici: todayTotal }}
    >
      {children}
      <Toaster position="bottom-center" duration={4000} />
    </SignedInShell>
  )
}
