import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import { getBillingPortalUrl, type Plan, type Subscription } from "@/lib/actions/subscription"
import { startCheckout } from "@/lib/actions/checkout"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { ErrorState } from "@/components/app/error-state"
import { PremiumClient } from "./premium-client"

// S17 Premium · /premium · FR-36, FR-37, FR-42 (breeder variant) · EP-44 (view v_public_plans, EUR prices),
// EP-47 (trial_available, the running breeder plan) and EP-43 (locale, account type, organisation,
// Entitlements.premium) on the server; "Probaj 7 dana besplatno" / "Pretplati se" calls EP-45 startCheckout and
// opens the Paddle.js overlay; the breeder status card links to the Paddle portal (EP-89). Payments are enabled
// only when PADDLE_API_KEY and NEXT_PUBLIC_PADDLE_CLIENT_TOKEN are both set (API EP-44 States), else the
// payments_coming_soon state. Owners get the Premium screen and breeder-organisation Admins the breeder variant;
// everyone else is redirected to /organizacija (EP-47 forbidden_role). A failed read → error.

export default async function PremiumPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[premium] get_me:", error.message)
  const me = (data ?? null) as Me | null
  const dict = getDictionary(fromProfileLocale(me?.locale))
  const breederAdmin =
    me?.account_type === "breeder" && me.organisation?.type === "breeder" && me.organisation.role === "admin"
  if (me && me.account_type !== "owner" && !breederAdmin) redirect("/organizacija")

  const [plans, subscription] = await Promise.all([
    supabase.from("v_public_plans").select("code, family, period, price, monthly_equivalent, trial_days"),
    supabase.rpc("get_my_subscription"),
  ])
  if (plans.error) console.error("[premium] v_public_plans:", plans.error.message)
  if (subscription.error) console.error("[premium] get_my_subscription:", subscription.error.message)

  if (!me || plans.error || subscription.error) {
    return <ErrorState message={dict.common.error} labels={{ retry: dict.common.retry }} />
  }

  const paymentsEnabled = !!process.env.PADDLE_API_KEY && !!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN

  return (
    <PremiumClient
      variant={breederAdmin ? "breeder" : "premium"}
      plans={(plans.data ?? []) as unknown as Plan[]}
      subscription={subscription.data as unknown as Subscription}
      premium={me.entitlements.premium}
      paymentsEnabled={paymentsEnabled}
      locale={fromProfileLocale(me.locale)}
      copy={{ premium: dict.premium, common: dict.common }}
      startCheckout={startCheckout}
      getBillingPortalUrl={getBillingPortalUrl}
    />
  )
}
