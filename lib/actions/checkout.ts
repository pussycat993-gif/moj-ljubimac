"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, type ActionResult } from "@/lib/server/result";
import type { Money, SubscriptionPlan } from "@/lib/actions/subscription";

// EP-45 startCheckout — the provider-neutral stub until OQ-11 is answered (Step 23). It runs the EP-45
// Request validation and then always answers 503 payment_provider_unavailable: no provider call, no checkout
// session, no subscriptions row and nothing stored in idempotency_keys (there is no result to replay until
// Step 31). The plan check reads the active plans rows; migrations and seed keep plans empty (OQ-03), so the
// 503 path is reached only with a test fixture row.

/** API §6 CheckoutSession (returned once a provider exists, Step 31). */
export type CheckoutSession = {
  checkout_url: string;
  provider_session_id: string;
  plan: SubscriptionPlan;
  trial_applied: boolean;
  trial_ends_at: string | null;
  amount: Money;
  first_charge_at: string;
  expires_at: string;
};

export type StartCheckoutInput = {
  plan: SubscriptionPlan;
  expect_trial?: boolean;
  idempotency_key: string;
};

const PLANS: readonly SubscriptionPlan[] = ["premium_monthly", "premium_yearly", "breeder_monthly", "breeder_yearly"];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const familyOf = (plan: string) => (plan.startsWith("premium_") ? "premium" : "breeder");

export async function startCheckout(input: StartCheckoutInput): Promise<ActionResult<CheckoutSession>> {
  const supabase = await createClient();
  // §4.1 gates; gate 4 does not apply — not an organisation write (API §5.6 intro).
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  const userId = caller.data.user.id;

  const fields: Record<string, string> = {};
  const key = typeof input?.idempotency_key === "string" ? input.idempotency_key : "";
  if (!key) fields.idempotency_key = "required";
  else if (!UUID_V4.test(key)) fields.idempotency_key = "invalid";
  const plan = typeof input?.plan === "string" ? input.plan : "";
  if (!plan) fields.plan = "required";
  else if (!PLANS.includes(plan as SubscriptionPlan)) fields.plan = "plan_not_allowed";
  if (input?.expect_trial !== undefined && typeof input.expect_trial !== "boolean") fields.expect_trial = "invalid";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  // Role (API §4.4): owners buy premium_*, the admin of a breeder organisation breeder_*; shelter accounts
  // and volunteers → forbidden_role.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("account_type, trial_used")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return { ok: false, error: fromDatabaseError(profileError) };
  if (!profile) return fail("not_found");
  let accountFamily: "premium" | "breeder";
  if (profile.account_type === "owner") accountFamily = "premium";
  else if (profile.account_type === "breeder") {
    const { data: memberships, error } = await supabase
      .from("organisation_memberships")
      .select("role, organisations(type)")
      .eq("user_id", userId);
    if (error) return { ok: false, error: fromDatabaseError(error) };
    const breederAdmin = (memberships ?? []).some((m) => m.role === "admin" && m.organisations?.type === "breeder");
    if (!breederAdmin) return fail("forbidden_role");
    accountFamily = "breeder";
  } else return fail("forbidden_role");

  // Plan: an active plans row whose family matches the account type.
  const { data: planRow, error: planError } = await supabase
    .from("plans")
    .select("code")
    .eq("code", plan as SubscriptionPlan)
    .eq("active", true)
    .maybeSingle();
  if (planError) return { ok: false, error: fromDatabaseError(planError) };
  if (!planRow || familyOf(plan) !== accountFamily) return fail("validation_failed", { fields: { plan: "plan_not_allowed" } });

  // BR-07: one trial per user; the screen offered it, but it was already used.
  if (input.expect_trial === true && profile.trial_used) return fail("trial_already_used");

  // A running row of the same family → use EP-48 to resume renewal instead.
  const { data: running, error: runningError } = await supabase
    .from("subscriptions")
    .select("id, plan")
    .eq("user_id", userId)
    .in("status", ["trialing", "active", "cancelled"])
    .gt("current_period_end", new Date().toISOString());
  if (runningError) return { ok: false, error: fromDatabaseError(runningError) };
  if ((running ?? []).some((s) => familyOf(s.plan) === accountFamily)) return fail("subscription_already_active");

  // OQ-11: no payment provider yet.
  return fail("payment_provider_unavailable");
}
