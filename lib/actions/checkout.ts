"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { withIdempotency } from "@/lib/server/idempotency";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import type { Money, SubscriptionPlan } from "@/lib/actions/subscription";

// EP-45 startCheckout — the Paddle.js overlay inputs (TC ADR-09 v1.8, API EP-45 v1.4). The EP-45 Request
// validation runs first, in the Step 23 order (idempotency_key, plan, role, active plan of the account's family,
// trial_already_used, subscription_already_active). Then, while PADDLE_API_KEY is empty (local mode), the answer
// is 503 payment_provider_unavailable and nothing is written. Otherwise the CheckoutSession (API §6) is built:
// BR-07 — the trial price id when trial_applied (premium_* and profiles.trial_used = false), else the plain price
// id; breeder plans never get a trial (BR-51). A needed price id that is null is a deployment error → 500
// internal_error, logged. The session is stored in idempotency_keys (API §3.3), so a repeat with the same key
// within 24 h returns the same session. No Paddle API call and no subscriptions row: rows come only from EP-46.

const TRIAL_DAYS = 7;

/** API §6 CheckoutSession. */
export type CheckoutSession = {
  price_id: string;
  customer_email: string;
  custom_data: { user_id: string; plan: SubscriptionPlan; idempotency_key: string };
  environment: "sandbox" | "production";
  client_token: string;
  plan: SubscriptionPlan;
  trial_applied: boolean;
  trial_ends_at: string | null;
  amount: Money;
  first_charge_at: string;
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
    .select("account_type, trial_used, email")
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
    .select("code, price_minor, currency, provider_price_id, provider_trial_price_id")
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

  // Local mode: payments are not configured — after validation, nothing written.
  if (!process.env.PADDLE_API_KEY) return fail("payment_provider_unavailable");

  const code = plan as SubscriptionPlan;
  return withIdempotency(supabase, { userId, key, operation: "start_checkout" }, async () => {
    const trialApplied = accountFamily === "premium" && !profile.trial_used;
    const priceId = trialApplied ? planRow.provider_trial_price_id : planRow.provider_price_id;
    if (!priceId) {
      console.error(
        `[lib/actions/checkout] ${trialApplied ? "provider_trial_price_id" : "provider_price_id"} is not set for ${code}`,
      );
      return fail("internal_error", { message: `price id missing for ${code}` });
    }
    const now = new Date();
    const trialEndsAt = trialApplied ? new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString() : null;
    return ok<CheckoutSession>({
      price_id: priceId,
      customer_email: profile.email,
      custom_data: { user_id: userId, plan: code, idempotency_key: key },
      environment: process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
      client_token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "",
      plan: code,
      trial_applied: trialApplied,
      trial_ends_at: trialEndsAt,
      amount: { amount_minor: planRow.price_minor, currency: planRow.currency },
      first_charge_at: trialEndsAt ?? now.toISOString(),
    });
  });
}
