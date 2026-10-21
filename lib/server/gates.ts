import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fail, fromAuthError, fromDatabaseError, ok, type ActionResult } from "./result";

type ApprovalStatus = Database["public"]["Enums"]["approval_status"];

export type Caller = {
  user: User;
  /** null until complete_registration has run (EP-41). */
  profile: { id: string; deletion_requested_at: string | null } | null;
  organisations: { organisation_id: string; approval_status: ApprovalStatus }[];
};

export type GateOptions = {
  access: "read" | "write";
  /** The only calls allowed through gate 3 (API §4.1): EP-51 cancel and EP-42 sign-out. */
  exempt?: "cancel_deletion" | "sign_out";
};

async function loadCaller(supabase: SupabaseClient<Database>, user: User): Promise<ActionResult<Caller>> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, deletion_requested_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { ok: false, error: fromDatabaseError(profileError) };

  const { data: memberships, error: membershipError } = await supabase
    .from("organisation_memberships")
    .select("organisation_id, organisations(approval_status)")
    .eq("user_id", user.id);
  if (membershipError) return { ok: false, error: fromDatabaseError(membershipError) };

  const organisations = (memberships ?? []).flatMap((m) =>
    m.organisations ? [{ organisation_id: m.organisation_id, approval_status: m.organisations.approval_status }] : [],
  );
  return ok({ user, profile, organisations });
}

/**
 * The API §4.1 gates, in order, for every protected server call:
 * 1. no session → 401 unauthenticated
 * 2. email not verified → 403 email_not_verified
 * 3. profiles.deletion_requested_at set → 403 account_pending_deletion (EP-51 cancel and EP-42 sign-out exempt)
 * 4. member of a pending organisation → writes 403 organisation_pending_approval; reads allowed
 */
export async function checkGates(
  supabase: SupabaseClient<Database>,
  { access, exempt }: GateOptions,
): Promise<ActionResult<Caller>> {
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    const mapped = fromAuthError(error);
    if (mapped.code !== "unauthenticated") return { ok: false, error: mapped };
  }
  const user = data?.user;
  if (!user) return fail("unauthenticated");

  if (!user.email_confirmed_at) return fail("email_not_verified");

  const caller = await loadCaller(supabase, user);
  if (!caller.ok) return caller;

  if (caller.data.profile?.deletion_requested_at && !exempt) return fail("account_pending_deletion");

  if (access === "write" && caller.data.organisations.some((o) => o.approval_status === "pending")) {
    return fail("organisation_pending_approval");
  }
  return caller;
}

/**
 * The email of a session opened by a password-reset link (its `amr` claim says
 * `recovery`), or null — no session, an ordinary sign-in, or a link already used.
 */
export async function recoverySessionEmail(supabase: SupabaseClient<Database>): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const amr = data.claims.amr ?? [];
  const isRecovery = amr.some((entry) => (typeof entry === "string" ? entry : entry.method) === "recovery");
  return isRecovery ? (data.claims.email ?? "") : null;
}

/** A `next` value is followed only when it is a path on this site. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  try {
    const base = "http://same-site.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * Where a fresh session lands (API EP-42): no profiles row → S15 completion step;
 * deletion pending → S19; organisation member → S20; otherwise `next` or S01.
 */
export async function postSignInPath(
  supabase: SupabaseClient<Database>,
  user: User,
  next: string | null | undefined,
): Promise<string> {
  const caller = await loadCaller(supabase, user);
  if (!caller.ok) return safeNextPath(next) ?? "/ljubimci";
  if (!caller.data.profile) return "/registracija";
  if (caller.data.profile.deletion_requested_at) return "/profil/podaci";
  if (caller.data.organisations.length > 0) return "/organizacija";
  return safeNextPath(next) ?? "/ljubimci";
}
