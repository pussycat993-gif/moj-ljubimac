import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/integrations/resend";
import { pushConfigFromEnv, sendPush } from "@/lib/integrations/webpush";
import { sendReminderDue } from "@/lib/integrations/whatsapp";
import { signDoneToken } from "@/lib/server/action-tokens";
import { runDispatch } from "@/lib/server/dispatch";
import { apiError } from "@/lib/server/result";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// EP-33 — POST /api/internal/dispatch, called every minute by pg_cron through pg_net (ADR-04, TC §8).
// System only: X-Dispatch-Secret is compared in constant time with DISPATCH_SECRET (RISK-22), then
// lib/server/dispatch.ts runs steps 1–8 with the service role. Env vars are read per request.
// Step 29: WhatsApp is live through lib/integrations/whatsapp.ts (reminder_due template). In production it
// is live only with WHATSAPP_ACCESS_TOKEN set, so an unconfigured deployment falls back to email + push
// instead of "sending" through the adapter's local fake mode.

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

/** Constant-time comparison: the time does not depend on where the strings differ. */
function secretsMatch(given: string, expected: string): boolean {
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function whatsappLive(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN) || process.env.NODE_ENV !== "production";
}

export async function POST(request: NextRequest) {
  const expected = process.env.DISPATCH_SECRET ?? "";
  const given = request.headers.get("x-dispatch-secret") ?? "";
  if (!expected || !given || !secretsMatch(given, expected)) {
    return NextResponse.json(apiError("invalid_signature", { message: "missing or wrong X-Dispatch-Secret" }), {
      status: 401,
    });
  }

  const body = (await request.json().catch(() => null)) as { run_at?: unknown } | null;
  const runAt = typeof body?.run_at === "string" ? body.run_at : new Date().toISOString();

  try {
    const supabase = createServiceRoleClient();
    const push = pushConfigFromEnv();
    const counters = await runDispatch({
      supabase,
      sendEmail: (input) => sendEmail(input),
      sendPush: push
        ? (endpoints, payload) =>
            sendPush(endpoints, payload, {
              ...push,
              removeEndpoint: async (id) => {
                const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);
                if (error) throw new Error(error.message);
              },
            })
        : null,
      signDoneToken,
      sendWhatsApp: whatsappLive() ? (input) => sendReminderDue(input) : undefined,
      liveChannels: whatsappLive() ? new Set(["whatsapp"] as const) : undefined,
      siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, ""),
    });
    console.info("[dispatch] run", runAt, JSON.stringify(counters));
    return NextResponse.json(counters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[dispatch] run failed:", runAt, message);
    return NextResponse.json(apiError("internal_error", { message }), { status: 500 });
  }
}
