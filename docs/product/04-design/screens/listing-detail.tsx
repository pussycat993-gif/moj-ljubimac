"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Ban,
  Building2,
  CalendarClock,
  CircleCheck,
  Clock,
  Copy,
  ExternalLink,
  Flag,
  HandHeart,
  ImageIcon,
  Landmark,
  LogIn,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  SearchX,
  ShieldAlert,
  ShieldCheck,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AppShell, PublicShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { ErrorState } from "../components/error-state"
import { listingPriceLine } from "../components/listing-card"
import {
  ListingTypeTag,
  listingCategoryLabel,
  listingSpeciesLabel,
  outcomeForType,
  type ListingCategory,
  type ListingSpecies,
  type ListingType,
} from "../components/listing-type-tag"
import { BlockDialog, ReportDialog } from "../components/safety-dialogs"
import { StateSwitcher } from "../components/state-switcher"
import { StatusBadge } from "../components/status-badge"

// S33 — Oglas · /sapa-pomoci/[id] · FR-62, FR-66, FR-68 (start), FR-70 (EP-74, EP-78, EP-82, EP-84, EP-85)
// Public without sign-in; messaging and "Doniraj" require sign-in. The author cannot message their own listing.

type ViewState =
  | "selling"
  | "need"
  | "signed_out"
  | "own"
  | "inactive"
  | "suspended"
  | "loading"
  | "error"
  | "hidden"

type Author = {
  id: string
  name: string
  initials: string
  city: string
  memberSince: string
  activeListings: number
  shelterSlug?: string
}

type Listing = {
  id: string
  type: ListingType
  title: string
  description: string
  category: ListingCategory
  species: ListingSpecies
  city: string
  priceRsd?: number
  negotiable?: boolean
  photos: number
  publishedOn: string
  expiresOn: string
  author: Author
  conversations?: number
}

const marko: Author = {
  id: "u-marko",
  name: "Marko J.",
  initials: "MJ",
  city: "Novi Sad",
  memberSince: "septembra 2026.",
  activeListings: 3,
}

const selling: Listing = {
  id: "l3",
  type: "selling",
  title: "Prodajem transporter za psa",
  description:
    "Plastični transporter za pse do 12 kg, dimenzije 68 × 47 × 50 cm. Korišćen dva puta za put kod veterinara, bez oštećenja. Vrata sa metalnom rešetkom, uz njega ide i podloga. Preuzimanje na Limanu ili se dogovorimo.",
  category: "carriers",
  species: "dog",
  city: "Novi Sad",
  priceRsd: 2500,
  photos: 4,
  publishedOn: "18. 10. 2026.",
  expiresOn: "17. 11. 2026.",
  author: marko,
}

const need: Listing = {
  id: "l1",
  type: "need",
  title: "Potrebno 20 kg granula za odrasle pse",
  description:
    "Ove nedelje primili smo šest novih pasa i zalihe hrane su pri kraju. Trebaju nam granule za odrasle pse srednje veličine — bilo koji proizvođač, idealno pakovanja od 10 do 15 kg. Možeš da doneseš hranu u azil ili da uplatiš donaciju, a mi ćemo kupiti hranu i objaviti račun.",
  category: "food",
  species: "dog",
  city: "Novi Sad",
  photos: 2,
  publishedOn: "19. 10. 2026.",
  expiresOn: "18. 11. 2026.",
  author: {
    id: "o-druga-sansa",
    name: "Azil „Druga šansa“",
    initials: "DŠ",
    city: "Novi Sad",
    memberSince: "marta 2026.",
    activeListings: 4,
    shelterSlug: "druga-sansa",
  },
}

const own: Listing = {
  id: "l2",
  type: "giving",
  title: "Poklanjam grebalicu za mačke, Bečej",
  description:
    "Grebalica sa dva nivoa i kućicom, visina 90 cm. Luna je više voli kutiju od kartona, pa je poklanjam nekome kome će trebati. Preuzimanje u Bečeju, centar.",
  category: "furniture",
  species: "cat",
  city: "Bečej",
  photos: 3,
  publishedOn: "18. 10. 2026.",
  expiresOn: "17. 11. 2026.",
  author: {
    id: "u-ivana",
    name: "Ivana P.",
    initials: "IP",
    city: "Bečej",
    memberSince: "januara 2026.",
    activeListings: 2,
  },
  conversations: 2,
}

// FR-72 / EP-78: the shelter's donation info. Money never passes through the app (BR-58).
const donation = {
  shelter: "Azil „Druga šansa“",
  recipient: "Udruženje „Druga šansa“, Novi Sad",
  account: "160-0000012345678-90",
  url: "https://drugasansa.rs/doniraj",
  dropoffAddress: "Temerinski put 120, Novi Sad",
  dropoffHours: "Subota 10:00 – 14:00 · Nedelja 10:00 – 13:00",
}

function DetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy="true" aria-label="Učitavanje">
      <Card className="gap-4 p-4 md:p-6">
        <Skeleton className="aspect-[4/3] w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-16 w-full" />
      </Card>
      <Card className="gap-3 p-4 md:p-6">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
    </div>
  )
}

function Gallery({ listing }: { listing: Listing }) {
  const [active, setActive] = useState(0)
  const count = Math.max(listing.photos, 1)
  return (
    <div className="space-y-2">
      <div className="relative flex aspect-[4/3] items-center justify-center rounded-sm bg-foreground/5">
        <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
        <span className="sr-only">
          Fotografija {active + 1} od {count}: {listing.title}
        </span>
        {count > 1 && (
          <span className="absolute right-3 bottom-3 rounded-full bg-card px-2 text-xs font-medium" aria-hidden>
            {active + 1} / {count}
          </span>
        )}
      </div>
      {count > 1 && (
        <div className="grid grid-cols-5 gap-2 md:max-w-md">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Prikaži fotografiju ${i + 1}`}
              aria-pressed={active === i}
              className={cn(
                "flex aspect-square min-w-0 items-center justify-center rounded-sm bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active === i && "ring-2 ring-primary",
              )}
            >
              <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DonationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setCopied(false)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Doniraj: {donation.shelter}</DialogTitle>
          <DialogDescription>
            Novac ne prolazi kroz Moj Ljubimac — uplaćuješ ili donosiš direktno azilu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <section aria-labelledby="don-account" className="space-y-2 rounded-sm bg-foreground/5 p-3">
            <h3 id="don-account" className="flex items-center gap-2 text-sm font-medium">
              <Landmark className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              Uplata na račun
            </h3>
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-heading text-lg font-bold tabular-nums">{donation.account}</p>
              <Button
                variant="outline"
                size="sm"
                className="h-11 shrink-0 md:h-8"
                onClick={() => setCopied(true)}
                aria-label="Kopiraj broj računa"
              >
                <Copy className="size-4" aria-hidden />
                {copied ? "Kopirano" : "Kopiraj"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Primalac: {donation.recipient}</p>
            <p className="text-sm text-muted-foreground">Svrha: Donacija — hrana za pse</p>
          </section>
          <section aria-labelledby="don-online" className="space-y-2 rounded-sm bg-foreground/5 p-3">
            <h3 id="don-online" className="flex items-center gap-2 text-sm font-medium">
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              Online uplata
            </h3>
            <p className="text-sm text-muted-foreground">Otvara se stranica azila za plaćanje karticom.</p>
            <Button asChild variant="outline" className="h-11 w-full md:h-9 md:w-auto">
              <a href={donation.url} target="_blank" rel="noopener noreferrer">
                Uplati online
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </Button>
          </section>
          <section aria-labelledby="don-dropoff" className="space-y-2 rounded-sm bg-foreground/5 p-3">
            <h3 id="don-dropoff" className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              Donošenje u azil
            </h3>
            <p className="text-sm">{donation.dropoffAddress}</p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{donation.dropoffHours}</span>
            </p>
          </section>
        </div>
        <DialogFooter>
          <Button asChild variant="outline" className="h-11 md:h-9">
            <Link href="/poruke">
              <MessageCircle className="size-4" aria-hidden />
              Pošalji poruku azilu
            </Link>
          </Button>
          <Button className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            Zatvori
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MessageDialog({
  open,
  onOpenChange,
  author,
  title,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  author: string
  title: string
}) {
  const [text, setText] = useState("Zdravo! Da li je oglas još aktuelan?")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const MAX = 2000
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setSent(false)
          setError("")
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Poruka za: {author}</DialogTitle>
          <DialogDescription className="break-words">Oglas: {title}</DialogDescription>
        </DialogHeader>
        {sent ? (
          <p role="status" className="flex items-center gap-2 rounded-sm bg-foreground/5 p-3 text-sm">
            <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0">Poruka je poslata. Odgovor stiže u Poruke, a javićemo ti i mejlom.</span>
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="first-message">Tvoja poruka</Label>
            <Textarea
              id="first-message"
              rows={4}
              maxLength={MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "first-message-error" : "first-message-count"}
            />
            {error ? (
              <p id="first-message-error" className="text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p id="first-message-count" className="text-right text-xs font-medium text-muted-foreground">
                {text.length} / {MAX}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          {sent ? (
            <Button asChild className="h-11 md:h-9">
              <Link href="/poruke">Otvori razgovor</Link>
            </Button>
          ) : (
            <>
              <Button variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
                Otkaži
              </Button>
              <Button
                className="h-11 md:h-9"
                onClick={() => (text.trim() ? setSent(true) : setError("Napiši poruku pre slanja."))}
              >
                Pošalji
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ListingDetailScreen() {
  const [view, setView] = useState<ViewState>("selling")
  const [donateOpen, setDonateOpen] = useState(false)
  const [messageOpen, setMessageOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [notice, setNotice] = useState("")

  const signedIn = view !== "signed_out"
  const listing = view === "need" ? need : view === "own" ? own : selling
  const isOwn = view === "own"
  const inactive = view === "inactive"
  const price = listingPriceLine(listing)
  const showSafety = signedIn && !isOwn && view !== "hidden"

  function changeView(v: ViewState) {
    setView(v)
    setNotice("")
  }

  const content = (
    <>
      <StateSwitcher
        states={[
          { value: "selling", label: "Prodajem (podrazumevano)" },
          { value: "need", label: "Potreba azila" },
          { value: "signed_out", label: "Bez prijave" },
          { value: "own", label: "Moj oglas" },
          { value: "inactive", label: "Rešen oglas" },
          { value: "suspended", label: "Isključen/a" },
          { value: "loading", label: "Učitavanje" },
          { value: "error", label: "Greška" },
          { value: "hidden", label: "Nedostupan" },
        ]}
        value={view}
        onChange={changeView}
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
            <h1 className="sr-only">Oglas</h1>
            <DetailSkeleton />
          </>
        )}
        {view === "error" && (
          <>
            <h1 className="sr-only">Oglas</h1>
            <ErrorState onRetry={() => setView("selling")} />
          </>
        )}
        {view === "hidden" && (
          <>
            <h1 className="sr-only">Oglas nije dostupan</h1>
            <EmptyState
              icon={SearchX}
              title="Oglas nije dostupan"
              description="Oglas je istekao, uklonjen ili ga autor više ne prikazuje. Pogledaj ostale oglase u svom gradu."
              action="Nazad na Šapu pomoći"
              href="/sapa-pomoci"
            />
          </>
        )}

        {!["loading", "error", "hidden"].includes(view) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="min-w-0 gap-4 p-4 md:p-6">
              <Gallery key={listing.id} listing={listing} />
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <ListingTypeTag type={listing.type} />
                <Badge variant="secondary">{listingCategoryLabel[listing.category]}</Badge>
                <Badge variant="secondary">{listingSpeciesLabel[listing.species]}</Badge>
                {inactive && <StatusBadge status="done" label={`Rešeno — ${outcomeForType.selling.label}`} />}
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <h1 className="min-w-0 font-heading text-[28px] leading-9 font-bold break-words">{listing.title}</h1>
                {showSafety && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label="Više radnji">
                        <MoreHorizontal className="size-5" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                        <Flag className="size-4" aria-hidden />
                        Prijavi oglas
                      </DropdownMenuItem>
                      {listing.type !== "need" && (
                        <DropdownMenuItem variant="destructive" onSelect={() => setBlockOpen(true)}>
                          <Ban className="size-4" aria-hidden />
                          Blokiraj korisnika
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {price && <p className="font-heading text-[22px] leading-7 font-bold">{price}</p>}
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {listing.city}
              </p>
              <Separator />
              <div className="space-y-2">
                <h2 className="font-heading text-lg font-bold">Opis</h2>
                <p className="text-base break-words whitespace-pre-line">{listing.description}</p>
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                <span>Objavljeno {listing.publishedOn}</span>
                <span aria-hidden>·</span>
                <span>{inactive ? "Rešeno 19. 10. 2026." : `Aktivan do ${listing.expiresOn}`}</span>
              </p>
            </Card>

            <div className="min-w-0 space-y-4">
              {notice && (
                <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
                  <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
                  <p className="min-w-0 text-sm">{notice}</p>
                </Card>
              )}

              {/* Action card */}
              <Card className="gap-3 p-4 md:p-6">
                {!signedIn && (
                  <>
                    <h2 className="font-heading text-lg font-bold">Zainteresovan/a si?</h2>
                    <p className="text-sm text-muted-foreground">
                      Poruke šalješ i primaš u aplikaciji — tvoj mejl i telefon niko ne vidi.
                    </p>
                    <Button asChild className="h-11 w-full md:h-9">
                      <Link href="/prijava">
                        <LogIn className="size-4" aria-hidden />
                        Prijavi se da pošalješ poruku
                      </Link>
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">
                      Nemaš nalog?{" "}
                      <Link href="/registracija" className="font-medium text-primary hover:underline">
                        Napravi nalog
                      </Link>
                    </p>
                  </>
                )}

                {signedIn && isOwn && (
                  <>
                    <h2 className="font-heading text-lg font-bold">Ovo je tvoj oglas</h2>
                    <p className="text-sm text-muted-foreground">Aktivan do {listing.expiresOn}.</p>
                    <Button asChild variant="outline" className="h-11 w-full md:h-9">
                      <Link href="/poruke">
                        <MessageCircle className="size-4" aria-hidden />
                        {listing.conversations} razgovora o oglasu
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-11 w-full md:h-9">
                      <Link href={`/sapa-pomoci/${listing.id}/izmeni`}>
                        <Pencil className="size-4" aria-hidden />
                        Izmeni oglas
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 w-full md:h-9"
                      onClick={() => setNotice("Oglas je produžen do 18. 11. 2026.")}
                    >
                      <RefreshCw className="size-4" aria-hidden />
                      Produži 30 dana
                    </Button>
                    <Button className="h-11 w-full md:h-9" onClick={() => setResolveOpen(true)}>
                      <CircleCheck className="size-4" aria-hidden />
                      Označi kao rešeno
                    </Button>
                  </>
                )}

                {signedIn && inactive && (
                  <>
                    <h2 className="font-heading text-lg font-bold">Oglas više nije aktivan</h2>
                    <p className="text-sm text-muted-foreground">
                      Autor je označio oglas kao prodat. Postojeći razgovori ostaju u Porukama.
                    </p>
                    <Button asChild variant="outline" className="h-11 w-full md:h-9">
                      <Link href="/sapa-pomoci">Pogledaj druge oglase</Link>
                    </Button>
                  </>
                )}

                {view === "suspended" && (
                  <>
                    <h2 className="font-heading text-lg font-bold">Poruke nisu dostupne</h2>
                    <p className="flex items-start gap-2 text-sm">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                      <span className="min-w-0">
                        Tvoj nalog je isključen iz Šape pomoći. Oglase vidiš, ali ne možeš da šalješ poruke.
                      </span>
                    </p>
                  </>
                )}

                {(view === "selling" || view === "need") && (
                  <>
                    <h2 className="font-heading text-lg font-bold">
                      {listing.type === "need" ? "Pomozi azilu" : "Zainteresovan/a si?"}
                    </h2>
                    {listing.type === "need" && (
                      <Button className="h-11 w-full md:h-9" onClick={() => setDonateOpen(true)}>
                        <HandHeart className="size-4" aria-hidden />
                        Doniraj
                      </Button>
                    )}
                    <Button
                      variant={listing.type === "need" ? "outline" : "default"}
                      className="h-11 w-full md:h-9"
                      onClick={() => setMessageOpen(true)}
                    >
                      <MessageCircle className="size-4" aria-hidden />
                      {listing.type === "need" ? "Pošalji poruku azilu" : "Pošalji poruku"}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Poruke ostaju u aplikaciji — tvoj mejl i telefon niko ne vidi.
                    </p>
                  </>
                )}
              </Card>

              {/* Author card */}
              <Card className="gap-3 p-4 md:p-6">
                <h2 className="text-xs font-medium text-muted-foreground">
                  {listing.author.shelterSlug ? "Objavio azil" : "Objavio/la"}
                </h2>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className={cn("size-12", listing.author.shelterSlug && "rounded-sm")}>
                    <AvatarFallback
                      className={cn(
                        "bg-muted font-heading font-bold text-foreground",
                        listing.author.shelterSlug && "rounded-sm",
                      )}
                    >
                      {listing.author.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1 font-heading text-lg font-bold">
                      {listing.author.shelterSlug && <Building2 className="size-4 shrink-0" aria-hidden />}
                      <span className="truncate">{listing.author.name}</span>
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {listing.author.city} · član od {listing.author.memberSince}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Aktivnih oglasa: {listing.author.activeListings}</p>
                <Button asChild variant="outline" className="h-11 w-full md:h-9">
                  <Link
                    href={listing.author.shelterSlug ? `/o/${listing.author.shelterSlug}` : `/korisnik/${listing.author.id}`}
                  >
                    {listing.author.shelterSlug ? "Javna stranica azila" : "Pogledaj profil"}
                  </Link>
                </Button>
              </Card>

              {!isOwn && (
                <Card className="flex-row items-start gap-3 p-4">
                  <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />
                  <p className="min-w-0 text-sm text-muted-foreground">
                    Stvari razmenjuj uživo i ne plaćaj unapred nepoznatim osobama. Nešto nije u redu? Prijavi oglas.
                  </p>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      <DonationDialog open={donateOpen} onOpenChange={setDonateOpen} />
      <MessageDialog
        key={listing.id}
        open={messageOpen}
        onOpenChange={setMessageOpen}
        author={listing.author.name}
        title={listing.title}
      />
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} target="listing" name={listing.title} />
      <BlockDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        name={listing.author.name}
        onConfirm={() => {
          setBlockOpen(false)
          setView("hidden")
        }}
      />
      <AlertDialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Označiti oglas kao poklonjen?</AlertDialogTitle>
            <AlertDialogDescription>
              Oglas se sklanja iz Šape pomoći i prelazi u „Rešeni“ u tvojim oglasima. Razgovori ostaju sačuvani.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setResolveOpen(false)
                setNotice(`Oglas je označen kao rešen — ${outcomeForType[listing.type].label}.`)
              }}
            >
              Da, rešeno je
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  if (!signedIn) return <PublicShell wide>{content}</PublicShell>
  return (
    <AppShell active="sapa-pomoci" counts={{ podsetnici: 2, poruke: 2 }}>
      {content}
    </AppShell>
  )
}

