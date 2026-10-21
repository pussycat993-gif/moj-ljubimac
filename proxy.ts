import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Request interception (TC ADR-01): Next.js 16 `proxy.ts`, Node.js runtime.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Every request except static assets and image optimisation.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
