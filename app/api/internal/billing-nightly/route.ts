import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/integrations/resend";
import { fromProfileLocale } from "@/lib/i18n";
import { formatBelgradeDate } from "@/lib/server/dispatch";
import { apiError } from "@/lib/server/result";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// EP-49 — POST /api/internal/billing-nightly, the nightly subscription job (FR-25, FR-31, FR-32, FR-39; BR-09,
// BR-16, BR-28; TC §8). pg_cron calls it through pg_net at 01:00 and 02:00 UTC (owner decision, Step 30); it works
// only when the Europe/Belgrade hour is 3 and otherwise answers zero counts, so it runs once a night at 03:00
// Belgrade time in summer and in winter. System only: X-Dispatch-Secret is compared in constant time with
// DISPATCH_SECRET (401 unauthenticated otherwise); the work uses the service role. Env vars are read per request.
//   1. Renewals — the payment provider is not configured (OQ-11): a warning, nothing else.
//   2. Expiry — billing_expire_subscriptions(); the Step 05 trigger refreshes the owner's household flag.
//   3. Notices (BR-09) — premium_expiry_30 / _7 / _1 by email; last_notice_days is set only for emails Resend
//      accepted, so a re-run on the same Belgrade date sends nothing and a failed send is retried by the next run
//      while the day still matches. The web-push notice has no Design §9.1 template (CR-24) and is not sent.
//   4. Household flag — billing_refresh_household_flags() catches the time-based changes step 2 did not touch.
// WhatsApp/Viber fall back after expiry without a write here: the dispatch checks Premium at send time (BR-16).

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

type NoticeRow = {
  subscription_id: string;
  user_id: string;
  email: string;
  locale: string;
  plan: string;
  current_period_end: string;
  auto_renew: boolean;
  days_left: number;
};

type Counters = { renewals_attempted: number; expired: number; notices_sent: number; households_updated: number };

const TEMPLATES = { 30: "premium_expiry_30", 7: "premium_expiry_7", 1: "premium_expiry_1" } as const;

/** Constant-time comparison: the time does not depend on where the strings differ. */
function secretsMatch(given: string, expected: string): boolean {
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function belgradeHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Belgrade", hour: "2-digit", hourCycle: "h23" }).format(now));
}

export async function POST(request: NextRequest) {
  const expected = process.env.DISPATCH_SECRET ?? "";
  const given = request.headers.get("x-dispatch-secret") ?? "";
  if (!expected || !given || !secretsMatch(given, expected)) {
    return NextResponse.json(apiError("unauthenticated", { message: "missing or wrong X-Dispatch-Secret" }), {
      status: 401,
    });
  }

  const now = new Date();
  const counters: Counters = { renewals_attempted: 0, expired: 0, notices_sent: 0, households_updated: 0 };
  if (belgradeHour(now) !== 3) {
    return NextResponse.json(counters);
  }

  try {
    const supabase = createServiceRoleClient();
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
    const changedHouseholds = new Set<string>();
    let emailsFailed = 0;

    // Step 1 — renewal charges wait for the payment provider (EP-49 [DEFERRED: OQ-11]).
    console.warn("[billing-nightly] renewals skipped: no payment provider is configured (OQ-11)");

    // Step 2 — expiry.
    const expired = await supabase.rpc("billing_expire_subscriptions");
    if (expired.error) throw new Error(`billing_expire_subscriptions: ${expired.error.message}`);
    const expiredResult = (expired.data ?? {}) as { expired?: number; household_ids?: string[] };
    counters.expired = Number(expiredResult.expired ?? 0);
    for (const id of expiredResult.household_ids ?? []) changedHouseholds.add(id);

    // Step 3 — notices.
    const candidates = await supabase.rpc("billing_expiry_notice_candidates", { p_now: now.toISOString() });
    if (candidates.error) throw new Error(`billing_expiry_notice_candidates: ${candidates.error.message}`);
    for (const row of (candidates.data ?? []) as NoticeRow[]) {
      const template = TEMPLATES[row.days_left as keyof typeof TEMPLATES];
      if (!template) continue;
      const locale = fromProfileLocale(row.locale);
      const result = await sendEmail({
        to: row.email,
        locale,
        template: {
          id: template,
          variables: {
            date: formatBelgradeDate(row.current_period_end, locale),
            auto_renew: row.auto_renew,
            url: `${siteUrl}/profil`,
          },
        },
      });
      if (result.status !== "delivered") {
        emailsFailed += 1;
        console.error("[billing-nightly] expiry notice not sent:", row.subscription_id, result.error);
        continue;
      }
      const marked = await supabase.rpc("mark_expiry_notice_sent", {
        p_subscription_id: row.subscription_id,
        p_days: row.days_left,
      });
      if (marked.error) throw new Error(`mark_expiry_notice_sent: ${marked.error.message}`);
      if (marked.data === true) counters.notices_sent += 1;
    }

    // Step 4 — household flag.
    const flags = await supabase.rpc("billing_refresh_household_flags");
    if (flags.error) throw new Error(`billing_refresh_household_flags: ${flags.error.message}`);
    for (const id of (flags.data ?? []) as string[]) changedHouseholds.add(id);
    counters.households_updated = changedHouseholds.size;

    console.info("[billing-nightly] run", JSON.stringify({ ...counters, emails_failed: emailsFailed }));
    return NextResponse.json(counters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[billing-nightly] run failed:", message);
    return NextResponse.json(apiError("internal_error", { message }), { status: 500 });
  }
}
