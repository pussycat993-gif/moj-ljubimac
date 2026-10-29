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
  // Šapa pomoći (Step 28b, CR-27): only the signed-in pages; /sapa-pomoci, /sapa-pomoci/<id> and /korisnik/<id>
  // stay public. /sapa-pomoci/<id>/izmeni is matched below.
  "/sapa-pomoci/nova",
  "/sapa-pomoci/moje",
  // S36 Poruke (Step 28c): /poruke and /poruke/<id>.
  "/poruke",
] as const;

/** Signed-in pages under a public prefix (S34 edit). */
const SIGNED_IN_PATTERNS = [/^\/sapa-pomoci\/[^/]+\/izmeni\/?$/] as const;

/**
 * Šapa pomoći surfaces (S34, S35, S36) keep the requested path as `next`, so a signed-out user who opens an email
 * link (e.g. `listing_expiring` "Produži" → /sapa-pomoci/moje?produzi=<id>) returns to it after signing in.
 * /prijava follows `next` only for same-site paths (`safeNextPath`). Other surfaces keep the plain redirect.
 */
export function keepsNext(pathname: string) {
  return pathname.startsWith("/sapa-pomoci/") || pathname === "/poruke" || pathname.startsWith("/poruke/");
}

export function isSignedInSurface(pathname: string) {
  return (
    SIGNED_IN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    SIGNED_IN_PATTERNS.some((pattern) => pattern.test(pathname))
  );
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
    const next = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/prijava";
    url.search = keepsNext(request.nextUrl.pathname) ? `?${new URLSearchParams({ next })}` : "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
