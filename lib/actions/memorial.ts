"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import type { MemorialRecord, Pet } from "@/lib/actions/pets";

// EP-06 move_pet_to_memorial (S03 DropdownMenu "Premesti u Uspomene" dialog) and EP-07
// restore_pet_from_memorial (S06 "Vrati među aktivne"), wrapping the RPCs of the memorial_rpcs
// migration for atomicity. The database enforces each rule as well (API §3.1): owner only (member,
// organisation animal → forbidden_role), the Free limits (premium_required:memorials /
// premium_required:pets, BR-01, BR-03), reminders stopped on the way in (BR-17) and re-enabled on
// the way out when reenable_reminders.

export type MemorialReason = NonNullable<MemorialRecord["reason"]>;

/** EP-06 Request. */
export type MemorialInput = {
  pet_id: string;
  date: string;
  reason?: MemorialReason | null;
  note?: string | null;
};

const REASONS: readonly MemorialReason[] = ["passed_away", "rehomed", "lost"];

/** Today's date in Europe/Belgrade as YYYY-MM-DD (API §3.5). */
function belgradeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(now);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** RPC error → ApiError; validation field codes travel in DETAIL '<field>:<code>'. */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

/**
 * EP-06 — S03 memorial dialog (FR-11). The pet must be active; date required, not in the future;
 * reason optional (passed_away / rehomed / lost); note ≤ 1000. A Free owner's third memorial →
 * premium_required (details.limit = "memorials").
 */
export async function movePetToMemorial(input: MemorialInput): Promise<ActionResult<MemorialRecord>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  if (typeof input?.pet_id !== "string" || input.pet_id === "") fields.pet_id = "required";
  if (input?.date === null || input?.date === undefined || input.date === "") fields.date = "required";
  else if (!isIsoDate(input.date)) fields.date = "invalid";
  else if (input.date > belgradeToday()) fields.date = "out_of_range";
  const reason = input?.reason ?? null;
  if (reason !== null && !REASONS.includes(reason)) fields.reason = "invalid";
  const note = typeof input?.note === "string" && input.note.trim() !== "" ? input.note.trim() : null;
  if (input?.note !== null && input?.note !== undefined && typeof input.note !== "string") fields.note = "invalid";
  else if (note !== null && note.length > 1000) fields.note = "too_long";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const args: { p_pet_id: string; p_date: string; p_reason?: MemorialReason; p_note?: string } = {
    p_pet_id: input.pet_id,
    p_date: input.date,
  };
  if (reason) args.p_reason = reason;
  if (note) args.p_note = note;

  const { data, error } = await supabase.rpc("move_pet_to_memorial", args);
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as MemorialRecord);
}

/**
 * EP-07 — S06 "Vrati među aktivne" (FR-12). The pet must be a memorial; reenable_reminders
 * defaults to true. A Free owner whose active slot is taken → premium_required (details.limit = "pets").
 */
export async function restorePetFromMemorial(input: {
  pet_id: string;
  reenable_reminders?: boolean;
}): Promise<ActionResult<Pet>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  if (typeof input?.pet_id !== "string" || input.pet_id === "") {
    return fail("validation_failed", { fields: { pet_id: "required" } });
  }
  if (input.reenable_reminders !== undefined && typeof input.reenable_reminders !== "boolean") {
    return fail("validation_failed", { fields: { reenable_reminders: "invalid" } });
  }

  const { data, error } = await supabase.rpc("restore_pet_from_memorial", {
    p_pet_id: input.pet_id,
    p_reenable_reminders: input.reenable_reminders ?? true,
  });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as Pet);
}
