"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, Check, Copy, Globe, ImageIcon, Link2, Plus, Share2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import { EmptyState } from "../components/empty-state"
import { LogoMark } from "../components/logo-mark"
import { PetAvatar } from "../components/pet-avatar"
import { PremiumLock } from "../components/premium-lock"
import { StateSwitcher } from "../components/state-switcher"
import { StatusBadge } from "../components/status-badge"

// S08 — Trenuci · /ljubimci/[id]/trenuci · FR-17, FR-18, FR-19

type ViewState = "D" | "E" | "G"

type Moment = {
  id: string
  date: string
  text: string
  photos: string[] // photo ids only — no per-photo captions; alt text is "<pet name>, <date>" (mock photos are placeholders)
  publicLink: boolean
  slug: string
}

const FREE_MOMENT_LIMIT = 5
const MAX_PHOTOS = 5

const pet = { name: "Maks", sex: "male" as const, species: "Pas · zlatni retriver" }

const initialMoments: Moment[] = [
  {
    id: "m1",
    date: "12. 10. 2026.",
    text: "Prvi put na Štrandu posle leta. Nije hteo da izađe iz vode.",
    photos: ["m1-1", "m1-2", "m1-3"],
    publicLink: true,
    slug: "maks-strand-k7p2",
  },
  {
    id: "m2",
    date: "28. 9. 2026.",
    text: "Treći rođendan! Torta od piletine i šargarepe.",
    photos: ["m2-1", "m2-2"],
    publicLink: false,
    slug: "maks-rodjendan-q9w4",
  },
  {
    id: "m3",
    date: "14. 8. 2026.",
    text: "Šetnja Fruškom gorom, 8 km bez pauze.",
    photos: ["m3-1"],
    publicLink: false,
    slug: "maks-fruska-gora-z3m8",
  },
]

const limitReachedMoments: Moment[] = [
  ...initialMoments,
  {
    id: "m4",
    date: "2. 7. 2026.",
    text: "Kupanje kod Čupka. Miriše kao kokos.",
    photos: ["m4-1"],
    publicLink: false,
    slug: "maks-cupko-r5t1",
  },
  {
    id: "m5",
    date: "20. 5. 2026.",
    text: "Nova omiljena igračka iz Šapice.",
    photos: ["m5-1"],
    publicLink: false,
    slug: "maks-igracka-h2n6",
  },
]

function formatDate(d: Date) {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`
}

function photoCount(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} fotografija`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} fotografije`
  return `${n} fotografija`
}

function PhotoPlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex aspect-square items-center justify-center rounded-sm bg-foreground/5", className)}
    >
      <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
    </div>
  )
}

export default function MomentsScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [moments, setMoments] = useState<Moment[]>(initialMoments)
  const [publicOverrides, setPublicOverrides] = useState<Record<string, boolean>>({})

  // New moment dialog
  const [newOpen, setNewOpen] = useState(false)
  const [newDate, setNewDate] = useState<Date>(new Date(2026, 9, 19))
  const [dateOpen, setDateOpen] = useState(false)
  const [newPhotos, setNewPhotos] = useState<string[]>([])
  const [newText, setNewText] = useState("")
  const [photoError, setPhotoError] = useState<string | null>(null)

  // Share dialogs
  const [shareImageId, setShareImageId] = useState<string | null>(null)
  const [linkId, setLinkId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const base = view === "E" ? [] : view === "G" ? limitReachedMoments : moments
  const list = base.map((m) => ({ ...m, publicLink: publicOverrides[m.id] ?? m.publicLink }))
  const atLimit = list.length >= FREE_MOMENT_LIMIT
  const shareImageMoment = list.find((m) => m.id === shareImageId)
  const linkMoment = list.find((m) => m.id === linkId)

  function addPhoto() {
    if (newPhotos.length >= MAX_PHOTOS) {
      setPhotoError("Trenutak može imati najviše 5 fotografija.")
      return
    }
    setPhotoError(null)
    setNewPhotos((p) => [...p, `novo-${Date.now()}-${p.length + 1}`])
  }

  function resetNew() {
    setNewPhotos([])
    setNewText("")
    setPhotoError(null)
    setNewDate(new Date(2026, 9, 19))
  }

  function saveMoment() {
    if (newPhotos.length > MAX_PHOTOS) {
      setPhotoError("Trenutak može imati najviše 5 fotografija.")
      return
    }
    setMoments((prev) => [
      {
        id: `m${Date.now()}`,
        date: formatDate(newDate),
        text: newText,
        photos: newPhotos,
        publicLink: false,
        slug: `maks-${Date.now().toString(36)}`,
      },
      ...prev,
    ])
    if (view === "E") setView("D")
    setNewOpen(false)
    resetNew()
  }

  function togglePublic(id: string, on: boolean) {
    setCopied(false)
    setPublicOverrides((prev) => ({ ...prev, [id]: on }))
  }

  return (
    <AppShell active="ljubimci">
      <StateSwitcher
        states={[
          { value: "D", label: "Podrazumevano" },
          { value: "E", label: "Prazno" },
          { value: "G", label: "Premium zaključano" },
        ]}
        value={view}
        onChange={setView}
      />

      <div data-pet-sex={pet.sex} className="space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/ljubimci/maks">
              <ArrowLeft className="size-4" aria-hidden />
              Karton: {pet.name}
            </Link>
          </Button>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <PetAvatar name={pet.name} sex={pet.sex} species="dog" size="md" ring />
              <div className="min-w-0">
                <h1 className="truncate font-heading text-[28px] leading-9 font-bold">Trenuci</h1>
                <p className="truncate text-sm text-muted-foreground">
                  {pet.name} · {pet.species}
                </p>
              </div>
            </div>
            {!atLimit && (
              <Button className="h-11 md:h-9" onClick={() => setNewOpen(true)}>
                <Plus className="size-5" aria-hidden />
                Novi trenutak
              </Button>
            )}
          </div>
        </div>

        {/* Free counter (BR-01: 5 moments per pet) */}
        {view !== "E" && (
          <Card className="gap-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm font-medium">Free plan</p>
              <p className="shrink-0 text-sm text-muted-foreground">
                {list.length} / {FREE_MOMENT_LIMIT} trenutaka
              </p>
            </div>
            <Progress
              value={(list.length / FREE_MOMENT_LIMIT) * 100}
              aria-label={`${list.length} od ${FREE_MOMENT_LIMIT} trenutaka`}
            />
          </Card>
        )}

        {atLimit && (
          <PremiumLock description={`Na Free planu čuvaš do 5 trenutaka po ljubimcu. Uz Premium beleži ${pet.name}ove trenutke bez ograničenja.`} />
        )}

        {list.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="Još nema trenutaka"
            description={`Sačuvaj prvu fotografiju i par reči o tome šta je ${pet.name} danas radio.`}
            action="Novi trenutak"
            onAction={() => setNewOpen(true)}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <li key={m.id} className="min-w-0">
                <Card className="h-full gap-3 p-4">
                  <div className="relative">
                    <PhotoPlaceholder label={`${pet.name}, ${m.date}`} />
                    {m.photos.length > 1 && (
                      <span className="absolute right-2 bottom-2 rounded-full bg-card px-2 text-xs font-medium">
                        {photoCount(m.photos.length)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{m.date}</p>
                    <p className="line-clamp-2 text-sm">{m.text || "Bez opisa"}</p>
                  </div>
                  {m.publicLink && (
                    <p className="flex items-center gap-1 text-xs font-medium text-pet-accent">
                      <Globe className="size-3.5" aria-hidden />
                      Javni link je uključen
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShareImageId(m.id)}>
                      <Share2 className="size-4" aria-hidden />
                      Podeli kao sliku
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCopied(false)
                        setLinkId(m.id)
                      }}
                    >
                      <Link2 className="size-4" aria-hidden />
                      Javni link
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* New moment (FR-17) */}
      <Dialog
        open={newOpen}
        onOpenChange={(o) => {
          setNewOpen(o)
          if (!o) resetNew()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novi trenutak</DialogTitle>
            <DialogDescription>Do 5 fotografija i kratak tekst.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="moment-date">Datum *</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button id="moment-date" variant="outline" className="h-11 w-full justify-start font-normal md:h-9">
                    <CalendarDays className="size-4" aria-hidden />
                    {formatDate(newDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newDate}
                    onSelect={(d) => {
                      if (d) setNewDate(d)
                      setDateOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <fieldset className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <legend className="text-sm font-medium">Fotografije</legend>
                <span className="text-xs font-medium text-muted-foreground">
                  {newPhotos.length} / {MAX_PHOTOS} fotografija
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                {newPhotos.map((p, i) => (
                  <div key={p} className="relative">
                    <PhotoPlaceholder label={`${pet.name}, ${formatDate(newDate)}`} />
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute top-1 right-1 size-6"
                      aria-label={`Ukloni fotografiju ${i + 1}`}
                      onClick={() => {
                        setPhotoError(null)
                        setNewPhotos((prev) => prev.filter((x) => x !== p))
                      }}
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                ))}
                {newPhotos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={addPhoto}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border text-xs font-medium text-muted-foreground hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <Plus className="size-5" aria-hidden />
                    Dodaj
                  </button>
                )}
              </div>
              {photoError && <p className="text-sm text-destructive">{photoError}</p>}
              {newPhotos.length === MAX_PHOTOS && !photoError && (
                <p className="text-sm text-muted-foreground">Dodao si najviše 5 fotografija.</p>
              )}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="moment-text">Tekst</Label>
              <Textarea
                id="moment-text"
                maxLength={280}
                placeholder={`Šta je ${pet.name} danas radio?`}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
              <p className="text-xs font-medium text-muted-foreground">{newText.length} / 280</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setNewOpen(false)}>
              Otkaži
            </Button>
            <Button className="h-11 md:h-9" onClick={saveMoment}>
              Sačuvaj trenutak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share as image (FR-18) */}
      <Dialog open={!!shareImageMoment} onOpenChange={(o) => !o && setShareImageId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Podeli kao sliku</DialogTitle>
            <DialogDescription>Slika je spremna za WhatsApp, Viber ili Instagram.</DialogDescription>
          </DialogHeader>
          {shareImageMoment && (
            <div className="space-y-4">
              {/* Preview of the generated image */}
              <div data-pet-sex={pet.sex} className="mx-auto w-full max-w-xs overflow-hidden rounded-md border border-border bg-card">
                <PhotoPlaceholder label={`${pet.name}, ${shareImageMoment.date}`} />
                <div className="flex items-end justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-heading text-lg font-bold text-pet-accent">{pet.name}</p>
                    <p className="text-xs font-medium text-muted-foreground">{shareImageMoment.date}</p>
                  </div>
                  {/* Free: the logo is always on the shared image (FR-18, BR-01) */}
                  <LogoMark variant="mark" className="shrink-0" />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-sm bg-foreground/5 p-3">
                <div className="min-w-0">
                  <Label htmlFor="remove-logo">Ukloni logo</Label>
                  <p className="text-xs font-medium text-muted-foreground">Uklanjanje logoa je deo Premiuma.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status="premium" />
                  <Switch id="remove-logo" checked={false} disabled aria-describedby="remove-logo-lock" />
                </div>
              </div>
              <p id="remove-logo-lock" className="sr-only">
                Dostupno u Premiumu
              </p>
              <Button variant="link" className="h-auto p-0">
                Probaj 7 dana besplatno
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setShareImageId(null)}>
              Zatvori
            </Button>
            <Button className="h-11 md:h-9">
              <Share2 className="size-5" aria-hidden />
              Podeli sliku
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Public link (FR-19) */}
      <Dialog open={!!linkMoment} onOpenChange={(o) => !o && setLinkId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Javni link</DialogTitle>
            <DialogDescription>
              Ko ima link vidi samo ovaj trenutak — fotografije, tekst i ime. Zdravstveni podaci se nikad ne prikazuju.
            </DialogDescription>
          </DialogHeader>
          {linkMoment && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-sm bg-foreground/5 p-3">
                <Label htmlFor="public-link" className="min-w-0">
                  Link je {linkMoment.publicLink ? "uključen" : "isključen"}
                </Label>
                <Switch
                  id="public-link"
                  checked={linkMoment.publicLink}
                  onCheckedChange={(v) => togglePublic(linkMoment.id, v)}
                />
              </div>
              {linkMoment.publicLink ? (
                <div className="space-y-2">
                  <Label htmlFor="public-link-url">Adresa</Label>
                  <div className="flex gap-2">
                    <Input
                      id="public-link-url"
                      readOnly
                      value={`mojljubimac.rs/t/${linkMoment.slug}`}
                      className="min-w-0 flex-1"
                    />
                    <Button variant="outline" onClick={() => setCopied(true)}>
                      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copied ? "Kopirano" : "Kopiraj"}
                    </Button>
                  </div>
                  <p role="status" className="sr-only">
                    {copied ? "Link je kopiran" : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Kad isključiš link, ko god ga otvori videće poruku da trenutak više nije javan.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setLinkId(null)}>
              Gotovo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
