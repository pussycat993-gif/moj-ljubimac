"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import type { OrganisationAccess } from "@/lib/actions/organisation";
import type { Money } from "@/lib/actions/pets";

// S22 /organizacija/legla (Step 26) — EP-61: listLitters (rpc:list_litters), createLitter (rpc:create_litter: the
// litter, one pets row per offspring and their first pet_status_history rows in one transaction; owner decision)
// and updateOffspring (Data API pets update of offspring_status / price_minor where litter_id is not null; the Step
// 09 trigger writes pet_status_history and the Step 24 guard answers breeder_plan_required). Everything runs on the
// server because the session lives in httpOnly cookies. Breeder organisations only (a shelter → forbidden_role);
// writes need an approved organisation and an active breeder plan (E-21). EP-62 is not cached (TC ADR-18), so a
// change shows on the public page on the next request — there is no purge.

export type OffspringStatus = "available" | "reserved" | "sold";

/** API §6 Litter.offspring[]. */
export type LitterOffspring = {
  pet_id: string;
  name: string;
  sex: "male" | "female" | "unknown";
  offspring_status: OffspringStatus;
  price: Money | null;
};

/** API §6 Litter. */
export type Litter = {
  id: string;
  mother: { pet_id: string; name: string };
  breed: string | null;
  father_id: string | null;
  father_name: string | null;
  father_external: boolean;
  born_on: string;
  offspring_count: number;
  available_count: number;
  offspring: LitterOffspring[];
};

/** EP-61 list Response. */
export type LittersPage = {
  items: Litter[];
  eligible_mothers: { pet_id: string; name: string }[];
  eligible_fathers: { pet_id: string; name: string }[];
  access: OrganisationAccess;
};

/** EP-61 create Request. */
export type CreateLitterInput = {
  mother_id: string;
  father_id?: string | null;
  father_name?: string | null;
  born_on: string;
  offspring_count: number;
};

/** EP-61 update offspring Request (price null clears it). */
export type UpdateOffspringInput = {
  pet_id: string;
  offspring_status?: OffspringStatus;
  price?: Money | null;
};

const OFFSPRING_STATUSES: readonly OffspringStatus[] = ["available", "reserved", "sold"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
function fromWriteError(error: { code?: string; message: string; details?: string | null }): ApiError {
  if (error.code === "42501" || error.code === "PGRST116") return { code: "not_found", message: error.message };
  return fromRpcError(error);
}

function trimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v === "" ? null : v;
}

/** Today on the Europe/Belgrade calendar (yyyy-mm-dd). */
function belgradeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** EP-61 list — the organisation's litters (born_on desc), the eligible parents and access. */
export async function listLitters(): Promise<ActionResult<LittersPage>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  const { data, error } = await supabase.rpc("list_litters");
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as LittersPage);
}

/** EP-61 create Request checks with field codes (the database checks them again). */
function validateLitter(input: CreateLitterInput): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!input?.mother_id) fields.mother_id = "required";
  else if (!UUID.test(String(input.mother_id))) fields.mother_id = "invalid";
  const fatherName = trimmed(input?.father_name);
  if (input?.father_id && fatherName) fields.father_id = "invalid";
  else if (input?.father_id && !UUID.test(String(input.father_id))) fields.father_id = "invalid";
  if (fatherName && fatherName.length > 120) fields.father_name = "too_long";
  if (!input?.born_on) fields.born_on = "required";
  else if (!DATE.test(String(input.born_on)) || Number.isNaN(Date.parse(String(input.born_on)))) fields.born_on = "invalid";
  else if (input.born_on > belgradeToday()) fields.born_on = "invalid";
  const count = input?.offspring_count;
  if (count === undefined || count === null) fields.offspring_count = "required";
  else if (!Number.isInteger(count) || count < 1 || count > 20) fields.offspring_count = "out_of_range";
  return fields;
}

/**
 * EP-61 createLitter — the litter and `offspring_count` offspring ("Mladunče N", the mother's species and breed,
 * sex unknown, birth_date = born_on, available) with their history rows, in one transaction. Returns the Litter.
 */
export async function createLitter(input: CreateLitterInput): Promise<ActionResult<Litter>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields = validateLitter(input);
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const { data: id, error } = await supabase.rpc("create_litter", {
    p_mother_id: input.mother_id,
    p_father_id: (input.father_id || null) as string,
    p_father_name: trimmed(input.father_name) as string,
    p_born_on: input.born_on,
    p_offspring_count: input.offspring_count,
  });
  if (error) return { ok: false, error: fromRpcError(error) };

  const { data: list, error: listError } = await supabase.rpc("list_litters");
  if (listError) return { ok: false, error: fromRpcError(listError) };
  const litter = (list as unknown as LittersPage).items.find((item) => item.id === id);
  if (!litter) return fail("internal_error", { message: "created litter not listed" });
  return ok(litter);
}

/**
 * EP-61 update offspring — status and/or price (RSD; null clears). Only offspring (litter_id is not null) of the
 * caller's organisation; anything else → not_found. Returns the updated Litter.offspring[] row.
 */
export async function updateOffspring(input: UpdateOffspringInput): Promise<ActionResult<LitterOffspring>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  if (!UUID.test(String(input?.pet_id))) return fail("not_found");

  const change: { offspring_status?: OffspringStatus; price_minor?: number | null } = {};
  const fields: Record<string, string> = {};
  if (input.offspring_status !== undefined) {
    if (!OFFSPRING_STATUSES.includes(input.offspring_status)) fields.offspring_status = "invalid";
    else change.offspring_status = input.offspring_status;
  }
  if (input.price !== undefined) {
    if (input.price === null) change.price_minor = null;
    else if (input.price?.currency !== "RSD") fields.price = "invalid";
    else if (!Number.isInteger(input.price.amount_minor) || input.price.amount_minor < 0) fields.price = "out_of_range";
    else change.price_minor = input.price.amount_minor;
  }
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });
  if (Object.keys(change).length === 0) return fail("validation_failed", { fields: { offspring_status: "required" } });

  const { data, error } = await supabase
    .from("pets")
    .update(change)
    .eq("id", input.pet_id)
    .not("litter_id", "is", null)
    .select("id, name, sex, offspring_status, price_minor");
  if (error) return { ok: false, error: fromWriteError(error) };
  const row = data?.[0];
  if (!row) return fail("not_found");
  return ok({
    pet_id: row.id,
    name: row.name,
    sex: row.sex,
    offspring_status: row.offspring_status as OffspringStatus,
    price: row.price_minor === null ? null : { amount_minor: row.price_minor, currency: "RSD" },
  });
}
