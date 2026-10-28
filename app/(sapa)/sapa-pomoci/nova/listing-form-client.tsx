"use client"

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CircleAlert, ImageIcon, ImagePlus, Info, ShieldAlert, Trash2, X } from "lucide-react"
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
import { toast } from "@/components/ui/sonner"
import { ListingTypeTag } from "@/components/app/listing-type-tag"
import { PremiumLock } from "@/components/app/premium-lock"
import { cn } from "@/lib/utils"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import type {
  Listing,
  ListingCategory,
  ListingSpecies,
  ListingType,
  MarketplaceStatus,
  SaveListingInput,
  changeListing,
  saveListing,
} from "@/lib/actions/listings"
import type { City } from "@/lib/actions/registration"
import type { confirmUpload, requestUpload } from "@/lib/actions/uploads"

// S34 Novi oglas / Izmeni oglas · /sapa-pomoci/nova, /sapa-pomoci/[id]/izmeni · FR-63, FR-64 (EP-75 saveListing,
// EP-77 delete, photos via EP-13 `listing_photo` after the listing exists). States: D, shelter (need for
// Me.marketplace.need_organisation), edit, invalid (client checks + 422 fields + category_not_allowed), X (any other
// failure — field codes without mockup copy show the form-level message, owner decision), G (PremiumLock on
// premium_required:listings or when the Free limit is reached), S (Me.marketplace.suspended_at /
// marketplace_suspended). OQ-17 (d): title 5–80 client-side, description ≤ 2000.

export type ListingFormActions = {
  saveListing: typeof saveListing
  changeListing: typeof changeListing
  requestUpload: typeof requestUpload
  confirmUpload: typeof confirmUpload
}

export type ListingFormCopy = {
  form: Dictionary["sapa"]["form"]
  common: Dictionary["sapa"]["common"]
  app: Dictionary["common"]
}

type Form = {
  type: ListingType
  title: string
  description: string
  category: ListingCategory | ""
  species: ListingSpecies | ""
  city: string
  price: string
  negotiable: boolean
}

type ErrorKey = "title" | "description" | "category" | "species" | "city" | "price"
type Errors = Partial<Record<ErrorKey, string>>

type PhotoItem =
  | { key: string; saved: true; id: string; fileName: string; url: string | null }
  | { key: string; saved: false; file: File; preview: string | null }

const TITLE_MIN = 5
const TITLE_MAX = 80
const DESCRIPTION_MAX = 2000
const PHOTO_MAX = 5
const PHOTO_MAX_BYTES = 10_485_760
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"]
const CATEGORIES: ListingCategory[] = ["food", "equipment_toys", "furniture", "carriers", "medicine_care", "other"]
const SPECIES: ListingSpecies[] = ["dog", "cat", "other"]
const BASE_TYPES: ListingType[] = ["giving", "selling", "seeking"]

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

function formatDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  })
    .format(new Date(iso))
    .replace(/\.$/, "") // "18. 11. 2026." — the copy supplies the closing full stop
}

function formFromListing(l: Listing): Form {
  return {
    type: l.type,
    title: l.title,
    description: l.description,
    category: l.category,
    species: l.species,
    city: l.city?.id ?? "",
    price: l.price ? String(Math.round(l.price.amount_minor / 100)) : "",
    negotiable: l.price_negotiable,
  }
}

function priceDigits(price: string) {
  return price.replace(/\./g, "")
}

function validate(f: Form, t: ListingFormCopy["form"]): Errors {
  const e: Errors = {}
  if (f.title.trim().length < TITLE_MIN) e.title = t.errors.titleMin
  if (f.title.length > TITLE_MAX) e.title = format(t.errors.titleMax, { max: TITLE_MAX })
  if (f.description.trim().length === 0) e.description = t.errors.descriptionRequired
  if (f.description.length > DESCRIPTION_MAX) e.description = format(t.errors.descriptionMax, { max: DESCRIPTION_MAX })
  if (!f.category) e.category = t.errors.categoryRequired
  if (f.category === "medicine_care" && f.type !== "need") e.category = t.errors.categoryNotAllowed
  if (!f.species) e.species = t.errors.speciesRequired
  if (!f.city) e.city = t.errors.cityRequired
  if (f.type === "selling" && !f.negotiable) {
    const digits = priceDigits(f.price)
    if (!/^\d{1,7}$/.test(digits) || Number(digits) <= 0) e.price = t.errors.price
  }
  return e
}

/** EP-75 422 `fields` → inline errors; null when a field has no inline message (→ the form-level X alert). */
function serverErrors(fields: Record<string, string>, t: ListingFormCopy["form"]): Errors | null {
  const e: Errors = {}
  for (const [field, code] of Object.entries(fields)) {
    if (field === "title") e.title = code === "too_long" ? format(t.errors.titleMax, { max: TITLE_MAX }) : t.errors.titleMin
    else if (field === "description")
      e.description =
        code === "too_long" ? format(t.errors.descriptionMax, { max: DESCRIPTION_MAX }) : t.errors.descriptionRequired
    else if (field === "category") e.category = code === "not_allowed" ? t.errors.categoryNotAllowed : t.errors.categoryRequired
    else if (field === "species") e.species = t.errors.speciesRequired
    else if (field === "city_id") e.city = t.errors.cityRequired
    else if (field === "price") e.price = t.errors.price
    else return null
  }
  return Object.keys(e).length > 0 ? e : null
}

/** EP-13: ticket → direct PUT to R2 → confirm. The confirmed photo, or null on any failure. */
async function uploadPhoto(actions: ListingFormActions, listingId: string, file: File) {
  try {
    const ticket = await actions.requestUpload({
      purpose: "listing_photo",
      target_id: listingId,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    })
    if (!ticket.ok) return null
    const put = await fetch(ticket.data.put_url, {
      method: ticket.data.method,
      headers: { "Content-Type": ticket.data.headers["Content-Type"] },
      body: file,
    })
    if (!put.ok) return null
    const confirmed = await actions.confirmUpload({ upload_token: ticket.data.upload_token })
    if (!confirmed.ok) return null
    const photo = confirmed.data as { id: string; file_name?: string; url?: { url: string | null } | null }
    return { id: photo.id, fileName: photo.file_name ?? file.name, url: photo.url?.url ?? null }
  } catch {
    return null
  }
}

function previewFor(file: File) {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null
}

export function ListingFormClient({
  listing = null,
  marketplace,
  defaultCityId = "",
  cities,
  locale,
  copy,
  actions,
}: {
  /** Edit (/sapa-pomoci/[id]/izmeni): the author's Listing (EP-74, photos signed). Create: null. */
  listing?: Listing | null
  marketplace: MarketplaceStatus
  defaultCityId?: string
  cities: City[]
  locale: Locale
  copy: ListingFormCopy
  actions: ListingFormActions
}) {
  const t = copy.form
  const router = useRouter()
  const isEdit = listing !== null
  const canPostNeed = marketplace.can_post_need && marketplace.need_organisation !== null
  const limit = marketplace.active_listing_limit

  const [form, setForm] = useState<Form>(() =>
    listing
      ? formFromListing(listing)
      : {
          type: canPostNeed ? "need" : "giving",
          title: "",
          description: "",
          category: "",
          species: "",
          city: defaultCityId,
          price: "",
          negotiable: false,
        },
  )
  const [photos, setPhotos] = useState<PhotoItem[]>(() =>
    [...(listing?.photos ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ key: p.id, saved: true, id: p.id, fileName: p.file_name, url: p.url?.url ?? null })),
  )
  const [listingId, setListingId] = useState<string | null>(listing?.id ?? null)
  const [errors, setErrors] = useState<Errors>({})
  const [photoError, setPhotoError] = useState(false)
  const [failed, setFailed] = useState(false)
  const [locked, setLocked] = useState(!isEdit && limit !== null && marketplace.active_listings >= limit)
  const [suspended, setSuspended] = useState(marketplace.suspended_at !== null)
  const [pending, setPending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const previews = useRef<string[]>([])

  useEffect(() => {
    const urls = previews.current
    return () => urls.forEach((u) => URL.revokeObjectURL?.(u))
  }, [])

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function blurCheck(key: ErrorKey) {
    setErrors((prev) => ({ ...prev, [key]: validate(form, t)[key] }))
  }

  function addFiles(files: FileList | null) {
    if (!files) return
    const room = PHOTO_MAX - photos.length
    const chosen = Array.from(files)
    const valid = chosen.filter((f) => PHOTO_TYPES.includes(f.type) && f.size <= PHOTO_MAX_BYTES).slice(0, Math.max(room, 0))
    setPhotoError(valid.length < chosen.length)
    if (valid.length === 0) return
    const added: PhotoItem[] = valid.map((file, i) => {
      const preview = previewFor(file)
      if (preview) previews.current.push(preview)
      return { key: `new-${Date.now()}-${i}-${file.name}`, saved: false, file, preview }
    })
    setPhotos((prev) => [...prev, ...added].slice(0, PHOTO_MAX))
  }

  function removePhoto(key: string) {
    setPhotos((prev) => prev.filter((p) => p.key !== key))
    setPhotoError(false)
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(form, t)
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setPending(true)
    setFailed(false)
    setPhotoError(false)
    const selling = form.type === "selling"
    const input: SaveListingInput = {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category as ListingCategory,
      species: form.species as ListingSpecies,
      city_id: form.city,
      price: selling && !form.negotiable ? { amount_minor: Number(priceDigits(form.price)) * 100, currency: "RSD" } : null,
      price_negotiable: selling && form.negotiable,
    }
    if (listingId) {
      input.id = listingId
      input.photo_ids = photos.flatMap((p) => (p.saved ? [p.id] : []))
    }

    const result = await actions.saveListing(input).catch(() => null)
    if (!result || !result.ok) {
      setPending(false)
      const error = result?.error
      if (error?.code === "premium_required") setLocked(true)
      else if (error?.code === "marketplace_suspended") setSuspended(true)
      else if (error?.code === "category_not_allowed") setErrors({ category: t.errors.categoryNotAllowed })
      else {
        const inline = error?.code === "validation_failed" && error.fields ? serverErrors(error.fields, t) : null
        if (inline) setErrors(inline)
        else setFailed(true)
      }
      return
    }

    const saved = result.data
    setListingId(saved.id)
    // Photos go up after the listing exists (EP-13 `listing_photo`, one ticket per file). A failed upload keeps the
    // form open on the saved listing with the photo error, so the next save updates instead of creating again.
    const next: PhotoItem[] = []
    let photoFailed = false
    for (const p of photos) {
      if (p.saved) {
        next.push(p)
        continue
      }
      const uploaded = await uploadPhoto(actions, saved.id, p.file)
      if (uploaded) next.push({ key: p.key, saved: true, ...uploaded, url: uploaded.url ?? p.preview })
      else {
        photoFailed = true
        next.push(p)
      }
    }
    setPhotos(next)
    if (photoFailed) {
      setPhotoError(true)
      setPending(false)
      return
    }

    toast(isEdit ? t.saved : format(t.published, { date: formatDate(saved.expires_at, locale) }))
    router.push(`/sapa-pomoci/${saved.id}`)
  }

  async function remove() {
    if (!listingId) return
    setFailed(false)
    const result = await actions.changeListing({ listing_id: listingId, op: "delete", confirm: true }).catch(() => null)
    if (result?.ok) router.push("/sapa-pomoci/moje")
    else setFailed(true)
  }

  // PremiumLock's CTA opens the Premium page (owner decision, Step 22).
  function openPremium(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) router.push("/premium")
  }

  const types: ListingType[] = isEdit
    ? listing.type === "need"
      ? ["need"]
      : BASE_TYPES
    : canPostNeed
      ? [...BASE_TYPES, "need"]
      : BASE_TYPES
  const categories = CATEGORIES.filter((c) => c !== "medicine_care" || form.type === "need")
  const cityName = (c: City) => (locale === "en" ? c.name_en : c.name_sr)

  let usage: string | null = null
  if (canPostNeed && marketplace.need_organisation) usage = format(t.usageShelter, { name: marketplace.need_organisation.name })
  else if (limit !== null)
    usage = format(t.usageFree, { active: locked ? Math.max(marketplace.active_listings, limit) : marketplace.active_listings, limit })

  const fields = (
    <form noValidate onSubmit={submit} className="space-y-6">
      <Card className="gap-4 p-4 md:p-6">
        <h2 className="font-heading text-lg font-bold">{t.typeSection}</h2>
        <RadioGroup
          value={form.type}
          onValueChange={(v) => {
            const type = v as ListingType
            setForm((f) => ({ ...f, type, category: f.category === "medicine_care" && type !== "need" ? "" : f.category }))
            setErrors((er) => ({ ...er, category: undefined, price: undefined }))
          }}
          className={cn("grid grid-cols-1 gap-3", types.length === 4 ? "md:grid-cols-2" : "md:grid-cols-3")}
          aria-label={t.typeSection}
        >
          {types.map((type) => (
            <Label
              key={type}
              htmlFor={`type-${type}`}
              className={cn(
                "flex min-w-0 cursor-pointer items-start gap-3 rounded-sm border border-border p-3 font-normal",
                form.type === type && "border-primary ring-1 ring-primary",
              )}
            >
              <RadioGroupItem id={`type-${type}`} value={type} className="mt-1" aria-label={copy.common.type[type]} />
              <span className="min-w-0 space-y-1">
                <ListingTypeTag type={type} label={copy.common.type[type]} />
                <span className="block text-sm text-muted-foreground">{t.typeHint[type]}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        {!canPostNeed && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">{t.needOnlyShelters}</span>
          </p>
        )}
      </Card>

      <Card className="gap-4 p-4 md:p-6">
        <h2 className="font-heading text-lg font-bold">{t.basics}</h2>
        <div className="space-y-2">
          <Label htmlFor="l-title">{t.title}</Label>
          <Input
            id="l-title"
            maxLength={TITLE_MAX}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            onBlur={() => blurCheck("title")}
            placeholder={
              form.type === "need"
                ? t.titlePlaceholder.need
                : form.type === "seeking"
                  ? t.titlePlaceholder.seeking
                  : t.titlePlaceholder.other
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
          <Label htmlFor="l-description">{t.description}</Label>
          <Textarea
            id="l-description"
            rows={5}
            maxLength={DESCRIPTION_MAX}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            onBlur={() => blurCheck("description")}
            placeholder={t.descriptionPlaceholder}
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
            <Label htmlFor="l-category">{t.category}</Label>
            <Select
              value={form.category}
              onValueChange={(v) => {
                set("category", v as ListingCategory)
                setErrors((er) => ({ ...er, category: undefined }))
              }}
            >
              <SelectTrigger
                id="l-category"
                className="h-11 w-full md:h-9"
                aria-invalid={!!errors.category}
                aria-describedby={errors.category ? "l-category-error" : undefined}
              >
                <SelectValue placeholder={t.choose} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {copy.common.category[c]}
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
            <Label htmlFor="l-species">{t.species}</Label>
            <Select
              value={form.species}
              onValueChange={(v) => {
                set("species", v as ListingSpecies)
                setErrors((er) => ({ ...er, species: undefined }))
              }}
            >
              <SelectTrigger
                id="l-species"
                className="h-11 w-full md:h-9"
                aria-invalid={!!errors.species}
                aria-describedby={errors.species ? "l-species-error" : undefined}
              >
                <SelectValue placeholder={t.choose} />
              </SelectTrigger>
              <SelectContent>
                {SPECIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {copy.common.species[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.species && (
              <p id="l-species-error" className="text-sm text-destructive">
                {errors.species}
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="l-city">{t.city}</Label>
            <Select
              value={form.city}
              onValueChange={(v) => {
                set("city", v)
                setErrors((er) => ({ ...er, city: undefined }))
              }}
            >
              <SelectTrigger
                id="l-city"
                className="h-11 w-full md:h-9"
                aria-invalid={!!errors.city}
                aria-describedby={errors.city ? "l-city-error" : undefined}
              >
                <SelectValue placeholder={t.chooseCity} />
              </SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {cityName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.city && (
              <p id="l-city-error" className="text-sm text-destructive">
                {errors.city}
              </p>
            )}
          </div>
        </div>
        {form.type === "need" && <p className="text-sm text-muted-foreground">{t.medicineNote}</p>}
      </Card>

      {form.type === "selling" && (
        <Card className="gap-4 p-4 md:p-6">
          <h2 className="font-heading text-lg font-bold">{t.priceSection}</h2>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 space-y-2 md:w-60">
              <Label htmlFor="l-price">{form.negotiable ? t.price : t.priceRequired}</Label>
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  id="l-price"
                  inputMode="numeric"
                  value={form.negotiable ? "" : form.price}
                  disabled={form.negotiable}
                  onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))}
                  onBlur={() => blurCheck("price")}
                  placeholder={t.pricePlaceholder}
                  aria-invalid={!!errors.price}
                  aria-describedby={errors.price ? "l-price-error" : undefined}
                  className="h-11 min-w-0 flex-1 md:h-9"
                />
                <span className="shrink-0 text-sm text-muted-foreground">{t.currency}</span>
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
              <Label htmlFor="l-negotiable">{copy.common.negotiable}</Label>
            </div>
          </div>
          {errors.price && (
            <p id="l-price-error" className="text-sm text-destructive">
              {errors.price}
            </p>
          )}
          <p className="text-sm text-muted-foreground">{t.paymentNote}</p>
        </Card>
      )}

      <Card className="gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-bold">{t.photos}</h2>
          <span className="text-xs font-medium text-muted-foreground" data-testid="photo-count">
            {photos.length} / {PHOTO_MAX}
          </span>
        </div>
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-5">
          {photos.map((p, i) => {
            const src = p.saved ? p.url : p.preview
            const name = p.saved ? p.fileName : p.file.name
            return (
              <li
                key={p.key}
                className="relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-sm bg-foreground/5"
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URLs / local previews, not optimisable
                  <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                )}
                <span className="sr-only">{name}</span>
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-card px-2 text-xs font-medium">{t.cover}</span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute top-1 right-1 size-8 rounded-full"
                  aria-label={format(t.removePhoto, { n: i + 1 })}
                  onClick={() => removePhoto(p.key)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </li>
            )
          })}
          {photos.length < PHOTO_MAX && (
            <li className="min-w-0">
              <Button
                type="button"
                variant="outline"
                className="flex aspect-square h-auto w-full flex-col gap-1 border-dashed"
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus className="size-5" aria-hidden />
                <span className="text-xs font-medium">{t.addPhoto}</span>
              </Button>
            </li>
          )}
        </ul>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={PHOTO_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          disabled={photos.length >= PHOTO_MAX}
          data-testid="listing-photo-input"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ""
          }}
        />
        <p
          id="l-photos-hint"
          role={photoError ? "alert" : undefined}
          className={cn("text-sm", photoError ? "text-destructive" : "text-muted-foreground")}
        >
          {format(t.photoHint, { max: PHOTO_MAX })}
        </p>
      </Card>

      {form.type === "need" && (
        <Card className="flex-row items-start gap-3 p-4 md:p-6">
          <Info className="size-5 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 text-sm">
            {t.donationInfo}{" "}
            <Link href="/organizacija/profil" className="font-medium text-primary hover:underline">
              {t.donationLink}
            </Link>
          </p>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">{t.expiryNote}</p>

      <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-between">
        {isEdit ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-destructive md:h-9"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            {t.delete}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 md:flex-row">
          <Button asChild type="button" variant="outline" className="h-11 md:h-9">
            <Link href="/sapa-pomoci/moje">{t.cancel}</Link>
          </Button>
          <Button type="submit" className="h-11 md:h-9" disabled={pending}>
            {isEdit ? t.saveEdit : t.publish}
          </Button>
        </div>
      </div>
    </form>
  )

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 md:h-8">
        <Link href="/sapa-pomoci/moje">
          <ArrowLeft className="size-4" aria-hidden />
          {t.back}
        </Link>
      </Button>
      <div className="min-w-0">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{isEdit ? t.titleEdit : t.titleNew}</h1>
        {usage && <p className="text-sm text-muted-foreground">{usage}</p>}
      </div>

      {failed && (
        <Card role="alert" className="flex-row items-start gap-3 px-4 py-3">
          <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 text-sm">{t.saveFailed}</p>
        </Card>
      )}

      {suspended ? (
        <Card role="status" className="flex-row items-start gap-3 p-4 md:p-6">
          <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-2">
            <h2 className="font-heading text-lg font-bold">{t.suspendedTitle}</h2>
            <p className="text-sm">{t.suspendedBody}</p>
          </div>
        </Card>
      ) : locked ? (
        <div onClick={openPremium}>
          <PremiumLock
            title={copy.app.premiumTitle}
            cta={copy.app.premiumCta}
            description={format(t.premiumDescription, { limit: limit ?? 3 })}
          >
            <div className="max-h-96 overflow-hidden">{fields}</div>
          </PremiumLock>
        </div>
      ) : (
        fields
      )}

      {isEdit && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription>{format(t.deleteBody, { title: form.title })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void remove()}>
                {t.deleteConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
