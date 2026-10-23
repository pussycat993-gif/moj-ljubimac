import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { getMyOrganisation, updateOrganisationProfile } from "@/lib/actions/organisation"
import { confirmUpload, requestUpload } from "@/lib/actions/uploads"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { OrgProfileScreen } from "./org-profile-screen"

// S29 Javni profil organizacije · /organizacija/profil · EP-53 (getMyOrganisation, with the presigned logo URL)
// and EP-43 (language) on the server. The Admin saves through EP-72 (updateOrganisationProfile) and uploads the
// logo through EP-13 (requestUpload / confirmUpload, purpose organisation_logo); a Volunteer gets the read-only
// view (access.can_edit = false). A failed read → ErrorState.

export const dynamic = "force-dynamic"

const actions = { updateOrganisationProfile, requestUpload, confirmUpload }

export default async function OrganisationProfilePage() {
  const supabase = await createClient()
  const [{ data, error }, organisation] = await Promise.all([supabase.rpc("get_me"), getMyOrganisation()])
  if (error) console.error("[organizacija/profil] get_me:", error.message)
  if (!organisation.ok) console.error("[organizacija/profil] get_my_organisation:", organisation.error.message)
  const locale = fromProfileLocale((data as Me | null)?.locale)
  const dict = getDictionary(locale)
  return (
    <OrgProfileScreen
      initial={organisation}
      locale={locale}
      copy={{ orgProfile: dict.orgProfile, orgAnimals: dict.orgAnimals, common: dict.common }}
      actions={actions}
    />
  )
}
