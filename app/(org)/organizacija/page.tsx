import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import {
  changeAnimalStatus,
  createIntake,
  getMyOrganisation,
  listOrgAnimals,
} from "@/lib/actions/organisation"
import { changeMemberRole, inviteTeamMember, removeMember, revokeInvitation } from "@/lib/actions/team"
import { deletePet } from "@/lib/actions/pets"
import { fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n"
import { OrgAnimalsLoading, OrgAnimalsScreen } from "./org-animals-screen"

// S20 Životinje i tim · /organizacija · EP-53 (getMyOrganisation) and EP-54 (listOrgAnimals) on the server; the
// language from EP-43. The client writes through the server actions of lib/actions/organisation.ts (EP-55),
// lib/actions/team.ts (EP-56) and lib/actions/pets.ts (EP-05); they run on the server because the session lives
// in httpOnly cookies (owner decision, Steps 13–17). `?tab=tim` opens the Tim tab (the shell's "Tim" link).
// The loading variant is the Suspense fallback.

export const dynamic = "force-dynamic"

const actions = {
  getMyOrganisation,
  listOrgAnimals,
  createIntake,
  changeAnimalStatus,
  deletePet,
  inviteTeamMember,
  revokeInvitation,
  removeMember,
  changeMemberRole,
}

function belgradeToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date())
}

async function OrgAnimals({ tab, locale }: { tab: "zivotinje" | "tim"; locale: Locale }) {
  const dict = getDictionary(locale)
  const [organisation, animals] = await Promise.all([getMyOrganisation(), listOrgAnimals({ limit: 50 })])
  if (!organisation.ok) console.error("[organizacija] get_my_organisation:", organisation.error.message)
  if (!animals.ok) console.error("[organizacija] list_org_animals:", animals.error.message)
  return (
    <OrgAnimalsScreen
      initialOrg={organisation}
      initialAnimals={animals}
      initialTab={tab}
      today={belgradeToday()}
      locale={locale}
      copy={{
        orgAnimals: dict.orgAnimals,
        orgProfile: dict.orgProfile,
        pet: dict.pet,
        petForm: dict.petForm,
        common: dict.common,
      }}
      actions={actions}
    />
  )
}

export default async function OrganisationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[organizacija] get_me:", error.message)
  const locale = fromProfileLocale((data as Me | null)?.locale)
  return (
    <Suspense fallback={<OrgAnimalsLoading label={getDictionary(locale).orgAnimals.loading} />}>
      <OrgAnimals tab={tab === "tim" ? "tim" : "zivotinje"} locale={locale} />
    </Suspense>
  )
}
