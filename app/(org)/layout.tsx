import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { SignedInShell } from "@/components/app/signed-in-shell"
import { Toaster } from "@/components/ui/sonner"

// Organisation shell (Design §5.2). User and language come from EP-43 (profiles.locale, FR-35); the organisation
// type from EP-53 (rpc:get_my_organisation). The workspace admits anyone EP-53 returns an organisation for —
// shelter and breeder accounts and team members with their own (owner) account (BR-53, owner decision,
// Step 24); without an organisation (EP-53 404) → S01. Confirmations are Sonner toasts at bottom centre, 4 s
// (Design §8).
export default async function OrgLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/prijava")

  const [{ data, error }, organisation] = await Promise.all([
    supabase.rpc("get_me"),
    supabase.rpc("get_my_organisation"),
  ])
  if (error) console.error("[(org)/layout] get_me:", error.message)
  const me = (data ?? null) as Me | null
  if (!error && !me) redirect("/registracija")
  if (organisation.error) {
    if (organisation.error.message === "not_found") redirect("/ljubimci")
    console.error("[(org)/layout] get_my_organisation:", organisation.error.message)
  }
  const orgType =
    (organisation.data as { organisation?: { type?: "shelter" | "breeder" } } | null)?.organisation?.type ??
    me?.organisation?.type ??
    "shelter"

  const dict = getDictionary(fromProfileLocale(me?.locale))
  return (
    <SignedInShell
      variant="organisation"
      orgType={orgType}
      user={{ name: me?.full_name || me?.email || user.email || "" }}
      labels={dict.shell.app}
    >
      {children}
      <Toaster position="bottom-center" duration={4000} />
    </SignedInShell>
  )
}
