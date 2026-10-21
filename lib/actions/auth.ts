"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { postSignInPath, recoverySessionEmail, safeNextPath } from "@/lib/server/gates";
import { fail, fromAuthError, ok, type ActionResult } from "@/lib/server/result";

// EP-42 (and the EP-41 resend). The session lives in httpOnly cookies (API §4.1), so
// every Supabase Auth call that creates, reads or changes it runs here on the server.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const RECOVERY_PATH = "/prijava/nova-lozinka";

async function siteOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

function callbackUrl(origin: string, next: string | null) {
  return next ? `${origin}/auth/callback?next=${encodeURIComponent(next)}` : `${origin}/auth/callback`;
}

/** EP-42 password sign-in → where the client navigates next. */
export async function signInWithPassword(input: {
  email: string;
  password: string;
  next?: string | null;
}): Promise<ActionResult<{ redirectTo: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error || !data.user) return { ok: false, error: fromAuthError(error ?? { message: "no user" }) };
  return ok({ redirectTo: await postSignInPath(supabase, data.user, input.next) });
}

/** EP-42 Google sign-in → the provider URL the client goes to; it returns to /auth/callback. */
export async function signInWithGoogle(input: { next?: string | null } = {}): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(await siteOrigin(), safeNextPath(input.next)), skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, error: fromAuthError(error ?? { message: "no provider url" }) };
  return ok({ url: data.url });
}

/** EP-42 password reset — always succeeds for a valid email (no account enumeration). */
export async function requestPasswordReset(input: { email: string }): Promise<ActionResult<null>> {
  if (!EMAIL_PATTERN.test(input.email)) return fail("validation_failed", { fields: { email: "invalid" } });
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: callbackUrl(await siteOrigin(), RECOVERY_PATH),
  });
  if (error) console.error("[actions/auth] resetPasswordForEmail:", error.message);
  return ok(null);
}

/** EP-41 resend of the verification email (S16 email_not_verified state). */
export async function resendVerification(input: { email: string }): Promise<ActionResult<null>> {
  if (!EMAIL_PATTERN.test(input.email)) return fail("validation_failed", { fields: { email: "invalid" } });
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: input.email,
    options: { emailRedirectTo: callbackUrl(await siteOrigin(), null) },
  });
  if (error) return { ok: false, error: fromAuthError(error) };
  return ok(null);
}

/**
 * EP-42 updateUser after recovery (S28). Only a session opened by a reset link may
 * set the password, and only once: the session ends right after, so the link's
 * page then shows the link-expired state (invalid_action_token).
 */
export async function setNewPassword(input: { password: string }): Promise<ActionResult<null>> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return fail("validation_failed", { fields: { password: "too_weak" } });
  }
  const supabase = await createClient();
  if ((await recoverySessionEmail(supabase)) === null) return fail("invalid_action_token");
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) return { ok: false, error: fromAuthError(error) };
  await supabase.auth.signOut({ scope: "local" });
  return ok(null);
}

/** EP-42 sign-out: clears the cookies and goes to /prijava (allowed during pending deletion). */
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // The server-side revoke failed; still drop this browser's session cookies.
    console.error("[actions/auth] signOut:", error.message);
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/prijava");
}
