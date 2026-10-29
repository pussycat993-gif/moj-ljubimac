import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Toaster } from "@/components/ui/sonner"
import { AdminCountsProvider } from "./admin-screen"

// Admin area (Design §5.5, S26). Only Operators (profiles.is_operator, API §4.2) get in: no session →
// /prijava?next=/admin; signed in without is_operator → /ljubimci (owner decision, Step 28). The Admin
// AppShell is rendered by the screen, whose active item follows ?tab=. Confirmations are Sonner toasts at
// bottom centre, 4 s (Design §8). Step 28c: the shell's Moderacija badge (counts.moderacija) = EP-86 open_count,
// read here per page load and handed to the screen through AdminCountsProvider.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/prijava?next=/admin")

  const { data, error } = await supabase.from("profiles").select("is_operator").eq("id", user.id).maybeSingle()
  if (error) console.error("[admin/layout] profiles:", error.message)
  if (!data?.is_operator) redirect("/ljubimci")

  const moderation = await supabase.rpc("admin_list_moderation", { p_view: "open_reports", p_limit: 1, p_offset: 0 })
  if (moderation.error) console.error("[admin/layout] admin_list_moderation:", moderation.error.message)
  const openCount = Number((moderation.data as { open_count?: number } | null)?.open_count ?? 0)

  return (
    <AdminCountsProvider moderacija={openCount}>
      {children}
      <Toaster position="bottom-center" duration={4000} />
    </AdminCountsProvider>
  )
}
