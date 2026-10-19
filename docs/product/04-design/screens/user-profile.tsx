"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, Ban, CalendarDays, Flag, ListChecks, MapPin, MoreHorizontal, UserX } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell, PublicShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { ErrorState } from "../components/error-state"
import { ListingCard, type ListingSummary } from "../components/listing-card"
import { ReadOnlyBanner } from "../components/read-only-banner"
import { BlockDialog, ReportDialog } from "../components/safety-dialogs"
import { StateSwitcher } from "../components/state-switcher"

// S37 — Profil korisnika · /korisnik/[id] · FR-67, FR-70 (EP-79, EP-84, EP-85)
// Public: display name (nickname or "Ime P."), city, member since, active listings. Never email or phone (FR-67).
// Shelters have no S37 — their author link goes to the public organisation page S23.

type ViewState = "default" | "signed_out" | "loading" | "empty" | "error" | "blocked" | "unavailable"

const user = {
  id: "u-marko",
  name: "Marko J.",
  initials: "MJ",
  city: "Novi Sad",
  memberSince: "septembra 2026.",
}

const listings: ListingSummary[] = [
  {
    id: "l3",
    type: "selling",
    title: "Prodajem transporter za psa",
    city: "Novi Sad",
    category: "carriers",
    species: "dog",
    priceRsd: 2500,
    author: "Marko J.",
    publishedOn: "18. 10. 2026.",
    photoCount: 4,
  },
  {
    id: "l14",
    type: "giving",
    title: "Poklanjam četku za dugodlake pse",
    city: "Novi Sad",
    category: "equipment_toys",
    species: "dog",
    author: "Marko J.",
    publishedOn: "11. 10. 2026.",
    photoCount: 1,
  },
  {
    id: "l15",
    type: "seeking",
    title: "Tražim rampu za psa za auto",
    city: "Novi Sad",
    category: "other",
    species: "dog",
    author: "Marko J.",
    publishedOn: "02. 10. 2026.",
    photoCount: 0,
  },
]

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Učitavanje">
      <Card className="flex-row items-center gap-4 p-4 md:p-6">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-md" />
        ))}
      </div>
    </div>
  )
}

export default function UserProfileScreen() {
  const [view, setView] = useState<ViewState>("default")
  const [reportOpen, setReportOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)

  const signedIn = view !== "signed_out"
  const blocked = view === "blocked"
  const shown = view === "empty" || blocked ? [] : listings

  const content = (
    <>
      <StateSwitcher
        states={[
          { value: "default", label: "Podrazumevano" },
          { value: "signed_out", label: "Bez prijave" },
          { value: "loading", label: "Učitavanje" },
          { value: "empty", label: "Bez oglasa" },
          { value: "error", label: "Greška" },
          { value: "blocked", label: "Blokiran" },
          { value: "unavailable", label: "Nedostupan profil" },
        ]}
        value={view}
        onChange={setView}
      />

      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 md:h-8">
          <Link href="/sapa-pomoci">
            <ArrowLeft className="size-4" aria-hidden />
            Šapa pomoći
          </Link>
        </Button>

        {view === "loading" && (
          <>
            <h1 className="sr-only">Profil korisnika</h1>
            <ProfileSkeleton />
          </>
        )}
        {view === "error" && (
          <>
            <h1 className="sr-only">Profil korisnika</h1>
            <ErrorState onRetry={() => setView("default")} />
          </>
        )}
        {view === "unavailable" && (
          <>
            <h1 className="sr-only">Profil nije dostupan</h1>
            <EmptyState
              icon={UserX}
              title="Profil nije dostupan"
              description="Ovaj korisnik više nije u Šapi pomoći ili je nalog obrisan."
              action="Nazad na Šapu pomoći"
              href="/sapa-pomoci"
            />
          </>
        )}

        {!["loading", "error", "unavailable"].includes(view) && (
          <>
            <Card className="gap-4 p-4 md:p-6">
              <div className="flex min-w-0 items-start gap-4">
                <Avatar className="size-20 shrink-0">
                  <AvatarFallback className="bg-muted font-heading text-[28px] font-bold text-foreground">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-1">
                  <h1 className="truncate font-heading text-[28px] leading-9 font-bold">{user.name}</h1>
                  <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{user.city}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">Član od {user.memberSince}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <ListChecks className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">Aktivnih oglasa: {blocked ? "—" : shown.length}</span>
                  </p>
                </div>
                {signedIn && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label="Više radnji">
                        <MoreHorizontal className="size-5" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                        <Flag className="size-4" aria-hidden />
                        Prijavi korisnika
                      </DropdownMenuItem>
                      {!blocked && (
                        <DropdownMenuItem variant="destructive" onSelect={() => setBlockOpen(true)}>
                          <Ban className="size-4" aria-hidden />
                          Blokiraj
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Mejl i telefon se ne prikazuju. Javi se porukom iz nekog od oglasa.
              </p>
            </Card>

            {blocked && (
              <div className="space-y-3">
                <ReadOnlyBanner reason="Blokirao/la si ovog korisnika. Ne može da ti šalje poruke, a ti ne vidiš oglase te osobe." />
                <Button variant="outline" className="h-11 md:h-9" onClick={() => setView("default")}>
                  Odblokiraj
                </Button>
              </div>
            )}

            {!blocked && (
              <section aria-labelledby="active-heading" className="space-y-4">
                <h2 id="active-heading" className="font-heading text-[22px] leading-7 font-bold">
                  Aktivni oglasi
                </h2>
                {shown.length === 0 ? (
                  <EmptyState
                    icon={ListChecks}
                    title="Trenutno nema aktivnih oglasa"
                    description={`${user.name} sada nema aktivnih oglasa. Pogledaj ostale oglase u Šapi pomoći.`}
                    action="Pogledaj oglase"
                    href="/sapa-pomoci"
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {shown.map((l) => (
                      <ListingCard key={l.id} listing={l} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} target="user" name={user.name} />
      <BlockDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        name={user.name}
        onConfirm={() => {
          setBlockOpen(false)
          setView("blocked")
        }}
      />
    </>
  )

  return <Frame signedIn={signedIn}>{content}</Frame>
}

function Frame({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  if (!signedIn) return <PublicShell wide>{children}</PublicShell>
  return (
    <AppShell active="sapa-pomoci" counts={{ podsetnici: 2, poruke: 2 }}>
      {children}
    </AppShell>
  )
}
