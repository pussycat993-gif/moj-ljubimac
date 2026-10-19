"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import {
  Baby,
  Bell,
  Building2,
  ChartColumn,
  Globe,
  Inbox,
  MapPin,
  PawPrint,
  Radio,
  Settings,
  User,
  Users,
  type LucideIcon,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LogoMark } from "./logo-mark"

type NavItem = { key: string; label: string; href: string; icon: LucideIcon; mobile: boolean }

const ownerNav: NavItem[] = [
  { key: "ljubimci", label: "Ljubimci", href: "/ljubimci", icon: PawPrint, mobile: true },
  { key: "podsetnici", label: "Podsetnici", href: "/podsetnici", icon: Bell, mobile: true },
  { key: "partneri", label: "Partneri", href: "/partneri", icon: MapPin, mobile: true },
  { key: "domacinstvo", label: "Domaćinstvo", href: "/domacinstvo", icon: Users, mobile: false },
  { key: "podesavanja", label: "Podešavanja", href: "/podesavanja/podsetnici", icon: Settings, mobile: false },
  { key: "profil", label: "Profil", href: "/profil", icon: User, mobile: true },
]

function orgNav(type: "shelter" | "breeder"): NavItem[] {
  return [
    { key: "zivotinje", label: "Životinje", href: "/organizacija", icon: PawPrint, mobile: true },
    {
      key: "zahtevi",
      label: type === "shelter" ? "Zahtevi" : "Upiti",
      href: "/organizacija/zahtevi",
      icon: Inbox,
      mobile: true,
    },
    ...(type === "breeder"
      ? [{ key: "legla", label: "Legla", href: "/organizacija/legla", icon: Baby, mobile: true }]
      : []),
    { key: "tim", label: "Tim", href: "/organizacija?tab=tim", icon: Users, mobile: false },
    { key: "javni-profil", label: "Javni profil", href: "/organizacija/profil", icon: Globe, mobile: false },
    { key: "profil", label: "Profil", href: "/profil", icon: User, mobile: true },
  ]
}

const adminNav: NavItem[] = [
  { key: "azili", label: "Azili na čekanju", href: "/admin?tab=azili", icon: Building2, mobile: true },
  { key: "partneri", label: "Partneri", href: "/admin?tab=partneri", icon: MapPin, mobile: true },
  { key: "statistika", label: "Statistika", href: "/admin?tab=statistika", icon: ChartColumn, mobile: true },
  { key: "kanali", label: "Kanali", href: "/admin?tab=kanali", icon: Radio, mobile: true },
]

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("")
}

export function AppShell({
  variant = "owner",
  orgType = "shelter",
  active,
  user = { name: "Ivana Petrović" },
  userInitials,
  counts,
  topBarExtra,
  children,
}: {
  variant?: "owner" | "organisation" | "admin"
  orgType?: "shelter" | "breeder"
  active: string
  /** Signed-in person shown in the sidebar footer (computers). */
  user?: { name: string }
  /** Overrides initials derived from `user.name`. */
  userInitials?: string
  /** Count badges per nav key, e.g. `{ podsetnici: 3 }` (today's pending reminders). Shown in the sidebar and on the
   *  phone bottom nav. Zero or missing → no badge. */
  counts?: Record<string, number>
  topBarExtra?: ReactNode
  children: ReactNode
}) {
  const items = variant === "owner" ? ownerNav : variant === "organisation" ? orgNav(orgType) : adminNav
  const mobileItems = items.filter((i) => i.mobile)
  const initials = userInitials ?? initialsOf(user.name)

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar — computers */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-card md:flex">
        <div className="flex justify-center px-6 pt-6 pb-4">
          <LogoMark variant="full" className="w-36" />
        </div>
        <p className="px-6 pb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase" aria-hidden>
          Meni
        </p>
        <nav aria-label="Glavna navigacija" className="flex-1 space-y-1 overflow-y-auto px-3">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = item.key === active
            const count = counts?.[item.key]
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {count ? (
                  <span
                    className={cn(
                      "flex min-w-6 shrink-0 items-center justify-center rounded-full px-2 text-xs font-medium",
                      isActive ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                    )}
                  >
                    {count}
                    <span className="sr-only"> novih</span>
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Link
            href="/profil"
            className="flex min-w-0 items-center gap-3 rounded-sm p-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Avatar className="size-9">
              <AvatarFallback className="bg-muted text-sm font-medium text-foreground">{initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs font-medium text-muted-foreground">Moj nalog</span>
            </span>
          </Link>
        </div>
      </aside>

      {/* Top bar — phones */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2 md:hidden">
        <LogoMark variant="mark" />
        <div className="flex min-w-0 flex-1 justify-center">{topBarExtra}</div>
        <Avatar className="size-9">
          <AvatarFallback className="bg-muted text-sm text-foreground">{initials}</AvatarFallback>
        </Avatar>
      </header>

      <main className="pb-24 md:pb-0 md:pl-60">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8">{children}</div>
      </main>

      {/* Bottom navigation — phones */}
      <nav
        aria-label="Glavna navigacija"
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-card md:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
      >
        {mobileItems.map((item) => {
          const Icon = item.icon
          const isActive = item.key === active
          const count = counts?.[item.key]
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-medium",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon className="size-6" aria-hidden />
                {count ? (
                  <span className="absolute -top-1 left-4 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none font-medium text-primary-foreground">
                    {count}
                    <span className="sr-only"> novih</span>
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <LogoMark />
          <Button size="sm">Napravi nalog</Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:py-8">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-4 px-4 py-4 text-sm text-muted-foreground">
          <Link href="/privatnost" className="hover:text-foreground">
            Politika privatnosti
          </Link>
          <Link href="/uslovi" className="hover:text-foreground">
            Uslovi korišćenja
          </Link>
        </div>
      </footer>
    </div>
  )
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <LogoMark variant="full" />
      <div className="w-full max-w-md">{children}</div>
    </main>
  )
}
