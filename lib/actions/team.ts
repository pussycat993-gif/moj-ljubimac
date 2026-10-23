"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { withIdempotency } from "@/lib/server/idempotency";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { hashToken, signActionToken } from "@/lib/server/action-tokens";
import { formatBelgradeDate } from "@/lib/server/dispatch";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { sendEmail } from "@/lib/integrations/resend";
import { fromProfileLocale } from "@/lib/i18n";
import type { OrganisationInvitation, OrganisationMember } from "@/lib/actions/organisation";

// S20 Tim tab (Step 24): EP-56 — inviteTeamMember (rpc:create_organisation_invitation: expire the earlier
// pending invitation to the same address and insert the new one in one transaction), and the Data API
// writes revokeInvitation (organisation_invitations delete of a pending row), removeMember
// (organisation_memberships delete) and changeMemberRole (organisation_memberships update). The database
// enforces BR-34 (Admins only → forbidden_role; members + pending invitations = 20 → team_full), the
// last-admin rule (validation_failed:last_admin → fields.user_id = last_admin) and the approval gate.

/** EP-56 invite Request. */
export type InviteTeamMemberInput = { email: string; role: "admin" | "volunteer"; idempotency_key: string };

/**
 * API §11: EP-56 team invitations, 20 per user per day. Step 24 decision: a counter of their own
 * (`organisation_invitations.create`), separate from household invitations.
 */
const INVITATIONS_PER_DAY = 20;
/** BR-47: valid 7 days, as household invitations (the stored expires_at is set by the database). */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** RPC / trigger errors: DETAIL '<field>:<code>' becomes `fields` (validation_failed:last_admin → user_id). */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed") {
    if (error.message === "validation_failed:last_admin") {
      mapped.fields = { user_id: "last_admin" };
    } else if (error.details) {
      const [field, code] = error.details.split(":");
      if (field && code) mapped.fields = { [field]: code };
    }
  }
  return mapped;
}

/** RLS refusals and missing rows look the same to the caller (API §4.3). */
function fromWriteError(error: { code?: string; message: string; details?: string | null }): ApiError {
  if (error.code === "42501" || error.code === "PGRST116") return { code: "not_found", message: error.message };
  return fromRpcError(error);
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

/** The caller's organisation (earliest membership), or null. */
async function myOrganisationId(supabase: Supabase, userId: string): Promise<ActionResult<string>> {
  const { data, error } = await supabase
    .from("organisation_memberships")
    .select("organisation_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) return { ok: false, error: fromDatabaseError(error) };
  const row = data?.[0];
  if (!row) return fail("not_found");
  return ok(row.organisation_id);
}

type CreateRpcResult = {
  invitation: OrganisationInvitation;
  organisation_name: string;
  inviter_name: string | null;
  inviter_locale: string | null;
  recipient_locale: string | null;
};

/**
 * EP-56 invite — idempotent per `idempotency_key` for 24 h (API §3.3), at most 20 per day (API §11). The og_
 * token is signed per API §9.3 (`signActionToken("og", [invitation_id], now + 7 days)`) and only its SHA-256
 * hash is stored. The Design §9.1 team_invitation email goes to the address in its account's language (else
 * the inviter's). A repeat with the same key returns the original invitation and sends nothing.
 */
export async function inviteTeamMember(input: InviteTeamMemberInput): Promise<ActionResult<OrganisationInvitation>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  const key = typeof input?.idempotency_key === "string" ? input.idempotency_key : "";
  if (!key) fields.idempotency_key = "required";
  else if (!UUID_V4.test(key)) fields.idempotency_key = "invalid";
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email) fields.email = "required";
  else if (!EMAIL.test(email) || email.length > 254) fields.email = "invalid";
  if (input?.role !== "admin" && input?.role !== "volunteer") fields.role = "invalid";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const userId = caller.data.user.id;
  return withIdempotency(supabase, { userId, key, operation: "organisation_invitation" }, async () => {
    const limited = await checkRateLimit(supabase, {
      userId,
      operation: "organisation_invitations.create",
      limit: INVITATIONS_PER_DAY,
      windowSeconds: 24 * 60 * 60,
    });
    if (limited) return { ok: false, error: limited };

    const invitationId = crypto.randomUUID();
    const token = await signActionToken("og", [invitationId], new Date(Date.now() + INVITATION_TTL_MS));
    const { data, error } = await supabase.rpc("create_organisation_invitation", {
      p_invitation_id: invitationId,
      p_token_hash: await hashToken(token),
      p_email: email,
      p_role: input.role,
    });
    if (error) return { ok: false, error: fromRpcError(error) };
    const created = data as unknown as CreateRpcResult;

    const locale = fromProfileLocale(created.recipient_locale ?? created.inviter_locale);
    const sent = await sendEmail({
      to: email,
      locale,
      template: {
        id: "team_invitation",
        variables: {
          inviter: created.inviter_name || caller.data.user.email || "",
          organisation: created.organisation_name,
          role: created.invitation.role,
          date: formatBelgradeDate(created.invitation.expires_at, locale),
          url: `${siteUrl()}/poziv/${token}`,
        },
      },
    });
    if (sent.status === "failed") {
      console.error("[lib/actions/team] invitation email failed:", sent.error);
      return fail("internal_error", { message: `team_invitation email: ${sent.error}` });
    }
    return ok(created.invitation);
  });
}

/** EP-56 revoke — Data API delete of a pending invitation of the caller's organisation (204). */
export async function revokeInvitation(input: { invitation_id: string }): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  if (!UUID.test(String(input?.invitation_id))) return fail("not_found");

  const { data, error } = await supabase
    .from("organisation_invitations")
    .delete()
    .eq("id", input.invitation_id)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: fromWriteError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return ok(null);
}

/** EP-56 remove — Data API delete of a member of the caller's organisation (204); their entries stay. */
export async function removeMember(input: { user_id: string }): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  if (!UUID.test(String(input?.user_id))) return fail("validation_failed", { fields: { user_id: "invalid" } });
  const organisation = await myOrganisationId(supabase, caller.data.user.id);
  if (!organisation.ok) return organisation;

  const { data, error } = await supabase
    .from("organisation_memberships")
    .delete()
    .eq("organisation_id", organisation.data)
    .eq("user_id", input.user_id)
    .select("id");
  if (error) return { ok: false, error: fromWriteError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return ok(null);
}

/** EP-56 change role — Data API update of a member's role; returns the OrganisationMember (EP-53 re-read). */
export async function changeMemberRole(input: {
  user_id: string;
  role: "admin" | "volunteer";
}): Promise<ActionResult<OrganisationMember>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  const fields: Record<string, string> = {};
  if (!UUID.test(String(input?.user_id))) fields.user_id = "invalid";
  if (input?.role !== "admin" && input?.role !== "volunteer") fields.role = "invalid";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });
  const organisation = await myOrganisationId(supabase, caller.data.user.id);
  if (!organisation.ok) return organisation;

  const { data, error } = await supabase
    .from("organisation_memberships")
    .update({ role: input.role })
    .eq("organisation_id", organisation.data)
    .eq("user_id", input.user_id)
    .select("user_id");
  if (error) return { ok: false, error: fromWriteError(error) };
  if (!data || data.length === 0) return fail("not_found");

  const { data: view, error: readError } = await supabase.rpc("get_my_organisation");
  if (readError) return { ok: false, error: fromRpcError(readError) };
  const member = ((view as unknown as { team: OrganisationMember[] }).team ?? []).find((m) => m.user_id === input.user_id);
  if (!member) return fail("not_found");
  return ok(member);
}
