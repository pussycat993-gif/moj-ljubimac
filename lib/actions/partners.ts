"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { r2 } from "@/lib/integrations/r2";
import type { City, Me } from "@/lib/actions/registration";

// Partner directory (EPIC-07): EP-64 rpc:partners_nearby (S24 type chips / "Koristi moju lokaciju"
// re-reads, and the S03 "Predlog veterinara u blizini" block with the EP-43 profile city), EP-65
// getPartner (S25, rpc:get_partner + the presigned logo) and EP-66 rpc:record_partner_click (the
// quick actions, fire-and-forget — owner decision, Step 27). BR-40 … BR-44 live in the database
// functions; these wrappers validate the Request and map errors (API §7.1).

export type PartnerType = "vet" | "pet_shop" | "grooming" | "pet_hotel";
export type PartnerMessageChannel = "none" | "sms" | "viber" | "whatsapp";
export type PartnerClickAction = "call" | "message" | "email" | "website";

export type { City };

/** API §6 PartnerHours. */
export type PartnerHours = { weekday: number; opens: string; closes: string };

/** API §6 Partner. */
export type Partner = {
  id: string;
  type: PartnerType;
  name: string;
  initials: string;
  address: string;
  city: City;
  phone: string;
  message_channel: PartnerMessageChannel;
  message_number: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  description: string | null;
  logo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  featured: boolean;
  paid_until: string;
  active: boolean;
  distance_km: number | null;
  hours: PartnerHours[];
  today_hours: PartnerHours | null;
};

/** EP-64 Request (without the p_ prefix). */
export type PartnersNearbyInput = {
  lat?: number | null;
  lng?: number | null;
  city_id?: string | null;
  type?: PartnerType | null;
  limit?: number | null;
};

/** EP-65 Request. */
export type GetPartnerInput = {
  partner_id: string;
  lat?: number | null;
  lng?: number | null;
  city_id?: string | null;
};

const TYPES: readonly PartnerType[] = ["vet", "pet_shop", "grooming", "pet_hotel"];
const ACTIONS: readonly PartnerClickAction[] = ["call", "message", "email", "website"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RPC error → ApiError; validation field codes travel in DETAIL '<field>:<code>'. */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field.replace(/^p_/, "")]: code };
  }
  return mapped;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isSet = (v: unknown) => v !== null && v !== undefined;

/** Both coordinates or neither (BR-42); latitude −90…90, longitude −180…180. */
function coordinateFields(lat: unknown, lng: unknown, fields: Record<string, string>) {
  if (isSet(lat) !== isSet(lng)) {
    fields[isSet(lat) ? "lng" : "lat"] = "required";
    return;
  }
  if (isSet(lat) && (!isNumber(lat) || lat < -90 || lat > 90)) fields.lat = "out_of_range";
  if (isSet(lng) && (!isNumber(lng) || lng < -180 || lng > 180)) fields.lng = "out_of_range";
}

/**
 * EP-64 — partners nearby (S24). Coordinates (browser location) or city_id (the profile city) are
 * required; featured first (≤ 3 per type per city), then by distance_km — ordered by the database.
 */
export async function listPartnersNearby(input: PartnersNearbyInput): Promise<ActionResult<Partner[]>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  coordinateFields(input?.lat, input?.lng, fields);
  const hasCoordinates = isSet(input?.lat) && isSet(input?.lng);
  if (isSet(input?.city_id) && (typeof input.city_id !== "string" || !UUID.test(input.city_id))) fields.city_id = "invalid";
  else if (!hasCoordinates && !isSet(input?.city_id) && !fields.lat && !fields.lng) fields.city_id = "required";
  if (isSet(input?.type) && !TYPES.includes(input.type as PartnerType)) fields.type = "invalid";
  if (isSet(input?.limit) && (!Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 50)) {
    fields.limit = "out_of_range";
  }
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const args: { p_lat?: number; p_lng?: number; p_city_id?: string; p_type?: PartnerType; p_limit?: number } = {};
  if (hasCoordinates) {
    args.p_lat = input.lat as number;
    args.p_lng = input.lng as number;
  }
  if (input.city_id) args.p_city_id = input.city_id;
  if (input.type) args.p_type = input.type;
  if (input.limit) args.p_limit = input.limit;

  const { data, error } = await supabase.rpc("partners_nearby", args);
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok((data ?? []) as unknown as Partner[]);
}

/**
 * S03 "Predlog veterinara u blizini" (FR-56, BR-43): EP-64 with p_type = vet, p_limit = 2 and
 * p_city_id = the profile city from EP-43. No profile city → [] (the block is not shown).
 */
export async function suggestNearbyVets(): Promise<ActionResult<Partner[]>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const { data, error } = await supabase.rpc("get_me");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  const cityId = (data as Me | null)?.city?.id;
  if (!cityId) return ok([]);

  const vets = await supabase.rpc("partners_nearby", { p_type: "vet", p_limit: 2, p_city_id: cityId });
  if (vets.error) return { ok: false, error: fromRpcError(vets.error) };
  return ok((vets.data ?? []) as unknown as Partner[]);
}

/**
 * EP-65 — one visible partner (S25) with full hours, today_hours, distance_km from lat/lng or
 * city_id (null without either) and logo_url presigned for 10 minutes. Unknown or paid_until
 * passed → 404 not_found (E-23).
 */
export async function getPartner(input: GetPartnerInput): Promise<ActionResult<Partner>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  if (!isSet(input?.partner_id) || input.partner_id === "") fields.partner_id = "required";
  else if (typeof input.partner_id !== "string" || !UUID.test(input.partner_id)) fields.partner_id = "invalid";
  coordinateFields(input?.lat, input?.lng, fields);
  if (isSet(input?.city_id) && (typeof input.city_id !== "string" || !UUID.test(input.city_id))) fields.city_id = "invalid";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const args: { p_partner_id: string; p_lat?: number; p_lng?: number; p_city_id?: string } = {
    p_partner_id: input.partner_id,
  };
  if (isSet(input.lat) && isSet(input.lng)) {
    args.p_lat = input.lat as number;
    args.p_lng = input.lng as number;
  }
  if (input.city_id) args.p_city_id = input.city_id;

  const { data, error } = await supabase.rpc("get_partner", args);
  if (error) return { ok: false, error: fromRpcError(error) };
  if (!data) return fail("not_found");

  const { logo_r2_key: logoKey, ...partner } = data as unknown as Partner & { logo_r2_key: string | null };
  let logoUrl: string | null = null;
  if (logoKey) {
    try {
      logoUrl = (await r2().presignGet(logoKey)).url;
    } catch (e) {
      // The profile still renders with initials when the logo cannot be signed.
      console.error("[partners] logo presign:", e instanceof Error ? e.message : e);
    }
  }
  return ok({ ...partner, logo_url: logoUrl });
}

/**
 * EP-66 — counts a quick action (FR-58). Callers fire it before opening the link and ignore the
 * result: a failure never blocks the link (EP-66 States).
 */
export async function recordPartnerClick(partnerId: string, action: PartnerClickAction): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  if (typeof partnerId !== "string" || !UUID.test(partnerId)) fields.partner_id = "invalid";
  if (!ACTIONS.includes(action)) fields.action = "invalid";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const { error } = await supabase.rpc("record_partner_click", { p_partner_id: partnerId, p_action: action });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(null);
}
