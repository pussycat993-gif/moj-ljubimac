import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Toaster } from "@/components/ui/sonner"

// Admin area (Design §5.5, S26). Only Operators (profiles.is_operator, API §4.2) get in: no session →
// /prijava?next=/admin; signed in without is_operator → /ljubimci (owner decision, Step 28). The Admin
// AppShell is rendered by the screen, whose active item follows ?tab=. Confirmations are Sonner toasts at
// bottom centre, 4 s (Design §8).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/prijava?next=/admin")

  const { data, error } = await supabase.from("profiles").select("is_operator").eq("id", user.id).maybeSingle()
  if (error) console.error("[admin/layout] profiles:", error.message)
  if (!data?.is_operator) redirect("/ljubimci")

  return (
    <>
      {children}
      <Toaster position="bottom-center" duration={4000} />
    </>
  )
}
