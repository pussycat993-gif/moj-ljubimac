"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkGates, type Caller } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import { r2, safeFileName } from "@/lib/integrations/r2";
import type { Pet } from "@/lib/actions/pets";

// EP-13 request_upload / confirm_upload (API §10). Step 13 handles purpose `pet_photo` only;
// `attachment` (Step 15), `listing_photo` (Step 28b) and `organisation_logo` (Step 24) follow.
// The upload_token is stateless: HMAC-SHA256 over purpose, target, r2_key, mime, size and
// expiry, signed with ACTION_TOKEN_SECRET (TC §8.1, the app's token signing key). No row is
// written until confirm.

/** API §6 UploadTicket. */
export type UploadTicket = {
  upload_token: string;
  put_url: string;
  method: "PUT";
  headers: { "Content-Type": string; "Content-Length": string };
  expires_at: string;
  file_name: string;
  position: number | null;
};

export type UploadRequest = {
  purpose: "attachment" | "pet_photo" | "organisation_logo" | "listing_photo";
  target_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

const MAX_BYTES = 10_485_760; // BR-05
const PET_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const TOKEN_PREFIX = "up_";
const TOKEN_TTL_MS = 10 * 60 * 1000;

type TokenPayload = { p: "pet_photo"; t: string; k: string; m: string; s: number; e: number };

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
  if (!secret) throw new Error("ACTION_TOKEN_SECRET is not set; upload tokens cannot be signed.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`upload:${data}`));
  return base64url(new Uint8Array(signature));
}

async function signToken(payload: TokenPayload): Promise<string> {
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${TOKEN_PREFIX}${body}.${await hmac(body)}`;
}

async function readToken(token: unknown): Promise<TokenPayload | null> {
  if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX)) return null;
  const [body, signature, extra] = token.slice(TOKEN_PREFIX.length).split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = await hmac(body);
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as TokenPayload;
    if (payload.p !== "pet_photo" || typeof payload.e !== "number" || payload.e < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type PhotoTarget = { id: string; owner_id: string | null; organisation_id: string | null; photo_r2_key: string | null };

/**
 * The pet a photo is for, as the caller may write it (EP-13 Authorization): owner or the
 * organisation's team ✅; a household member ❌ forbidden_role; no relation → not_found.
 */
async function photoTarget(supabase: Supabase, caller: Caller, petId: string): Promise<ActionResult<PhotoTarget>> {
  const { data, error } = await supabase
    .from("pets")
    .select("id, owner_id, organisation_id, photo_r2_key")
    .eq("id", petId)
    .maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");
  const ownPet = data.owner_id !== null && data.owner_id === caller.user.id;
  const organisationPet =
    data.organisation_id !== null && caller.organisations.some((o) => o.organisation_id === data.organisation_id);
  if (!ownPet && !organisationPet) return fail("forbidden_role");
  return ok(data);
}

/** API §10 step 6: u/<owner_id>/pets/<pet_id>/photo/… or o/<org_id>/pets/<pet_id>/photo/…. */
function petPhotoKey(pet: PhotoTarget, fileName: string): string {
  const prefix = pet.owner_id ? `u/${pet.owner_id}` : `o/${pet.organisation_id}`;
  return `${prefix}/pets/${pet.id}/photo/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

/** EP-13 request_upload — the presigned PUT for one file. */
export async function requestUpload(input: UploadRequest): Promise<ActionResult<UploadTicket>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  if (input?.purpose !== "pet_photo") fields.purpose = "invalid";
  if (typeof input?.target_id !== "string" || input.target_id === "") fields.target_id = "required";
  const fileName = typeof input?.file_name === "string" ? input.file_name.trim() : "";
  if (!fileName) fields.file_name = "required";
  else if (fileName.length > 200) fields.file_name = "too_long";
  if (!Number.isInteger(input?.size_bytes)) fields.size_bytes = "invalid";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  if (!PET_PHOTO_TYPES.includes(input.mime_type)) return fail("file_type_not_allowed");
  if (input.size_bytes > MAX_BYTES) return fail("file_too_large");
  if (input.size_bytes < 1) return fail("validation_failed", { fields: { size_bytes: "out_of_range" } });

  const target = await photoTarget(supabase, caller.data, input.target_id);
  if (!target.ok) return target;

  const key = petPhotoKey(target.data, fileName);
  const presigned = await r2().presignPut(key, { contentType: input.mime_type, contentLength: input.size_bytes });
  const upload_token = await signToken({
    p: "pet_photo",
    t: target.data.id,
    k: key,
    m: input.mime_type,
    s: input.size_bytes,
    e: Date.now() + TOKEN_TTL_MS,
  });

  return ok({
    upload_token,
    put_url: presigned.url,
    method: "PUT",
    headers: { "Content-Type": input.mime_type, "Content-Length": String(input.size_bytes) },
    expires_at: presigned.expires_at,
    file_name: fileName,
    position: null,
  });
}

/**
 * EP-13 confirm_upload — HEAD the object (size and type must match the ticket; a mismatch
 * deletes it), then set pets.photo_r2_key and queue the old key for the nightly R2 cleanup.
 */
export async function confirmUpload(input: { upload_token: string }): Promise<ActionResult<Pet>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const token = await readToken(input?.upload_token);
  if (!token) return fail("validation_failed", { fields: { upload_token: "invalid" } });

  const target = await photoTarget(supabase, caller.data, token.t);
  if (!target.ok) return target;

  const storage = r2();
  const head = await storage.head(token.k);
  if (!head) return fail("validation_failed", { fields: { upload_token: "not_uploaded" } });
  if (head.size !== token.s) {
    await storage.remove(token.k);
    return fail("file_too_large");
  }
  if ((head.content_type ?? "").split(";")[0].trim().toLowerCase() !== token.m) {
    await storage.remove(token.k);
    return fail("file_type_not_allowed");
  }

  const oldKey = target.data.photo_r2_key;
  const { data, error } = await supabase
    .from("pets")
    .update({ photo_r2_key: token.k })
    .eq("id", token.t)
    .select(
      "id, owner_id, organisation_id, name, species, species_other, breed, sex, birth_date, birth_year, " +
        "colour_markings, microchip_number, passport_number, neutered, photo_r2_key, vet_name, vet_phone, " +
        "weight_unit, note, lifecycle, shelter_status, offspring_status, breeding_status, litter_id, price_minor, " +
        "public_description, approx_age_text, created_at, updated_at",
    )
    .maybeSingle();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");

  // r2_deletion_queue has no client access (TC §5.7): the System queue write uses the service role.
  if (oldKey && oldKey !== token.k) {
    const { error: queueError } = await createServiceRoleClient()
      .from("r2_deletion_queue")
      .upsert({ r2_key: oldKey }, { onConflict: "r2_key", ignoreDuplicates: true });
    if (queueError) console.error("[uploads] queue old pet photo:", queueError.message);
  }

  const { photo_r2_key, price_minor, ...rest } = data as unknown as Omit<Pet, "has_photo" | "photo_file_name" | "price"> & {
    photo_r2_key: string | null;
    price_minor: number | null;
  };
  return ok({
    ...rest,
    has_photo: photo_r2_key !== null,
    photo_file_name: photo_r2_key ? (photo_r2_key.split("/").pop() ?? null) : null,
    price: price_minor === null ? null : { amount_minor: price_minor, currency: "RSD" },
  });
}
