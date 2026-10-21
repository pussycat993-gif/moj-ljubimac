import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postSignInPath, safeNextPath } from "@/lib/server/gates";

const RECOVERY_PATH = "/prijava/nova-lozinka";

/**
 * EP-42: exchanges the code from a verification, reset or Google link for the
 * cookie session, then redirects. A reset link always lands on S28, which shows
 * link-expired when the code could not be exchanged (already used or expired).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const isRecovery = next === RECOVERY_PATH;

  if (!code) return NextResponse.redirect(new URL(isRecovery ? RECOVERY_PATH : "/prijava", origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    if (error) console.error("[auth/callback] exchangeCodeForSession:", error.message);
    return NextResponse.redirect(new URL(isRecovery ? RECOVERY_PATH : "/prijava", origin));
  }

  if (isRecovery) return NextResponse.redirect(new URL(RECOVERY_PATH, origin));
  return NextResponse.redirect(new URL(await postSignInPath(supabase, data.user, next), origin));
}
