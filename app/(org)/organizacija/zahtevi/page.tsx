import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { getMyOrganisation } from "@/lib/actions/organisation"
import { decideRequest, listOrgRequests } from "@/lib/actions/org-requests"
import { resendRecordTransfer, sendRecordTransfer } from "@/lib/actions/transfers"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { OrgRequestsLoading, OrgRequestsScreen } from "./org-requests-screen"

// S21 Zahtevi i upiti · /organizacija/zahtevi · EP-53 (getMyOrganisation: organisation name, city, approval) and
// EP-57 (listOrgRequests) on the server; the language from EP-43. Decisions (EP-58 decideRequest) and transfers
// (EP-59 sendRecordTransfer / resendRecordTransfer) are server actions because the session lives in httpOnly
// cookies. The loading variant is the Suspense fallback.

export const dynamic = "force-dynamic"

const actions = { listOrgRequests, decideRequest, sendRecordTransfer, resendRecordTransfer }

async function OrgRequests({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale)
  const [organisation, requests] = await Promise.all([getMyOrganisation(), listOrgRequests({ limit: 20 })])
  if (!organisation.ok) console.error("[organizacija/zahtevi] get_my_organisation:", organisation.error.message)
  if (!requests.ok) console.error("[organizacija/zahtevi] list_org_requests:", requests.error.message)
  return (
    <OrgRequestsScreen
      initialOrg={organisation}
      initialRequests={requests}
      locale={locale}
      copy={{
        orgRequests: dict.orgRequests,
        orgAnimals: dict.orgAnimals,
        orgProfile: dict.orgProfile,
        pet: dict.pet,
        common: dict.common,
      }}
      actions={actions}
    />
  )
}

export default async function OrgRequestsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[organizacija/zahtevi] get_me:", error.message)
  const locale = fromProfileLocale((data as Me | null)?.locale)
  return (
    <Suspense fallback={<OrgRequestsLoading label={getDictionary(locale).orgRequests.loading} />}>
      <OrgRequests locale={locale} />
    </Suspense>
  )
}
