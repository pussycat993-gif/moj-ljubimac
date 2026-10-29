"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import { cancelSubscription, createPortalSession, paddleConfigured, resumeSubscription } from "@/lib/integrations/paddle";

// S18 Profil (/profil) and S17 Premium (/premium): EP-47 rpc:get_my_subscription, EP-48 setAutoRenew (database
// function set_auto_renew, owner decision Step 23) and EP-89 getBillingPortalUrl (v1.4). Runs on the server because
// the session lives in httpOnly cookies (owner decision, Steps 13–17). The §4.1 gates run first; gate 4 does not
// apply, because these are not organisation writes (API §5.6 intro). EP-48's confirmation email has no Design §9.1
// template (CR-24), so none is sent. Paddle (TC ADR-09) owns renewals: EP-48 cancels / resumes at Paddle first, and
// a row without a provider id (local seed data) changes in the database only.

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
  /** v1.4: the row has a Paddle customer → "Upravljaj plaćanjem" (EP-89). */
  manage_billing_available: boolean;
  over_limits: {
    limit: "pets" | "attachments" | "household" | "whatsapp";
    pet_id: string | null;
    pet_name: string | null;
    used: number;
    allowed: number;
  }[];
};

/**
 * API §6 Plan (EP-44, view v_public_plans): EUR before VAT (BR-62). `price` is null only when a code has no
 * active plans row (CR-22, owner decision Step 23: Plan.price is treated as nullable).
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

const RUNNING = ["trialing", "active", "cancelled"] as const;
const familyOf = (plan: string) => (plan.startsWith("premium_") ? "premium" : "breeder");

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
 * When the running row has a provider_subscription_id, Paddle goes first (cancel at period end / remove the
 * scheduled cancellation); without PADDLE_API_KEY, or when Paddle fails → 503 payment_provider_unavailable and
 * nothing changes.
 */
export async function setAutoRenew(input: { auto_renew: boolean }): Promise<ActionResult<Subscription>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  if (typeof input?.auto_renew !== "boolean") return fail("validation_failed", { fields: { auto_renew: "required" } });

  const { data: running, error: runningError } = await supabase
    .from("subscriptions")
    .select("id, provider_subscription_id")
    .eq("user_id", caller.data.user.id)
    .in("status", [...RUNNING])
    .gt("current_period_end", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runningError) return { ok: false, error: fromDatabaseError(runningError) };

  const providerId = running?.provider_subscription_id ?? null;
  if (providerId) {
    if (!paddleConfigured()) return fail("payment_provider_unavailable", { message: "PADDLE_API_KEY is empty" });
    try {
      if (input.auto_renew) await resumeSubscription(providerId);
      else await cancelSubscription(providerId, "next_billing_period");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[lib/actions/subscription] Paddle auto-renew change failed:", message);
      return fail("payment_provider_unavailable", { message });
    }
  }

  const { error } = await supabase.rpc("set_auto_renew", { p_auto_renew: input.auto_renew });
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return readSubscription(supabase);
}

/**
 * EP-89 — the Paddle customer-portal URL for the caller's latest row of their plan family (card changes, invoices,
 * cancellation). No provider_customer_id → 409 subscription_not_active; PADDLE_API_KEY empty or Paddle failing →
 * 503 payment_provider_unavailable. The URL is short-lived and never stored.
 */
export async function getBillingPortalUrl(): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  // EP-47 authorization (shelter / volunteer → forbidden_role) and the family of the latest row.
  const current = await readSubscription(supabase);
  if (!current.ok) return current;
  if (!current.data.manage_billing_available || !current.data.plan) return fail("subscription_not_active");
  const family = familyOf(current.data.plan);

  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select("plan, provider_customer_id, provider_subscription_id")
    .eq("user_id", caller.data.user.id)
    .order("created_at", { ascending: false })
    .order("current_period_end", { ascending: false });
  if (error) return { ok: false, error: fromDatabaseError(error) };
  const latest = (rows ?? []).find((r) => familyOf(r.plan) === family);
  if (!latest?.provider_customer_id) return fail("subscription_not_active");

  if (!paddleConfigured()) return fail("payment_provider_unavailable", { message: "PADDLE_API_KEY is empty" });
  try {
    const url = await createPortalSession(latest.provider_customer_id, latest.provider_subscription_id);
    return ok({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[lib/actions/subscription] Paddle portal session failed:", message);
    return fail("payment_provider_unavailable", { message });
  }
}
