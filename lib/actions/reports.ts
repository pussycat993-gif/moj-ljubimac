"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import type { ReportReason } from "@/lib/actions/listings";

// Šapa pomoći report and block (Step 28c, FR-70, API v1.3 §5.9): EP-84 submitReport — a reports insert through the
// caller's session (RLS: the reporter inserts and reads their own; the Step 28a trigger sets reported_user_id to the
// listing's author); a repeat while the caller's earlier report on the same target is open returns that report with
// already_submitted = true and writes nothing (FR-70 #2; the unique partial indexes back it). Also the server wrappers
// of EP-85 rpc:block_user / rpc:unblock_user (the session lives in httpOnly cookies). Allowed while suspended; gate 4
// does not apply (personal writes, API §5.9 conventions). Owner decision (Step 28c): a foreign-key error (SQLSTATE
// 23503) on an unknown user → not_found.

/** API §6 Report (the reporter's view). */
export type Report = {
  id: string;
  target: "listing" | "user";
  listing_id: string | null;
  reported_user_id: string | null;
  reason: ReportReason;
  note: string | null;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
};

/** EP-84 Request: exactly one of listing_id and user_id. */
export type SubmitReportInput = {
  listing_id?: string | null;
  user_id?: string | null;
  reason: ReportReason;
  note?: string | null;
};

export type SubmitReportResult = { report: Report; already_submitted: boolean };

/** API §6 UserBlock. */
export type UserBlock = { blocker_id: string; blocked_id: string; created_at: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS: readonly ReportReason[] = ["spam", "scam", "inappropriate", "animal_welfare", "other"];
const NOTE_MAX = 500;
const COLUMNS = "id, listing_id, reported_user_id, reason, note, status, created_at";

type ReportRow = {
  id: string;
  listing_id: string | null;
  reported_user_id: string | null;
  reason: ReportReason;
  note: string | null;
  status: Report["status"];
  created_at: string;
};

function toReport(row: ReportRow, target: Report["target"]): Report {
  return { ...row, target };
}

function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  if (error.code === "23503") return { code: "not_found", message: error.message };
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

/** EP-84 — report a listing or a user. */
export async function submitReport(input: SubmitReportInput): Promise<ActionResult<SubmitReportResult>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  const me = caller.data.user.id;

  const fields: Record<string, string> = {};
  const listingId = input?.listing_id ?? null;
  const userId = input?.user_id ?? null;
  if ((listingId === null) === (userId === null)) fields.listing_id = "invalid";
  else if (listingId !== null && (typeof listingId !== "string" || !UUID.test(listingId))) fields.listing_id = "invalid";
  else if (userId !== null && (typeof userId !== "string" || !UUID.test(userId) || userId === me)) fields.user_id = "invalid";
  if (!REASONS.includes(input?.reason)) fields.reason = "required";
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  if (input?.note !== undefined && input.note !== null && typeof input.note !== "string") fields.note = "invalid";
  else if (note.length > NOTE_MAX) fields.note = "too_long";
  else if (input?.reason === "other" && note.length === 0) fields.note = "required";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const target: Report["target"] = listingId ? "listing" : "user";

  if (listingId) {
    // listings RLS: the listing must be visible to the caller; their own listing cannot be reported.
    const { data: listing, error } = await supabase.from("listings").select("id, author_id").eq("id", listingId).maybeSingle();
    if (error) return { ok: false, error: fromDatabaseError(error) };
    if (!listing) return fail("not_found");
    if (listing.author_id === me) return fail("validation_failed", { fields: { listing_id: "invalid" } });
  }

  const findOpen = async () => {
    let query = supabase.from("reports").select(COLUMNS).eq("reporter_id", me).eq("status", "open");
    query = listingId ? query.eq("listing_id", listingId) : query.eq("reported_user_id", userId!).is("listing_id", null);
    return query.maybeSingle();
  };

  const existing = await findOpen();
  if (existing.error) return { ok: false, error: fromDatabaseError(existing.error) };
  if (existing.data) return ok({ report: toReport(existing.data as ReportRow, target), already_submitted: true });

  const { data, error } = await supabase
    .from("reports")
    .insert({
      listing_id: listingId,
      reported_user_id: listingId ? null : userId,
      reason: input.reason,
      note: note || null,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    // A concurrent identical report won the unique partial index: show that one as already submitted.
    if (error.code === "23505") {
      const again = await findOpen();
      if (again.data) return ok({ report: toReport(again.data as ReportRow, target), already_submitted: true });
    }
    return { ok: false, error: fromRpcError(error) };
  }
  return ok({ report: toReport(data as ReportRow, target), already_submitted: false });
}

/** EP-85 block — the existing row when already blocked. */
export async function blockUser(userId: string): Promise<ActionResult<UserBlock>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  if (typeof userId !== "string" || !UUID.test(userId)) return fail("validation_failed", { fields: { p_user_id: "invalid" } });
  const { data, error } = await supabase.rpc("block_user", { p_user_id: userId });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as UserBlock);
}

/** EP-85 unblock — also when no block existed. */
export async function unblockUser(userId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  if (typeof userId !== "string" || !UUID.test(userId)) return fail("validation_failed", { fields: { p_user_id: "invalid" } });
  const { error } = await supabase.rpc("unblock_user", { p_user_id: userId });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(null);
}
