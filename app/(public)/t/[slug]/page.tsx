import type { Metadata } from "next"
import { getVisitorLocale } from "@/lib/actions/registration"
import { getDictionary } from "@/lib/i18n"
import { getPublicMoment, type PublicMoment } from "@/lib/server/public-moments"
import { PublicMomentClient } from "./public-moment-client"

// S09 Javni trenutak · /t/[slug] · public (no sign-in) · language from the ml_locale cookie. Rendered on
// every request from the EP-24 read (lib/server/public-moments.ts, shared with
// app/api/public/moments/[slug]/route.ts); nothing is cached (TC ADR-18) and the page is not indexed
// (EP-24 X-Robots-Tag: noindex). 200 → default; 404 (unknown, inactive or deleted) → link_disabled.

export const dynamic = "force-dynamic"

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function PublicMomentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const locale = await getVisitorLocale()
  const dict = getDictionary(locale)

  let moment: PublicMoment | null = null
  try {
    moment = await getPublicMoment(slug)
  } catch (error) {
    console.error("[t/[slug]]", error instanceof Error ? error.message : error)
  }

  return <PublicMomentClient moment={moment} locale={locale} copy={dict.publicMoment} shellLabels={dict.shell.public} />
}
