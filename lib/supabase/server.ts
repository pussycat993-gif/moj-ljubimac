import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Server client over a given cookie store. The session lives in httpOnly
 * cookies (API §4.1), so browser JavaScript never sees it.
 */
export function createServerSupabase(cookieStore: CookieStore) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { httpOnly: true },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies; the session refresh in
            // request interception (Step 11) writes them instead.
          }
        },
      },
    },
  );
}

/** Server client for Server Components, server actions and route handlers. */
export async function createClient() {
  return createServerSupabase(await cookies());
}
