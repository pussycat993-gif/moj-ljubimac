import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { SignedInShell } from "@/components/app/signed-in-shell"

// Organisation shell (Design §5.2). User, organisation type and language come from EP-43
// (profiles.locale, FR-35). Organisation data (EP-53) is wired in Step 24.
export default async function OrgLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/prijava")

  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[(org)/layout] get_me:", error.message)
  const me = (data ?? null) as Me | null
  if (!error && !me) redirect("/registracija")

  const dict = getDictionary(fromProfileLocale(me?.locale))
  return (
    <SignedInShell
      variant="organisation"
      orgType={me?.organisation?.type ?? "shelter"}
      user={{ name: me?.full_name || me?.email || user.email || "" }}
      labels={dict.shell.app}
    >
      {children}
    </SignedInShell>
  )
}
