import type { ReactNode } from "react"
import Link from "next/link"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

// The single Premium-locked pattern (design system §8). Used for every Free limit.
export function PremiumLock({
  title = "Dostupno u Premiumu",
  description,
  cta = "Probaj 7 dana besplatno",
  ctaHref,
  children,
}: {
  title?: string
  description: string
  cta?: string
  /** Step F1 (owner decision, Step 22): the CTA links here (/premium); without it the button is inert (mockup). */
  ctaHref?: string
  children?: ReactNode
}) {
  const panel = (
    <Card className="mx-auto w-full max-w-sm items-center gap-3 p-6 text-center shadow-raised">
      <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
        <Lock className="size-5 text-primary" aria-hidden />
      </span>
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      {ctaHref ? (
        <Button asChild className="h-11 w-full md:h-9">
          <Link href={ctaHref}>{cta}</Link>
        </Button>
      ) : (
        <Button className="h-11 w-full md:h-9">{cta}</Button>
      )}
    </Card>
  )
  if (!children) return panel
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">{panel}</div>
    </div>
  )
}
