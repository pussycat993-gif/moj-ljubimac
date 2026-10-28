"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { r2 } from "@/lib/integrations/r2";
import type { City } from "@/lib/actions/registration";
import type { FileUrl } from "@/lib/actions/files";

// S20 /organizacija and S29 /organizacija/profil (Step 24): EP-53 rpc:get_my_organisation, EP-54
// rpc:list_org_animals, EP-55 createIntake (rpc:create_intake, one transaction) and status changes (Data API
// pets update; the Step 09 trigger writes pet_status_history), EP-72 public profile (Data API organisations
// update). Everything runs on the server because the session lives in httpOnly cookies (owner decision,
// Steps 13–17). The database enforces the rules (API §3.1): RLS, the Step 05 / 06 / 09 triggers and the
// Step 24 guards (organisation_pending_approval, breeder_plan_required, forbidden_role, EP-72 checks).

/** API §6 Access (organisation roles). */
export type OrganisationAccess = { role: "org_admin" | "volunteer"; can_edit: boolean; can_delete: boolean };

/** API §6 DonationInfo (FR-66, FR-72). `payment_purpose` only from EP-78; null from EP-53 / EP-88. */
export type DonationInfo = {
  organisation_id: string;
  organisation_name: string;
  city: City | null;
  bank_account: string | null;
  payment_url: string | null;
  dropoff_address: string | null;
  dropoff_hours: string | null;
  payment_purpose: string | null;
  has_any: boolean;
};

/** EP-88 Request: every field optional, null clears it, only fields sent change. */
export type DonationInfoInput = {
  bank_account?: string | null;
  payment_url?: string | null;
  dropoff_address?: string | null;
  dropoff_hours?: string | null;
};

/** API §6 Organisation. `donation` (Step 28b, FR-72): shelters only, null for breeders. */
export type Organisation = {
  id: string;
  type: "shelter" | "breeder";
  name: string;
  slug: string;
  public_path: string;
  city: City | null;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  tax_id: string | null;
  registration_note: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: FileUrl | null;
  donation: DonationInfo | null;
  member_count: number;
  member_limit: number;
  created_at: string;
};

/** API §6 OrganisationMember. */
export type OrganisationMember = {
  user_id: string;
  full_name: string | null;
  email: string;
  role: "admin" | "volunteer";
  joined_at: string;
  is_me: boolean;
};

/** API §6 OrganisationInvitation. */
export type OrganisationInvitation = {
  id: string;
  email: string;
  role: "admin" | "volunteer";
  status: "pending" | "accepted" | "declined" | "expired";
  expires_at: string;
  created_at: string;
};

/** EP-53 Response. */
export type MyOrganisation = {
  organisation: Organisation;
  team: OrganisationMember[];
  pending_invitations: OrganisationInvitation[];
  breeder_plan_active: boolean;
  access: OrganisationAccess;
};

/** API §6 OrgAnimalRow. */
export type OrgAnimalRow = {
  pet_id: string;
  name: string;
  species: string;
  species_other: string | null;
  breed: string | null;
  sex: "male" | "female" | "unknown";
  approx_age_text: string | null;
  birth_date: string | null;
  birth_year: number | null;
  status_kind: "shelter" | "offspring" | "breeding";
  status: string;
  since_date: string | null;
  is_mother: boolean;
  lifecycle: "active" | "memorial";
  transferred: boolean;
};

/** EP-54 Response. */
export type OrgAnimalsPage = { items: OrgAnimalRow[]; total: number; status_counts: Record<string, number> };

/** API §6 Intake. */
export type Intake = {
  pet_id: string;
  organisation_id: string;
  name: string;
  species: string;
  species_other: string | null;
  sex: "male" | "female" | "unknown";
  breed: string | null;
  approx_age_text: string | null;
  shelter_status: string;
  intake_on: string;
  arrival_type: "found" | "surrendered" | "confiscated" | "other";
  place_found: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
};

/** EP-55 Request (createIntake). */
export type IntakeInput = {
  name: string;
  species: string;
  species_other?: string | null;
  sex: "male" | "female" | "unknown";
  breed?: string | null;
  approx_age_text?: string | null;
  intake_on: string;
  arrival_type: "found" | "surrendered" | "confiscated" | "other";
  place_found?: string | null;
  note?: string | null;
};

/** EP-72 Request. */
export type OrganisationProfileInput = {
  description?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_r2_key?: null;
};

const SHELTER_STATUSES = ["intake", "in_care", "available", "reserved", "adopted", "deceased", "returned_to_owner"] as const;
const BREEDING_STATUSES = ["active", "retired"] as const;
const SPECIES = [
  "dog", "cat", "rabbit", "hamster", "guinea_pig", "chinchilla", "ferret", "bird", "fish", "turtle", "lizard", "snake", "other",
];
const ARRIVAL_TYPES = ["found", "surrendered", "confiscated", "other"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTPS_URL = /^https:\/\/[^\s.]+\.[^\s]+$/;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** RPC and trigger errors carry their field code in DETAIL '<field>:<code>' (Step 15 convention). */
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
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** organisation.logo_r2_key (internal) → Organisation.logo_url, a presigned GET (API §10 step 5). */
async function withLogoUrl(raw: Organisation & { logo_r2_key?: string | null }): Promise<Organisation> {
  const { logo_r2_key: key, ...organisation } = raw;
  if (!key) return { ...organisation, logo_url: null };
  try {
    const signed = await r2().presignGet(key, { fileName: key.split("/").pop() ?? null });
    return {
      ...organisation,
      logo_url: { kind: "organisation_logo", id: organisation.id, url: signed.url, expires_at: signed.expires_at, mime_type: null },
    };
  } catch (error) {
    console.error("[lib/actions/organisation] logo presign failed:", error instanceof Error ? error.message : error);
    return { ...organisation, logo_url: { kind: "organisation_logo", id: organisation.id, url: null, expires_at: null, mime_type: null } };
  }
}

async function readMyOrganisation(supabase: Supabase): Promise<ActionResult<MyOrganisation>> {
  const { data, error } = await supabase.rpc("get_my_organisation");
  if (error) return { ok: false, error: fromRpcError(error) };
  const view = data as unknown as MyOrganisation & { organisation: Organisation & { logo_r2_key?: string | null } };
  return ok({ ...view, organisation: await withLogoUrl(view.organisation) });
}

/** EP-53 — the caller's organisation, team, pending invitations (Admins) and access. No organisation → 404. */
export async function getMyOrganisation(): Promise<ActionResult<MyOrganisation>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  return readMyOrganisation(supabase);
}

/** EP-54 — the organisation's animals with search (FR-59), status filter and paging. */
export async function listOrgAnimals(
  input: { q?: string | null; status?: string | null; limit?: number; offset?: number } = {},
): Promise<ActionResult<OrgAnimalsPage>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  const q = trimmed(input?.q);
  const status = trimmed(input?.status);
  const { data, error } = await supabase.rpc("list_org_animals", {
    ...(q ? { p_q: q } : {}),
    ...(status ? { p_status: status } : {}),
    p_limit: input?.limit ?? 20,
    p_offset: input?.offset ?? 0,
  });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as OrgAnimalsPage);
}

/** EP-55 Request checks with field codes (the database checks them again). */
function validateIntake(input: IntakeInput): Record<string, string> {
  const fields: Record<string, string> = {};
  const name = trimmed(input?.name);
  if (!name) fields.name = "required";
  else if (name.length > 80) fields.name = "too_long";
  if (!SPECIES.includes(String(input?.species))) fields.species = "invalid";
  const other = trimmed(input?.species_other);
  if (input?.species === "other" && !other) fields.species_other = "required";
  else if (input?.species === "other" && other && other.length > 60) fields.species_other = "too_long";
  if (!["male", "female", "unknown"].includes(String(input?.sex))) fields.sex = "invalid";
  if ((trimmed(input?.breed) ?? "").length > 80) fields.breed = "too_long";
  if ((trimmed(input?.approx_age_text) ?? "").length > 80) fields.approx_age_text = "too_long";
  if (!input?.intake_on) fields.intake_on = "required";
  else if (!DATE.test(input.intake_on)) fields.intake_on = "invalid";
  else if (input.intake_on > belgradeToday()) fields.intake_on = "in_future";
  if (!ARRIVAL_TYPES.includes(String(input?.arrival_type))) fields.arrival_type = "invalid";
  if ((trimmed(input?.place_found) ?? "").length > 200) fields.place_found = "too_long";
  if ((trimmed(input?.note) ?? "").length > 2000) fields.note = "too_long";
  return fields;
}

/**
 * EP-55 createIntake — a shelter animal, its intake and the first status-history row in one transaction
 * (rpc:create_intake, security invoker). Breeder → forbidden_role; pending → organisation_pending_approval.
 */
export async function createIntake(input: IntakeInput): Promise<ActionResult<Intake>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields = validateIntake(input);
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const { data, error } = await supabase.rpc("create_intake", {
    p_name: trimmed(input.name) ?? "",
    p_species: input.species,
    p_species_other: (input.species === "other" ? trimmed(input.species_other) : null) as string,
    p_sex: input.sex,
    p_breed: trimmed(input.breed) as string,
    p_approx_age_text: trimmed(input.approx_age_text) as string,
    p_intake_on: input.intake_on,
    p_arrival_type: input.arrival_type,
    p_place_found: trimmed(input.place_found) as string,
    p_note: trimmed(input.note) as string,
  });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as Intake);
}

/**
 * EP-55 status change — Data API pets update of shelter_status (shelters) or breeding_status (breeders);
 * the Step 09 trigger writes pet_status_history. Returns the changed OrgAnimalRow fields.
 */
export async function changeAnimalStatus(
  input: { pet_id: string; shelter_status: string } | { pet_id: string; breeding_status: string },
): Promise<ActionResult<Pick<OrgAnimalRow, "pet_id" | "status_kind" | "status">>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  if (!UUID.test(String(input?.pet_id))) return fail("not_found");

  let change: { shelter_status: (typeof SHELTER_STATUSES)[number] } | { breeding_status: (typeof BREEDING_STATUSES)[number] };
  if ("shelter_status" in input) {
    if (!(SHELTER_STATUSES as readonly string[]).includes(input.shelter_status)) {
      return fail("validation_failed", { fields: { shelter_status: "invalid" } });
    }
    change = { shelter_status: input.shelter_status as (typeof SHELTER_STATUSES)[number] };
  } else if ("breeding_status" in input) {
    if (!(BREEDING_STATUSES as readonly string[]).includes(input.breeding_status)) {
      return fail("validation_failed", { fields: { breeding_status: "invalid" } });
    }
    change = { breeding_status: input.breeding_status as (typeof BREEDING_STATUSES)[number] };
  } else {
    return fail("validation_failed", { fields: { status: "required" } });
  }

  const { data, error } = await supabase
    .from("pets")
    .update(change)
    .eq("id", input.pet_id)
    .not("organisation_id", "is", null)
    .select("id, shelter_status, breeding_status");
  if (error) return { ok: false, error: fromWriteError(error) };
  const row = data?.[0];
  if (!row) return fail("not_found");
  return ok(
    "shelter_status" in change
      ? { pet_id: row.id, status_kind: "shelter" as const, status: String(row.shelter_status) }
      : { pet_id: row.id, status_kind: "breeding" as const, status: String(row.breeding_status) },
  );
}

/** EP-72 Request checks with field codes (the database checks them again). */
function validateProfile(input: OrganisationProfileInput): Record<string, string> {
  const fields: Record<string, string> = {};
  if (input.description !== undefined && input.description !== null && input.description.length > 1000) {
    fields.description = "too_long";
  }
  if (input.phone && input.phone.length > 30) fields.phone = "too_long";
  if (input.email && (input.email.length > 254 || !EMAIL.test(input.email))) fields.email = "invalid";
  if (input.website && !HTTPS_URL.test(input.website)) fields.website = "invalid";
  if (input.logo_r2_key !== undefined && input.logo_r2_key !== null) fields.logo_r2_key = "invalid";
  return fields;
}

/**
 * EP-72 — the Admin saves the public profile (FR-60). Volunteer → forbidden_role (trigger); no relation →
 * not_found. A new logo is set by EP-13 confirm (organisation_logo); here `logo_r2_key` may only be null
 * (remove the logo). Returns the Organisation (EP-53 re-read, with logo_url).
 */
export async function updateOrganisationProfile(
  input: { organisation_id: string } & OrganisationProfileInput,
): Promise<ActionResult<Organisation>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  if (!UUID.test(String(input?.organisation_id))) return fail("not_found");

  const change: OrganisationProfileInput = {};
  if (input.description !== undefined) change.description = trimmed(input.description);
  if (input.phone !== undefined) change.phone = trimmed(input.phone);
  if (input.email !== undefined) change.email = trimmed(input.email)?.toLowerCase() ?? null;
  if (input.website !== undefined) change.website = trimmed(input.website);
  if (input.logo_r2_key !== undefined) change.logo_r2_key = input.logo_r2_key;
  const fields = validateProfile(change);
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const { data, error } = await supabase
    .from("organisations")
    .update(change)
    .eq("id", input.organisation_id)
    .select("id");
  if (error) return { ok: false, error: fromWriteError(error) };
  if (!data || data.length === 0) return fail("not_found");

  const view = await readMyOrganisation(supabase);
  if (!view.ok) return view;
  return ok(view.data.organisation);
}

/** API §5.9 EP-88 / OQ-17 interim mapping (e): bank account format NNN-N…N-NN. */
const BANK_ACCOUNT = /^\d{3}-\d{1,13}-\d{2}$/;

/** EP-88 Request checks with field codes (the database checks donation_url again). */
function validateDonation(input: DonationInfoInput): Record<string, string> {
  const fields: Record<string, string> = {};
  if (input.bank_account && !BANK_ACCOUNT.test(input.bank_account)) fields.bank_account = "invalid";
  if (input.payment_url) {
    let valid = input.payment_url.length <= 500 && HTTPS_URL.test(input.payment_url);
    try {
      valid = valid && new URL(input.payment_url).protocol === "https:";
    } catch {
      valid = false;
    }
    if (!valid) fields.payment_url = "invalid";
  }
  if (input.dropoff_address && input.dropoff_address.length > 200) fields.dropoff_address = "too_long";
  if (input.dropoff_hours && input.dropoff_hours.length > 200) fields.dropoff_hours = "too_long";
  return fields;
}

/**
 * EP-88 updateDonationInfo — the Shelter Admin saves the four donation fields (FR-72). Volunteer and breeder
 * organisations → forbidden_role; no organisation → not_found; pending → organisation_pending_approval (gate 4).
 * Returns DonationInfo (payment_purpose = null). No money is collected or processed (BR-58).
 */
export async function updateDonationInfo(input: DonationInfoInput): Promise<ActionResult<DonationInfo>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const view = await readMyOrganisation(supabase);
  if (!view.ok) return view;
  const { organisation, access } = view.data;
  if (organisation.type !== "shelter" || access.role !== "org_admin") return fail("forbidden_role");

  const change: Partial<Record<"donation_bank_account" | "donation_url" | "dropoff_address" | "dropoff_hours", string | null>> = {};
  const values: DonationInfoInput = {};
  if (input?.bank_account !== undefined) values.bank_account = change.donation_bank_account = trimmed(input.bank_account);
  if (input?.payment_url !== undefined) values.payment_url = change.donation_url = trimmed(input.payment_url);
  if (input?.dropoff_address !== undefined) values.dropoff_address = change.dropoff_address = trimmed(input.dropoff_address);
  if (input?.dropoff_hours !== undefined) values.dropoff_hours = change.dropoff_hours = trimmed(input.dropoff_hours);
  const fields = validateDonation(values);
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  if (Object.keys(change).length > 0) {
    const { data, error } = await supabase.from("organisations").update(change).eq("id", organisation.id).select("id");
    if (error) {
      if (error.code === "23514") return fail("validation_failed", { fields: { payment_url: "invalid" } });
      return { ok: false, error: fromWriteError(error) };
    }
    if (!data || data.length === 0) return fail("not_found");
  }

  const fresh = await readMyOrganisation(supabase);
  if (!fresh.ok) return fresh;
  const donation = fresh.data.organisation.donation;
  if (!donation) return fail("not_found");
  return ok(donation);
}
