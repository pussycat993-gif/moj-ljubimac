import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postSignInPath, safeNextPath } from "@/lib/server/gates";
import { completeRegistration, type RegistrationInput } from "@/lib/actions/registration";

const RECOVERY_PATH = "/prijava/nova-lozinka";

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The EP-41 sign-up payload stored in user_metadata, or null (e.g. a first Google sign-in). */
function registrationFromMetadata(metadata: Record<string, unknown> | undefined): RegistrationInput | null {
  const accountType = text(metadata?.account_type);
  if (accountType !== "owner" && accountType !== "shelter" && accountType !== "breeder") return null;
  return {
    account_type: accountType,
    locale: text(metadata?.locale) === "en" ? "en" : "sr-Latn",
    terms_version: text(metadata?.terms_version) ?? "",
    org_name: text(metadata?.org_name),
    city_id: text(metadata?.city_id),
    tax_id: text(metadata?.tax_id),
    registration_note: text(metadata?.registration_note),
  };
}

/**
 * EP-42: exchanges the code from a verification, reset or Google link for the
 * cookie session, then redirects. A reset link always lands on S28, which shows
 * link-expired when the code could not be exchanged (already used or expired).
 * EP-41: a verified email sign-up without a profile is completed from its
 * user_metadata; without that payload (Google) the user goes to the S15 completion step.
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

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (!profile) {
    const registration = registrationFromMetadata(data.user.user_metadata);
    if (!registration) return NextResponse.redirect(new URL("/registracija", origin));
    const result = await completeRegistration(registration);
    if (!result.ok) {
      console.error("[auth/callback] complete_registration:", result.error.code);
      return NextResponse.redirect(new URL("/registracija", origin));
    }
  }

  return NextResponse.redirect(new URL(await postSignInPath(supabase, data.user, next), origin));
}
