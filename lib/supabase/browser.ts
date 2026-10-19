import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Browser client from the two public variables only (ADR-06). The auth
 * session is in httpOnly cookies (API §4.1), so this client is anonymous;
 * sign-in, sign-out and password changes go through the server.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
