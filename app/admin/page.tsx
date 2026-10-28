import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { City, Me } from "@/lib/actions/registration"
import type { AdminPartner, AppSettings, PartnerClickStatsPage, PendingOrganisation } from "@/lib/actions/admin"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { AdminScreen, type AdminCopy, type AdminData, type Loaded } from "./admin-screen"

// S26 Administracija · /admin · the Operator's reads, with their session (RLS and the is_operator checks of
// the database functions): EP-68 view admin_pending_organisations (registered_at asc, with total), EP-69
// rpc:admin_list_partners, EP-70 rpc:admin_partner_click_stats (?period=YYYY-MM, default the current month),
// EP-71 app_settings, EP-67 cities (partner city Select). Lists show 20 rows; "Učitaj još" raises the count
// in the URL (?azili= / ?partneri= / ?statistika=) and the rows are read in pages of at most 50 (API §3.4).
// The loading state shows while the reads are in flight.

const PAGE = 20
const MAX_LIMIT = 50

type SearchParams = Record<string, string | string[] | undefined>

function copyFor(locale: Locale): AdminCopy {
  const dict = getDictionary(locale)
  return { admin: dict.admin, common: dict.common, shell: dict.shell.app }
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined
}

/** Rows to show: 20, 40, … from the URL (never below 20). */
function shown(value: string | undefined): number {
  const n = Number(value)
  return Number.isInteger(n) && n > PAGE ? Math.min(n, 1000) : PAGE
}

/** Reads `want` rows in pages of at most 50 (API §3.4) and the total. */
async function readPages<T>(
  want: number,
  page: (limit: number, offset: number) => Promise<{ items: T[]; total: number } | null>,
): Promise<Loaded<{ items: T[]; total: number }>> {
  const items: T[] = []
  let total = 0
  for (let offset = 0; offset < want; offset += MAX_LIMIT) {
    const result = await page(Math.min(MAX_LIMIT, want - offset), offset)
    if (!result) return { ok: false }
    items.push(...result.items)
    total = result.total
    if (items.length >= total) break
  }
  return { ok: true, data: { items, total } }
}

async function AdminView({ params, locale, user }: { params: SearchParams; locale: Locale; user: { name: string } }) {
  const supabase = await createClient()
  const period = single(params.period)

  const pendingRead = readPages<PendingOrganisation>(shown(single(params.azili)), async (limit, offset) => {
    const { data, error, count } = await supabase
      .from("admin_pending_organisations")
      .select("*", { count: "exact" })
      .order("registered_at", { ascending: true })
      .range(offset, offset + limit - 1)
    if (error) {
      console.error("[admin] admin_pending_organisations:", error.message)
      return null
    }
    return { items: (data ?? []) as unknown as PendingOrganisation[], total: count ?? 0 }
  })

  const partnersRead = readPages<AdminPartner>(shown(single(params.partneri)), async (limit, offset) => {
    const { data, error } = await supabase.rpc("admin_list_partners", { p_limit: limit, p_offset: offset })
    if (error) {
      console.error("[admin] admin_list_partners:", error.message)
      return null
    }
    return data as unknown as { items: AdminPartner[]; total: number }
  })

  const statsRead = (async (): Promise<Loaded<PartnerClickStatsPage>> => {
    const want = shown(single(params.statistika))
    let first: PartnerClickStatsPage | null = null
    const rows = await readPages(want, async (limit, offset) => {
      const { data, error } = await supabase.rpc("admin_partner_click_stats", {
        p_period: period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : undefined,
        p_limit: limit,
        p_offset: offset,
      })
      if (error) {
        console.error("[admin] admin_partner_click_stats:", error.message)
        return null
      }
      const page = data as unknown as PartnerClickStatsPage
      first ??= page
      return { items: page.items, total: page.total }
    })
    if (!rows.ok || !first) return { ok: false }
    const head: PartnerClickStatsPage = first
    return { ok: true, data: { ...head, items: rows.data.items, total: rows.data.total } }
  })()

  const settingsRead = (async (): Promise<Loaded<AppSettings>> => {
    const { data, error } = await supabase.from("app_settings").select("viber_enabled, updated_at").maybeSingle()
    if (error || !data) {
      if (error) console.error("[admin] app_settings:", error.message)
      return { ok: false }
    }
    return { ok: true, data: { viber_enabled: data.viber_enabled, whatsapp_monthly_cap: 30, updated_at: data.updated_at } }
  })()

  const citiesRead = supabase
    .from("cities")
    .select("id, name_sr, name_en, latitude, longitude")
    .order("name_sr", { ascending: true })

  const [pending, partners, stats, settings, cities] = await Promise.all([
    pendingRead,
    partnersRead,
    statsRead,
    settingsRead,
    citiesRead,
  ])
  if (cities.error) console.error("[admin] cities:", cities.error.message)

  const data: AdminData = {
    pending,
    partners,
    stats,
    settings,
    cities: (cities.data ?? []) as City[],
  }
  return <AdminScreen data={data} copy={copyFor(locale)} locale={locale} user={user} />
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[admin] get_me:", error.message)
  const me = (data ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)
  const user = { name: me?.full_name || me?.email || "" }
  return (
    <Suspense fallback={<AdminScreen data={null} copy={copyFor(locale)} locale={locale} user={user} />}>
      <AdminView params={params} locale={locale} user={user} />
    </Suspense>
  )
}
