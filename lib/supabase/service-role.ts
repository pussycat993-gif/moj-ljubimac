import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// API §3.1: bypasses RLS — for Operator actions, jobs and webhooks only, never a user's own data.
export function createServiceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set; the service-role client cannot be created.");
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
