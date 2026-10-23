import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import {
  cancelAccountDeletion,
  getMyDataOverview,
  requestAccountDeletion,
  requestDataExport,
} from "@/lib/actions/data-control"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { AccountDataScreen } from "./account-data-screen"

// S19 Moji podaci · /profil/podaci · FR-40, FR-41 · EP-43 (email, deletion fields — the read is exempt from the
// pending-deletion gate) and EP-50 getMyDataOverview on the server; the client writes through EP-50 / EP-51 server
// actions (lib/actions/data-control.ts). While deletion is pending EP-50 answers 403 account_pending_deletion
// and the screen is built from EP-43 alone (owner decision, Step 23). A failed EP-43 read → ErrorState.

const actions = { requestDataExport, getMyDataOverview, requestAccountDeletion, cancelAccountDeletion }

export default async function AccountDataPage() {
  const supabase = await createClient()
  const [{ data, error }, overview] = await Promise.all([supabase.rpc("get_me"), getMyDataOverview()])
  if (error) console.error("[profil/podaci] get_me:", error.message)
  if (!overview.ok && overview.error.code !== "account_pending_deletion") {
    console.error("[profil/podaci] getMyDataOverview:", overview.error.message)
  }
  const me = (data ?? null) as Me | null
  const locale = fromProfileLocale(me?.locale)
  const dict = getDictionary(locale)

  if (!me) return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />

  return (
    <AccountDataScreen
      me={me}
      overview={overview.ok ? overview.data : null}
      locale={locale}
      copy={{ accountData: dict.accountData, common: dict.common }}
      actions={actions}
    />
  )
}
