"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, CircleAlert, CircleCheck, ImageIcon, ImagePlus, Info, ShieldAlert, Trash2, X } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AppShell } from "../components/shells"
import {
  ListingTypeTag,
  listingCategoryLabel,
  type ListingCategory,
  type ListingSpecies,
  type ListingType,
} from "../components/listing-type-tag"
import { PremiumLock } from "../components/premium-lock"
import { StateSwitcher } from "../components/state-switcher"

// S34 — Novi oglas / Izmeni oglas · /sapa-pomoci/nova, /sapa-pomoci/[id]/izmeni · FR-63, FR-64 (EP-75, EP-13 `listing_photo`)
// Type permissions (BR-54): need only for members of an approved shelter; giving/selling/seeking for every signed-in user.
// Limits (BR-55): Free 3 active listings, Premium and shelters unlimited; ≤ 5 photos; medicine_care only for needs.

type ViewState = "default" | "shelter" | "edit" | "invalid" | "error" | "premium_locked" | "suspended"

type Form = {
  type: ListingType
  title: string
  description: string
  category: ListingCategory | ""
  species: ListingSpecies | ""
  city: string
  price: string
  negotiable: boolean
  photos: string[]
}

type Errors = Partial<Record<"type" | "title" | "description" | "category" | "species" | "city" | "price", string>>

const TITLE_MAX = 80
const DESCRIPTION_MAX = 1000
const PHOTO_MAX = 5

// Shared city list — same in registration (S15) and profile (S18).
const cities = ["Novi Sad", "Beograd", "Niš", "Kragujevac", "Subotica", "Bečej", "Zrenjanin", "Sombor", "Čačak", "Kraljevo"]

const typeOptions: { value: ListingType; hint: string; shelterOnly?: boolean }[] = [
  { value: "giving", hint: "Besplatno, nekome kome treba." },
  { value: "selling", hint: "Za cenu u dinarima ili po dogovoru." },
  { value: "seeking", hint: "Tražiš nešto za svog ljubimca." },
  { value: "need", hint: "Šta azilu trenutno treba. Uz oglas ide dugme „Doniraj“.", shelterOnly: true },
]

const empty: Form = {
  type: "giving",
  title: "",
  description: "",
  category: "",
  species: "",
  city: "Novi Sad",
  price: "",
  negotiable: false,
  photos: [],
}

const editForm: Form = {
  type: "selling",
  title: "Prodajem transporter za psa",
  description:
    "Plastični transporter za pse do 12 kg, dimenzije 68 × 47 × 50 cm. Korišćen dva puta, bez oštećenja. Preuzimanje na Limanu.",
  category: "carriers",
  species: "dog",
  city: "Novi Sad",
  price: "2500",
  negotiable: false,
  photos: ["transporter-1.jpg", "transporter-2.jpg", "transporter-3.jpg", "transporter-4.jpg"],
}

const shelterForm: Form = {
  ...empty,
  type: "need",
  title: "Potrebno 20 kg granula za odrasle pse",
  category: "food",
  species: "dog",
}

const invalidForm: Form = {
  ...empty,
  type: "selling",
  title: "Kav",
  description: "",
  category: "",
  species: "cat",
  price: "",
}

function validate(f: Form): Errors {
  const e: Errors = {}
  if (f.title.trim().length < 5) e.title = "Naslov ima bar 5 znakova, npr. „Poklanjam grebalicu za mačke“."
  if (f.title.length > TITLE_MAX) e.title = `Naslov može imati najviše ${TITLE_MAX} znakova.`
  if (f.description.trim().length === 0) e.description = "Opiši stanje, veličinu i kako se preuzima."
  if (f.description.length > DESCRIPTION_MAX) e.description = `Opis može imati najviše ${DESCRIPTION_MAX} znakova.`
  if (!f.category) e.category = "Izaberi kategoriju."
  if (f.category === "medicine_care" && f.type !== "need") e.category = "Lekovi i nega mogu da budu samo potreba azila."
  if (!f.species) e.species = "Izaberi za koju životinju je oglas."
  if (!f.city) e.city = "Izaberi grad."
  if (f.type === "selling" && !f.negotiable && !/^\d{1,7}$/.test(f.price.replace(/\./g, "")))
    e.price = "Upiši cenu u dinarima ili označi „Po dogovoru“."
  return e
}

function initialFor(v: ViewState): Form {
  if (v === "edit") return editForm
  if (v === "shelter") return shelterForm
  if (v === "invalid") return invalidForm
  return empty
}

export default function ListingFormScreen() {
  const [view, setView] = useState<ViewState>("default")
  const [form, setForm] = useState<Form>(empty)
  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isShelter = view === "shelter"
  const isEdit = view === "edit"

  function changeView(v: ViewState) {
    setView(v)
    const f = initialFor(v)
    setForm(f)
    setErrors(v === "invalid" ? validate(f) : {})
    setSaved("")
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved("")
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form)
    setErrors(e)
    if (Object.keys(e).length === 0) {
      setSaved(isEdit ? "Izmene su sačuvane." : "Oglas je objavljen i aktivan je do 18. 11. 2026.")
    }
  }

  const categories = (Object.keys(listingCategoryLabel) as ListingCategory[]).filter(
    (c) => c !== "medicine_care" || form.type === "need",
  )
  const types = typeOptions.filter((t) => !t.shelterOnly || isShelter)

  const fields = (
    <form noValidate onSubmit={onSubmit} className="space-y-6">
      <Card className="gap-4 p-4 md:p-6">
        <h2 className="font-heading text-lg font-bold">Vrsta oglasa</h2>
        <RadioGroup
          value={form.type}
          onValueChange={(v) => {
            const t = v as ListingType
            setForm((f) => ({
              ...f,
              type: t,
              category: f.category === "medicine_care" && t !== "need" ? "" : f.category,
            }))
          }}
          className={cn("grid grid-cols-1 gap-3", types.length === 4 ? "md:grid-cols-2" : "md:grid-cols-3")}
          aria-label="Vrsta oglasa"
        >
          {types.map((t) => (
            <Label
              key={t.value}
              htmlFor={`type-${t.value}`}
              className={cn(
                "flex min-w-0 cursor-pointer items-start gap-3 rounded-sm border border-border p-3 font-normal",
                form.type === t.value && "border-primary ring-1 ring-primary",
              )}
            >
              <RadioGroupItem id={`type-${t.value}`} value={t.value} className="mt-1" />
              <span className="min-w-0 space-y-1">
                <ListingTypeTag type={t.value} />
                <span className="block text-sm text-muted-foreground">{t.hint}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        {!isShelter && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">Potrebe sa dugmetom „Doniraj“ objavljuju samo odobreni azili.</span>
          </p>
        )}
      </Card>

      <Card className="gap-4 p-4 md:p-6">
        <h2 className="font-heading text-lg font-bold">Osnovno</h2>
        <div className="space-y-2">
          <Label htmlFor="l-title">Naslov *</Label>
          <Input
            id="l-title"
            maxLength={TITLE_MAX}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            onBlur={() => setErrors((er) => ({ ...er, title: validate(form).title }))}
            placeholder={
              form.type === "need"
                ? "npr. Potrebno 20 kg granula za odrasle pse"
                : form.type === "seeking"
                  ? "npr. Tražim kavez za zeca"
                  : "npr. Poklanjam grebalicu za mačke"
            }
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? "l-title-error" : "l-title-count"}
            className="h-11 md:h-9"
          />
          {errors.title ? (
            <p id="l-title-error" className="text-sm text-destructive">
              {errors.title}
            </p>
          ) : (
            <p id="l-title-count" className="text-right text-xs font-medium text-muted-foreground">
              {form.title.length} / {TITLE_MAX}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="l-description">Opis *</Label>
          <Textarea
            id="l-description"
            rows={5}
            maxLength={DESCRIPTION_MAX}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            onBlur={() => setErrors((er) => ({ ...er, description: validate(form).description }))}
            placeholder="Stanje, veličina, gde i kako se preuzima."
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? "l-description-error" : "l-description-count"}
          />
          {errors.description ? (
            <p id="l-description-error" className="text-sm text-destructive">
              {errors.description}
            </p>
          ) : (
            <p id="l-description-count" className="text-right text-xs font-medium text-muted-foreground">
              {form.description.length} / {DESCRIPTION_MAX}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="l-category">Kategorija *</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v as ListingCategory)}>
              <SelectTrigger
                id="l-category"
                className="h-11 w-full md:h-9"
                aria-invalid={!!errors.category}
                aria-describedby={errors.category ? "l-category-error" : undefined}
              >
                <SelectValue placeholder="Izaberi" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {listingCategoryLabel[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p id="l-category-error" className="text-sm text-destructive">
                {errors.category}
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="l-species">Za koga *</Label>
            <Select value={form.species} onValueChange={(v) => set("species", v as ListingSpecies)}>
              <SelectTrigger
                id="l-species"
                className="h-11 w-full md:h-9"
                aria-invalid={!!errors.species}
                aria-describedby={errors.species ? "l-species-error" : undefined}
              >
                <SelectValue placeholder="Izaberi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dog">Psi</SelectItem>
                <SelectItem value="cat">Mačke</SelectItem>
                <SelectItem value="other">Ostale životinje</SelectItem>
              </SelectContent>
            </Select>
            {errors.species && (
              <p id="l-species-error" className="text-sm text-destructive">
                {errors.species}
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="l-city">Grad *</Label>
            <Select value={form.city} onValueChange={(v) => set("city", v)}>
              <SelectTrigger id="l-city" className="h-11 w-full md:h-9" aria-invalid={!!errors.city}>
                <SelectValue placeholder="Izaberi grad" />
              </SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {form.type === "need" && (
          <p className="text-sm text-muted-foreground">„Lekovi i nega“ je dostupno samo za potrebe azila.</p>
        )}
      </Card>

      {form.type === "selling" && (
        <Card className="gap-4 p-4 md:p-6">
          <h2 className="font-heading text-lg font-bold">Cena</h2>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 space-y-2 md:w-60">
              <Label htmlFor="l-price">Cena u dinarima{form.negotiable ? "" : " *"}</Label>
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  id="l-price"
                  inputMode="numeric"
                  value={form.negotiable ? "" : form.price}
                  disabled={form.negotiable}
                  onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="2.500"
                  aria-invalid={!!errors.price}
                  aria-describedby={errors.price ? "l-price-error" : undefined}
                  className="h-11 min-w-0 flex-1 md:h-9"
                />
                <span className="shrink-0 text-sm text-muted-foreground">RSD</span>
              </div>
            </div>
            <div className="flex min-h-11 items-center gap-3 md:min-h-9">
              <Checkbox
                id="l-negotiable"
                checked={form.negotiable}
                onCheckedChange={(v) => {
                  set("negotiable", v === true)
                  setErrors((er) => ({ ...er, price: undefined }))
                }}
              />
              <Label htmlFor="l-negotiable">Po dogovoru</Label>
            </div>
          </div>
          {errors.price && (
            <p id="l-price-error" className="text-sm text-destructive">
              {errors.price}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Plaćanje dogovarate vi — novac ne prolazi kroz Moj Ljubimac.
          </p>
        </Card>
      )}

      <Card className="gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-bold">Fotografije</h2>
          <span className="text-xs font-medium text-muted-foreground">
            {form.photos.length} / {PHOTO_MAX}
          </span>
        </div>
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-5">
          {form.photos.map((p, i) => (
            <li key={p} className="relative flex aspect-square min-w-0 items-center justify-center rounded-sm bg-foreground/5">
              <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
              <span className="sr-only">{p}</span>
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded-full bg-card px-2 text-xs font-medium">Naslovna</span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute top-1 right-1 size-8 rounded-full"
                aria-label={`Ukloni fotografiju ${i + 1}`}
                onClick={() => set("photos", form.photos.filter((x) => x !== p))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
          {form.photos.length < PHOTO_MAX && (
            <li className="min-w-0">
              <Button
                type="button"
                variant="outline"
                className="flex aspect-square h-auto w-full flex-col gap-1 border-dashed"
                onClick={() => set("photos", [...form.photos, `fotografija-${form.photos.length + 1}.jpg`])}
              >
                <ImagePlus className="size-5" aria-hidden />
                <span className="text-xs font-medium">Dodaj</span>
              </Button>
            </li>
          )}
        </ul>
        <p className="text-sm text-muted-foreground">
          Do {PHOTO_MAX} fotografija, JPG ili PNG do 10 MB. Prva je naslovna.
        </p>
      </Card>

      {form.type === "need" && (
        <Card className="flex-row items-start gap-3 p-4 md:p-6">
          <Info className="size-5 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 text-sm">
            Dugme „Doniraj“ prikazuje podatke za donacije iz javnog profila azila: račun, link za uplatu, adresu i
            vreme za donošenje.{" "}
            <Link href="/organizacija/profil" className="font-medium text-primary hover:underline">
              Proveri podatke za donacije
            </Link>
          </p>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        Oglas je aktivan 30 dana. Tri dana pre isteka šaljemo ti mejl da ga produžiš.
      </p>

      <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-between">
        {isEdit ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-destructive md:h-9"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            Obriši oglas
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 md:flex-row">
          <Button asChild type="button" variant="outline" className="h-11 md:h-9">
            <Link href="/sapa-pomoci/moje">Otkaži</Link>
          </Button>
          <Button type="submit" className="h-11 md:h-9">
            {isEdit ? "Sačuvaj izmene" : "Objavi oglas"}
          </Button>
        </div>
      </div>
    </form>
  )

  return (
    <AppShell
      variant={isShelter ? "organisation" : "owner"}
      active="sapa-pomoci"
      user={isShelter ? { name: "Jelena Stanković" } : undefined}
      counts={{ podsetnici: 2, poruke: 2 }}
    >
      <StateSwitcher
        states={[
          { value: "default", label: "Novi oglas" },
          { value: "shelter", label: "Azil (potreba)" },
          { value: "edit", label: "Izmena" },
          { value: "invalid", label: "Greške u formi" },
          { value: "error", label: "Greška" },
          { value: "premium_locked", label: "Premium zaključano (4. oglas)" },
          { value: "suspended", label: "Isključen/a" },
        ]}
        value={view}
        onChange={changeView}
      />

      <div className="mx-auto max-w-3xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 md:h-8">
          <Link href="/sapa-pomoci/moje">
            <ArrowLeft className="size-4" aria-hidden />
            Moji oglasi
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-9 font-bold">{isEdit ? "Izmeni oglas" : "Novi oglas"}</h1>
          <p className="text-sm text-muted-foreground">
            {isShelter
              ? "Azil „Druga šansa“ · bez ograničenja broja oglasa"
              : view === "premium_locked"
                ? "Aktivni oglasi: 3 / 3 na Free planu"
                : "Aktivni oglasi: 1 / 3 na Free planu"}
          </p>
        </div>

        {saved && (
          <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
            <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
            <p className="min-w-0 text-sm">{saved}</p>
          </Card>
        )}

        {view === "error" && (
          <Card role="alert" className="flex-row items-start gap-3 px-4 py-3">
            <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden />
            <p className="min-w-0 text-sm">
              Oglas nije sačuvan — veza je prekinuta. Tvoj tekst je i dalje ovde, pokušaj ponovo.
            </p>
          </Card>
        )}

        {view === "suspended" ? (
          <Card role="status" className="flex-row items-start gap-3 p-4 md:p-6">
            <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 space-y-2">
              <h2 className="font-heading text-lg font-bold">Ne možeš da objavljuješ oglase</h2>
              <p className="text-sm">
                Tvoj nalog je isključen iz Šape pomoći zbog prijava drugih korisnika. Ako misliš da je greška, piši nam
                na podrska@mojljubimac.rs.
              </p>
            </div>
          </Card>
        ) : view === "premium_locked" ? (
          <PremiumLock description="Na Free planu možeš imati 3 aktivna oglasa. Sa Premiumom objavljuješ koliko god želiš — ili označi neki oglas kao rešen.">
            <div className="max-h-96 overflow-hidden">{fields}</div>
          </PremiumLock>
        ) : (
          fields
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obrisati oglas?</AlertDialogTitle>
            <AlertDialogDescription>
              Oglas „{form.title}“ i njegove fotografije brišemo trajno. Ovo ne može da se poništi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => setDeleteOpen(false)}>
              Da, obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
