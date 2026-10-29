import { NextResponse, type NextRequest } from "next/server";
import { r2, r2Configured } from "@/lib/integrations/r2";
import { apiError } from "@/lib/server/result";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { processExport, type ExportDb, type ExportRow } from "./build-archive";

// EP-50 archive builder — POST /api/internal/exports (FR-41; TC ADR-13 Mechanics, §8). pg_cron calls it every
// 5 minutes through pg_net with the Vault secrets dispatch_url / dispatch_secret (Step 19 mechanism). System only:
// X-Dispatch-Secret is compared in constant time with DISPATCH_SECRET (401 unauthenticated otherwise). Each run
// builds the oldest `preparing` row only (owner decision, Step 30a: one export per run), so a run stays within the
// job budget (API §12); the other rows wait for the next run. `ready`, `failed` and `expired` rows are never
// touched. Without R2 credentials nothing is built and the rows stay `preparing` (as Step 30 skips R2).
// Response: {exports_ready, exports_failed}. Env vars are read per request.

export const dynamic = "force-dynamic";

const EXPORTS_PER_RUN = 1;

const encoder = new TextEncoder();

/** Constant-time comparison: the time does not depend on where the strings differ. */
function secretsMatch(given: string, expected: string): boolean {
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const expected = process.env.DISPATCH_SECRET ?? "";
  const given = request.headers.get("x-dispatch-secret") ?? "";
  if (!expected || !given || !secretsMatch(given, expected)) {
    return NextResponse.json(apiError("unauthenticated", { message: "missing or wrong X-Dispatch-Secret" }), {
      status: 401,
    });
  }

  const counters = { exports_ready: 0, exports_failed: 0 };
  if (!r2Configured()) {
    console.info("[exports] R2 is not configured — no archive built, rows stay preparing");
    return NextResponse.json(counters);
  }

  try {
    const supabase = createServiceRoleClient() as unknown as ExportDb;
    const { data, error } = await supabase
      .from("data_exports")
      .select("id, user_id, requested_at")
      .eq("status", "preparing")
      .order("requested_at", { ascending: true })
      .limit(EXPORTS_PER_RUN);
    if (error) throw new Error(`data_exports: ${error.message}`);

    const storage = r2();
    for (const row of (data ?? []) as ExportRow[]) {
      const outcome = await processExport(row, { supabase, storage });
      if (outcome.status === "ready") counters.exports_ready += 1;
      else counters.exports_failed += 1;
    }

    console.info("[exports] run", JSON.stringify(counters));
    return NextResponse.json(counters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[exports] run failed:", message, JSON.stringify(counters));
    return NextResponse.json(apiError("internal_error", { message }), { status: 500 });
  }
}
