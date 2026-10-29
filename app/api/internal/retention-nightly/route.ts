import { NextResponse, type NextRequest } from "next/server";
import { cancelSubscription, paddleConfigured } from "@/lib/integrations/paddle";
import { r2, r2Configured, type R2 } from "@/lib/integrations/r2";
import { apiError } from "@/lib/server/result";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// EP-52 — POST /api/internal/retention-nightly, the nightly deletion & retention job (FR-40, FR-31, FR-13; NFR-06,
// NFR-08; BR-27, BR-31, BR-38, BR-46; TC §5.9, §8). pg_cron calls it through pg_net at 01:30 and 02:30 UTC (owner
// decision, Step 30); it works only when the Europe/Belgrade hour is 3 and otherwise answers zero counts, so it runs
// once a night at 03:30 Belgrade time in summer and in winter. System only: X-Dispatch-Secret is compared in
// constant time with DISPATCH_SECRET (401 unauthenticated otherwise). Every step is idempotent; a failed run keeps
// its progress and the next night resumes. Env vars are read per request.
//   1. Accounts past deletion_due_at — BR-27 / BR-46 succession, then the account and its rows (database function).
//      The heir email has no Design §9.1 template (CR-24) and is not sent. Paddle (v1.4): before the rows go, a
//      due account's non-expired provider subscription is cancelled at Paddle immediately (and marked expired);
//      if that call fails the account is skipped tonight (p_skip) and retried the next night, so a deleted user
//      is never charged again. With PADDLE_API_KEY empty no call is made.
//   2. R2 cleanup — every queued key is deleted and dequeued only after R2 confirms; then objects older than 24 h
//      under u/, o/, p/ and exports/ that no row uses are deleted (API §10 item 7), at most 1000 listed per run.
//      Without R2 credentials R2 is skipped entirely and the keys stay queued (owner decision, Step 30).
//   3. reminder_deliveries older than 12 months are purged (NFR-08).
//   4. Pending invitations and record transfers past expires_at → expired.
//   5. Ready data exports past expires_at → expired, their archive deleted from R2.
//   + idempotency_keys older than 24 h and ended rate-limit windows are purged (TC §5.9).

export const dynamic = "force-dynamic";

const ACCOUNT_BATCH = 100;
const QUEUE_BATCH = 500;
const ORPHAN_SCAN_LIMIT = 1000;
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const ORPHAN_PREFIXES = ["u/", "o/", "p/", "exports/"] as const;

const encoder = new TextEncoder();

type Counters = {
  accounts_deleted: number;
  households_transferred: number;
  r2_objects_deleted: number;
  deliveries_purged: number;
  invitations_expired: number;
  transfers_expired: number;
  exports_expired: number;
};

type Supabase = ReturnType<typeof createServiceRoleClient>;

/**
 * EP-52 step 1 (Paddle part): cancels every due account's non-expired provider subscription immediately and
 * returns the accounts whose cancellation failed (skipped for the night).
 */
async function cancelDueProviderSubscriptions(supabase: Supabase, now: Date): Promise<string[]> {
  if (!paddleConfigured()) return [];
  const due = await supabase.from("profiles").select("id").lte("deletion_due_at", now.toISOString());
  if (due.error) throw new Error(`profiles (due): ${due.error.message}`);
  const ids = ((due.data ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return [];

  const subs = await supabase
    .from("subscriptions")
    .select("id, user_id, provider_subscription_id")
    .in("user_id", ids)
    .neq("status", "expired")
    .not("provider_subscription_id", "is", null);
  if (subs.error) throw new Error(`subscriptions (due): ${subs.error.message}`);

  const skipped = new Set<string>();
  for (const row of (subs.data ?? []) as { id: string; user_id: string; provider_subscription_id: string }[]) {
    try {
      await cancelSubscription(row.provider_subscription_id, "immediately");
    } catch (error) {
      skipped.add(row.user_id);
      console.warn(
        "[retention-nightly] Paddle cancellation failed — account skipped tonight:",
        row.user_id,
        error instanceof Error ? error.message : error,
      );
      continue;
    }
    // Cancelled at Paddle: a later failure of the deletion must not try to cancel it again.
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "expired", auto_renew: false })
      .eq("id", row.id);
    if (error) throw new Error(`subscriptions (expire cancelled): ${error.message}`);
  }
  return [...skipped];
}

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

/** Deletes the keys from R2 and dequeues the ones R2 confirmed; returns how many were confirmed. */
async function deleteAndDequeue(supabase: Supabase, storage: R2, keys: string[]): Promise<number> {
  const confirmed: string[] = [];
  for (const key of keys) {
    if (await storage.remove(key)) confirmed.push(key);
    else console.error("[retention-nightly] R2 did not confirm the deletion of", key);
  }
  if (confirmed.length > 0) {
    const { error } = await supabase.rpc("r2_dequeue", { p_keys: confirmed });
    if (error) throw new Error(`r2_dequeue: ${error.message}`);
  }
  return confirmed.length;
}

/** API §10 item 7: objects older than 24 h that no row uses and that are not queued. */
async function deleteOrphans(supabase: Supabase, storage: R2, now: Date): Promise<number> {
  let listed = 0;
  let deleted = 0;
  for (const prefix of ORPHAN_PREFIXES) {
    let token: string | null = null;
    do {
      if (listed >= ORPHAN_SCAN_LIMIT) return deleted;
      const page = await storage.list(prefix, { maxKeys: ORPHAN_SCAN_LIMIT - listed, continuationToken: token });
      listed += page.objects.length;
      token = page.next_token;
      const old = page.objects
        .filter((object) => now.getTime() - new Date(object.last_modified).getTime() > ORPHAN_MIN_AGE_MS)
        .map((object) => object.key);
      if (old.length === 0) continue;
      const { data, error } = await supabase.rpc("r2_keys_in_use", { p_keys: old });
      if (error) throw new Error(`r2_keys_in_use: ${error.message}`);
      const inUse = new Set((data ?? []) as string[]);
      for (const key of old.filter((k) => !inUse.has(k))) {
        if (await storage.remove(key)) deleted += 1;
        else console.error("[retention-nightly] R2 did not confirm the deletion of orphan", key);
      }
    } while (token);
  }
  return deleted;
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
  const counters: Counters = {
    accounts_deleted: 0,
    households_transferred: 0,
    r2_objects_deleted: 0,
    deliveries_purged: 0,
    invitations_expired: 0,
    transfers_expired: 0,
    exports_expired: 0,
  };
  if (belgradeHour(now) !== 3) {
    return NextResponse.json(counters);
  }

  const log: Record<string, number> = { accounts_failed: 0, organisations_deleted: 0 };
  try {
    const supabase = createServiceRoleClient();
    const storage = r2Configured() ? r2() : null;
    if (!storage) console.info("[retention-nightly] R2 is not configured — R2 skipped, keys stay queued");

    // Step 1 — account deletion. A batch that only failed stops the loop (those accounts wait for the next night).
    const skip = await cancelDueProviderSubscriptions(supabase, now);
    log.accounts_skipped_paddle = skip.length;
    for (;;) {
      const { data, error } = await supabase.rpc("retention_delete_due_accounts", { p_limit: ACCOUNT_BATCH, p_skip: skip });
      if (error) throw new Error(`retention_delete_due_accounts: ${error.message}`);
      const result = (data ?? {}) as Record<string, number>;
      const deleted = Number(result.accounts_deleted ?? 0);
      const failed = Number(result.failed ?? 0);
      counters.accounts_deleted += deleted;
      counters.households_transferred += Number(result.households_transferred ?? 0);
      log.organisations_deleted += Number(result.organisations_deleted ?? 0);
      log.accounts_failed += failed;
      if (deleted === 0 || deleted + failed < ACCOUNT_BATCH) break;
    }

    // Step 2 — R2 cleanup.
    if (storage) {
      for (;;) {
        const { data, error } = await supabase.rpc("r2_deletion_batch", { p_limit: QUEUE_BATCH });
        if (error) throw new Error(`r2_deletion_batch: ${error.message}`);
        const keys = (data ?? []) as string[];
        if (keys.length === 0) break;
        const confirmed = await deleteAndDequeue(supabase, storage, keys);
        counters.r2_objects_deleted += confirmed;
        if (keys.length < QUEUE_BATCH || confirmed === 0) break;
      }
      counters.r2_objects_deleted += await deleteOrphans(supabase, storage, now);
    }

    // Step 3 — delivery purge.
    const purged = await supabase.rpc("retention_purge_deliveries");
    if (purged.error) throw new Error(`retention_purge_deliveries: ${purged.error.message}`);
    counters.deliveries_purged = Number(purged.data ?? 0);

    // Step 4 — invitation and transfer expiry.
    const invitations = await supabase.rpc("retention_expire_invitations");
    if (invitations.error) throw new Error(`retention_expire_invitations: ${invitations.error.message}`);
    const invitationResult = (invitations.data ?? {}) as Record<string, number>;
    counters.invitations_expired = Number(invitationResult.invitations_expired ?? 0);
    counters.transfers_expired = Number(invitationResult.transfers_expired ?? 0);

    // Step 5 — export expiry; the archives are deleted right away when R2 is configured.
    const exportsResult = await supabase.rpc("retention_expire_exports");
    if (exportsResult.error) throw new Error(`retention_expire_exports: ${exportsResult.error.message}`);
    const exportsData = (exportsResult.data ?? {}) as { exports_expired?: number; r2_keys?: string[] };
    counters.exports_expired = Number(exportsData.exports_expired ?? 0);
    if (storage && (exportsData.r2_keys ?? []).length > 0) {
      counters.r2_objects_deleted += await deleteAndDequeue(supabase, storage, exportsData.r2_keys ?? []);
    }

    // TC §5.9 — idempotency / rate-limit purge.
    const support = await supabase.rpc("retention_purge_server_support");
    if (support.error) throw new Error(`retention_purge_server_support: ${support.error.message}`);
    Object.assign(log, (support.data ?? {}) as Record<string, number>);

    console.info("[retention-nightly] run", JSON.stringify({ ...counters, ...log }));
    return NextResponse.json(counters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[retention-nightly] run failed:", message, JSON.stringify(counters));
    return NextResponse.json(apiError("internal_error", { message }), { status: 500 });
  }
}
