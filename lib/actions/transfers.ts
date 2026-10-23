"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { withIdempotency } from "@/lib/server/idempotency";
import { hashToken, signActionToken } from "@/lib/server/action-tokens";
import { formatBelgradeDate } from "@/lib/server/dispatch";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { sendEmail } from "@/lib/integrations/resend";
import { r2, safeFileName } from "@/lib/integrations/r2";
import { fromProfileLocale } from "@/lib/i18n";
import type { City } from "@/lib/actions/registration";
import type { FileUrl } from "@/lib/actions/files";
import type { RecordTransfer } from "@/lib/actions/org-requests";

// Record transfers (Step 25, FR-50, FR-51): EP-59 sendRecordTransfer / resendRecordTransfer (S21 transfer Dialog;
// rpc:create_record_transfer / rpc:resend_record_transfer — Admins only, the earlier pending transfer expires, the
// animal becomes Adopted / Sold, the record_transfer email carries /poziv/<token>) and EP-60 getTransfer /
// acceptTransfer / declineTransfer (S14 /poziv/[token] for tr_ tokens). The tr_ token is signed per API §9.3
// (signActionToken("tr", [transfer_id], now + 30 days), BR-38) and only its SHA-256 hash is stored.
// Accept (owner decision): rpc:get_transfer_copy_plan (every check) → new ids and u/<owner>/pets/<new_pet>/… keys
// → R2 server-side copies → rpc:accept_record_transfer (one transaction); if the database step fails, the copied
// objects are deleted. The emails to the organisation's admins on accept / decline have no Design §9.1 template
// (CR-24) and are not sent.

/** API §6 TransferView. */
export type TransferView = {
  transfer_id: string;
  status: "pending" | "accepted" | "declined";
  expires_at: string;
  organisation: { name: string; city: City | null };
  animal: {
    name: string;
    sex: "male" | "female" | "unknown";
    species: string;
    species_other: string | null;
    breed: string | null;
    approx_age_text: string | null;
    birth_date: string | null;
    microchip_number: string | null;
    photo_url: FileUrl | null;
  };
  counts: { vaccinations: number; vet_visits: number; attachments: number };
  new_pet_id: string | null;
};

/** BR-38: valid 30 days (the stored expires_at is set by the database). */
const TRANSFER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRANSFER_TOKEN = /^tr_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** The "<uuid>-" prefix of an API §10 key's last segment. */
const KEY_UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** RPC errors carry their field code in DETAIL '<field>:<code>' (Step 15 convention). */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

function transferToken(token: unknown): string | null {
  return typeof token === "string" && token.length <= 1024 && TRANSFER_TOKEN.test(token) ? token : null;
}

type RawTransferView = Omit<TransferView, "animal"> & {
  animal: Omit<TransferView["animal"], "photo_url"> & { photo_url: null; photo_r2_key?: string | null };
};

/** animal.photo_r2_key (internal) → animal.photo_url, a presigned GET (API §10 step 5). */
async function withPhotoUrl(raw: RawTransferView): Promise<TransferView> {
  const { photo_r2_key: key, ...animal } = raw.animal;
  if (!key) return { ...raw, animal: { ...animal, photo_url: null } };
  try {
    const signed = await r2().presignGet(key);
    return {
      ...raw,
      animal: {
        ...animal,
        photo_url: { kind: "pet_photo", id: raw.transfer_id, url: signed.url, expires_at: signed.expires_at, mime_type: null },
      },
    };
  } catch (error) {
    console.error("[lib/actions/transfers] photo presign failed:", error instanceof Error ? error.message : error);
    return {
      ...raw,
      animal: { ...animal, photo_url: { kind: "pet_photo", id: raw.transfer_id, url: null, expires_at: null, mime_type: null } },
    };
  }
}

type CreateRpcResult = {
  transfer: RecordTransfer;
  organisation_name: string;
  pet_name: string;
  sender_locale: string | null;
  recipient_locale: string | null;
};

/** Creates the row through `rpc` with a fresh tr_ token and emails the link (Design §9.1 record_transfer). */
async function createAndSend(
  rpc: (
    id: string,
    tokenHash: string,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string; details?: string | null } | null }>,
): Promise<ActionResult<RecordTransfer>> {
  const transferId = crypto.randomUUID();
  const token = await signActionToken("tr", [transferId], new Date(Date.now() + TRANSFER_TTL_MS));
  const { data, error } = await rpc(transferId, await hashToken(token));
  if (error) return { ok: false, error: fromRpcError(error) };
  const created = data as unknown as CreateRpcResult;

  const locale = fromProfileLocale(created.recipient_locale ?? created.sender_locale);
  const sent = await sendEmail({
    to: created.transfer.recipient_email,
    locale,
    template: {
      id: "record_transfer",
      variables: {
        organisation: created.organisation_name,
        pet: created.pet_name,
        // The body ends with "{date}." and the sr-Latn date already ends with "." (22. 11. 2026.).
        date: formatBelgradeDate(created.transfer.expires_at, locale).replace(/\.$/, ""),
        url: `${siteUrl()}/poziv/${token}`,
      },
    },
  });
  if (sent.status === "failed") {
    console.error("[lib/actions/transfers] record_transfer email failed:", sent.error);
    return fail("internal_error", { message: `record_transfer email: ${sent.error}` });
  }
  return ok(created.transfer);
}

/**
 * EP-59 send — Admins only. Idempotent per `idempotency_key` for 24 h (API §3.3): a repeat returns the original
 * and sends nothing. The pet already handed over → 409 invitation_used.
 */
export async function sendRecordTransfer(input: {
  pet_id: string;
  recipient_email: string;
  idempotency_key: string;
}): Promise<ActionResult<RecordTransfer>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  const key = typeof input?.idempotency_key === "string" ? input.idempotency_key : "";
  if (!key) fields.idempotency_key = "required";
  else if (!UUID_V4.test(key)) fields.idempotency_key = "invalid";
  const email = typeof input?.recipient_email === "string" ? input.recipient_email.trim().toLowerCase() : "";
  if (!email) fields.recipient_email = "required";
  else if (!EMAIL.test(email) || email.length > 254) fields.recipient_email = "invalid";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });
  if (!UUID.test(String(input.pet_id))) return fail("not_found");

  const userId = caller.data.user.id;
  return withIdempotency(supabase, { userId, key, operation: "record_transfer" }, () =>
    createAndSend((id, tokenHash) =>
      supabase.rpc("create_record_transfer", {
        p_id: id,
        p_pet_id: input.pet_id,
        p_recipient_email: email,
        p_token_hash: tokenHash,
      }),
    ),
  );
}

/** EP-59 re-send — a new token for the same pet and address (BR-38); the earlier pending one expires. */
export async function resendRecordTransfer(input: {
  transfer_id: string;
  idempotency_key: string;
}): Promise<ActionResult<RecordTransfer>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const key = typeof input?.idempotency_key === "string" ? input.idempotency_key : "";
  if (!key || !UUID_V4.test(key)) {
    return fail("validation_failed", { fields: { idempotency_key: key ? "invalid" : "required" } });
  }
  if (!UUID.test(String(input?.transfer_id))) return fail("not_found");

  const userId = caller.data.user.id;
  return withIdempotency(supabase, { userId, key, operation: "record_transfer" }, () =>
    createAndSend((id, tokenHash) =>
      supabase.rpc("resend_record_transfer", {
        p_new_id: id,
        p_transfer_id: input.transfer_id,
        p_token_hash: tokenHash,
      }),
    ),
  );
}

/** EP-60 get — anyone holding the token, Visitor included. Unknown → 404; expired → 410 invitation_expired. */
export async function getTransfer(input: { token: string }): Promise<ActionResult<TransferView>> {
  const token = transferToken(input?.token);
  if (!token) return fail("not_found");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_transfer_by_token", { p_token_hash: await hashToken(token) });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(await withPhotoUrl(data as unknown as RawTransferView));
}

type CopyPlan = {
  transfer_id: string;
  owner_id: string;
  photo_r2_key: string | null;
  vet_visits: { id: string }[];
  attachments: { id: string; vet_visit_id: string; r2_key: string; file_name: string | null }[];
};

/** The original name in an API §10 key ("<uuid>-<safe_file_name>"), made safe again. */
function nameFromKey(key: string, fileName: string | null): string {
  const base = fileName ?? (key.split("/").pop() ?? "file").replace(KEY_UUID_PREFIX, "");
  return safeFileName(base) || "file";
}

/** FR-51 / E-20: premium_required:transfer_slot gets the pet in the Free slot (Me.usage.free_slot_pet). */
async function withSlotPet(supabase: Supabase, error: ApiError): Promise<ApiError> {
  if (error.code !== "premium_required" || error.details?.limit !== "transfer_slot") return error;
  const { data } = await supabase.rpc("get_me");
  const slot = (data as { usage?: { free_slot_pet?: { id: string; name: string } | null } } | null)?.usage?.free_slot_pet ?? null;
  return { ...error, details: { limit: "transfer_slot", slot_pet_id: slot?.id ?? null, slot_pet_name: slot?.name ?? null } };
}

/**
 * EP-60 accept — a signed-in owner account holding the token gets a full copy of the record (new pet, entries,
 * attachments and photo copied in R2 under u/<owner>/…). 401 without a session (S14 sign-in variant); shelter /
 * breeder accounts → 403 forbidden_role (BR-33); a Free slot taken → 403 premium_required (transfer_slot).
 */
export async function acceptTransfer(input: { token: string }): Promise<ActionResult<TransferView>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  const token = transferToken(input?.token);
  if (!token) return fail("not_found");
  const tokenHash = await hashToken(token);

  const { data: planData, error: planError } = await supabase.rpc("get_transfer_copy_plan", { p_token_hash: tokenHash });
  if (planError) return { ok: false, error: await withSlotPet(supabase, fromRpcError(planError)) };
  const plan = planData as unknown as CopyPlan;

  const newPetId = crypto.randomUUID();
  const prefix = `u/${plan.owner_id}/pets/${newPetId}`;
  const visitIds: Record<string, string> = {};
  for (const visit of plan.vet_visits) visitIds[visit.id] = crypto.randomUUID();
  const keyMap: Record<string, string> = {};
  if (plan.photo_r2_key) {
    keyMap[plan.photo_r2_key] = `${prefix}/photo/${crypto.randomUUID()}-${nameFromKey(plan.photo_r2_key, null)}`;
  }
  for (const attachment of plan.attachments) {
    const visit = visitIds[attachment.vet_visit_id];
    if (!visit) continue;
    keyMap[attachment.r2_key] =
      `${prefix}/visits/${visit}/${crypto.randomUUID()}-${nameFromKey(attachment.r2_key, attachment.file_name)}`;
  }

  const storage = r2();
  const copied: string[] = [];
  const cleanUp = () => Promise.all(copied.map((key) => storage.remove(key)));
  try {
    for (const [source, target] of Object.entries(keyMap)) {
      await storage.copy(source, target);
      copied.push(target);
    }
  } catch (error) {
    console.error("[lib/actions/transfers] R2 copy failed:", error instanceof Error ? error.message : error);
    await cleanUp();
    return fail("internal_error", { message: "record transfer: R2 copy failed" });
  }

  const { data, error } = await supabase.rpc("accept_record_transfer", {
    p_token_hash: tokenHash,
    p_new_pet_id: newPetId,
    p_visit_id_map: visitIds,
    p_key_map: keyMap,
  });
  if (error) {
    await cleanUp();
    return { ok: false, error: await withSlotPet(supabase, fromRpcError(error)) };
  }
  return ok(await withPhotoUrl(data as unknown as RawTransferView));
}

/** EP-60 decline — a signed-in user holding the token; the record stays with the organisation. */
export async function declineTransfer(input: { token: string }): Promise<ActionResult<TransferView>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  const token = transferToken(input?.token);
  if (!token) return fail("not_found");
  const { data, error } = await supabase.rpc("decline_record_transfer", { p_token_hash: await hashToken(token) });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(await withPhotoUrl(data as unknown as RawTransferView));
}
