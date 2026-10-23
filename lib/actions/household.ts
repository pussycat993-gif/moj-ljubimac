"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { withIdempotency } from "@/lib/server/idempotency";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { hashToken, signActionToken } from "@/lib/server/action-tokens";
import { formatBelgradeDate } from "@/lib/server/dispatch";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { sendEmail } from "@/lib/integrations/resend";
import { fromProfileLocale, type Locale } from "@/lib/i18n";

// S13 Domaćinstvo (/domacinstvo): EP-34 read (rpc:get_household), EP-35 create_household_invitation,
// EP-36 change_household_membership, EP-37 shared pets (Data API household_pets) and EP-38 the member's
// own reminder opt-in (Data API household_memberships). Everything runs on the server because the session
// lives in httpOnly cookies (owner decision, Steps 13–17). The database enforces the rules (API §3.1):
// the Step 05 / Step 06 RLS and triggers (owner-only writes, BR-20 size, BR-28 read-only) and the Step 22
// functions get_household / create_household_invitation.

/** API §6 HouseholdMember. */
export type HouseholdMember = {
  user_id: string;
  full_name: string | null;
  email: string;
  role: "owner" | "member";
  joined_at: string;
  reminders_enabled: boolean | null;
  is_me: boolean;
};

/** API §6 HouseholdInvitation. */
export type HouseholdInvitation = {
  id: string;
  household_id: string;
  kind: "email" | "link";
  email: string | null;
  status: "pending" | "accepted" | "declined" | "expired";
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  accepted_by: string | null;
};

export type HouseholdPet = {
  pet_id: string;
  name: string;
  sex: "male" | "female" | "unknown";
  species: string;
  breed: string | null;
  lifecycle: "active" | "memorial";
  shared: boolean;
};

/** API §6 Household. */
export type Household = {
  id: string;
  name: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_premium_until: string | null;
  read_only: boolean;
  my_role: "owner" | "member";
  my_reminders_enabled: boolean | null;
  members: HouseholdMember[];
  member_count: number;
  member_limit: number;
  pets: HouseholdPet[];
  pending_invitations: HouseholdInvitation[];
  access: { role: "owner" | "member"; can_edit: boolean; can_delete: boolean };
};

/** EP-34 Response. */
export type HouseholdView = {
  household: Household | null;
  my_households: { household_id: string; name: string; owner_name: string | null; my_role: "owner" | "member" }[];
};

/** EP-35 Request. */
export type CreateInvitationInput = {
  email: string | null;
  household_name?: string | null;
  idempotency_key: string;
};

/** EP-35 Response. */
export type CreatedInvitation = { invitation: HouseholdInvitation; invite_url: string };

/** EP-36 Request. */
export type ChangeMembershipInput =
  | { op: "revoke_invitation"; invitation_id: string }
  | { op: "remove_member"; household_id: string; user_id: string }
  | { op: "leave"; household_id: string };

/** API §11: 20 household invitations per user per day. */
const INVITATIONS_PER_DAY = 20;
/** BR-47: invitations are valid 7 days (the stored expires_at is set by the database). */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RPC errors carry their field code in DETAIL '<field>:<code>' (Step 15 convention). */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

/** RLS refusals and missing rows look the same to the caller (API §4.3). */
function fromWriteError(error: { code?: string; message: string }): ApiError {
  if (error.code === "42501" || error.code === "23503" || error.code === "PGRST116") return { code: "not_found", message: error.message };
  return fromDatabaseError(error);
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

function intlLocale(locale: Locale) {
  return locale === "en" ? "en-GB" : "sr-Latn";
}

async function readHousehold(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId?: string,
): Promise<ActionResult<HouseholdView>> {
  const { data, error } = await supabase.rpc("get_household", householdId ? { p_household_id: householdId } : {});
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as HouseholdView);
}

/** EP-34 — rpc:get_household. Without `household_id`: the household the caller owns, else the earliest-joined. */
export async function getHousehold(input: { household_id?: string } = {}): Promise<ActionResult<HouseholdView>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  if (input?.household_id !== undefined && !UUID.test(String(input.household_id))) return fail("not_found");
  return readHousehold(supabase, input?.household_id);
}

type CreateRpcResult = {
  invitation: HouseholdInvitation;
  household_name: string;
  inviter_name: string | null;
  inviter_locale: string | null;
  recipient_locale: string | null;
  shared_pets: string[];
};

/**
 * EP-35 — invite by email or by link (FR-26). Idempotent per `idempotency_key` for 24 h (API §3.3);
 * at most 20 per day (API §11). The hh_ token is signed per API §9.3 and only its SHA-256 hash is stored;
 * the raw token exists only in `invite_url`. Email invitations send the Design §9.1 household_invitation
 * email in the recipient's language; link invitations send nothing.
 */
export async function createHouseholdInvitation(input: CreateInvitationInput): Promise<ActionResult<CreatedInvitation>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  const key = typeof input?.idempotency_key === "string" ? input.idempotency_key : "";
  if (!key) fields.idempotency_key = "required";
  else if (!UUID_V4.test(key)) fields.idempotency_key = "invalid";
  let email: string | null = null;
  if (input?.email !== null && input?.email !== undefined) {
    email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!EMAIL.test(email) || email.length > 254) fields.email = "invalid";
  }
  const householdName = typeof input?.household_name === "string" ? input.household_name.trim() : null;
  if (householdName !== null && householdName.length > 60) fields.household_name = "too_long";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const userId = caller.data.user.id;
  return withIdempotency(supabase, { userId, key, operation: "household_invitation" }, async () => {
    const limited = await checkRateLimit(supabase, {
      userId,
      operation: "household_invitations.create",
      limit: INVITATIONS_PER_DAY,
      windowSeconds: 24 * 60 * 60,
    });
    if (limited) return { ok: false, error: limited };

    const invitationId = crypto.randomUUID();
    const token = await signActionToken("hh", [invitationId], new Date(Date.now() + INVITATION_TTL_MS));
    const { data, error } = await supabase.rpc("create_household_invitation", {
      p_invitation_id: invitationId,
      p_token_hash: await hashToken(token),
      ...(email ? { p_email: email } : {}),
      ...(householdName ? { p_household_name: householdName } : {}),
    });
    if (error) return { ok: false, error: fromRpcError(error) };
    const created = data as unknown as CreateRpcResult;
    const inviteUrl = `${siteUrl()}/poziv/${token}`;

    if (email) {
      const locale = fromProfileLocale(created.recipient_locale ?? created.inviter_locale);
      const pets =
        created.shared_pets.length > 0
          ? new Intl.ListFormat(intlLocale(locale), { type: "conjunction" }).format(created.shared_pets)
          : null;
      const sent = await sendEmail({
        to: email,
        locale,
        template: {
          id: "household_invitation",
          variables: {
            inviter: created.inviter_name || caller.data.user.email || "",
            household: created.household_name,
            pets,
            date: formatBelgradeDate(created.invitation.expires_at, locale),
            url: inviteUrl,
          },
        },
      });
      if (sent.status === "failed") {
        console.error("[lib/actions/household] invitation email failed:", sent.error);
        return fail("internal_error", { message: `household_invitation email: ${sent.error}` });
      }
    }
    return ok({ invitation: created.invitation, invite_url: inviteUrl });
  });
}

/**
 * EP-36 — revoke a pending invitation or remove a member (owner, BR-25), or leave (member). Removing or
 * leaving deletes the membership row; the member's entries stay (BR-26) and access ends at once (RLS).
 */
export async function changeHouseholdMembership(
  input: ChangeMembershipInput,
): Promise<ActionResult<Household | { left: true }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  const me = caller.data.user.id;

  if (input?.op === "revoke_invitation") {
    if (!UUID.test(String(input.invitation_id))) return fail("validation_failed", { fields: { invitation_id: "invalid" } });
    // RLS: only the household owner sees invitations.
    const { data: invitation, error } = await supabase
      .from("household_invitations")
      .select("id, household_id, status")
      .eq("id", input.invitation_id)
      .maybeSingle();
    if (error) return { ok: false, error: fromWriteError(error) };
    if (!invitation) return fail("not_found");
    if (invitation.status !== "pending") return fail("invitation_used");
    const { data: updated, error: updateError } = await supabase
      .from("household_invitations")
      .update({ status: "expired", expires_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .eq("status", "pending")
      .select("id");
    if (updateError) return { ok: false, error: fromWriteError(updateError) };
    if (!updated || updated.length === 0) return fail("invitation_used");
    return refreshed(supabase, invitation.household_id);
  }

  if (input?.op === "remove_member" || input?.op === "leave") {
    if (!UUID.test(String(input.household_id))) return fail("validation_failed", { fields: { household_id: "invalid" } });
    if (input.op === "remove_member" && !UUID.test(String(input.user_id))) {
      return fail("validation_failed", { fields: { user_id: "invalid" } });
    }
    const { data: household, error } = await supabase
      .from("households")
      .select("id, owner_id")
      .eq("id", input.household_id)
      .maybeSingle();
    if (error) return { ok: false, error: fromWriteError(error) };
    if (!household) return fail("not_found");

    const isOwner = household.owner_id === me;
    // remove_member is the owner's (BR-25); the owner cannot leave their own household.
    if (input.op === "remove_member" ? !isOwner : isOwner) return fail("forbidden_role");
    const target = input.op === "remove_member" ? input.user_id : me;

    const { data: deleted, error: deleteError } = await supabase
      .from("household_memberships")
      .delete()
      .eq("household_id", household.id)
      .eq("user_id", target)
      .select("id");
    if (deleteError) return { ok: false, error: fromWriteError(deleteError) };
    if (!deleted || deleted.length === 0) return fail("not_found");
    if (input.op === "leave") return ok({ left: true as const });
    return refreshed(supabase, household.id);
  }

  return fail("validation_failed", { fields: { op: "invalid" } });
}

async function refreshed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
): Promise<ActionResult<Household>> {
  const view = await readHousehold(supabase, householdId);
  if (!view.ok) return view;
  if (!view.data.household) return fail("not_found");
  return ok(view.data.household);
}

/**
 * EP-37 — share or un-share one of the owner's pets (BR-21). Share = upsert ignoring duplicates; un-share
 * = delete. The household_pets_check_write trigger answers forbidden_role (member) and
 * household_read_only (BR-28).
 */
export async function setSharedPet(input: {
  household_id: string;
  pet_id: string;
  shared: boolean;
}): Promise<ActionResult<{ household_id: string; pet_id: string; shared: boolean }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  if (!UUID.test(String(input?.household_id)) || !UUID.test(String(input?.pet_id))) return fail("not_found");
  if (typeof input.shared !== "boolean") return fail("validation_failed", { fields: { shared: "invalid" } });

  if (input.shared) {
    const { data: pet, error: petError } = await supabase
      .from("pets")
      .select("id, owner_id")
      .eq("id", input.pet_id)
      .maybeSingle();
    if (petError) return { ok: false, error: fromWriteError(petError) };
    if (!pet || pet.owner_id !== caller.data.user.id) return fail("not_found");
    const { error } = await supabase
      .from("household_pets")
      .upsert({ household_id: input.household_id, pet_id: input.pet_id }, { onConflict: "household_id,pet_id", ignoreDuplicates: true });
    if (error) return { ok: false, error: fromWriteError(error) };
  } else {
    const { error } = await supabase
      .from("household_pets")
      .delete()
      .eq("household_id", input.household_id)
      .eq("pet_id", input.pet_id);
    if (error) return { ok: false, error: fromWriteError(error) };
  }
  return ok({ household_id: input.household_id, pet_id: input.pet_id, shared: input.shared });
}

/** EP-38 — the member's own reminder opt-in (BR-24); allowed while the household is read-only. */
export async function setMyReminderOptIn(input: {
  household_id: string;
  reminders_enabled: boolean;
}): Promise<ActionResult<{ household_id: string; reminders_enabled: boolean }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  if (!UUID.test(String(input?.household_id))) return fail("not_found");
  if (typeof input.reminders_enabled !== "boolean") {
    return fail("validation_failed", { fields: { reminders_enabled: "invalid" } });
  }
  const { data, error } = await supabase
    .from("household_memberships")
    .update({ reminders_enabled: input.reminders_enabled })
    .eq("household_id", input.household_id)
    .eq("user_id", caller.data.user.id)
    .select("household_id, reminders_enabled");
  if (error) return { ok: false, error: fromWriteError(error) };
  const row = data?.[0];
  if (!row) return fail("not_found");
  return ok(row);
}
