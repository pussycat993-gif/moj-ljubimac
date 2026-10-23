"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import type { Access, WeightUnit } from "@/lib/actions/pets";

// EP-08 weight entries create / update / delete (S03 Težina tab). Data API writes run here on the
// server because the session lives in httpOnly cookies (owner decision, Steps 13–14); every write
// is returned through view:weight_entries_api. The database enforces each rule as well (API §3.1):
// RLS, health_record_check_write (member: own entries only → forbidden_role; read-only household →
// household_read_only), the value / note checks.

/** API §6 WeightEntry. */
export type WeightEntry = {
  id: string;
  pet_id: string;
  measured_on: string;
  value: number;
  weight_unit: WeightUnit;
  note: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  access: Access;
};

/** EP-08 Request (insert). Update takes any of measured_on, value, note. */
export type WeightEntryInput = {
  pet_id: string;
  measured_on: string;
  value: number;
  note?: string | null;
};

/** Today's date in Europe/Belgrade as YYYY-MM-DD (API §3.5). */
function belgradeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(now);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** EP-08 Request rules → the column values, or the field error codes (API §7.1). */
function validateWeight(
  input: Record<string, unknown>,
  { partial }: { partial: boolean },
): { values: Record<string, unknown> } | { fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const has = (key: string) => !partial || key in input;

  if (!partial) {
    if (typeof input.pet_id !== "string" || input.pet_id === "") fields.pet_id = "required";
    else values.pet_id = input.pet_id;
  }

  if (has("measured_on")) {
    const date = input.measured_on;
    if (date === null || date === undefined || date === "") fields.measured_on = "required";
    else if (!isIsoDate(date)) fields.measured_on = "invalid";
    else if (date > belgradeToday()) fields.measured_on = "out_of_range";
    else values.measured_on = date;
  }

  if (has("value")) {
    const value = input.value;
    if (value === null || value === undefined || value === "") fields.value = "required";
    else if (typeof value !== "number" || !Number.isFinite(value)) fields.value = "invalid";
    else if (value <= 0 || value >= 1_000_000) fields.value = "out_of_range";
    else if (Math.round(value * 1000) / 1000 !== value) fields.value = "invalid";
    else values.value = value;
  }

  if (has("note")) {
    const note = typeof input.note === "string" ? input.note.trim() : null;
    if (note && note.length > 500) fields.note = "too_long";
    else values.note = note || null;
  }

  return Object.keys(fields).length > 0 ? { fields } : { values };
}

async function readEntry(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<ActionResult<WeightEntry>> {
  const { data, error } = await supabase.from("weight_entries_api").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");
  return ok(data as unknown as WeightEntry);
}

/** EP-08 insert — the Težina "Dodaj merenje" dialog. Returns API §6 WeightEntry. */
export async function createWeightEntry(input: WeightEntryInput): Promise<ActionResult<WeightEntry>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const checked = validateWeight(input as unknown as Record<string, unknown>, { partial: false });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  const { data, error } = await supabase
    .from("weight_entries")
    .insert(checked.values as never)
    .select("id")
    .single();
  if (error) {
    // RLS rejects an insert on a pet the caller has no relation to (API §4.3: not revealed).
    if (error.code === "42501") return fail("not_found");
    return { ok: false, error: fromDatabaseError(error) };
  }
  return readEntry(supabase, data.id);
}

/** EP-08 update — the row menu "Izmeni". Partial; returns API §6 WeightEntry. */
export async function updateWeightEntry(
  id: string,
  input: Partial<Omit<WeightEntryInput, "pet_id">>,
): Promise<ActionResult<WeightEntry>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  if ("pet_id" in (input ?? {})) return fail("validation_failed", { fields: { pet_id: "invalid" } });
  const checked = validateWeight(input as Record<string, unknown>, { partial: true });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  const { data, error } = await supabase
    .from("weight_entries")
    .update(checked.values as never)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return readEntry(supabase, id);
}

/** EP-08 delete — the row menu "Obriši" → AlertDialog "Da, obriši". */
export async function deleteWeightEntry(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const { data, error } = await supabase.from("weight_entries").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return ok({ id: data[0].id });
}
