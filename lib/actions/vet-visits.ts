"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import type { Money } from "@/lib/actions/pets";

// EP-12 vet visits create / update / delete (S05 /ljubimci/[id]/pregledi/novi, the S03 Pregledi row
// menu and the edit route /ljubimci/[id]/pregledi/[pregledId]). Data API writes run here on the
// server because the session lives in httpOnly cookies (owner decision, Steps 13–15). The database
// enforces each rule as well (API §3.1): RLS, health_record_check_write (member → forbidden_role),
// the EP-12 check constraints. The vet_visits_sync_reminder trigger keeps the `vet_follow_up`
// reminder in step (FR-07, FR-20); deleting a visit cascades its attachments, whose R2 keys an
// after-delete trigger queues for the nightly cleanup.

/** API §6 Attachment. */
export type Attachment = {
  id: string;
  vet_visit_id: string;
  pet_id: string;
  file_name: string | null;
  mime_type: string;
  size_bytes: number;
  created_by: string;
  created_at: string;
};

/** API §6 VetVisit. */
export type VetVisit = {
  id: string;
  pet_id: string;
  visited_on: string;
  clinic: string | null;
  reason: string;
  findings: string | null;
  recommendations: string | null;
  cost: Money | null;
  follow_up_on: string | null;
  attachments: Attachment[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** EP-12 Request (insert). Update takes any subset of the other fields. */
export type VetVisitInput = {
  pet_id: string;
  visited_on: string;
  reason: string;
  clinic?: string | null;
  findings?: string | null;
  recommendations?: string | null;
  cost_minor?: number | null;
  follow_up_on?: string | null;
};

const VISIT_COLUMNS =
  "id, pet_id, visited_on, clinic, reason, findings, recommendations, cost_minor, follow_up_on, created_by, created_at, updated_at";
const ATTACHMENT_COLUMNS = "id, vet_visit_id, pet_id, file_name, mime_type, size_bytes, created_by, created_at";
const OPTIONAL_TEXT: Record<string, number> = { clinic: 100, findings: 4000, recommendations: 4000 };

/** Today's date in Europe/Belgrade as YYYY-MM-DD (API §3.5). */
function belgradeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(now);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * EP-12 Request rules → the column values, or the field error codes (API §7.1). On update,
 * `current` is the stored row, so a lone follow_up_on or visited_on is still checked against the other.
 */
function validateVetVisit(
  input: Record<string, unknown>,
  { partial, current }: { partial: boolean; current?: { visited_on: string; follow_up_on: string | null } },
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

  if (has("visited_on")) {
    const date = input.visited_on;
    if (date === null || date === undefined || date === "") fields.visited_on = "required";
    else if (!isIsoDate(date)) fields.visited_on = "invalid";
    else if (date > belgradeToday()) fields.visited_on = "out_of_range";
    else values.visited_on = date;
  }

  if (has("reason")) {
    const reason = text(input.reason);
    if (!reason) fields.reason = "required";
    else if (reason.length > 200) fields.reason = "too_long";
    else values.reason = reason;
  }

  for (const [key, max] of Object.entries(OPTIONAL_TEXT)) {
    if (!has(key)) continue;
    const value = text(input[key]);
    if (value !== null && value.length > max) fields[key] = "too_long";
    else values[key] = value;
  }

  if (has("cost_minor")) {
    const cost = input.cost_minor ?? null;
    if (cost !== null && (!Number.isInteger(cost) || (cost as number) < 0)) fields.cost_minor = "out_of_range";
    else values.cost_minor = cost;
  }

  if (has("follow_up_on") || (partial && "visited_on" in values)) {
    const followUp = has("follow_up_on") ? (input.follow_up_on ?? null) : (current?.follow_up_on ?? null);
    const visitedOn = (values.visited_on as string | undefined) ?? (has("visited_on") ? undefined : current?.visited_on);
    if (followUp === null || followUp === "") {
      if (has("follow_up_on")) values.follow_up_on = null;
    } else if (!isIsoDate(followUp)) fields.follow_up_on = "invalid";
    else if (visitedOn && followUp <= visitedOn) fields.follow_up_on = "before_start";
    else if (has("follow_up_on")) values.follow_up_on = followUp;
  }

  return Object.keys(fields).length > 0 ? { fields } : { values };
}

type VisitRow = Omit<VetVisit, "cost" | "attachments"> & { cost_minor: number | null };
type Supabase = Awaited<ReturnType<typeof createClient>>;

/** API §6 VetVisit from a vet_visits row and its attachments (order created_at asc). */
async function toVetVisit(supabase: Supabase, row: VisitRow): Promise<ActionResult<VetVisit>> {
  const { data, error } = await supabase
    .from("attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("vet_visit_id", row.id)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: fromDatabaseError(error) };
  const { cost_minor, ...rest } = row;
  return ok({
    ...rest,
    cost: cost_minor === null ? null : { amount_minor: cost_minor, currency: "RSD" },
    attachments: (data ?? []) as unknown as Attachment[],
  });
}

/** EP-12 insert — S05 "Sačuvaj pregled" (attachments follow through EP-13). Returns API §6 VetVisit. */
export async function createVetVisit(input: VetVisitInput): Promise<ActionResult<VetVisit>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const checked = validateVetVisit(input as unknown as Record<string, unknown>, { partial: false });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  const { data, error } = await supabase
    .from("vet_visits")
    .insert(checked.values as never)
    .select(VISIT_COLUMNS)
    .single();
  if (error) {
    // RLS rejects an insert on a pet the caller has no relation to (API §4.3: not revealed).
    if (error.code === "42501") return fail("not_found");
    return { ok: false, error: fromDatabaseError(error) };
  }
  return toVetVisit(supabase, data as unknown as VisitRow);
}

/** EP-12 update — the edit route "Sačuvaj izmene". Partial; returns API §6 VetVisit. */
export async function updateVetVisit(
  id: string,
  input: Partial<Omit<VetVisitInput, "pet_id">>,
): Promise<ActionResult<VetVisit>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const { data: current, error: readError } = await supabase
    .from("vet_visits")
    .select("visited_on, follow_up_on")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false, error: fromDatabaseError(readError) };
  if (!current) return fail("not_found");

  const checked = validateVetVisit(input as Record<string, unknown>, {
    partial: true,
    current,
  });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  const { data, error } = await supabase
    .from("vet_visits")
    .update(checked.values as never)
    .eq("id", id)
    .select(VISIT_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");
  return toVetVisit(supabase, data as unknown as VisitRow);
}

/** EP-12 delete — the Pregledi row menu "Obriši" → AlertDialog "Da, obriši". */
export async function deleteVetVisit(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const { data, error } = await supabase.from("vet_visits").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return ok({ id: data[0].id });
}
