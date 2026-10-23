"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import type { Access, PetRecord } from "@/lib/actions/pets";

// EP-10 treatments create / update / delete (S27 /ljubimci/[id]/terapije/nova, the S03 Terapije row
// menu and the edit route /ljubimci/[id]/terapije/[terapijaId]) and EP-11 log_dose (S03 "Doza data").
// Data API writes run here on the server because the session lives in httpOnly cookies (owner
// decision, Steps 13–15). The database enforces each rule as well (API §3.1): RLS,
// health_record_check_write (member → forbidden_role), the EP-10 check constraints. The
// treatments_sync_reminder trigger keeps the `treatment_dose` reminder in step (FR-06, FR-20, BR-49).

/** API §6 DoseLog. */
export type DoseLog = {
  id: string;
  treatment_id: string;
  given_at: string;
  occurrence_id: string | null;
  created_by: string;
  created_by_name: string | null;
  access: Access;
};

export type TreatmentType = "medication" | "deworming" | "flea_tick" | "other";
export type IntervalUnit = "hours" | "days";

/** API §6 Treatment. */
export type Treatment = {
  id: string;
  pet_id: string;
  type: TreatmentType;
  name: string;
  dose: string | null;
  interval_value: number | null;
  interval_unit: IntervalUnit | null;
  starts_on: string;
  ends_on: string | null;
  note: string | null;
  is_active: boolean;
  next_dose_at: string | null;
  next_dose_occurrence_id: string | null;
  recent_doses: DoseLog[];
  dose_count: number;
  created_by: string;
  created_at: string;
};

/** EP-10 Request (insert). Update takes any subset of the other fields. */
export type TreatmentInput = {
  pet_id: string;
  type: TreatmentType;
  name: string;
  dose?: string | null;
  interval_value?: number | null;
  interval_unit?: IntervalUnit | null;
  starts_on: string;
  ends_on?: string | null;
  note?: string | null;
};

const TYPES: TreatmentType[] = ["medication", "deworming", "flea_tick", "other"];
const UNITS: IntervalUnit[] = ["hours", "days"];

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

type Current = { starts_on: string; ends_on: string | null; interval_value: number | null; interval_unit: IntervalUnit | null };

/**
 * EP-10 Request rules → the column values, or the field error codes (API §7.1). On update,
 * `current` is the stored row, so a lone ends_on or interval half is still checked against it.
 */
function validateTreatment(
  input: Record<string, unknown>,
  { partial, current }: { partial: boolean; current?: Current },
): { values: Record<string, unknown> } | { fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const has = (key: string) => !partial || key in input;

  if (!partial) {
    if (typeof input.pet_id !== "string" || input.pet_id === "") fields.pet_id = "required";
    else values.pet_id = input.pet_id;
  } else if ("pet_id" in input) {
    fields.pet_id = "invalid";
  }

  if (has("type")) {
    if (input.type === null || input.type === undefined || input.type === "") fields.type = "required";
    else if (!TYPES.includes(input.type as TreatmentType)) fields.type = "invalid";
    else values.type = input.type;
  }

  if (has("name")) {
    const name = text(input.name);
    if (!name) fields.name = "required";
    else if (name.length > 100) fields.name = "too_long";
    else values.name = name;
  }

  if (has("dose")) {
    const dose = text(input.dose);
    if (dose !== null && dose.length > 60) fields.dose = "too_long";
    else values.dose = dose;
  }

  if (has("interval_value") || has("interval_unit")) {
    const value = has("interval_value") ? (input.interval_value ?? null) : (current?.interval_value ?? null);
    const unit = has("interval_unit") ? (input.interval_unit ?? null) : (current?.interval_unit ?? null);
    if (value !== null && (!Number.isInteger(value) || (value as number) <= 0)) fields.interval_value = "out_of_range";
    else if (unit !== null && !UNITS.includes(unit as IntervalUnit)) fields.interval_unit = "invalid";
    else if (value !== null && unit === null) fields.interval_unit = "required";
    else if (value === null && unit !== null) fields.interval_value = "required";
    else {
      values.interval_value = value;
      values.interval_unit = unit;
    }
  }

  if (has("starts_on")) {
    const date = input.starts_on;
    if (date === null || date === undefined || date === "") fields.starts_on = "required";
    else if (!isIsoDate(date)) fields.starts_on = "invalid";
    else values.starts_on = date;
  }

  if (has("ends_on") || (partial && "starts_on" in values)) {
    const end = has("ends_on") ? (input.ends_on ?? null) : (current?.ends_on ?? null);
    const start = (values.starts_on as string | undefined) ?? (has("starts_on") ? undefined : current?.starts_on);
    if (end === null || end === "") {
      if (has("ends_on")) values.ends_on = null;
    } else if (!isIsoDate(end)) fields.ends_on = "invalid";
    else if (start && end < start) fields.ends_on = "before_start";
    else if (has("ends_on")) values.ends_on = end;
  }

  if (has("note")) {
    const note = text(input.note);
    if (note !== null && note.length > 1000) fields.note = "too_long";
    else values.note = note;
  }

  return Object.keys(fields).length > 0 ? { fields } : { values };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The written treatment as API §6 Treatment, read back through EP-02 (the computed fields live there). */
async function readTreatment(supabase: Supabase, petId: string, id: string): Promise<ActionResult<Treatment>> {
  const { data, error } = await supabase.rpc("get_pet_record", { p_pet_id: petId });
  if (error) return { ok: false, error: fromDatabaseError(error) };
  const treatment = ((data as unknown as PetRecord | null)?.treatments as unknown as Treatment[] | undefined)?.find(
    (t) => t.id === id,
  );
  return treatment ? ok(treatment) : fail("not_found");
}

/** EP-10 insert — S27 "Sačuvaj terapiju". Returns API §6 Treatment. */
export async function createTreatment(input: TreatmentInput): Promise<ActionResult<Treatment>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const checked = validateTreatment(input as unknown as Record<string, unknown>, { partial: false });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  const { data, error } = await supabase
    .from("treatments")
    .insert(checked.values as never)
    .select("id, pet_id")
    .single();
  if (error) {
    // RLS rejects an insert on a pet the caller has no relation to (API §4.3: not revealed).
    if (error.code === "42501") return fail("not_found");
    return { ok: false, error: fromDatabaseError(error) };
  }
  return readTreatment(supabase, data.pet_id, data.id);
}

/** EP-10 update — the edit route "Sačuvaj izmene". Partial; returns API §6 Treatment. */
export async function updateTreatment(
  id: string,
  input: Partial<Omit<TreatmentInput, "pet_id">>,
): Promise<ActionResult<Treatment>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const { data: current, error: readError } = await supabase
    .from("treatments")
    .select("pet_id, starts_on, ends_on, interval_value, interval_unit")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false, error: fromDatabaseError(readError) };
  if (!current) return fail("not_found");

  const checked = validateTreatment(input as Record<string, unknown>, { partial: true, current: current as Current });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  const { data, error } = await supabase
    .from("treatments")
    .update(checked.values as never)
    .eq("id", id)
    .select("id, pet_id")
    .maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");
  return readTreatment(supabase, data.pet_id, data.id);
}

/** EP-10 delete — the Terapije row menu "Obriši" → AlertDialog "Da, obriši". Dose logs cascade. */
export async function deleteTreatment(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const { data, error } = await supabase.from("treatments").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return ok({ id: data[0].id });
}

/**
 * rpc:log_dose raises validation_failed with DETAIL '<field>:<code>' (the partner RPC convention);
 * that becomes `fields` (API §7.1).
 */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

/**
 * EP-11 log_dose — S03 Terapije "Doza data" (FR-06, FR-28). Owner, member and organisation team may
 * log; idempotent on occurrence_id (the dose's open occurrence, completed with it).
 */
export async function logDose(input: {
  treatment_id: string;
  given_at?: string | null;
  occurrence_id?: string | null;
}): Promise<ActionResult<DoseLog>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  if (typeof input?.treatment_id !== "string" || input.treatment_id === "") {
    return fail("validation_failed", { fields: { p_treatment_id: "required" } });
  }

  const args: { p_treatment_id: string; p_given_at?: string; p_occurrence_id?: string } = {
    p_treatment_id: input.treatment_id,
  };
  if (input.given_at) args.p_given_at = input.given_at;
  if (input.occurrence_id) args.p_occurrence_id = input.occurrence_id;

  const { data, error } = await supabase.rpc("log_dose", args);
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as DoseLog);
}
