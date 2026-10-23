"use client"

import { Card } from "@/components/ui/card"
import { PublicShell, type PublicShellLabels } from "@/components/app/shells"
import type { Dictionary } from "@/lib/i18n"

// S30 — Politika privatnosti · /privatnost · Release Criterion 4
// Legal text is supplied by the owner/lawyer (OQ-15). Until then every section body is a marked placeholder.
// Blocks only Release (Step 32), not building.

const sectionIds = ["ko-smo", "podaci", "zasto", "cuvanje", "prava", "kontakt"] as const

function Placeholder({ text }: { text: string }) {
  return (
    <p className="rounded-sm border border-dashed border-border p-3 text-sm text-muted-foreground italic">
      {text}
    </p>
  )
}

export function PrivacyClient({
  page,
  legal,
  shellLabels,
  intro,
}: {
  page: Dictionary["privacy"]
  legal: Dictionary["legal"]
  shellLabels: PublicShellLabels
  /** The intro line, placeholders filled in. */
  intro: string
}) {
  const sections = sectionIds.map((id) => ({ id, heading: page.sections[id] }))
  return (
    <PublicShell labels={shellLabels}>
      <article className="space-y-6">
        <header className="space-y-1">
          <h1 className="font-heading text-[28px] leading-9 font-bold">{page.title}</h1>
          <p className="text-sm text-muted-foreground">{intro}</p>
        </header>

        <Card className="gap-2 p-4 md:p-6">
          <h2 className="text-xs font-medium text-muted-foreground">{legal.contents}</h2>
          <nav aria-label={legal.contents}>
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
              <Placeholder text={legal.placeholder} />
            </section>
          ))}
        </Card>
      </article>
    </PublicShell>
  )
}
