"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";

// EP-09 vaccinations create / update / delete (S04 /ljubimci/[id]/vakcine/nova, the S03 Vakcine
// row menu and the edit route /ljubimci/[id]/vakcine/[vakcinaId]). Data API writes run here on the
// server because the session lives in httpOnly cookies (owner decision, Steps 13–14). The database
// enforces each rule as well (API §3.1): RLS, health_record_check_write (member → forbidden_role),
// the length and next_due_on > given_on checks. The vaccinations_sync_reminder trigger creates,
// moves or removes the linked `vaccination` reminder (FR-05, FR-20, E-01).

/** API §6 Vaccination. */
export type Vaccination = {
  id: string;
  pet_id: string;
  name: string;
  given_on: string;
  next_due_on: string | null;
  days_until_due: number | null;
  clinic: string | null;
  batch_number: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** EP-09 Request (insert). Update takes any subset of the other fields. */
export type VaccinationInput = {
  pet_id: string;
  name: string;
  given_on: string;
  next_due_on?: string | null;
  clinic?: string | null;
  batch_number?: string | null;
  note?: string | null;
};

const COLUMNS = "id, pet_id, name, given_on, next_due_on, clinic, batch_number, note, created_by, created_at, updated_at";
const OPTIONAL_TEXT: Record<string, number> = { clinic: 100, batch_number: 60, note: 1000 };

/** Today's date in Europe/Belgrade as YYYY-MM-DD (API §3.5). */
function belgradeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(now);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Vaccination.days_until_due = next_due_on − today (Europe/Belgrade); null without a next dose. */
function daysUntil(nextDueOn: string | null): number | null {
  if (!nextDueOn) return null;
  return Math.round((Date.parse(nextDueOn) - Date.parse(belgradeToday())) / 86_400_000);
}

function toVaccination(row: Omit<Vaccination, "days_until_due">): Vaccination {
  return { ...row, days_until_due: daysUntil(row.next_due_on) };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * EP-09 Request rules → the column values, or the field error codes (API §7.1). On update,
 * `currentGivenOn` is the stored given_on, so a lone next_due_on is still checked against it.
 */
function validateVaccination(
  input: Record<string, unknown>,
  { partial, currentGivenOn }: { partial: boolean; currentGivenOn?: string },
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

  if (has("name")) {
    const name = text(input.name);
    if (!name) fields.name = "required";
    else if (name.length > 100) fields.name = "too_long";
    else values.name = name;
  }

  if (has("given_on")) {
    const date = input.given_on;
    if (date === null || date === undefined || date === "") fields.given_on = "required";
    else if (!isIsoDate(date)) fields.given_on = "invalid";
    else if (date > belgradeToday()) fields.given_on = "out_of_range";
    else values.given_on = date;
  }

  if (has("next_due_on")) {
    const next = input.next_due_on ?? null;
    const givenOn = (values.given_on as string | undefined) ?? (has("given_on") ? undefined : currentGivenOn);
    if (next === null || next === "") values.next_due_on = null;
    else if (!isIsoDate(next)) fields.next_due_on = "invalid";
    else if (givenOn && next <= givenOn) fields.next_due_on = "before_start";
    else values.next_due_on = next;
  }

  for (const [key, max] of Object.entries(OPTIONAL_TEXT)) {
    if (!has(key)) continue;
    const value = text(input[key]);
    if (value !== null && value.length > max) fields[key] = "too_long";
    else values[key] = value;
  }

  return Object.keys(fields).length > 0 ? { fields } : { values };
}

/** EP-09 insert — S04 "Sačuvaj vakcinu". Returns API §6 Vaccination. */
export async function createVaccination(input: VaccinationInput): Promise<ActionResult<Vaccination>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const checked = validateVaccination(input as unknown as Record<string, unknown>, { partial: false });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  const { data, error } = await supabase
    .from("vaccinations")
    .insert(checked.values as never)
    .select(COLUMNS)
    .single();
  if (error) {
    // RLS rejects an insert on a pet the caller has no relation to (API §4.3: not revealed).
    if (error.code === "42501") return fail("not_found");
    return { ok: false, error: fromDatabaseError(error) };
  }
  return ok(toVaccination(data as unknown as Omit<Vaccination, "days_until_due">));
}

/** EP-09 update — the edit route "Sačuvaj izmene". Partial; returns API §6 Vaccination. */
export async function updateVaccination(
  id: string,
  input: Partial<Omit<VaccinationInput, "pet_id">>,
): Promise<ActionResult<Vaccination>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const { data: current, error: readError } = await supabase
    .from("vaccinations")
    .select("given_on")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false, error: fromDatabaseError(readError) };
  if (!current) return fail("not_found");

  const checked = validateVaccination(input as Record<string, unknown>, {
    partial: true,
    currentGivenOn: current.given_on,
  });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  const { data, error } = await supabase
    .from("vaccinations")
    .update(checked.values as never)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");
  return ok(toVaccination(data as unknown as Omit<Vaccination, "days_until_due">));
}

/** EP-09 delete — the Vakcine row menu "Obriši" → AlertDialog "Da, obriši". */
export async function deleteVaccination(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const { data, error } = await supabase.from("vaccinations").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return ok({ id: data[0].id });
}
