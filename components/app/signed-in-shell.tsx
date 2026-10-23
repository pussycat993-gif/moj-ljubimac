"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AppShell, type AppShellLabels } from "@/components/app/shells"

// The nav key of the current route, for AppShell `active` (layouts cannot read the pathname).
function activeKey(pathname: string): string {
  const [first = "", second] = pathname.split("/").filter(Boolean)
  if (first === "organizacija") {
    if (second === "zahtevi") return "zahtevi"
    if (second === "legla") return "legla"
    if (second === "profil") return "javni-profil"
    return "zivotinje"
  }
  return first
}

/**
 * AppShell as the signed-in layouts render it (app/(app)/layout.tsx, app/(org)/layout.tsx):
 * user and labels come from EP-43 and the dictionary; `active` follows the current route.
 */
export function SignedInShell({
  variant,
  orgType,
  user,
  labels,
  counts,
  children,
}: {
  variant: "owner" | "organisation"
  orgType?: "shelter" | "breeder"
  user: { name: string }
  labels: AppShellLabels
  counts?: Record<string, number>
  children: ReactNode
}) {
  const pathname = usePathname() ?? ""
  return (
    <AppShell variant={variant} orgType={orgType} active={activeKey(pathname)} user={user} labels={labels} counts={counts}>
      {children}
    </AppShell>
  )
}
