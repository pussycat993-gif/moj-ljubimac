import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { ActionResult } from "./result";

/** API §3.3: a repeat with the same key within 24 h returns the original result. */
export const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

type Idempotent = { userId: string; key: string; operation: string; now?: Date };

/**
 * Runs `run` once per (user, idempotency_key) and replays its stored result for 24 h
 * (API §3.3, TC §5.7 idempotency_keys). Uses the caller's own session — RLS limits the
 * rows to the caller (API §3.1). Only successful results are stored: a failed attempt
 * performed nothing, so the same intent may be tried again.
 */
export async function withIdempotency<T>(
  supabase: SupabaseClient<Database>,
  { userId, key, operation, now = new Date() }: Idempotent,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const since = new Date(now.getTime() - IDEMPOTENCY_WINDOW_MS).toISOString();
  const { data: stored, error: readError } = await supabase
    .from("idempotency_keys")
    .select("result")
    .eq("user_id", userId)
    .eq("key", key)
    .gte("created_at", since)
    .maybeSingle();
  if (readError) console.error("[lib/server/idempotency] read failed:", readError.message);
  if (stored?.result) return stored.result as ActionResult<T>;

  const result = await run();
  if (result.ok) {
    const { error: writeError } = await supabase
      .from("idempotency_keys")
      .insert({ user_id: userId, key, operation, result: result as unknown as Json });
    if (writeError) console.error("[lib/server/idempotency] store failed:", writeError.message);
  }
  return result;
}
