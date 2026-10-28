import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/integrations/resend";
import { apiError } from "@/lib/server/result";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Locale } from "@/lib/i18n";

// EP-87 — POST /api/internal/listings-daily, the Šapa pomoći expiry job (FR-65, BR-56; TC §8). pg_cron calls it
// through pg_net at 07:00 and 08:00 UTC (owner decision, Step 28b); it works only when the Europe/Belgrade hour is 9
// and otherwise answers zero counts, so it runs once a day at 09:00 Belgrade time in summer and in winter.
// System only: X-Dispatch-Secret is compared in constant time with DISPATCH_SECRET; the work uses the service role.
//   1. 3-day notice: listing_expiring to the author, then expiry_notice_sent_at = now() only for the emails Resend
//      accepted (a failed send is retried by the next daily run; a re-run the same day sends nothing).
//   2. Expire: active listings past expires_at → expired; listing_expired to the author.
// Batches of ≤ 200 (FOR UPDATE SKIP LOCKED in the database functions). Suspended authors and authors with a pending
// account deletion get no emails; their listings still expire. Env vars are read per request.

export const dynamic = "force-dynamic";

const BATCH = 200;
const encoder = new TextEncoder();

type NoticeRow = { listing_id: string; title: string; expires_at: string; email: string; locale: string };
type ExpiredRow = NoticeRow & { notify: boolean };

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

function toLocale(locale: string): Locale {
  return locale === "en" ? "en" : "sr";
}

/** expires_at as a Europe/Belgrade date: "19. 10. 2026." (sr-Latn) / "19 Oct 2026" (en-GB). */
function belgradeDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "sr-Latn", {
    timeZone: "Europe/Belgrade",
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export async function POST(request: NextRequest) {
  const expected = process.env.DISPATCH_SECRET ?? "";
  const given = request.headers.get("x-dispatch-secret") ?? "";
  if (!expected || !given || !secretsMatch(given, expected)) {
    return NextResponse.json(apiError("invalid_signature", { message: "missing or wrong X-Dispatch-Secret" }), {
      status: 401,
    });
  }

  const started = Date.now();
  const counters = { notices_sent: 0, expired: 0, emails_failed: 0, duration_ms: 0 };
  if (belgradeHour(new Date(started)) !== 9) {
    return NextResponse.json(counters);
  }

  try {
    const supabase = createServiceRoleClient();
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
    const manageUrl = `${siteUrl}/sapa-pomoci/moje`;

    // Step 1 — 3-day notice. Failed sends stay candidates; `seen` stops this run from retrying them.
    const seen = new Set<string>();
    for (;;) {
      const { data, error } = await supabase.rpc("listings_expiry_notice_candidates", { p_limit: BATCH });
      if (error) throw new Error(`listings_expiry_notice_candidates: ${error.message}`);
      const rows = ((data ?? []) as NoticeRow[]).filter((row) => !seen.has(row.listing_id));
      if (rows.length === 0) break;
      const accepted: string[] = [];
      for (const row of rows) {
        seen.add(row.listing_id);
        const locale = toLocale(row.locale);
        const result = await sendEmail({
          to: row.email,
          locale,
          template: {
            id: "listing_expiring",
            variables: {
              listing: row.title,
              date: belgradeDate(row.expires_at, locale),
              extend_url: `${manageUrl}?produzi=${row.listing_id}`,
              manage_url: manageUrl,
            },
          },
        });
        if (result.status === "delivered") accepted.push(row.listing_id);
        else counters.emails_failed += 1;
      }
      if (accepted.length > 0) {
        const { data: marked, error: markError } = await supabase.rpc("mark_listing_notices_sent", { p_listing_ids: accepted });
        if (markError) throw new Error(`mark_listing_notices_sent: ${markError.message}`);
        counters.notices_sent += Number(marked ?? 0);
      }
      if ((data ?? []).length < BATCH) break;
    }

    // Step 2 — expire (E-31).
    for (;;) {
      const { data, error } = await supabase.rpc("expire_listings", { p_limit: BATCH });
      if (error) throw new Error(`expire_listings: ${error.message}`);
      const rows = (data ?? []) as ExpiredRow[];
      counters.expired += rows.length;
      for (const row of rows.filter((r) => r.notify)) {
        const locale = toLocale(row.locale);
        const result = await sendEmail({
          to: row.email,
          locale,
          template: {
            id: "listing_expired",
            variables: { listing: row.title, date: belgradeDate(row.expires_at, locale), url: manageUrl },
          },
        });
        if (result.status !== "delivered") counters.emails_failed += 1;
      }
      if (rows.length < BATCH) break;
    }

    counters.duration_ms = Date.now() - started;
    console.info("[listings-daily] run", JSON.stringify(counters));
    return NextResponse.json(counters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[listings-daily] run failed:", message);
    return NextResponse.json(apiError("internal_error", { message }), { status: 500 });
  }
}
