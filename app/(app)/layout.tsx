import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { SignedInShell } from "@/components/app/signed-in-shell"

// App shell (Design §5.1). User, role and language come from EP-43 (profiles.locale, FR-35).
// No profile yet → the S15 completion step. Count badges are wired in Step 17 (EP-25).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/prijava")

  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[(app)/layout] get_me:", error.message)
  const me = (data ?? null) as Me | null
  if (!error && !me) redirect("/registracija")

  const dict = getDictionary(fromProfileLocale(me?.locale))
  return (
    <SignedInShell
      variant={me?.organisation ? "organisation" : "owner"}
      orgType={me?.organisation?.type}
      user={{ name: me?.full_name || me?.email || user.email || "" }}
      labels={dict.shell.app}
    >
      {children}
    </SignedInShell>
  )
}
