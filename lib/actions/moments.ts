"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { r2, safeFileName } from "@/lib/integrations/r2";
import type { Access } from "@/lib/actions/pets";
import type { UploadTicket } from "@/lib/actions/uploads";

// Moments (FR-17, FR-19): EP-20 list_moments (view:moments_api), EP-21 prepare_moment /
// confirm_moment, EP-22 delete_moment, EP-23 set_moment_public_link. The database enforces the rules
// (RLS on moments / moment_photos / moment_public_links; care_check_write: a member writes only own
// moments → forbidden_role, read-only household → household_read_only; the Free-limit trigger →
// premium_required:moments, BR-01 / BR-24; rpc:confirm_moment repeats the EP-21 Request rules).
//
// EP-21 (owner decision 2026-10-23, option A): prepare_moment checks the request, the pet and the
// Free limit, chooses the moment id, builds one R2 key per photo under
// u/<owner_id>/pets/<pet_id>/moments/<moment_id>/<position>-<uuid>-<safe_file_name> (API §10 item 6),
// presigns the PUTs and signs a stateless draft token — no row is written. The draft token is an
// HMAC-SHA256 over the moment id, pet, date, text, keys and expiry, signed with ACTION_TOKEN_SECRET;
// it is valid 10 minutes. Each ticket's upload_token carries the same draft token. confirm_moment
// verifies the token, HEADs every object (size and type must match; a mismatch deletes it) and calls
// rpc:confirm_moment, which inserts the moment with that id and its photos in one transaction.
// EP-22 deletes the moment row: the cascade removes its photos and public link (BR-45) and the
// moment_photos trigger queues the R2 keys for the nightly cleanup. EP-23 inserts the link with a
// 128-bit base62 22-char slug on first use, later calls update `active` and keep the slug. Public
// pages are not cached (TC ADR-18), so nothing is purged.

/** API §6 MomentPhoto. */
export type MomentPhoto = { id: string; moment_id: string; position: number };

/** EP-23 response, API §6 Moment.public_link. */
export type MomentPublicLink = { slug: string; active: boolean; url: string };

/** API §6 Moment. */
export type Moment = {
  id: string;
  pet_id: string;
  moment_date: string;
  text: string | null;
  photos: MomentPhoto[];
  photo_count: number;
  public_link: MomentPublicLink | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  access: Access;
};

/** EP-20 response. */
export type MomentsPage = { items: Moment[]; total: number };

export type MomentPhotoInput = { file_name: string; mime_type: string; size_bytes: number };

/** EP-21 step 1 request. */
export type PrepareMomentInput = {
  pet_id: string;
  moment_date: string;
  text?: string | null;
  photos?: MomentPhotoInput[];
};

/** EP-21 step 1 response. */
export type PreparedMoment = { draft_token: string; tickets: UploadTicket[] };

const MAX_PHOTOS = 5; // BR-06
const MAX_TEXT = 280; // BR-52
const MAX_BYTES = 10_485_760; // BR-05
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const FREE_MOMENTS_PER_PET = 5; // BR-01
const TOKEN_PREFIX = "md_";
const TOKEN_TTL_MS = 10 * 60 * 1000;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** i moment id, p pet, d date, x text, k photos (k key, n position, m mime, s size), e expiry. */
type DraftPayload = {
  i: string;
  p: string;
  d: string;
  x: string | null;
  k: { k: string; n: number; m: string; s: number }[];
  e: number;
};

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.ACTION_TOKEN_SECRET;
  if (!secret) throw new Error("ACTION_TOKEN_SECRET is not set; moment draft tokens cannot be signed.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`moment:${data}`));
  return base64url(new Uint8Array(signature));
}

async function signDraft(payload: DraftPayload): Promise<string> {
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${TOKEN_PREFIX}${body}.${await hmac(body)}`;
}

async function readDraft(token: unknown): Promise<DraftPayload | null> {
  if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX)) return null;
  const [body, signature, extra] = token.slice(TOKEN_PREFIX.length).split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = await hmac(body);
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as DraftPayload;
    if (typeof payload.e !== "number" || payload.e < Date.now() || !Array.isArray(payload.k)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** EP-23: 128 random bits as base62, left-padded to 22 characters. */
function randomSlug(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const [zero, eight, base] = [BigInt(0), BigInt(8), BigInt(62)];
  let value = zero;
  for (const byte of bytes) value = (value << eight) | BigInt(byte);
  let slug = "";
  while (value > zero) {
    slug = BASE62[Number(value % base)] + slug;
    value /= base;
  }
  return slug.padStart(22, "0");
}

/** NEXT_PUBLIC_SITE_URL + "/t/" + slug (owner decision, Step 21). */
function publicUrl(slug: string): string {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")}/t/${slug}`;
}

function withSiteUrl(moment: Moment): Moment {
  return moment.public_link ? { ...moment, public_link: { ...moment.public_link, url: publicUrl(moment.public_link.slug) } } : moment;
}

/** Today in Europe/Belgrade as YYYY-MM-DD. */
function todayInBelgrade(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date());
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A database error with its `p_<field>:<code>` DETAIL moved into `fields` (API §7.1). */
function mapRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field.replace(/^p_/, "")]: code };
  }
  return mapped;
}

/** EP-20 — one page of a pet's moments, newest first, with the total for the Free counter. */
export async function listMoments(input: { pet_id: string; limit?: number; offset?: number }): Promise<ActionResult<MomentsPage>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const limit = input?.limit ?? 20;
  const offset = input?.offset ?? 0;
  if (typeof input?.pet_id !== "string" || input.pet_id === "") return fail("validation_failed", { fields: { pet_id: "required" } });
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail("validation_failed", { fields: { limit: "out_of_range" } });
  if (!Number.isInteger(offset) || offset < 0) return fail("validation_failed", { fields: { offset: "out_of_range" } });

  const { data, error, count } = await supabase
    .from("moments_api")
    .select("*", { count: "exact" })
    .eq("pet_id", input.pet_id)
    .order("moment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return ok({ items: ((data ?? []) as unknown as Moment[]).map(withSiteUrl), total: count ?? 0 });
}

/** EP-21 step 1 — check the moment, then hand out the moment id, the photo tickets and the draft token. */
export async function prepareMoment(input: PrepareMomentInput): Promise<ActionResult<PreparedMoment>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const photos = input?.photos ?? [];
  if (!Array.isArray(photos)) return fail("validation_failed", { fields: { photos: "invalid" } });
  if (photos.length > MAX_PHOTOS) return fail("too_many_photos");

  const fields: Record<string, string> = {};
  if (typeof input?.pet_id !== "string" || input.pet_id === "") fields.pet_id = "required";
  if (input?.moment_date === undefined || input.moment_date === null || input.moment_date === "") fields.moment_date = "required";
  else if (!validDate(input.moment_date)) fields.moment_date = "invalid";
  else if (input.moment_date > todayInBelgrade()) fields.moment_date = "out_of_range";
  if (input?.text !== undefined && input.text !== null && typeof input.text !== "string") fields.text = "invalid";
  const text = typeof input?.text === "string" ? input.text.trim() : "";
  if (text.length > MAX_TEXT) fields.text = "too_long";
  if (!text && photos.length === 0 && !fields.text) fields.text = "required";
  const names = photos.map((photo) => (typeof photo?.file_name === "string" ? photo.file_name.trim() : ""));
  if (names.some((name) => !name || name.length > 200) || photos.some((photo) => !Number.isInteger(photo?.size_bytes))) {
    fields.photos = "invalid";
  }
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  if (photos.some((photo) => !PHOTO_TYPES.includes(photo.mime_type))) return fail("file_type_not_allowed");
  if (photos.some((photo) => photo.size_bytes > MAX_BYTES)) return fail("file_too_large");
  if (photos.some((photo) => photo.size_bytes < 1)) return fail("validation_failed", { fields: { photos: "out_of_range" } });

  // The pet as the caller sees it (RLS): moments belong to personally owned pets; organisation roles
  // have no relation (404). A member of a read-only household may not add (BR-28).
  const [pet, summary] = await Promise.all([
    supabase.from("pets").select("id, owner_id, lifecycle").eq("id", input.pet_id).maybeSingle(),
    supabase.from("pet_summaries_api").select("id, can_log, access").eq("id", input.pet_id).maybeSingle(),
  ]);
  if (pet.error) return { ok: false, error: fromDatabaseError(pet.error) };
  if (summary.error) return { ok: false, error: fromDatabaseError(summary.error) };
  const role = (summary.data?.access as Access | undefined)?.role;
  if (!pet.data || !pet.data.owner_id || (role !== "owner" && role !== "member")) return fail("not_found");
  if (pet.data.lifecycle !== "active") return fail("validation_failed", { fields: { pet_id: "invalid_state" } });
  if (role === "member" && !summary.data?.can_log) return fail("household_read_only");

  // BR-01 / BR-24 at step 1: the creator's own entitlement decides (the insert trigger checks again).
  const { data: premium, error: premiumError } = await supabase.rpc("is_premium", { user_id: caller.data.user.id });
  if (premiumError) return { ok: false, error: fromDatabaseError(premiumError) };
  if (!premium) {
    const { count, error } = await supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("pet_id", pet.data.id);
    if (error) return { ok: false, error: fromDatabaseError(error) };
    if ((count ?? 0) >= FREE_MOMENTS_PER_PET) return fail("premium_required", { details: { limit: "moments" } });
  }

  const momentId = crypto.randomUUID();
  const prefix = `u/${pet.data.owner_id}/pets/${pet.data.id}/moments/${momentId}`;
  const storage = photos.length > 0 ? r2() : null;
  const keys = photos.map((photo, index) => ({
    k: `${prefix}/${index + 1}-${crypto.randomUUID()}-${safeFileName(names[index])}`,
    n: index + 1,
    m: photo.mime_type,
    s: photo.size_bytes,
  }));
  const draft_token = await signDraft({
    i: momentId,
    p: pet.data.id,
    d: input.moment_date,
    x: text || null,
    k: keys,
    e: Date.now() + TOKEN_TTL_MS,
  });
  const tickets = await Promise.all(
    keys.map(async (key, index): Promise<UploadTicket> => {
      const presigned = await storage!.presignPut(key.k, { contentType: key.m, contentLength: key.s });
      return {
        upload_token: draft_token,
        put_url: presigned.url,
        method: "PUT",
        headers: { "Content-Type": key.m, "Content-Length": String(key.s) },
        expires_at: presigned.expires_at,
        file_name: names[index],
        position: key.n,
      };
    }),
  );
  return ok({ draft_token, tickets });
}

/** EP-21 step 3 — verify the uploads, then insert the moment and its photos in one transaction. */
export async function confirmMoment(input: { draft_token: string }): Promise<ActionResult<Moment>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const draft = await readDraft(input?.draft_token);
  if (!draft) return fail("validation_failed", { fields: { draft_token: "invalid" } });

  const storage = draft.k.length > 0 ? r2() : null;
  const heads = await Promise.all(draft.k.map((photo) => storage!.head(photo.k)));
  if (heads.some((head) => !head)) return fail("validation_failed", { fields: { draft_token: "not_uploaded" } });
  for (const [index, photo] of draft.k.entries()) {
    const head = heads[index]!;
    if (head.size !== photo.s) {
      await storage!.remove(photo.k);
      return fail("file_too_large");
    }
    if ((head.content_type ?? "").split(";")[0].trim().toLowerCase() !== photo.m.toLowerCase()) {
      await storage!.remove(photo.k);
      return fail("file_type_not_allowed");
    }
  }

  const { data, error } = await supabase.rpc("confirm_moment", {
    p_moment_id: draft.i,
    p_pet_id: draft.p,
    p_moment_date: draft.d,
    p_text: draft.x as string,
    p_photos: draft.k.map((photo) => ({ r2_key: photo.k, position: photo.n })),
  });
  if (error) {
    // RLS rejects a pet the caller has no relation to (API §4.3: not revealed).
    if (error.code === "42501") return fail("not_found");
    // The moment id is already taken: this draft was confirmed before.
    if (error.code === "23505") return fail("validation_failed", { fields: { draft_token: "invalid" } });
    return { ok: false, error: mapRpcError(error) };
  }
  if (!data) return fail("not_found");
  return ok(withSiteUrl(data as unknown as Moment));
}

/** EP-22 — delete a moment; its photos and public link go with it and the R2 keys are queued. */
export async function deleteMoment(input: { moment_id: string }): Promise<ActionResult<{ deleted_moment_id: string }>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  if (typeof input?.moment_id !== "string" || input.moment_id === "") {
    return fail("validation_failed", { fields: { moment_id: "required" } });
  }
  const { data, error } = await supabase.from("moments").delete().eq("id", input.moment_id).select("id");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data || data.length === 0) return fail("not_found");
  return ok({ deleted_moment_id: data[0].id });
}

/** EP-23 — enable or disable a moment's public link (the slug is created on first use and kept). */
export async function setMomentPublicLink(input: { moment_id: string; active: boolean }): Promise<ActionResult<MomentPublicLink>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  if (typeof input?.moment_id !== "string" || input.moment_id === "") fields.moment_id = "required";
  if (typeof input?.active !== "boolean") fields.active = "required";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const moment = await supabase.from("moments").select("id").eq("id", input.moment_id).maybeSingle();
  if (moment.error) return { ok: false, error: fromDatabaseError(moment.error) };
  if (!moment.data) return fail("not_found");

  const existing = await supabase
    .from("moment_public_links")
    .select("slug, active")
    .eq("moment_id", input.moment_id)
    .maybeSingle();
  if (existing.error) return { ok: false, error: fromDatabaseError(existing.error) };

  if (existing.data) {
    // Always written, so care_check_write answers for a member on someone else's moment.
    const { data, error } = await supabase
      .from("moment_public_links")
      .update({ active: input.active })
      .eq("moment_id", input.moment_id)
      .select("slug, active");
    if (error) return { ok: false, error: fromDatabaseError(error) };
    if (!data || data.length === 0) return fail("not_found");
    return ok({ slug: data[0].slug, active: data[0].active, url: publicUrl(data[0].slug) });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from("moment_public_links")
      .insert({ moment_id: input.moment_id, slug: randomSlug(), active: input.active })
      .select("slug, active")
      .single();
    if (!error) return ok({ slug: data.slug, active: data.active, url: publicUrl(data.slug) });
    // A slug collision (practically never with 128 bits) tries a new slug.
    if (error.code === "23505" && error.message.includes("slug")) continue;
    if (error.code === "42501") return fail("not_found");
    return { ok: false, error: fromDatabaseError(error) };
  }
  return fail("internal_error");
}
