"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";

// EP-03 create_pet and EP-04 update_pet (Data API writes run here on the server because the
// session lives in httpOnly cookies — owner decision, Step 13) and EP-05 delete_pet.
// Every rule is also enforced by the database (API §3.1): RLS, the pets role trigger
// (forbidden_role), the Free limit trigger (premium_required:pets), check constraints.

export type PetSpeciesValue =
  | "dog"
  | "cat"
  | "rabbit"
  | "hamster"
  | "guinea_pig"
  | "chinchilla"
  | "ferret"
  | "bird"
  | "fish"
  | "turtle"
  | "lizard"
  | "snake"
  | "other";
export type PetSexValue = "male" | "female" | "unknown";
export type NeuteredValue = "yes" | "no" | "unknown";
export type WeightUnit = "kg" | "g";

/** API §6 Access. */
export type Access = {
  role: "owner" | "member" | "org_admin" | "volunteer" | "operator";
  can_edit: boolean;
  can_delete: boolean;
};

/** API §6 Money. */
export type Money = { amount_minor: number; currency: "RSD" };

/** API §6 MemorialRecord. */
export type MemorialRecord = {
  id: string;
  pet_id: string;
  date: string;
  reason: "passed_away" | "rehomed" | "lost" | null;
  note: string | null;
  created_at: string;
};

/** API §6 ReminderOccurrence. */
export type ReminderOccurrence = {
  id: string;
  reminder_id: string;
  type: "vaccination" | "treatment_dose" | "vet_follow_up" | "meal" | "birthday" | "manual";
  title: string | null;
  due_at: string;
  status: "pending" | "sent" | "resent" | "done" | "missed";
  display_status: "today" | "soon" | "missed" | "done";
  pet_id: string | null;
  pet_name: string | null;
  pet_sex: PetSexValue | null;
  pet_species: PetSpeciesValue | null;
  channels: ("email" | "push" | "whatsapp" | "viber")[];
  sent_at: string | null;
  done_at: string | null;
  done_by: string | null;
  done_by_name: string | null;
  is_shared: boolean;
  can_mark_done: boolean;
};

/** API §6 PetSummary (EP-01, view:pet_summaries_api). */
export type PetSummary = {
  id: string;
  name: string;
  species: PetSpeciesValue;
  species_other: string | null;
  breed: string | null;
  sex: PetSexValue;
  birth_date: string | null;
  birth_year: number | null;
  has_photo: boolean;
  lifecycle: "active" | "memorial";
  organisation_id: string | null;
  owner_name: string | null;
  vet_name: string | null;
  attachment_count: number;
  moment_count: number;
  next_reminder: ReminderOccurrence | null;
  memorial: MemorialRecord | null;
  access: Access;
  can_log: boolean;
};

/** API §6 Pet. */
export type Pet = {
  id: string;
  owner_id: string | null;
  organisation_id: string | null;
  name: string;
  species: PetSpeciesValue;
  species_other: string | null;
  breed: string | null;
  sex: PetSexValue;
  birth_date: string | null;
  birth_year: number | null;
  colour_markings: string | null;
  microchip_number: string | null;
  passport_number: string | null;
  neutered: NeuteredValue;
  has_photo: boolean;
  photo_file_name: string | null;
  vet_name: string | null;
  vet_phone: string | null;
  weight_unit: WeightUnit;
  note: string | null;
  lifecycle: "active" | "memorial";
  shelter_status: string | null;
  offspring_status: string | null;
  breeding_status: "active" | "retired" | null;
  litter_id: string | null;
  price: Money | null;
  public_description: string | null;
  approx_age_text: string | null;
  created_at: string;
  updated_at: string;
};

/** API §6 PetRecord (EP-02). Entry arrays are typed loosely until Steps 14–15 render them. */
export type PetRecord = {
  pet: Pet;
  access: Access;
  can_log: boolean;
  read_only_reason: "household_member" | "household_read_only" | "transferred" | null;
  owner_name: string | null;
  memorial: MemorialRecord | null;
  upcoming_reminders: ReminderOccurrence[];
  vaccinations: Record<string, unknown>[];
  treatments: Record<string, unknown>[];
  vet_visits: Record<string, unknown>[];
  weights: Record<string, unknown>[];
  attachment_count: number;
};

/** EP-03 Request (owner fields; organisation-only fields arrive with Step 24). */
export type PetInput = {
  name: string;
  species: PetSpeciesValue | "";
  species_other?: string | null;
  sex: PetSexValue | "";
  breed?: string | null;
  colour_markings?: string | null;
  microchip_number?: string | null;
  passport_number?: string | null;
  birth_date?: string | null;
  birth_year?: number | null;
  neutered?: NeuteredValue;
  vet_name?: string | null;
  vet_phone?: string | null;
  weight_unit?: WeightUnit;
  note?: string | null;
};

const SPECIES: readonly PetSpeciesValue[] = [
  "dog", "cat", "rabbit", "hamster", "guinea_pig", "chinchilla", "ferret",
  "bird", "fish", "turtle", "lizard", "snake", "other",
];
const SEXES: readonly PetSexValue[] = ["male", "female", "unknown"];
const NEUTERED: readonly NeuteredValue[] = ["yes", "no", "unknown"];
const UNITS: readonly WeightUnit[] = ["kg", "g"];
const OPTIONAL_TEXT: Record<string, number> = {
  breed: 100,
  colour_markings: 100,
  microchip_number: 100,
  passport_number: 100,
  vet_name: 100,
  vet_phone: 30,
  note: 2000,
};
/** EP-03: organisation-only fields; sent by an owner → validation_failed. */
const ORGANISATION_FIELDS = ["breeding_status", "public_description", "approx_age_text", "price_minor"];
/** EP-04: never writable through update_pet. */
const NOT_WRITABLE = [
  "owner_id", "organisation_id", "lifecycle", "photo_r2_key", "shelter_status", "offspring_status", "litter_id",
];

const PET_COLUMNS =
  "id, owner_id, organisation_id, name, species, species_other, breed, sex, birth_date, birth_year, " +
  "colour_markings, microchip_number, passport_number, neutered, photo_r2_key, vet_name, vet_phone, " +
  "weight_unit, note, lifecycle, shelter_status, offspring_status, breeding_status, litter_id, price_minor, " +
  "public_description, approx_age_text, created_at, updated_at";

type PetRow = Omit<Pet, "has_photo" | "photo_file_name" | "price"> & {
  photo_r2_key: string | null;
  price_minor: number | null;
};

/** A pets row → API §6 Pet; the raw r2 key never leaves the server. */
function toPet(row: PetRow): Pet {
  const { photo_r2_key, price_minor, ...rest } = row;
  return {
    ...rest,
    has_photo: photo_r2_key !== null,
    photo_file_name: photo_r2_key ? (photo_r2_key.split("/").pop() ?? null) : null,
    price: price_minor === null ? null : { amount_minor: price_minor, currency: "RSD" },
  };
}

/** Today's date in Europe/Belgrade as YYYY-MM-DD (API §3.5). */
function belgradeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(now);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** EP-03 / EP-04 Request rules → the column values, or the field error codes (API §7.1). */
function validatePet(
  input: Record<string, unknown>,
  { partial }: { partial: boolean },
): { values: Record<string, unknown> } | { fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const has = (key: string) => !partial || key in input;

  for (const key of ORGANISATION_FIELDS) if (key in input) fields[key] = "invalid";
  if (partial) for (const key of NOT_WRITABLE) if (key in input) fields[key] = "invalid";

  if (has("name")) {
    const name = text(input.name);
    if (!name) fields.name = "required";
    else if (name.length > 60) fields.name = "too_long";
    else values.name = name;
  }

  if (has("species")) {
    if (!input.species) fields.species = "required";
    else if (!SPECIES.includes(input.species as PetSpeciesValue)) fields.species = "invalid";
    else values.species = input.species;
  }

  if (has("species") || has("species_other")) {
    const other = text(input.species_other);
    if (values.species === "other" || (!has("species") && other !== null)) {
      if (!other) fields.species_other = "required";
      else if (other.length > 60) fields.species_other = "too_long";
      else values.species_other = other;
    } else if (other !== null) {
      fields.species_other = "invalid";
    } else {
      values.species_other = null;
    }
  }

  if (has("sex")) {
    if (!input.sex) fields.sex = "required";
    else if (!SEXES.includes(input.sex as PetSexValue)) fields.sex = "invalid";
    else values.sex = input.sex;
  }

  for (const [key, max] of Object.entries(OPTIONAL_TEXT)) {
    if (!has(key)) continue;
    const value = text(input[key]);
    if (value !== null && value.length > max) fields[key] = "too_long";
    else values[key] = value;
  }

  const birthDate = input.birth_date ?? null;
  const birthYear = input.birth_year ?? null;
  if (birthDate !== null && birthYear !== null) fields.birth_year = "invalid";
  if (has("birth_date")) {
    if (birthDate === null) values.birth_date = null;
    else if (typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate)))
      fields.birth_date = "invalid";
    else if (birthDate > belgradeToday()) fields.birth_date = "out_of_range";
    else values.birth_date = birthDate;
  }
  if (has("birth_year")) {
    if (birthYear === null) values.birth_year = null;
    else if (typeof birthYear !== "number" || !Number.isInteger(birthYear)) fields.birth_year = "invalid";
    else if (birthYear < 1990 || birthYear > Number(belgradeToday().slice(0, 4))) fields.birth_year = "out_of_range";
    else values.birth_year = birthYear;
  }

  if (has("neutered") && input.neutered !== undefined) {
    if (!NEUTERED.includes(input.neutered as NeuteredValue)) fields.neutered = "invalid";
    else values.neutered = input.neutered;
  }
  if (has("weight_unit") && input.weight_unit !== undefined) {
    if (!UNITS.includes(input.weight_unit as WeightUnit)) fields.weight_unit = "invalid";
    else values.weight_unit = input.weight_unit;
  }

  return Object.keys(fields).length > 0 ? { fields } : { values };
}

/** EP-03 — create pet (S02 /ljubimci/novi). Returns API §6 Pet. */
export async function createPet(input: PetInput): Promise<ActionResult<Pet>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const checked = validatePet(input as Record<string, unknown>, { partial: false });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  // Owners own the pet; organisation roles create it for their organisation (EP-03 Address).
  const organisationId = caller.data.organisations[0]?.organisation_id ?? null;
  const row = {
    ...checked.values,
    owner_id: organisationId ? null : caller.data.user.id,
    organisation_id: organisationId,
  };

  const { data, error } = await supabase
    .from("pets")
    .insert(row as never)
    .select(PET_COLUMNS)
    .single();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return ok(toPet(data as unknown as PetRow));
}

/** EP-04 — update pet (S02 /ljubimci/[id]/izmena), partial. Returns API §6 Pet. */
export async function updatePet(petId: string, input: Partial<PetInput>): Promise<ActionResult<Pet>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const checked = validatePet(input as Record<string, unknown>, { partial: true });
  if ("fields" in checked) return fail("validation_failed", { fields: checked.fields });

  const { data, error } = await supabase
    .from("pets")
    .update(checked.values as never)
    .eq("id", petId)
    .select(PET_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");
  return ok(toPet(data as unknown as PetRow));
}

/**
 * EP-05 — delete pet permanently (S03 DropdownMenu → AlertDialog "Da, obriši").
 * One statement = one transaction: the pets row goes, the cascade removes every record,
 * care-log, moment, memorial, reminder, occurrence and public-link row, and the after-delete
 * triggers on pets, attachments and moment_photos queue every R2 key of the pet in
 * r2_deletion_queue for the nightly cleanup (TC §5.9) — committed together with the delete.
 * Member and Volunteer → forbidden_role (pets role trigger); no relation → not_found.
 */
export async function deletePet(input: { pet_id: string; confirm: boolean }): Promise<ActionResult<{ deleted_pet_id: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  if (input?.confirm !== true) return fail("validation_failed", { fields: { confirm: "required" } });
  if (typeof input.pet_id !== "string" || input.pet_id === "") return fail("validation_failed", { fields: { pet_id: "required" } });

  const { data, error } = await supabase.from("pets").delete().eq("id", input.pet_id).select("id");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return ok({ deleted_pet_id: data[0].id });
}
