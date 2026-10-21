import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { apiError, fromDatabaseError, type ApiError } from "./result";

type RateLimit = {
  userId: string;
  /** e.g. `invitations.send` (TC §5.7). */
  operation: string;
  /** Calls allowed per window (API §11). */
  limit: number;
  windowSeconds: number;
  now?: Date;
};

/**
 * Counts one call per user, operation and fixed window in rate_limit_counters
 * (API §11, TC §5.7) through the caller's own session. Returns null when the call
 * may proceed, or rate_limited with details.retry_after_s when the window is full.
 */
export async function checkRateLimit(
  supabase: SupabaseClient<Database>,
  { userId, operation, limit, windowSeconds, now = new Date() }: RateLimit,
): Promise<ApiError | null> {
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const windowStartIso = new Date(windowStart).toISOString();

  const { data: counter, error: readError } = await supabase
    .from("rate_limit_counters")
    .select("count")
    .eq("user_id", userId)
    .eq("operation", operation)
    .eq("window_start", windowStartIso)
    .maybeSingle();
  if (readError) return fromDatabaseError(readError);

  if (counter && counter.count >= limit) {
    const retryAfterS = Math.max(1, Math.ceil((windowStart + windowMs - now.getTime()) / 1000));
    return apiError("rate_limited", {
      message: `${operation}: ${limit} per ${windowSeconds} s`,
      details: { retry_after_s: retryAfterS },
    });
  }

  const { error: writeError } = counter
    ? await supabase
        .from("rate_limit_counters")
        .update({ count: counter.count + 1 })
        .eq("user_id", userId)
        .eq("operation", operation)
        .eq("window_start", windowStartIso)
    : await supabase
        .from("rate_limit_counters")
        .insert({ user_id: userId, operation, window_start: windowStartIso, count: 1 });
  if (writeError) return fromDatabaseError(writeError);
  return null;
}
