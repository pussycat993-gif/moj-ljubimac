import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

/** Routes of shells A, O and D (Design §11) and their children. */
export const SIGNED_IN_PREFIXES = [
  "/ljubimci",
  "/uspomene",
  "/podsetnici",
  "/podesavanja",
  "/domacinstvo",
  "/premium",
  "/profil",
  "/partneri",
  "/organizacija",
  "/admin",
] as const;

export function isSignedInSurface(pathname: string) {
  return SIGNED_IN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Refreshes the Supabase session on every request (API §4.1) and keeps the auth
 * cookies httpOnly; unauthenticated requests for signed-in surfaces go to /prijava.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { httpOnly: true },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    },
  );

  // Validates the token and refreshes an expired session; do not run code between
  // creating the client and this call.
  const { data } = await supabase.auth.getUser();

  if (!data.user && isSignedInSurface(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/prijava";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
