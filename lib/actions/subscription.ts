"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";

// S18 Profil (/profil) and S17 Premium (/premium): EP-47 rpc:get_my_subscription and EP-48 setAutoRenew
// (database function set_auto_renew, owner decision Step 23). Runs on the server because the session lives
// in httpOnly cookies (owner decision, Steps 13–17). The §4.1 gates run first; gate 4 does not apply, because
// these are not organisation writes (API §5.6 intro). EP-48's confirmation email has no Design §9.1 template
// (CR-24), so none is sent. No payment-provider call: the stored token is reused at renewal (Step 31).

export type SubscriptionPlan = "premium_monthly" | "premium_yearly" | "breeder_monthly" | "breeder_yearly";
export type SubscriptionStatus = "trialing" | "active" | "cancelled" | "expired" | "payment_failed";
export type Money = { amount_minor: number; currency: string };

/** API §6 Subscription. */
export type Subscription = {
  id: string | null;
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  auto_renew: boolean | null;
  price: Money | null;
  period_days: number | null;
  days_remaining: number | null;
  is_active: boolean;
  trial_available: boolean;
  card_brand: string | null;
  card_last4: string | null;
  over_limits: {
    limit: "pets" | "attachments" | "household" | "whatsapp";
    pet_id: string | null;
    pet_name: string | null;
    used: number;
    allowed: number;
  }[];
};

/**
 * API §6 Plan (EP-44, view v_public_plans). `price` is null until plans are seeded with prices
 * (OQ-03 / CR-22, owner decision Step 23: Plan.price is treated as nullable).
 */
export type Plan = {
  code: SubscriptionPlan;
  family: "premium" | "breeder";
  period: "month" | "year";
  price: Money | null;
  monthly_equivalent: Money | null;
  trial_days: number;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function readSubscription(supabase: Supabase): Promise<ActionResult<Subscription>> {
  const { data, error } = await supabase.rpc("get_my_subscription");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return ok(data as unknown as Subscription);
}

/** EP-47 — the caller's most recent subscription of their plan family (shelter / volunteer → forbidden_role). */
export async function getMySubscription(): Promise<ActionResult<Subscription>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  return readSubscription(supabase);
}

/**
 * EP-48 — `auto_renew = false` cancels renewal (status cancelled, Premium until current_period_end, BR-08);
 * `true` resumes it (trialing while the trial runs, else active). No running row → 409 subscription_not_active.
 */
export async function setAutoRenew(input: { auto_renew: boolean }): Promise<ActionResult<Subscription>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  if (typeof input?.auto_renew !== "boolean") return fail("validation_failed", { fields: { auto_renew: "required" } });

  const { error } = await supabase.rpc("set_auto_renew", { p_auto_renew: input.auto_renew });
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return readSubscription(supabase);
}
