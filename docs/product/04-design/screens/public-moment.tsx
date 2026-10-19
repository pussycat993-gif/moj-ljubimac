"use client"

import { useState } from "react"
import { CalendarDays, ImageIcon, Link2Off, PawPrint } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { PublicShell } from "../components/shells"
import { PetAvatar } from "../components/pet-avatar"
import { StateSwitcher } from "../components/state-switcher"

// S09 — Javni trenutak · /t/[slug] · FR-19
// Visitor view: only photos, text, pet name and date. Never any health data.

type ViewState = "D" | "OFF"

const moment = {
  pet: { name: "Maks", sex: "male" as const },
  date: "12. 10. 2026.",
  text: "Prvi put na Štrandu posle leta. Nije hteo da izađe iz vode, a posle je spavao ceo dan.",
  photos: ["p1", "p2", "p3"], // ids only — no per-photo captions
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

function SignUpCta() {
  return (
    <Card className="items-center gap-3 p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
        <PawPrint className="size-6 text-primary" aria-hidden />
      </span>
      <h2 className="font-heading text-lg font-bold">I tvoj ljubimac zaslužuje svoj karton</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Vakcine, podsetnici i najlepši trenuci — sve na jednom mestu, besplatno.
      </p>
      <Button className="h-11 md:h-9">Napravi nalog za svog ljubimca</Button>
    </Card>
  )
}

export default function PublicMomentScreen() {
  const [view, setView] = useState<ViewState>("D")
  const [active, setActive] = useState(0)

  return (
    <PublicShell>
      <StateSwitcher
        states={[
          { value: "D", label: "Podrazumevano" },
          { value: "OFF", label: "Link isključen" },
        ]}
        value={view}
        onChange={setView}
      />

      {view === "OFF" ? (
        <div className="space-y-6">
          <Card className="items-center gap-3 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
              <Link2Off className="size-6 text-muted-foreground" aria-hidden />
            </span>
            <h1 className="font-heading text-[28px] leading-9 font-bold">Ovaj trenutak više nije javan</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              Vlasnik je isključio link ili je trenutak obrisan.
            </p>
          </Card>
          <SignUpCta />
        </div>
      ) : (
        <article data-pet-sex={moment.pet.sex} className="space-y-6">
          <Card className="gap-4 p-4 md:p-6">
            <header className="flex min-w-0 items-center gap-3">
              <PetAvatar name={moment.pet.name} sex={moment.pet.sex} species="dog" size="md" ring />
              <div className="min-w-0">
                <h1 className="truncate font-heading text-[28px] leading-9 font-bold">{moment.pet.name}</h1>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <CalendarDays className="size-4" aria-hidden />
                  <time dateTime="2026-10-12">{moment.date}</time>
                </p>
              </div>
            </header>

            <PhotoPlaceholder label={`${moment.pet.name}, ${moment.date}`} />

            {moment.photos.length > 1 && (
              <div
                className="flex gap-2 overflow-x-auto overflow-y-hidden"
                role="group"
                aria-label="Fotografije trenutka"
              >
                {moment.photos.map((p, i) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Prikaži fotografiju ${i + 1} od ${moment.photos.length}`}
                    aria-pressed={active === i}
                    className={cn(
                      "w-20 shrink-0 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                      active === i && "ring-2 ring-pet-accent",
                    )}
                  >
                    <PhotoPlaceholder label={`${moment.pet.name}, ${moment.date}`} />
                  </button>
                ))}
              </div>
            )}

            <p className="text-base">{moment.text}</p>
          </Card>

          <SignUpCta />
        </article>
      )}
    </PublicShell>
  )
}
