"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { sendEmail } from "@/lib/integrations/resend";
import { geocode } from "@/lib/integrations/nominatim";
import { r2, safeFileName } from "@/lib/integrations/r2";
import { fromProfileLocale, getDictionary } from "@/lib/i18n";
import type { City } from "@/lib/actions/registration";
import type { Partner, PartnerHours, PartnerMessageChannel, PartnerType } from "@/lib/actions/partners";
import type { UploadTicket } from "@/lib/actions/uploads";
import type { Json } from "@/lib/supabase/database.types";
import type { ReportReason } from "@/lib/actions/listings";

// Operator admin (S26 /admin, EPIC-07): EP-68 decideOrganisation, EP-69 geocodeAddress /
// createPartnerLogoUpload / savePartner, EP-71 setAppSettings. Every action runs the API §4.1 gates,
// then checks profiles.is_operator explicitly (forbidden_role otherwise, API §4.4) and only then writes
// with the service role, on the server only (API §3.1). The reads of S26 (view admin_pending_organisations,
// rpc:admin_list_partners, rpc:admin_partner_click_stats, app_settings, cities) run in app/admin/page.tsx
// with the Operator's session. Partner logo (owner decision, Step 28): savePartner (create) → logo ticket →
// PUT to R2 → savePartner({ id, logo_r2_key }); savePartner checks the key starts with p/<id>/ and, when R2
// is configured, that the object exists (HEAD).
// EP-86 moderate (Step 28c): dismiss_report / hide_listing / suspend_user through rpc:admin_decide_report (one
// transaction), restore_listing through rpc:admin_restore_listing (owner decision: expired when the BR-55 limit
// refuses active) and restore_user through rpc:admin_restore_user — all service-role only, called after the
// explicit is_operator check. The emails listing_hidden / marketplace_suspended go to the author in their locale
// with {reason} = reason_note or the report reason label; reason_note is never stored (OQ-17). listModeration is
// the server wrapper of the EP-86 list rpc:admin_list_moderation (the Operator's session; empty for anyone else).

/** API §6 PendingOrganisation. */
export type PendingOrganisation = {
  id: string;
  type: "shelter" | "breeder";
  name: string;
  city: City | null;
  tax_id: string | null;
  registration_note: string | null;
  email: string | null;
  phone: string | null;
  contact_full_name: string | null;
  contact_email: string;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  registered_at: string;
};

/** EP-69 list item. */
export type AdminPartner = Partner & { featured_count: number };

/** API §6 PartnerClickStats. */
export type PartnerClickStats = {
  partner_id: string;
  partner_name: string;
  partner_type: PartnerType;
  city_name_sr: string;
  call: number;
  message: number;
  email: number;
  website: number;
  total: number;
};

/** EP-70 Response. */
export type PartnerClickStatsPage = {
  period: string;
  available_periods: string[];
  items: PartnerClickStats[];
  total: number;
};

/** API §6 AppSettings. */
export type AppSettings = { viber_enabled: boolean; whatsapp_monthly_cap: number; updated_at: string };

export type DecideOrganisationInput = {
  organisation_id: string;
  decision: "approve" | "reject";
  rejection_reason?: string | null;
};

export type GeocodeAddressInput = { address: string; city_id: string };
export type GeocodedAddress = { latitude: number; longitude: number; display_name: string };

export type PartnerLogoUploadInput = { partner_id: string; file_name: string; mime_type: string; size_bytes: number };
/** UploadTicket plus the generated key, passed back as savePartner logo_r2_key (API §10 step 3, EP-69). */
export type PartnerLogoTicket = UploadTicket & { r2_key: string };

/** EP-69 save Request: `id` absent = create; present = update, only the fields sent change. */
export type SavePartnerInput = {
  id?: string;
  type?: PartnerType;
  name?: string;
  address?: string;
  city_id?: string;
  phone?: string;
  email?: string | null;
  website?: string | null;
  instagram?: string | null;
  description?: string | null;
  message_channel?: PartnerMessageChannel;
  message_number?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  logo_r2_key?: string | null;
  featured?: boolean;
  paid_until?: string;
  hours?: PartnerHours[];
};

export type SetAppSettingsInput = { viber_enabled: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: readonly PartnerType[] = ["vet", "pet_shop", "grooming", "pet_hotel"];
const CHANNELS: readonly PartnerMessageChannel[] = ["none", "sms", "viber", "whatsapp"];
const MAX_LOGO_BYTES = 10_485_760; // BR-05
const WHATSAPP_MONTHLY_CAP = 30; // BR-14a
const UPLOAD_TTL_MS = 10 * 60 * 1000;

type Supabase = Awaited<ReturnType<typeof createClient>>;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

/** RPC error → ApiError; validation field codes travel in DETAIL '<field>:<code>'. */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field.replace(/^p_/, "")]: code };
  }
  return mapped;
}

/** API §4.1 gates, then profiles.is_operator (API §4.4: everyone else → 403 forbidden_role). */
async function requireOperator(supabase: Supabase, access: "read" | "write"): Promise<ActionResult<{ userId: string }>> {
  const caller = await checkGates(supabase, { access });
  if (!caller.ok) return caller;
  const { data, error } = await supabase.from("profiles").select("is_operator").eq("id", caller.data.user.id).maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data?.is_operator) return fail("forbidden_role");
  return ok({ userId: caller.data.user.id });
}

function r2Configured(): boolean {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

// EP-68 ------------------------------------------------------------------------------------------------

/**
 * EP-68 decide: approve → approved, members' writes unblock at once, shelter_approved email to the
 * creator; reject → rejected + rejection_reason, shelter_rejected email (with "Razlog: …" when given).
 * Emails go in the creator's profiles.locale; a failed email is logged and does not undo the decision.
 */
export async function decideOrganisation(input: DecideOrganisationInput): Promise<ActionResult<PendingOrganisation>> {
  const supabase = await createClient();
  const operator = await requireOperator(supabase, "write");
  if (!operator.ok) return operator;

  const fields: Record<string, string> = {};
  if (typeof input?.organisation_id !== "string" || !UUID.test(input.organisation_id)) fields.organisation_id = "invalid";
  if (input?.decision !== "approve" && input?.decision !== "reject") fields.decision = "invalid";
  const reason = typeof input?.rejection_reason === "string" ? input.rejection_reason.trim() : null;
  if (input?.rejection_reason !== undefined && input.rejection_reason !== null && typeof input.rejection_reason !== "string") {
    fields.rejection_reason = "invalid";
  } else if (reason && input.decision === "approve") {
    fields.rejection_reason = "invalid";
  } else if (reason && reason.length > 500) {
    fields.rejection_reason = "too_long";
  }
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("decide_organisation", {
    p_organisation_id: input.organisation_id,
    p_decision: input.decision,
    p_rejection_reason: reason || undefined,
  });
  if (error) return { ok: false, error: fromRpcError(error) };

  const decided = data as unknown as { organisation: PendingOrganisation; creator_locale: string | null };
  const organisation = decided.organisation;
  if (organisation.contact_email) {
    const locale = fromProfileLocale(decided.creator_locale);
    const sent = await sendEmail({
      to: organisation.contact_email,
      locale,
      template:
        input.decision === "approve"
          ? { id: "shelter_approved", variables: { organisation: organisation.name, url: `${siteUrl()}/organizacija` } }
          : { id: "shelter_rejected", variables: { organisation: organisation.name, reason: organisation.rejection_reason } },
    });
    if (sent.status === "failed") console.error("[admin] decideOrganisation email failed:", sent.error);
  }
  return ok(organisation);
}

// EP-69 ------------------------------------------------------------------------------------------------

async function cityName(supabase: Supabase, cityId: string): Promise<ActionResult<string>> {
  const { data, error } = await supabase.from("cities").select("name_sr").eq("id", cityId).maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("validation_failed", { fields: { city_id: "invalid" } });
  return ok(data.name_sr);
}

/** EP-69 geocode: Nominatim (ADR-11) for "<address, city, Serbia>"; nothing found → 502 geocoding_failed. */
export async function geocodeAddress(input: GeocodeAddressInput): Promise<ActionResult<GeocodedAddress>> {
  const supabase = await createClient();
  const operator = await requireOperator(supabase, "read");
  if (!operator.ok) return operator;

  const fields: Record<string, string> = {};
  const address = typeof input?.address === "string" ? input.address.trim() : "";
  if (!address) fields.address = "required";
  else if (address.length > 200) fields.address = "too_long";
  if (typeof input?.city_id !== "string" || !UUID.test(input.city_id)) fields.city_id = input?.city_id ? "invalid" : "required";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const city = await cityName(supabase, input.city_id);
  if (!city.ok) return city;
  const result = await geocode({ address, city: city.data });
  if (!result.ok) return fail("geocoding_failed");
  return ok(result.data);
}

const LOGO_EXTENSIONS: Record<string, string> = { jpeg: "jpg", "svg+xml": "svg" };

/**
 * EP-69 logo upload: an UploadTicket for p/<partner_id>/logo-<uuid>.<ext> (API §10). Images only, at most
 * 10 MB (BR-05). The partner must exist (owner decision, Step 28: the add Dialog creates it first).
 */
export async function createPartnerLogoUpload(input: PartnerLogoUploadInput): Promise<ActionResult<PartnerLogoTicket>> {
  const supabase = await createClient();
  const operator = await requireOperator(supabase, "write");
  if (!operator.ok) return operator;

  const fields: Record<string, string> = {};
  if (typeof input?.partner_id !== "string" || !UUID.test(input.partner_id)) fields.partner_id = input?.partner_id ? "invalid" : "required";
  if (typeof input?.file_name !== "string" || input.file_name.trim() === "") fields.file_name = "required";
  if (typeof input?.size_bytes !== "number" || !Number.isInteger(input.size_bytes) || input.size_bytes < 1) {
    fields.size_bytes = "invalid";
  }
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });
  const mime = typeof input.mime_type === "string" ? input.mime_type.toLowerCase() : "";
  const subtype = /^image\/([a-z0-9.+-]+)$/.exec(mime)?.[1];
  if (!subtype) return fail("file_type_not_allowed");
  if (input.size_bytes > MAX_LOGO_BYTES) return fail("file_too_large");

  const service = createServiceRoleClient();
  const { data: partner, error } = await service.from("partners").select("id").eq("id", input.partner_id).maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!partner) return fail("not_found");

  const ext = LOGO_EXTENSIONS[subtype] ?? safeFileName(subtype).replace(/[^a-z0-9]/g, "");
  const key = `p/${partner.id}/logo-${crypto.randomUUID()}.${ext}`;
  try {
    const put = await r2().presignPut(key, { contentType: mime, contentLength: input.size_bytes });
    return ok({
      upload_token: await signLogoTicket(key, mime, input.size_bytes),
      put_url: put.url,
      method: "PUT",
      headers: { "Content-Type": mime, "Content-Length": String(input.size_bytes) },
      expires_at: put.expires_at,
      file_name: input.file_name,
      position: null,
      r2_key: key,
    });
  } catch (e) {
    console.error("[admin] createPartnerLogoUpload:", e instanceof Error ? e.message : String(e));
    return fail("internal_error", { message: e instanceof Error ? e.message : String(e) });
  }
}

/** API §6 UploadTicket.upload_token: HMAC-SHA256 (ACTION_TOKEN_SECRET) over purpose, key, mime, size, expiry. */
async function signLogoTicket(key: string, mime: string, size: number): Promise<string> {
  const secret = process.env.ACTION_TOKEN_SECRET;
  if (!secret) throw new Error("ACTION_TOKEN_SECRET is not set; upload tokens cannot be signed.");
  const toBase64Url = (bytes: Uint8Array) => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const body = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ p: "partner_logo", k: key, m: mime, s: size, e: Date.now() + UPLOAD_TTL_MS })),
  );
  const hmacKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(`upload:${body}`));
  return `up_${body}.${toBase64Url(new Uint8Array(signature))}`;
}

type ExistingPartner = {
  id: string;
  address: string;
  city_id: string;
  message_channel: PartnerMessageChannel;
  message_number: string | null;
};

const has = (input: object, key: string) => Object.prototype.hasOwnProperty.call(input, key) && (input as Record<string, unknown>)[key] !== undefined;

function optionalText(value: unknown): string | null | "invalid" {
  if (value === null) return null;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function validUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validHours(hours: unknown): PartnerHours[] | null {
  if (!Array.isArray(hours)) return null;
  const seen = new Set<number>();
  const rows: PartnerHours[] = [];
  for (const row of hours as Partial<PartnerHours>[]) {
    const weekday = row?.weekday;
    if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || seen.has(weekday)) return null;
    if (typeof row.opens !== "string" || !TIME.test(row.opens)) return null;
    if (typeof row.closes !== "string" || (!TIME.test(row.closes) && row.closes !== "24:00")) return null;
    if (row.opens >= row.closes) return null;
    seen.add(weekday);
    rows.push({ weekday, opens: row.opens, closes: row.closes });
  }
  return rows.sort((a, b) => a.weekday - b.weekday);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * EP-69 save: validates the Request, geocodes when both coordinates are null (on create; on update when
 * both are sent as null — ADR-11), then rpc:save_partner upserts partners and replaces partner_hours in
 * one transaction (the old logo key is queued there). featured_limit_reached comes from the BR-41
 * trigger. Returns the Partner with a presigned logo_url.
 */
export async function savePartner(input: SavePartnerInput): Promise<ActionResult<Partner>> {
  const supabase = await createClient();
  const operator = await requireOperator(supabase, "write");
  if (!operator.ok) return operator;
  if (!input || typeof input !== "object") return fail("validation_failed", { fields: { id: "invalid" } });

  const creating = !has(input, "id");
  if (!creating && (typeof input.id !== "string" || !UUID.test(input.id))) {
    return fail("validation_failed", { fields: { id: "invalid" } });
  }

  const service = createServiceRoleClient();
  let existing: ExistingPartner | null = null;
  if (!creating) {
    const { data, error } = await service
      .from("partners")
      .select("id, address, city_id, message_channel, message_number")
      .eq("id", input.id!)
      .maybeSingle();
    if (error) return { ok: false, error: fromDatabaseError(error) };
    if (!data) return fail("not_found");
    existing = data;
  }

  const errors: Record<string, string> = {};
  const values: Record<string, Json> = {};
  const required = (key: string) => {
    if (creating && !has(input, key)) errors[key] = "required";
  };

  if (has(input, "type")) {
    if (TYPES.includes(input.type as PartnerType)) values.type = input.type!;
    else errors.type = "invalid";
  } else required("type");

  for (const key of ["name", "address"] as const) {
    if (has(input, key)) {
      const value = typeof input[key] === "string" ? input[key]!.trim() : null;
      if (!value) errors[key] = "required";
      else if (value.length > 200) errors[key] = "too_long";
      else values[key] = value;
    } else required(key);
  }

  if (has(input, "city_id")) {
    if (typeof input.city_id === "string" && UUID.test(input.city_id)) values.city_id = input.city_id;
    else errors.city_id = "invalid";
  } else required("city_id");

  if (has(input, "phone")) {
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    if (!phone) errors.phone = "required";
    else if (phone.length < 6 || phone.length > 30) errors.phone = "invalid";
    else values.phone = phone;
  } else required("phone");

  if (has(input, "email")) {
    const email = optionalText(input.email);
    if (email === "invalid" || (email !== null && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
      errors.email = "invalid";
    } else values.email = email;
  }
  if (has(input, "website")) {
    const website = optionalText(input.website);
    if (website === "invalid" || (website !== null && (website.length > 200 || !validUrl(website)))) errors.website = "invalid";
    else values.website = website;
  }
  if (has(input, "instagram")) {
    const raw = optionalText(input.instagram);
    const handle = typeof raw === "string" && raw !== "invalid" ? raw.replace(/^@/, "") : raw;
    if (handle === "invalid" || (handle !== null && !/^[A-Za-z0-9._]{1,30}$/.test(handle))) errors.instagram = "invalid";
    else values.instagram = handle;
  }
  if (has(input, "description")) {
    const description = optionalText(input.description);
    if (description === "invalid") errors.description = "invalid";
    else if (description !== null && description.length > 1000) errors.description = "too_long";
    else values.description = description;
  }

  let channel: PartnerMessageChannel = existing?.message_channel ?? "none";
  if (has(input, "message_channel")) {
    if (CHANNELS.includes(input.message_channel as PartnerMessageChannel)) channel = input.message_channel!;
    else errors.message_channel = "invalid";
    values.message_channel = channel;
  }
  let number: string | null = existing?.message_number ?? null;
  if (has(input, "message_number")) {
    const value = optionalText(input.message_number);
    if (value === "invalid" || (value !== null && (value.length < 6 || value.length > 30))) errors.message_number = "invalid";
    else number = value;
    values.message_number = value === "invalid" ? null : value;
  }
  if (channel !== "none" && !number && !errors.message_number && !errors.message_channel) errors.message_number = "required";

  const hasLat = has(input, "latitude");
  const hasLng = has(input, "longitude");
  for (const [key, min, max] of [["latitude", -90, 90], ["longitude", -180, 180]] as const) {
    if (!has(input, key) || input[key] === null) continue;
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value)) errors[key] = "invalid";
    else if (value < min || value > max) errors[key] = "out_of_range";
    else values[key] = value;
  }
  const lat = hasLat ? (input.latitude ?? null) : null;
  const lng = hasLng ? (input.longitude ?? null) : null;
  if ((lat === null) !== (lng === null) && (creating || hasLat || hasLng)) {
    errors[lat === null ? "latitude" : "longitude"] = "required";
  }

  if (has(input, "logo_r2_key")) {
    const key = input.logo_r2_key;
    if (key === null) values.logo_r2_key = null;
    else if (typeof key !== "string" || creating || !key.startsWith(`p/${input.id}/`)) errors.logo_r2_key = "invalid";
    else values.logo_r2_key = key;
  }

  if (has(input, "featured")) {
    if (typeof input.featured === "boolean") values.featured = input.featured;
    else errors.featured = "invalid";
  }
  if (has(input, "paid_until")) {
    if (validDate(input.paid_until)) values.paid_until = input.paid_until;
    else errors.paid_until = "invalid";
  } else required("paid_until");

  let hours: PartnerHours[] | null = null;
  if (has(input, "hours")) {
    hours = validHours(input.hours);
    if (!hours) errors.hours = "invalid";
  }

  if (Object.keys(errors).length > 0) return fail("validation_failed", { fields: errors });

  if (typeof values.city_id === "string" && values.city_id !== existing?.city_id) {
    const city = await cityName(supabase, values.city_id);
    if (!city.ok) return city;
  }

  // ADR-11: both coordinates null → geocode the address.
  const shouldGeocode = lat === null && lng === null && (creating || (hasLat && hasLng));
  if (shouldGeocode) {
    const cityId = (values.city_id as string | undefined) ?? existing!.city_id;
    const city = await cityName(supabase, cityId);
    if (!city.ok) return city;
    const address = (values.address as string | undefined) ?? existing!.address;
    const result = await geocode({ address, city: city.data });
    if (!result.ok) return fail("geocoding_failed");
    values.latitude = result.data.latitude;
    values.longitude = result.data.longitude;
  }

  // Owner decision (Step 28): the logo object must exist in R2 (skipped when R2 is not configured locally).
  if (typeof values.logo_r2_key === "string" && r2Configured()) {
    try {
      const head = await r2().head(values.logo_r2_key);
      if (!head) return fail("validation_failed", { fields: { logo_r2_key: "not_uploaded" } });
    } catch (e) {
      return fail("internal_error", { message: e instanceof Error ? e.message : String(e) });
    }
  }

  const { data, error } = await service.rpc("save_partner", {
    p_id: creating ? (null as unknown as string) : input.id!,
    p_fields: values,
    p_hours: hours === null ? undefined : (hours as unknown as Json),
  });
  if (error) return { ok: false, error: fromRpcError(error) };

  const { logo_r2_key: logoKey, ...partner } = data as unknown as Partner & { logo_r2_key: string | null };
  let logoUrl: string | null = null;
  if (logoKey) {
    try {
      logoUrl = (await r2().presignGet(logoKey)).url;
    } catch {
      logoUrl = null;
    }
  }
  return ok({ ...partner, logo_url: logoUrl });
}

// EP-71 ------------------------------------------------------------------------------------------------

/** EP-71 set: app_settings.viber_enabled (BR-14b); the Operator only. */
export async function setAppSettings(input: SetAppSettingsInput): Promise<ActionResult<AppSettings>> {
  const supabase = await createClient();
  const operator = await requireOperator(supabase, "write");
  if (!operator.ok) return operator;
  if (typeof input?.viber_enabled !== "boolean") return fail("validation_failed", { fields: { viber_enabled: "required" } });

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("app_settings")
    .update({ viber_enabled: input.viber_enabled })
    .not("id", "is", null)
    .select("viber_enabled, updated_at")
    .single();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return ok({ viber_enabled: data.viber_enabled, whatsapp_monthly_cap: WHATSAPP_MONTHLY_CAP, updated_at: data.updated_at });
}

// EP-86 ------------------------------------------------------------------------------------------------

/** API §6 ModerationItem. */
export type ModerationItem = {
  report_id: string;
  target: "listing" | "user";
  reason: ReportReason;
  note: string | null;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
  handled_at: string | null;
  reporter: { user_id: string | null; display_name: string | null };
  listing: { id: string | null; title: string | null; status: "active" | "resolved" | "expired" | "hidden" | null };
  reported_user: { user_id: string | null; display_name: string | null; suspended_at: string | null };
  same_target_open_count: number;
};

/** API §6 Restriction. */
export type Restriction = {
  kind: "listing" | "user";
  listing_id: string | null;
  listing_title: string | null;
  user_id: string;
  user_display_name: string | null;
  restricted_at: string;
  reason: ReportReason | null;
};

export type ModerationView = "open_reports" | "restrictions";

/** EP-86 list Response. */
export type ModerationPage<V extends ModerationView = ModerationView> = {
  view: V;
  items: V extends "open_reports" ? ModerationItem[] : Restriction[];
  total: number;
  open_count: number;
  handled_this_month: number;
};

/** EP-86 moderate Request, discriminated by op. */
export type ModerateInput =
  | { op: "dismiss_report"; report_id: string }
  | { op: "hide_listing"; report_id: string; reason_note?: string | null }
  | { op: "suspend_user"; report_id: string; reason_note?: string | null }
  | { op: "restore_listing"; listing_id: string }
  | { op: "restore_user"; user_id: string };

export type ModerateResult = { report: ModerationItem | null; restriction: Restriction | null };

type DecidedReport = {
  item: ModerationItem;
  email:
    | { template: "listing_hidden"; to: string | null; locale: string | null; listing: string; reason: ReportReason }
    | { template: "marketplace_suspended"; to: string | null; locale: string | null; reason: ReportReason }
    | null;
};

/** EP-86 list — the Operator's session; RLS-style empty result for everyone else. */
export async function listModeration<V extends ModerationView>(input: {
  view: V;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<ModerationPage<V>>> {
  const supabase = await createClient();
  const operator = await requireOperator(supabase, "read");
  if (!operator.ok) return operator;
  const { data, error } = await supabase.rpc("admin_list_moderation", {
    p_view: input?.view,
    p_limit: input?.limit ?? 20,
    p_offset: input?.offset ?? 0,
  });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as ModerationPage<V>);
}

/** The author's email after hide / suspend; {reason} = reason_note or the report reason label (Design §9.1). */
async function sendModerationEmail(email: NonNullable<DecidedReport["email"]>, reasonNote: string | null) {
  if (!email.to) return;
  const locale = fromProfileLocale(email.locale);
  const reason = reasonNote || getDictionary(locale).sapa.common.reportReason[email.reason];
  const sent = await sendEmail({
    to: email.to,
    locale,
    template:
      email.template === "listing_hidden"
        ? { id: "listing_hidden", variables: { listing: email.listing, reason, url: `${siteUrl()}/sapa-pomoci/moje` } }
        : { id: "marketplace_suspended", variables: { reason } },
  });
  if (sent.status === "failed") console.error(`[admin] moderate ${email.template} email failed:`, sent.error);
}

/** EP-86 moderate: dismiss / hide / suspend a report's target, or restore a hidden listing or a suspended user. */
export async function moderate(input: ModerateInput): Promise<ActionResult<ModerateResult>> {
  const supabase = await createClient();
  const operator = await requireOperator(supabase, "write");
  if (!operator.ok) return operator;

  const op = input?.op;
  const service = createServiceRoleClient();

  if (op === "dismiss_report" || op === "hide_listing" || op === "suspend_user") {
    const fields: Record<string, string> = {};
    if (typeof input.report_id !== "string" || !UUID.test(input.report_id)) fields.report_id = "invalid";
    let reasonNote: string | null = null;
    if (op !== "dismiss_report") {
      const raw = input.reason_note;
      if (raw !== undefined && raw !== null && typeof raw !== "string") fields.reason_note = "invalid";
      else if (typeof raw === "string") {
        reasonNote = raw.trim() || null;
        if (reasonNote && reasonNote.length > 500) fields.reason_note = "too_long";
      }
    }
    if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

    const { data, error } = await service.rpc("admin_decide_report", {
      p_operator: operator.data.userId,
      p_report_id: input.report_id,
      p_op: op,
    });
    if (error) return { ok: false, error: fromRpcError(error) };
    const decided = data as unknown as DecidedReport;
    if (decided.email) await sendModerationEmail(decided.email, reasonNote);
    return ok({ report: decided.item, restriction: null });
  }

  if (op === "restore_listing") {
    if (typeof input.listing_id !== "string" || !UUID.test(input.listing_id)) {
      return fail("validation_failed", { fields: { listing_id: "invalid" } });
    }
    const before = await service.rpc("admin_get_restriction", { p_kind: "listing", p_id: input.listing_id });
    if (before.error) return { ok: false, error: fromRpcError(before.error) };
    const { error } = await service.rpc("admin_restore_listing", { p_id: input.listing_id });
    if (error) return { ok: false, error: fromRpcError(error) };
    return ok({ report: null, restriction: before.data as unknown as Restriction });
  }

  if (op === "restore_user") {
    if (typeof input.user_id !== "string" || !UUID.test(input.user_id)) {
      return fail("validation_failed", { fields: { user_id: "invalid" } });
    }
    const { data, error } = await service.rpc("admin_restore_user", { p_user_id: input.user_id });
    if (error) return { ok: false, error: fromRpcError(error) };
    return ok({ report: null, restriction: data as unknown as Restriction });
  }

  return fail("validation_failed", { fields: { op: "invalid" } });
}
