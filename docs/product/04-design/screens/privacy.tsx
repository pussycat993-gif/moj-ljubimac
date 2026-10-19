"use client"

import { Card } from "@/components/ui/card"
import { PublicShell } from "../components/shells"

// S30 — Politika privatnosti · /privatnost · Release Criterion 4
// Legal text is supplied by the owner/lawyer (OQ-15). Until then every section body is a marked placeholder.
// Blocks only Release (Step 32), not building.

const sections: { id: string; heading: string }[] = [
  { id: "ko-smo", heading: "Ko smo" },
  { id: "podaci", heading: "Koje podatke prikupljamo" },
  { id: "zasto", heading: "Zašto ih prikupljamo" },
  { id: "cuvanje", heading: "Koliko ih čuvamo" },
  { id: "prava", heading: "Tvoja prava" },
  { id: "kontakt", heading: "Kontakt" },
]

function Placeholder() {
  return (
    <p className="rounded-sm border border-dashed border-border p-3 text-sm text-muted-foreground italic">
      Tekst dostavlja vlasnik (OQ-15).
    </p>
  )
}

export default function PrivacyScreen() {
  return (
    <PublicShell>
      <article className="space-y-6">
        <header className="space-y-1">
          <h1 className="font-heading text-[28px] leading-9 font-bold">Politika privatnosti</h1>
          <p className="text-sm text-muted-foreground">Kako Moj Ljubimac čuva tvoje podatke i podatke tvojih ljubimaca. Poslednja izmena: — (OQ-15)</p>
        </header>

        <Card className="gap-2 p-4 md:p-6">
          <h2 className="text-xs font-medium text-muted-foreground">Sadržaj</h2>
          <nav aria-label="Sadržaj">
            <ol className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
              {sections.map((s, i) => (
                <li key={s.id} className="min-w-0">
                  <a
                    href={`#${s.id}`}
                    className="block truncate rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {i + 1}. {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </Card>

        <Card className="gap-6 p-4 md:p-6">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="min-w-0 scroll-mt-6 space-y-2">
              <h2 id={`${s.id}-h`} className="font-heading text-[22px] leading-7 font-bold">
                {i + 1}. {s.heading}
              </h2>
              <Placeholder />
            </section>
          ))}
        </Card>
      </article>
    </PublicShell>
  )
}
