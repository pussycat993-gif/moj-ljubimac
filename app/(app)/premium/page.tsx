import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { Plan, Subscription } from "@/lib/actions/subscription"
import { startCheckout } from "@/lib/actions/checkout"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { PremiumClient } from "./premium-client"

// S17 Premium · /premium · FR-36, FR-37 · EP-44 (view v_public_plans), EP-47 (trial_available) and EP-43
// (locale, account type, Entitlements.premium) on the server; "Pretplati se" / "Probaj 7 dana besplatno" calls
// the EP-45 startCheckout stub (lib/actions/checkout.ts), which answers 503 payment_provider_unavailable until
// OQ-11. Owner decision (Step 23): non-owner accounts are redirected to /organizacija. A failed read → error.

export default async function PremiumPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[premium] get_me:", error.message)
  const me = (data ?? null) as Me | null
  const dict = getDictionary(fromProfileLocale(me?.locale))
  if (me && me.account_type !== "owner") redirect("/organizacija")

  const [plans, subscription] = await Promise.all([
    supabase.from("v_public_plans").select("code, family, period, price, monthly_equivalent, trial_days"),
    supabase.rpc("get_my_subscription"),
  ])
  if (plans.error) console.error("[premium] v_public_plans:", plans.error.message)
  if (subscription.error) console.error("[premium] get_my_subscription:", subscription.error.message)

  if (!me || plans.error || subscription.error) {
    return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />
  }

  return (
    <PremiumClient
      plans={(plans.data ?? []) as unknown as Plan[]}
      trialAvailable={(subscription.data as unknown as Subscription).trial_available}
      premium={me.entitlements.premium}
      locale={fromProfileLocale(me.locale)}
      copy={{ premium: dict.premium, common: dict.common }}
      startCheckout={startCheckout}
    />
  )
}
