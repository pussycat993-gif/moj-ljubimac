import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getVisitorLocale, type Me } from "@/lib/actions/registration"
import { submitOrgRequest } from "@/lib/actions/org-requests"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { getPublicOrgPage, type PublicOrgPage } from "@/lib/server/public-org-page"
import { PublicOrgScreen, type PublicOrgViewer } from "./public-org-screen"

// S23 Javna stranica azila / odgajivačnice · /o/[slug] · public (Visitor and signed-in). Rendered on every request
// from the EP-62 read (lib/server/public-org-page.ts, shared with app/api/public/orgs/[slug]/route.ts); nothing is
// cached (TC ADR-18). Guest vs signed-in comes from the session (EP-43 get_me: the language and the request
// prefill), not from EP-62; a Visitor's language comes from the ml_locale cookie. EP-63 submitOrgRequest is a
// server action (the session lives in httpOnly cookies). 404 / 5xx → the error state.

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Moj Ljubimac" }

const actions = { submitOrgRequest }

async function sessionViewer(): Promise<{ viewer: PublicOrgViewer; locale: Locale | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { viewer: null, locale: null }
    const { data, error } = await supabase.rpc("get_me")
    if (error) console.error("[o/[slug]] get_me:", error.message)
    const me = (data ?? null) as Me | null
    return {
      viewer: { name: me?.full_name ?? "", email: me?.email ?? user.email ?? "" },
      locale: me ? fromProfileLocale(me.locale) : null,
    }
  } catch (error) {
    console.error("[o/[slug]] session:", error instanceof Error ? error.message : error)
    return { viewer: null, locale: null }
  }
}

export default async function PublicOrgPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [{ viewer, locale: profileLocale }, visitorLocale] = await Promise.all([sessionViewer(), getVisitorLocale()])
  const locale = profileLocale ?? visitorLocale
  const dict = getDictionary(locale)

  let page: PublicOrgPage | null = null
  try {
    const result = await getPublicOrgPage(slug)
    if (result.ok) page = result.data
  } catch (error) {
    console.error("[o/[slug]]", error instanceof Error ? error.message : error)
  }

  return (
    <PublicOrgScreen
      page={page}
      viewer={viewer}
      locale={locale}
      copy={{ publicOrg: dict.publicOrg, pet: dict.pet, common: dict.common }}
      shellLabels={dict.shell.public}
      actions={actions}
    />
  )
}
