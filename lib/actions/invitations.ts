"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { hashToken } from "@/lib/server/action-tokens";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import type { City } from "@/lib/actions/registration";

// S14 /poziv/[token]: EP-39 get_household_invitation and EP-40 decide_household_invitation. The path is
// chosen by the token's type prefix (API §9.3): hh_ → household invitation (rpc:get_household_invitation /
// rpc:decide_household_invitation); og_ → organisation team invitation (Step 24, CR-18:
// rpc:get_organisation_invitation / rpc:decide_organisation_invitation, InvitationView kind = organisation;
// accepting inserts organisation_memberships with the invited role and leaves profiles.account_type as it
// is, BR-53). All are security definer — the token hash is the credential (BR-52). tr_ (record transfer,
// EP-60, Step 25) is not handled yet and answers not_found, which S14 shows as its error state. Only the
// SHA-256 hash of the token reaches the database.

/** API §6 InvitationView. Fields marked (session) are null for a Visitor. */
export type InvitationView = {
  kind: "household" | "organisation" | "transfer";
  status: "pending" | "accepted" | "declined";
  expires_at: string;
  household_name: string | null;
  organisation_name: string | null;
  organisation_type: "shelter" | "breeder" | null;
  role: "admin" | "volunteer" | null;
  inviter_name: string | null;
  inviter_city: City | null;
  shared_pets: { name: string; sex: "male" | "female" | "unknown"; species: string; breed: string | null }[] | null;
  member_count: number | null;
  member_limit: number | null;
  is_signed_in: boolean;
  already_member: boolean | null;
};

/** EP-40 Response. */
export type InvitationDecision = {
  kind: "household" | "organisation";
  status: "accepted" | "declined";
  household_id: string | null;
  organisation_id: string | null;
};

const INVITATION_TOKEN = /^(hh|og)_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

type InvitationToken = { token: string; kind: "household" | "organisation" };

function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

/** A household (hh_) or organisation team (og_) token, or null for anything else (tr_ comes in Step 25). */
function invitationToken(token: unknown): InvitationToken | null {
  if (typeof token !== "string" || token.length > 1024 || !INVITATION_TOKEN.test(token)) return null;
  return { token, kind: token.startsWith("og_") ? "organisation" : "household" };
}

/** EP-39 — anyone holding the token (hh_ or og_); a Visitor gets the limited fields (is_signed_in = false). */
export async function getHouseholdInvitation(input: { token: string }): Promise<ActionResult<InvitationView>> {
  const token = invitationToken(input?.token);
  if (!token) return fail("not_found");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    token.kind === "organisation" ? "get_organisation_invitation" : "get_household_invitation",
    { p_token_hash: await hashToken(token.token) },
  );
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as InvitationView);
}

/** EP-40 — accept or decline (hh_ or og_) as the signed-in user; a Visitor gets 401 unauthenticated. */
export async function decideHouseholdInvitation(input: {
  token: string;
  decision: "accept" | "decline";
}): Promise<ActionResult<InvitationDecision>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  if (input?.decision !== "accept" && input?.decision !== "decline") {
    return fail("validation_failed", { fields: { decision: "invalid" } });
  }
  const token = invitationToken(input.token);
  if (!token) return fail("not_found");
  const { data, error } = await supabase.rpc(
    token.kind === "organisation" ? "decide_organisation_invitation" : "decide_household_invitation",
    { p_token_hash: await hashToken(token.token), p_decision: input.decision },
  );
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as InvitationDecision);
}
