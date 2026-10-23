"use client"

import { useState } from "react"
import Link from "next/link"
import { CalendarDays, ImageIcon, Link2Off, PawPrint } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { PublicShell, type PublicShellLabels } from "@/components/app/shells"
import { PetAvatar } from "@/components/app/pet-avatar"
import type { PublicMoment } from "@/lib/server/public-moments"
import { format, type Dictionary, type Locale } from "@/lib/i18n"

// S09 — Javni trenutak · /t/[slug] · FR-19 · server-rendered from EP-24 on every request (TC ADR-18).
// Visitor view: only photos, text, pet name and date — never any health data (BR-37, BR-45).
// States: default on 200; link_disabled on 404 (unknown slug, link turned off, or moment deleted — E-07).

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "sr-Latn")

/** sr-Latn "19. 10. 2026." · en-GB "19 Oct 2026" (Design §9). */
function formatDay(day: string, locale: Locale) {
  const [y, m, d] = day.split("-").map(Number)
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(new Date(y, m - 1, d))
}

function MomentPhoto({ src, label, className }: { src?: string; label: string; className?: string }) {
  if (!src) {
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
  // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URLs, not optimisable
  return <img src={src} alt={label} className={cn("aspect-square w-full rounded-sm object-cover", className)} />
}

function SignUpCta({ t }: { t: Dictionary["publicMoment"] }) {
  return (
    <Card className="items-center gap-3 p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
        <PawPrint className="size-6 text-primary" aria-hidden />
      </span>
      <h2 className="font-heading text-lg font-bold">{t.ctaTitle}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t.ctaDescription}</p>
      <Button asChild className="h-11 md:h-9">
        <Link href="/registracija">{t.ctaButton}</Link>
      </Button>
    </Card>
  )
}

export function PublicMomentClient({
  moment,
  locale,
  copy,
  shellLabels,
}: {
  /** EP-24 200 body; null on 404 (link_disabled). */
  moment: PublicMoment | null
  locale: Locale
  copy: Dictionary["publicMoment"]
  shellLabels: PublicShellLabels
}) {
  const [active, setActive] = useState(0)
  const t = copy

  if (!moment) {
    return (
      <PublicShell labels={shellLabels}>
        <div className="space-y-6">
          <Card className="items-center gap-3 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
              <Link2Off className="size-6 text-muted-foreground" aria-hidden />
            </span>
            <h1 className="font-heading text-[28px] leading-9 font-bold">{t.offTitle}</h1>
            <p className="max-w-sm text-sm text-muted-foreground">{t.offDescription}</p>
          </Card>
          <SignUpCta t={t} />
        </div>
      </PublicShell>
    )
  }

  const dateLabel = formatDay(moment.moment_date, locale)
  const label = `${moment.pet_name}, ${dateLabel}`
  const photos = moment.photos

  return (
    <PublicShell labels={shellLabels}>
      <article data-pet-sex={moment.pet_sex} className="space-y-6">
        <Card className="gap-4 p-4 md:p-6">
          <header className="flex min-w-0 items-center gap-3">
            <PetAvatar name={moment.pet_name} sex={moment.pet_sex} size="md" ring />
            <div className="min-w-0">
              <h1 className="truncate font-heading text-[28px] leading-9 font-bold">{moment.pet_name}</h1>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden />
                <time dateTime={moment.moment_date}>{dateLabel}</time>
              </p>
            </div>
          </header>

          {photos.length > 0 && <MomentPhoto src={photos[Math.min(active, photos.length - 1)]?.url} label={label} />}

          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto overflow-y-hidden" role="group" aria-label={t.photosGroup}>
              {photos.map((p, i) => (
                <button
                  key={p.position}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={format(t.showPhoto, { n: i + 1, total: photos.length })}
                  aria-pressed={active === i}
                  className={cn(
                    "w-20 shrink-0 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                    active === i && "ring-2 ring-pet-accent",
                  )}
                >
                  <MomentPhoto src={p.url} label={label} />
                </button>
              ))}
            </div>
          )}

          {moment.text && <p className="text-base">{moment.text}</p>}
        </Card>

        <SignUpCta t={t} />
      </article>
    </PublicShell>
  )
}
