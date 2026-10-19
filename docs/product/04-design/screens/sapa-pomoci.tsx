"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, HandHeart, ListChecks, LogIn, Plus, SearchX, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell, PublicShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { ErrorState } from "../components/error-state"
import { ListingCard, type ListingSummary } from "../components/listing-card"
import {
  listingCategoryLabel,
  type ListingCategory,
  type ListingSpecies,
  type ListingType,
} from "../components/listing-type-tag"
import { StateSwitcher } from "../components/state-switcher"

// S32 — Šapa pomoći · /sapa-pomoci · FR-61 (EP-73)
// Public list: visible without sign-in (PublicShell), AppShell when signed in. Newest first, offset pages.
// Listings of users you blocked are already filtered out by EP-73 (BR-59).

type ViewState = "default" | "signed_out" | "loading" | "empty" | "error" | "suspended"
type TypeFilter = "all" | ListingType

const typeChips: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Sve" },
  { value: "need", label: "Potrebe azila" },
  { value: "giving", label: "Poklanjam" },
  { value: "selling", label: "Prodajem" },
  { value: "seeking", label: "Tražim" },
]

// Shared city list — same in registration (S15) and profile (S18).
const cities = ["Novi Sad", "Beograd", "Niš", "Kragujevac", "Subotica", "Bečej", "Zrenjanin", "Sombor", "Čačak", "Kraljevo"]

const listings: ListingSummary[] = [
  {
    id: "l1",
    type: "need",
    title: "Potrebno 20 kg granula za odrasle pse",
    city: "Novi Sad",
    category: "food",
    species: "dog",
    author: "Azil „Druga šansa“",
    authorIsShelter: true,
    publishedOn: "19. 10. 2026.",
    photoCount: 1,
  },
  {
    id: "l2",
    type: "giving",
    title: "Poklanjam grebalicu za mačke, Bečej",
    city: "Bečej",
    category: "furniture",
    species: "cat",
    author: "Ivana P.",
    publishedOn: "18. 10. 2026.",
    photoCount: 3,
  },
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
    id: "l4",
    type: "seeking",
    title: "Tražim kavez za zeca",
    city: "Novi Sad",
    category: "furniture",
    species: "other",
    author: "Jelena S.",
    publishedOn: "17. 10. 2026.",
    photoCount: 0,
  },
  {
    id: "l5",
    type: "need",
    title: "Potrebne ćebad i peškiri za zimu",
    city: "Bečej",
    category: "other",
    species: "dog",
    author: "Azil „Šapa nade“",
    authorIsShelter: true,
    publishedOn: "16. 10. 2026.",
    photoCount: 2,
  },
  {
    id: "l6",
    type: "selling",
    title: "Prodajem kućicu za mačke, malo korišćena",
    city: "Beograd",
    category: "furniture",
    species: "cat",
    negotiable: true,
    author: "Ana M.",
    publishedOn: "15. 10. 2026.",
    photoCount: 2,
  },
  {
    id: "l7",
    type: "giving",
    title: "Poklanjam ogrlice i povoce za male pse",
    city: "Novi Sad",
    category: "equipment_toys",
    species: "dog",
    author: "Nikola R.",
    publishedOn: "14. 10. 2026.",
    photoCount: 1,
  },
  {
    id: "l8",
    type: "need",
    title: "Potrebne kapi protiv buva i krpelja",
    city: "Novi Sad",
    category: "medicine_care",
    species: "cat",
    author: "Azil „Druga šansa“",
    authorIsShelter: true,
    publishedOn: "13. 10. 2026.",
    photoCount: 1,
  },
  {
    id: "l9",
    type: "seeking",
    title: "Tražim igračke za mačiće",
    city: "Subotica",
    category: "equipment_toys",
    species: "cat",
    author: "Milica T.",
    publishedOn: "12. 10. 2026.",
    photoCount: 0,
  },
]

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Učitavanje">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="gap-0 overflow-hidden py-0">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export default function SapaPomociScreen() {
  const [view, setView] = useState<ViewState>("default")
  const [type, setType] = useState<TypeFilter>("all")
  const [category, setCategory] = useState<"all" | ListingCategory>("all")
  const [species, setSpecies] = useState<"all" | ListingSpecies>("all")
  const [city, setCity] = useState("all")
  const [page, setPage] = useState(1)

  const signedIn = view !== "signed_out"
  const suspended = view === "suspended"
  const filtered =
    view === "empty"
      ? []
      : listings.filter(
          (l) =>
            (type === "all" || l.type === type) &&
            (category === "all" || l.category === category) &&
            (species === "all" || l.species === species) &&
            (city === "all" || l.city === city),
        )
  const hasFilters = type !== "all" || category !== "all" || species !== "all" || city !== "all"
  const totalPages = 3

  function resetFilters() {
    setType("all")
    setCategory("all")
    setSpecies("all")
    setCity("all")
    setPage(1)
  }

  const content = (
    <>
      <StateSwitcher
        states={[
          { value: "default", label: "Podrazumevano (prijavljen/a)" },
          { value: "signed_out", label: "Bez prijave" },
          { value: "loading", label: "Učitavanje" },
          { value: "empty", label: "Prazno" },
          { value: "error", label: "Greška" },
          { value: "suspended", label: "Isključen/a iz Šape pomoći" },
        ]}
        value={view}
        onChange={(v) => {
          setView(v)
          setPage(1)
        }}
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-[28px] leading-9 font-bold">Šapa pomoći</h1>
            <p className="text-sm text-muted-foreground">
              Poklanjaj, prodaj ili potraži stvari za ljubimce — i pomozi azilima u svom gradu.
            </p>
          </div>
          {signedIn && !suspended && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" className="h-11 md:h-9">
                <Link href="/sapa-pomoci/moje">
                  <ListChecks className="size-4" aria-hidden />
                  Moji oglasi
                </Link>
              </Button>
              <Button asChild className="h-11 md:h-9">
                <Link href="/sapa-pomoci/nova">
                  <Plus className="size-5" aria-hidden />
                  Novi oglas
                </Link>
              </Button>
            </div>
          )}
        </div>

        {!signedIn && (
          <Card className="flex-col gap-3 p-4 md:flex-row md:items-center md:p-6">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
              <HandHeart className="size-5 text-primary" aria-hidden />
            </span>
            <p className="min-w-0 flex-1 text-sm">
              Oglase možeš da pregledaš i bez naloga. Prijavi se da pošalješ poruku, objaviš oglas ili doniraš azilu.
            </p>
            <Button asChild className="h-11 shrink-0 md:h-9">
              <Link href="/prijava">
                <LogIn className="size-4" aria-hidden />
                Prijavi se
              </Link>
            </Button>
          </Card>
        )}

        {suspended && (
          <Card role="status" className="flex-row items-start gap-3 px-4 py-3">
            <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
            <p className="min-w-0 text-sm">
              Tvoj nalog je isključen iz Šape pomoći zbog prijava drugih korisnika. Oglase i dalje vidiš, ali ne možeš
              da objavljuješ oglase ni da šalješ poruke. Ako misliš da je greška, piši nam na podrska@mojljubimac.rs.
            </p>
          </Card>
        )}

        <section aria-label="Filteri" className="space-y-3">
          <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1" role="group" aria-label="Vrsta oglasa">
            {typeChips.map((c) => (
              <Button
                key={c.value}
                size="sm"
                variant={type === c.value ? "default" : "outline"}
                aria-pressed={type === c.value}
                className="shrink-0"
                onClick={() => {
                  setType(c.value)
                  if (c.value !== "need" && category === "medicine_care") setCategory("all")
                  setPage(1)
                }}
              >
                {c.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="f-category" className="text-xs font-medium text-muted-foreground">
                Kategorija
              </Label>
              <Select value={category} onValueChange={(v) => setCategory(v as "all" | ListingCategory)}>
                <SelectTrigger id="f-category" className="h-11 w-full bg-card md:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sve kategorije</SelectItem>
                  {(Object.keys(listingCategoryLabel) as ListingCategory[])
                    .filter((k) => k !== "medicine_care" || type === "all" || type === "need")
                    .map((k) => (
                      <SelectItem key={k} value={k}>
                        {listingCategoryLabel[k]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="f-species" className="text-xs font-medium text-muted-foreground">
                Za koga
              </Label>
              <Select value={species} onValueChange={(v) => setSpecies(v as "all" | ListingSpecies)}>
                <SelectTrigger id="f-species" className="h-11 w-full bg-card md:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sve životinje</SelectItem>
                  <SelectItem value="dog">Psi</SelectItem>
                  <SelectItem value="cat">Mačke</SelectItem>
                  <SelectItem value="other">Ostale životinje</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="f-city" className="text-xs font-medium text-muted-foreground">
                Grad
              </Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger id="f-city" className="h-11 w-full bg-card md:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Svi gradovi</SelectItem>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {view === "loading" && <LoadingGrid />}
        {view === "error" && <ErrorState onRetry={() => setView("default")} />}

        {view !== "loading" && view !== "error" && filtered.length === 0 && (
          <EmptyState
            icon={SearchX}
            title={hasFilters ? "Nema oglasa za ove filtere" : "Još nema oglasa"}
            description={
              hasFilters
                ? "Probaj drugu kategoriju ili grad, ili poništi filtere."
                : "Budi prvi/a — pokloni ili prodaj nešto što tvom ljubimcu više ne treba."
            }
            action={hasFilters ? "Poništi filtere" : signedIn && !suspended ? "Novi oglas" : undefined}
            onAction={hasFilters ? resetFilters : undefined}
            href={hasFilters ? undefined : "/sapa-pomoci/nova"}
          />
        )}

        {view !== "loading" && view !== "error" && filtered.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              {hasFilters ? `${filtered.length} oglasa` : "48 oglasa"} · najnoviji prvo
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
            {!hasFilters && (
              <nav aria-label="Strane" className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  className="h-11 md:h-9"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Prethodna
                </Button>
                <span className="text-sm text-muted-foreground">
                  Strana {page} od {totalPages}
                </span>
                <Button
                  variant="outline"
                  className="h-11 md:h-9"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sledeća
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </>
  )

  return <Frame signedIn={signedIn}>{content}</Frame>
}

function Frame({ signedIn = false, children }: { signedIn?: boolean; children: ReactNode }) {
  if (!signedIn) return <PublicShell wide>{children}</PublicShell>
  return (
    <AppShell active="sapa-pomoci" counts={{ podsetnici: 2, poruke: 2 }}>
      {children}
    </AppShell>
  )
}
