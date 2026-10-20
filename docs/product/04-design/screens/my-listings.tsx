"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import {
  CircleCheck,
  EyeOff,
  ImageIcon,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { ErrorState } from "../components/error-state"
import { listingPriceLine } from "../components/listing-card"
import { ListingTypeTag, outcomeForType, type ListingStatus, type ListingType } from "../components/listing-type-tag"
import { PremiumLock } from "../components/premium-lock"
import { StateSwitcher } from "../components/state-switcher"
import { StatusBadge } from "../components/status-badge"

// S35 — Moji oglasi · /sapa-pomoci/moje · FR-64, FR-65 (EP-76, EP-77)
// Edit, extend (+30 days from now), mark resolved (one outcome per type), delete. Free: 3 active (BR-55).

type ViewState = "default" | "loading" | "empty" | "error" | "premium_locked" | "suspended"
type TabKey = "active" | "expired" | "resolved"

type MyListing = {
  id: string
  type: ListingType
  title: string
  priceRsd?: number
  negotiable?: boolean
  status: ListingStatus
  expiresOn: string
  daysLeft?: number
  conversations: number
  unread: number
  photoCount: number
  resolvedLabel?: string
  hiddenReason?: string
}

const initial: MyListing[] = [
  {
    id: "l2",
    type: "giving",
    title: "Poklanjam grebalicu za mačke, Bečej",
    status: "active",
    expiresOn: "17. 11. 2026.",
    daysLeft: 29,
    conversations: 2,
    unread: 1,
    photoCount: 3,
  },
  {
    id: "l10",
    type: "selling",
    title: "Prodajem ležaljku za psa, veličina M",
    priceRsd: 1800,
    status: "active",
    expiresOn: "22. 10. 2026.",
    daysLeft: 3,
    conversations: 0,
    unread: 0,
    photoCount: 2,
  },
  {
    id: "l11",
    type: "seeking",
    title: "Tražim rashladnu prostirku za psa",
    status: "hidden",
    expiresOn: "05. 11. 2026.",
    conversations: 1,
    unread: 0,
    photoCount: 0,
    hiddenReason: "Sakrio operater 18. 10. 2026. — razlog: neprimeren sadržaj. Piši na podrska@mojljubimac.rs ako misliš da je greška.",
  },
  {
    id: "l12",
    type: "selling",
    title: "Prodajem automatsku hranilicu",
    negotiable: true,
    status: "expired",
    expiresOn: "10. 10. 2026.",
    conversations: 3,
    unread: 0,
    photoCount: 1,
  },
  {
    id: "l13",
    type: "giving",
    title: "Poklanjam 3 kg granula za mačke",
    status: "resolved",
    expiresOn: "01. 10. 2026.",
    conversations: 4,
    unread: 0,
    photoCount: 1,
    resolvedLabel: "Poklonjeno 28. 09. 2026.",
  },
]

const FREE_LIMIT = 3

function RowsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Učitavanje">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex-row items-center gap-3 p-4">
          <Skeleton className="size-16 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </Card>
      ))}
    </div>
  )
}

function TabBody({
  rows,
  emptyTitle,
  emptyText,
  view,
  tab,
  suspended,
  onRetry,
  Row,
}: {
  rows: MyListing[]
  emptyTitle: string
  emptyText: string
  view: ViewState
  tab: TabKey
  suspended: boolean
  onRetry: () => void
  Row: (props: { l: MyListing }) => ReactNode
}) {
  if (view === "loading") return <RowsSkeleton />
  if (view === "error") return <ErrorState onRetry={onRetry} />
  if (rows.length === 0)
    return (
      <EmptyState
        icon={ListChecks}
        title={emptyTitle}
        description={emptyText}
        action={tab === "active" && !suspended ? "Novi oglas" : undefined}
        href="/sapa-pomoci/nova"
      />
    )
  return (
    <div className="space-y-3">
      {rows.map((l) => (
        <Row key={l.id} l={l} />
      ))}
    </div>
  )
}

export default function MyListingsScreen() {
  const [view, setView] = useState<ViewState>("default")
  const [tab, setTab] = useState<TabKey>("active")
  const [items, setItems] = useState<MyListing[]>(initial)
  const [notice, setNotice] = useState("")
  const [resolving, setResolving] = useState<MyListing | null>(null)
  const [deleting, setDeleting] = useState<MyListing | null>(null)

  const suspended = view === "suspended"
  const list = view === "empty" ? [] : items
  const active = list.filter((l) => l.status === "active" || l.status === "hidden")
  const expired = list.filter((l) => l.status === "expired")
  const resolved = list.filter((l) => l.status === "resolved")
  // premium_locked mock: a third active listing exists, so the Free limit is reached.
  const activeCount = view === "premium_locked" ? 3 : list.filter((l) => l.status === "active").length
  const limitReached = activeCount >= FREE_LIMIT

  function changeView(v: ViewState) {
    setView(v)
    setNotice("")
    setItems(initial)
  }

  function extend(l: MyListing) {
    setItems((prev) =>
      prev.map((x) => (x.id === l.id ? { ...x, status: "active", expiresOn: "18. 11. 2026.", daysLeft: 30 } : x)),
    )
    setNotice(`„${l.title}“ je produžen do 18. 11. 2026.`)
  }

  function resolve() {
    if (!resolving) return
    const label = outcomeForType[resolving.type].label
    setItems((prev) =>
      prev.map((x) =>
        x.id === resolving.id ? { ...x, status: "resolved", resolvedLabel: `${label} 19. 10. 2026.` } : x,
      ),
    )
    setNotice(`„${resolving.title}“ je označen kao rešen — ${label}.`)
    setResolving(null)
  }

  function remove() {
    if (!deleting) return
    setItems((prev) => prev.filter((x) => x.id !== deleting.id))
    setNotice(`„${deleting.title}“ je obrisan.`)
    setDeleting(null)
  }

  function Row({ l }: { l: MyListing }) {
    const price = listingPriceLine(l)
    const canExtend = !suspended && (l.status === "active" || l.status === "expired")
    const extendBlocked = l.status === "expired" && limitReached
    return (
      <Card className="gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-sm bg-foreground/5 md:size-16">
            <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ListingTypeTag type={l.type} />
              {l.status === "active" && l.daysLeft !== undefined && l.daysLeft <= 3 && (
                <StatusBadge status="soon" label={`Ističe za ${l.daysLeft} dana`} />
              )}
              {l.status === "active" && (l.daysLeft === undefined || l.daysLeft > 3) && (
                <StatusBadge status="done" label="Aktivan" />
              )}
              {l.status === "hidden" && <StatusBadge status="missed" label="Sakriven" />}
              {l.status === "expired" && <StatusBadge status="missed" label="Istekao" />}
              {l.status === "resolved" && <StatusBadge status="done" label="Rešeno" />}
            </div>
            <Link
              href={`/sapa-pomoci/${l.id}`}
              className="line-clamp-2 font-heading text-lg font-bold break-words hover:underline"
            >
              {l.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {price ? `${price} · ` : ""}
              {l.status === "resolved"
                ? l.resolvedLabel
                : l.status === "expired"
                  ? `Istekao ${l.expiresOn}`
                  : `Aktivan do ${l.expiresOn}`}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`Radnje: ${l.title}`}>
                <MoreHorizontal className="size-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!suspended && l.status !== "resolved" && (
                <DropdownMenuItem asChild>
                  <Link href={`/sapa-pomoci/${l.id}/izmeni`}>
                    <Pencil className="size-4" aria-hidden />
                    Izmeni
                  </Link>
                </DropdownMenuItem>
              )}
              {l.status === "active" && (
                <DropdownMenuItem onSelect={() => setResolving(l)}>
                  <CircleCheck className="size-4" aria-hidden />
                  Označi kao rešeno
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(l)}>
                <Trash2 className="size-4" aria-hidden />
                Obriši
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {l.status === "hidden" && l.hiddenReason && (
          <p className="flex items-start gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">{l.hiddenReason}</span>
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/poruke"
            className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground md:min-h-9"
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            <span className="truncate">
              {l.conversations === 0 ? "Još nema poruka" : `Razgovora: ${l.conversations}`}
              {l.unread > 0 && <span className="font-medium text-foreground"> · nepročitano: {l.unread}</span>}
            </span>
          </Link>
          {canExtend && (
            <Button
              variant={l.status === "expired" || (l.daysLeft ?? 99) <= 3 ? "default" : "outline"}
              size="sm"
              className="h-11 md:h-8"
              disabled={extendBlocked}
              aria-describedby={extendBlocked ? `ext-${l.id}` : undefined}
              onClick={() => extend(l)}
            >
              <RefreshCw className="size-4" aria-hidden />
              {l.status === "expired" ? "Objavi ponovo (30 dana)" : "Produži 30 dana"}
            </Button>
          )}
        </div>
        {extendBlocked && (
          <p id={`ext-${l.id}`} className="text-sm text-muted-foreground">
            Imaš 3 aktivna oglasa — reši jedan ili pređi na Premium da ponovo objaviš ovaj.
          </p>
        )}
      </Card>
    )
  }

  return (
    <AppShell active="sapa-pomoci" counts={{ podsetnici: 2, poruke: 2 }}>
      <StateSwitcher
        states={[
          { value: "default", label: "Podrazumevano" },
          { value: "loading", label: "Učitavanje" },
          { value: "empty", label: "Prazno" },
          { value: "error", label: "Greška" },
          { value: "premium_locked", label: "Premium zaključano (3 / 3)" },
          { value: "suspended", label: "Isključen/a" },
        ]}
        value={view}
        onChange={changeView}
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-9 font-bold">Moji oglasi</h1>
            <p className="text-sm text-muted-foreground">Oglasi traju 30 dana. Podsetićemo te mejlom 3 dana pre isteka.</p>
          </div>
          {!suspended && !limitReached && (
            <Button asChild className="h-11 md:h-9">
              <Link href="/sapa-pomoci/nova">
                <Plus className="size-5" aria-hidden />
                Novi oglas
              </Link>
            </Button>
          )}
        </div>

        {suspended && (
          <Card role="status" className="flex-row items-start gap-3 px-4 py-3">
            <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
            <p className="min-w-0 text-sm">
              Tvoj nalog je isključen iz Šape pomoći. Tvoji oglasi su skriveni za druge, a nove ne možeš da objavljuješ.
              Možeš da ih obrišeš.
            </p>
          </Card>
        )}

        {view !== "loading" && view !== "error" && !suspended && (
          <Card className="gap-3 p-4 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-bold">Aktivni oglasi</h2>
              <span className="text-sm font-medium">
                {activeCount} / {FREE_LIMIT}
              </span>
            </div>
            <Progress
              value={(Math.min(activeCount, FREE_LIMIT) / FREE_LIMIT) * 100}
              aria-label={`Aktivnih oglasa ${activeCount} od ${FREE_LIMIT} na Free planu`}
            />
            <p className="text-sm text-muted-foreground">
              Na Free planu imaš do 3 aktivna oglasa. Sakriveni oglasi se ne računaju. Premium: bez ograničenja.
            </p>
          </Card>
        )}

        {view === "premium_locked" && (
          <PremiumLock description="Imaš 3 aktivna oglasa, koliko dozvoljava Free plan. Sa Premiumom objavljuješ bez ograničenja — ili označi neki oglas kao rešen." />
        )}

        {notice && (
          <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
            <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
            <p className="min-w-0 text-sm">{notice}</p>
          </Card>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <div className="overflow-x-auto overflow-y-hidden">
            <TabsList>
              <TabsTrigger value="active">Aktivni ({active.length})</TabsTrigger>
              <TabsTrigger value="expired">Istekli ({expired.length})</TabsTrigger>
              <TabsTrigger value="resolved">Rešeni ({resolved.length})</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="active" className="mt-4">
            <TabBody
              view={view}
              tab={tab}
              suspended={suspended}
              onRetry={() => setView("default")}
              Row={Row}
              rows={active}
              emptyTitle="Još nemaš aktivnih oglasa"
              emptyText="Pokloni ili prodaj nešto što tvom ljubimcu više ne treba, ili potraži ono što mu treba."
            />
          </TabsContent>
          <TabsContent value="expired" className="mt-4">
            <TabBody
              view={view}
              tab={tab}
              suspended={suspended}
              onRetry={() => setView("default")}
              Row={Row}
              rows={expired}
              emptyTitle="Nema isteklih oglasa"
              emptyText="Oglasi kojima prođe 30 dana prelaze ovde. Možeš da ih objaviš ponovo."
            />
          </TabsContent>
          <TabsContent value="resolved" className="mt-4">
            <TabBody
              view={view}
              tab={tab}
              suspended={suspended}
              onRetry={() => setView("default")}
              Row={Row}
              rows={resolved}
              emptyTitle="Nema rešenih oglasa"
              emptyText="Kad nešto pokloniš, prodaš ili pronađeš, označi oglas kao rešen."
            />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={resolving !== null} onOpenChange={(o) => !o && setResolving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Označiti kao rešeno — {resolving ? outcomeForType[resolving.type].label : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Oglas „{resolving?.title}“ se sklanja iz Šape pomoći i prelazi u „Rešeni“. Razgovori ostaju sačuvani.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={resolve}>Da, rešeno je</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obrisati oglas?</AlertDialogTitle>
            <AlertDialogDescription>
              Oglas „{deleting?.title}“ i njegove fotografije brišemo trajno. Ovo ne može da se poništi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Da, obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
