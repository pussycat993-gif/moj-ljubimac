"use client"

import type { ReactElement } from "react"
import type { PdfExportBundle } from "@/lib/actions/pdf-export"
import type { Treatment } from "@/lib/actions/treatments"
import type { WeightUnit } from "@/lib/actions/pets"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// FR-10 — the pet record as a PDF, rendered in the browser from the EP-16 PdfExportBundle with
// @react-pdf/renderer (ADR-12, ADR-17). S03 loads this module and @react-pdf/renderer only when
// "Izvezi PDF" is pressed (owner decision, Step 16). Sections reuse the S03 labels plus "Prilozi";
// title "Karton ljubimca — {pet}", owner "Vlasnik: {name}", footer "Moj Ljubimac · {date}", file "{pet}-karton.pdf".
// JPG/PNG images are embedded; PDFs, other image types and images that fail to load are listed by
// name (ADR-12 Consequences). Inter Regular/Bold from public/fonts carry č ć š ž đ. Colours are the
// Design §4 tokens, read from the page's CSS variables.

type ReactPdf = typeof import("@react-pdf/renderer")
type DocumentElement = ReactElement<import("@react-pdf/renderer").DocumentProps>

export type PdfExportCopy = Pick<Dictionary, "petRecord" | "pet" | "petForm">

/** Embedded images: attachment id, or "photo" for the pet photo → data URI. */
export type PdfImages = Record<string, string>

/** Design §4 tokens used by the PDF (CSS variable values; empty → react-pdf default). */
export type PdfColours = { foreground?: string; muted?: string; border?: string; accent?: string }

const PHOTO = "photo"
const EMBEDDABLE = ["image/jpeg", "image/png"]

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

export function petRecordPdfFileName(name: string) {
  return `${name}-karton.pdf`
}

/** "YYYY-MM-DD" → local calendar date. */
function parseIsoDate(value: string) {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** sr-Latn "19. 10. 2026." · en-GB "19 Oct 2026" (Design §9). */
function formatDate(d: Date, locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone,
  }).format(d)
}

const isoDateLabel = (value: string, locale: Locale) => formatDate(parseIsoDate(value), locale)

/** A timestamp in Europe/Belgrade: "19. 10. 2026. 08:00" · "19 Oct 2026 08:00". */
function formatDateTime(iso: string, t: PdfExportCopy["petRecord"], locale: Locale) {
  const d = new Date(iso)
  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Belgrade",
  }).format(d)
  return format(t.dateTime, { date: formatDate(d, locale, "Europe/Belgrade"), time })
}

/** "4,2 kg" · "850 g" (Design §9) in the pet's unit (FR-03). */
function formatWeight(value: number, unit: WeightUnit, locale: Locale) {
  const number = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: unit === "kg" ? 1 : 0,
    maximumFractionDigits: 3,
  }).format(value)
  return `${number} ${unit}`
}

/** "2.990 RSD" · "2,990 RSD" (Design §9). */
function formatMoney(amountMinor: number, locale: Locale) {
  const fractional = amountMinor % 100 !== 0
  const amount = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
  return `${amount} RSD`
}

/** `{base}_one|_few|_other` by Intl.PluralRules (owner decision, Step 13). */
function plural(dict: object, base: string, n: number, locale: Locale): string {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  return (dict as Record<string, string>)[`${base}_${rule === "one" || rule === "few" ? rule : "other"}`]
}

/** Age as on S01/S03 (owner decision, Step 13). */
function ageLabel(pet: PdfExportBundle["pet"], today: string, t: PdfExportCopy["pet"], locale: Locale): string | null {
  const [year, month, day] = today.split("-").map(Number)
  const years = (n: number) => format(plural(t, "years", n, locale), { n })
  const months = (n: number) => format(plural(t, "months", n, locale), { n })
  if (pet.birth_date) {
    const [by, bm, bd] = pet.birth_date.split("-").map(Number)
    const total = Math.max(0, (year - by) * 12 + (month - bm) - (day < bd ? 1 : 0))
    return total >= 12 ? years(Math.floor(total / 12)) : months(total)
  }
  if (pet.birth_year) {
    const diff = year - pet.birth_year
    return format(t.about, { age: diff >= 1 ? years(diff) : months(month - 1) })
  }
  return null
}

/** "Svakih 12 sati" · "Svaki dan" · "Svakih 30 dana" · "Jednokratno". */
function frequencyLabel(tr: Treatment, t: PdfExportCopy["petRecord"], locale: Locale) {
  const n = tr.interval_value
  if (!n || !tr.interval_unit) return t.oneTime
  if (tr.interval_unit === "hours") return format(plural(t, "everyHours", n, locale), { n })
  return n === 1 ? t.everyDay : format(plural(t, "everyDays", n, locale), { n })
}

/** "15. 10. 2026. – 25. 10. 2026." · "Od 1. 4. 2026." · one dose: the start date. */
function periodLabel(tr: Treatment, t: PdfExportCopy["petRecord"], locale: Locale) {
  const start = isoDateLabel(tr.starts_on, locale)
  if (tr.ends_on && tr.ends_on !== tr.starts_on) {
    return format(t.periodRange, { start, end: isoDateLabel(tr.ends_on, locale) })
  }
  if (!tr.ends_on && tr.interval_value) return format(t.periodFrom, { start })
  return start
}

const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ")

/** The react-pdf Document for one PdfExportBundle (FR-10: every section of the record). */
export function buildPetRecordDocument(
  lib: ReactPdf,
  bundle: PdfExportBundle,
  images: PdfImages,
  copy: PdfExportCopy,
  locale: Locale,
  colours: PdfColours = {},
): DocumentElement {
  // react-pdf Image has no alt text; named PdfImage so it is not taken for an HTML image.
  const { Document, Page, Text, View, Image: PdfImage, StyleSheet } = lib
  const t = copy.petRecord
  const pet = bundle.pet
  const unit = pet.weight_unit
  const female = pet.sex === "female"
  const generated = new Date(bundle.generated_at)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(generated)

  const styles = StyleSheet.create({
    page: { fontFamily: "Inter", fontSize: 10, lineHeight: 1.4, padding: 40, paddingBottom: 56, color: colours.foreground },
    title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
    muted: { color: colours.muted },
    header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
    photo: { width: 64, height: 64, borderRadius: 32, objectFit: "cover", marginRight: 12 },
    section: { marginBottom: 14 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: 700,
      color: colours.accent,
      borderBottomWidth: 1,
      borderBottomColor: colours.border,
      paddingBottom: 2,
      marginBottom: 6,
    },
    row: { flexDirection: "row", marginBottom: 2 },
    label: { width: 120, color: colours.muted },
    item: { marginBottom: 8 },
    strong: { fontWeight: 700 },
    image: { maxWidth: 240, maxHeight: 240, objectFit: "contain", marginTop: 4, marginBottom: 2 },
    footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: colours.muted, textAlign: "center" },
  })

  const speciesLabel = pet.species === "other" && pet.species_other ? pet.species_other : copy.pet.species[pet.species]
  const age = ageLabel(pet, today, copy.pet, locale)
  const neuteredLabel = female ? t.neuteredFemale : t.neuteredMale
  const neuteredValue =
    pet.neutered === "yes" ? copy.petForm.yes : pet.neutered === "no" ? copy.petForm.no : copy.petForm.unknown
  const birthValue = pet.birth_date ? isoDateLabel(pet.birth_date, locale) : pet.birth_year ? String(pet.birth_year) : null
  const reasons = female ? copy.pet.reasonFemale : copy.pet.reasonMale
  const attachments = bundle.vet_visits.flatMap((v) => v.attachments)

  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <View style={styles.row} key={label}>
        <Text style={styles.label}>{label}</Text>
        <Text>{value}</Text>
      </View>
    ) : null

  const section = (title: string, body: ReactElement | ReactElement[]) => (
    <View style={styles.section} key={title}>
      <Text style={styles.sectionTitle} minPresenceAhead={40}>
        {title}
      </Text>
      {body}
    </View>
  )

  return (
    <Document title={format(t.pdfTitle, { name: pet.name })} language={locale === "en" ? "en" : "sr-Latn"}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {images[PHOTO] && <PdfImage src={images[PHOTO]} style={styles.photo} />}
          <View>
            <Text style={styles.title}>{format(t.pdfTitle, { name: pet.name })}</Text>
            <Text style={styles.muted}>{join([pet.breed ?? speciesLabel, age])}</Text>
            <Text style={styles.muted}>
              {join([female ? copy.pet.female : pet.sex === "male" ? copy.pet.male : null, pet.neutered === "yes" && neuteredLabel])}
            </Text>
            {bundle.owner_name && <Text style={styles.muted}>{format(t.pdfOwner, { name: bundle.owner_name })}</Text>}
          </View>
        </View>

        {section(t.basics, [
          <View key="rows">
            {row(t.species, speciesLabel)}
            {row(t.breed, pet.breed)}
            {row(t.birthday, birthValue)}
            {row(t.colour, pet.colour_markings)}
            {row(t.microchip, pet.microchip_number)}
            {row(t.passport, pet.passport_number)}
            {row(neuteredLabel, neuteredValue)}
            {row(t.weightUnit, unit)}
          </View>,
          ...(pet.note ? [<Text key="note" style={styles.muted}>{pet.note}</Text>] : []),
        ])}

        {pet.vet_name &&
          section(
            t.vet,
            <View>
              <Text>{pet.vet_name}</Text>
              {pet.vet_phone && <Text style={styles.muted}>{pet.vet_phone}</Text>}
            </View>,
          )}

        {bundle.memorial &&
          section(
            t.pdfMemorial,
            <View>
              {row(t.pdfDate, isoDateLabel(bundle.memorial.date, locale))}
              {row(t.memorialReason, bundle.memorial.reason ? reasons[bundle.memorial.reason] : null)}
              {row(t.note, bundle.memorial.note)}
            </View>,
          )}

        {section(
          t.tabVaccines,
          bundle.vaccinations.length === 0 ? (
            <Text style={styles.muted}>{t.vaccinesEmptyTitle}</Text>
          ) : (
            bundle.vaccinations.map((v) => (
              <View key={v.id} style={styles.item} wrap={false}>
                <Text style={styles.strong}>{v.name}</Text>
                <Text style={styles.muted}>
                  {join([
                    format(t.vaccineGiven, { date: isoDateLabel(v.given_on, locale) }),
                    v.clinic,
                    v.batch_number && format(t.vaccineBatch, { batch: v.batch_number }),
                  ])}
                </Text>
                <Text>{v.next_due_on ? format(t.nextDose, { date: isoDateLabel(v.next_due_on, locale) }) : t.noNextDose}</Text>
                {v.note && <Text style={styles.muted}>{v.note}</Text>}
              </View>
            ))
          ),
        )}

        {section(
          t.tabTreatments,
          bundle.treatments.length === 0 ? (
            <Text style={styles.muted}>{t.treatmentsEmptyTitle}</Text>
          ) : (
            bundle.treatments.map((tr) => (
              <View key={tr.id} style={styles.item}>
                <Text style={styles.strong}>{join([tr.name, copy.pet.treatmentType[tr.type], !tr.is_active && t.finished])}</Text>
                <Text style={styles.muted}>{join([tr.dose, frequencyLabel(tr, t, locale), periodLabel(tr, t, locale)])}</Text>
                {tr.note && <Text style={styles.muted}>{tr.note}</Text>}
                {tr.doses.length > 0 && (
                  <View>
                    <Text style={styles.label}>{t.doseLog}</Text>
                    {tr.doses.map((d) => (
                      <Text key={d.id}>{join([formatDateTime(d.given_at, t, locale), d.created_by_name])}</Text>
                    ))}
                  </View>
                )}
              </View>
            ))
          ),
        )}

        {section(
          t.tabVisits,
          bundle.vet_visits.length === 0 ? (
            <Text style={styles.muted}>{t.visitsEmptyTitle}</Text>
          ) : (
            bundle.vet_visits.map((v) => (
              <View key={v.id} style={styles.item}>
                <Text style={styles.strong}>{v.reason}</Text>
                <Text style={styles.muted}>
                  {join([isoDateLabel(v.visited_on, locale), v.clinic, v.cost && formatMoney(v.cost.amount_minor, locale)])}
                </Text>
                {row(t.findings, v.findings)}
                {row(t.recommendations, v.recommendations)}
                {row(t.followUp, v.follow_up_on && isoDateLabel(v.follow_up_on, locale))}
              </View>
            ))
          ),
        )}

        {section(
          t.tabWeight,
          bundle.weights.length === 0 ? (
            <Text style={styles.muted}>{t.weightEmptyTitle}</Text>
          ) : (
            bundle.weights.map((w) => (
              <View key={w.id} style={styles.row}>
                <Text style={styles.label}>{isoDateLabel(w.measured_on, locale)}</Text>
                <Text>{join([formatWeight(w.value, unit, locale), w.note])}</Text>
              </View>
            ))
          ),
        )}

        {attachments.length > 0 &&
          section(
            t.pdfAttachments,
            attachments.map((a) => (
              <View key={a.id} style={styles.item} wrap={false}>
                {images[a.id] && <PdfImage src={images[a.id]} style={styles.image} />}
                <Text style={styles.muted}>{a.file_name ?? a.id}</Text>
              </View>
            )),
          )}

        <Text style={styles.footer} fixed>
          {format(t.pdfFooter, { date: formatDate(generated, locale, "Europe/Belgrade") })}
        </Text>
      </Page>
    </Document>
  )
}

/** A presigned GET → data URI, only for the image types react-pdf embeds; null when it fails. */
async function loadImage(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    if (!EMBEDDABLE.includes(blob.type)) return null
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** The images of a bundle that can be embedded (pet photo, JPG/PNG attachments). */
export async function loadPdfImages(bundle: PdfExportBundle): Promise<PdfImages> {
  const jobs: [string, string | null][] = [
    ...(bundle.photo ? [[PHOTO, bundle.photo.url] as [string, string | null]] : []),
    ...bundle.attachment_files
      .filter((f) => f.mime_type !== null && EMBEDDABLE.includes(f.mime_type))
      .map((f) => [f.id, f.url] as [string, string | null]),
  ]
  const loaded = await Promise.all(jobs.map(async ([id, url]) => [id, await loadImage(url)] as const))
  return Object.fromEntries(loaded.filter((entry): entry is readonly [string, string] => entry[1] !== null))
}

function tokenColours(): PdfColours {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string) => style.getPropertyValue(name).trim() || undefined
  return {
    foreground: read("--foreground"),
    muted: read("--muted-foreground"),
    border: read("--border"),
    accent: read("--primary"),
  }
}

let fontsRegistered = false

function registerFonts(lib: ReactPdf) {
  if (fontsRegistered) return
  const origin = window.location.origin
  lib.Font.register({
    family: "Inter",
    fonts: [
      { src: `${origin}/fonts/Inter-Regular.ttf`, fontWeight: 400 },
      { src: `${origin}/fonts/Inter-Bold.ttf`, fontWeight: 700 },
    ],
  })
  // Serbian words are not hyphenated with the English rules react-pdf ships.
  lib.Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

/** Renders the bundle to a PDF in the browser and downloads it; returns the file name. */
export async function exportPetRecordPdf(bundle: PdfExportBundle, copy: PdfExportCopy, locale: Locale): Promise<string> {
  const lib = await import("@react-pdf/renderer")
  registerFonts(lib)
  const images = await loadPdfImages(bundle)
  const blob = await lib.pdf(buildPetRecordDocument(lib, bundle, images, copy, locale, tokenColours())).toBlob()
  const fileName = petRecordPdfFileName(bundle.pet.name)
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return fileName
}
