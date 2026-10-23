"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import type { ReminderOccurrence } from "@/lib/actions/pets";

// EP-25 list reminder occurrences (S10 tabs and "Učitaj još", the S01 "Danas" strip), EP-26 mark done
// (S01 / S03 / S10 "Urađeno") and EP-27 manual reminders get / create / update / delete (S11
// /podsetnici/novi and /podsetnici/[id]). Data API calls run here on the server because the session
// lives in httpOnly cookies (owner decision, Steps 13–17). The database enforces the access rules
// (API §3.1): RLS (own manual reminders only; generated types are not addressable), the
// reminders_check_write trigger (shelter / breeder accounts and a member linking a pet they do not own
// → forbidden_role), BR-17 (memorial pets never have active reminders) and the occurrence regeneration
// (future pending rows only, done / missed history kept). The EP-27 Request rules are checked here.

export type ReminderFilter = "today" | "upcoming" | "missed" | "done" | "next";
export type ManualRecurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

/** EP-25 Response. */
export type ReminderOccurrenceList = {
  items: ReminderOccurrence[];
  total: number;
  counts: { today: number; upcoming: number; missed: number; done: number };
};

/** API §6 Reminder. */
export type Reminder = {
  id: string;
  user_id: string;
  pet_id: string | null;
  type: ReminderOccurrence["type"];
  title: string | null;
  starts_at: string;
  recurrence: ManualRecurrence | "hourly_interval";
  active: boolean;
  next_due_at: string | null;
  created_at: string;
  updated_at: string;
};

/** EP-27 Request (create). Update takes any subset. */
export type ManualReminderInput = {
  title: string;
  pet_id: string | null;
  starts_at: string;
  recurrence: ManualRecurrence;
};

const COLUMNS = "id, user_id, pet_id, type, title, starts_at, recurrence, active, created_at, updated_at";
const FILTERS: ReminderFilter[] = ["today", "upcoming", "missed", "done", "next"];
const RECURRENCES: ManualRecurrence[] = ["none", "daily", "weekly", "monthly", "yearly"];

/** RPC errors carry their field code in DETAIL '<field>:<code>' (Step 15 convention). */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

/** EP-25 — rpc:list_reminder_occurrences. `today` returns the whole list (limit / offset ignored). */
export async function listReminderOccurrences(input: {
  filter: ReminderFilter;
  pet_id?: string | null;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<ReminderOccurrenceList>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  if (!FILTERS.includes(input?.filter)) return fail("validation_failed", { fields: { filter: "invalid" } });
  const args: { p_filter: string; p_pet_id?: string; p_limit?: number; p_offset?: number } = { p_filter: input.filter };
  if (input.pet_id) args.p_pet_id = input.pet_id;
  if (input.limit !== undefined) args.p_limit = input.limit;
  if (input.offset !== undefined) args.p_offset = input.offset;

  const { data, error } = await supabase.rpc("list_reminder_occurrences", args);
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as ReminderOccurrenceList);
}

/** EP-26 — rpc:mark_occurrence_done. Naturally idempotent; returns the instance as done. */
export async function markOccurrenceDone(occurrenceId: string): Promise<ActionResult<ReminderOccurrence>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  if (typeof occurrenceId !== "string" || occurrenceId === "") {
    return fail("validation_failed", { fields: { occurrence_id: "required" } });
  }
  const { data, error } = await supabase.rpc("mark_occurrence_done", { p_occurrence_id: occurrenceId });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as ReminderOccurrence);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

/** EP-27 Request rules → the column values, or the field error codes (API §7.1). */
function validateManual(
  input: Record<string, unknown>,
  partial: boolean,
): { values: Record<string, unknown> } | { fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const has = (key: string) => !partial || key in input;

  if (has("title")) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) fields.title = "required";
    else if (title.length > 80) fields.title = "too_long";
    else values.title = title;
  }

  if (has("pet_id")) {
    const petId = input.pet_id ?? null;
    if (petId !== null && (typeof petId !== "string" || petId === "")) fields.pet_id = "invalid";
    else values.pet_id = petId;
  }

  if (has("starts_at")) {
    const startsAt = input.starts_at;
    if (startsAt === null || startsAt === undefined || startsAt === "") fields.starts_at = "required";
    else if (!isTimestamp(startsAt)) fields.starts_at = "invalid";
    else if (Date.parse(startsAt) <= Date.now()) fields.starts_at = "in_past";
    else values.starts_at = new Date(startsAt).toISOString();
  }

  if (has("recurrence")) {
    if (!RECURRENCES.includes(input.recurrence as ManualRecurrence)) fields.recurrence = "invalid";
    else values.recurrence = input.recurrence;
  }

  return Object.keys(fields).length > 0 ? { fields } : { values };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** pet_id must be the caller's own active pet (EP-27): memorial → pet_memorial; not visible → not_found. */
async function checkPet(supabase: Supabase, petId: string | null): Promise<ActionResult<never> | null> {
  if (!petId) return null;
  const { data, error } = await supabase.from("pets").select("lifecycle").eq("id", petId).maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");
  if (data.lifecycle === "memorial") return fail("validation_failed", { fields: { pet_id: "pet_memorial" } });
  return null;
}

/** Reminder.next_due_at: the earliest not-done instance due from now on. */
async function toReminder(supabase: Supabase, row: Omit<Reminder, "next_due_at">): Promise<Reminder> {
  const { data } = await supabase
    .from("reminder_occurrences")
    .select("due_at")
    .eq("reminder_id", row.id)
    .neq("status", "done")
    .gte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(1);
  return { ...row, next_due_at: data?.[0]?.due_at ?? null };
}

function writeError(error: { code?: string; message: string }): ActionResult<never> {
  // RLS rejects a pet the caller has no relation to (API §4.3: not revealed).
  if (error.code === "42501") return fail("not_found");
  return { ok: false, error: fromDatabaseError(error) };
}

/** EP-27 get — the S11 edit variant's prefill. Other types → not_found. */
export async function getManualReminder(id: string): Promise<ActionResult<Reminder>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const { data, error } = await supabase
    .from("reminders")
    .select(COLUMNS)
    .eq("id", id)
    .eq("type", "manual")
    .eq("user_id", caller.data.user.id)
    .maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");
  return ok(await toReminder(supabase, data as unknown as Omit<Reminder, "next_due_at">));
}

/** EP-27 create — S11 "Sačuvaj podsetnik". */
export async function createManualReminder(input: ManualReminderInput): Promise<ActionResult<Reminder>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const checked = validateManual(input as unknown as Record<string, unknown>, false);
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });
  const petCheck = await checkPet(supabase, checked.values.pet_id as string | null);
  if (petCheck) return petCheck;

  const { data, error } = await supabase
    .from("reminders")
    .insert({ type: "manual", ...checked.values } as never)
    .select(COLUMNS)
    .single();
  if (error) return writeError(error);
  return ok(await toReminder(supabase, data as unknown as Omit<Reminder, "next_due_at">));
}

/** EP-27 update — S11 edit "Sačuvaj izmene". Partial; future occurrences are regenerated. */
export async function updateManualReminder(
  id: string,
  input: Partial<ManualReminderInput>,
): Promise<ActionResult<Reminder>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const checked = validateManual(input as Record<string, unknown>, true);
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });
  if ("pet_id" in checked.values) {
    const petCheck = await checkPet(supabase, checked.values.pet_id as string | null);
    if (petCheck) return petCheck;
  }

  const { data, error } = await supabase
    .from("reminders")
    .update(checked.values as never)
    .eq("id", id)
    .eq("type", "manual")
    .eq("user_id", caller.data.user.id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return writeError(error);
  if (!data) return fail("not_found");
  return ok(await toReminder(supabase, data as unknown as Omit<Reminder, "next_due_at">));
}

/** EP-27 delete — S11 "Obriši podsetnik" → AlertDialog "Da, obriši". Occurrences cascade. */
export async function deleteManualReminder(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const { data, error } = await supabase
    .from("reminders")
    .delete()
    .eq("id", id)
    .eq("type", "manual")
    .eq("user_id", caller.data.user.id)
    .select("id");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return ok({ id: data[0].id });
}
