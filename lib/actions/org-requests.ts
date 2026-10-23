"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { withIdempotency } from "@/lib/server/idempotency";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { sendEmail } from "@/lib/integrations/resend";
import { fromProfileLocale } from "@/lib/i18n";
import type { OrganisationAccess } from "@/lib/actions/organisation";

// S21 /organizacija/zahtevi and S23 (Step 26) — Step 25: EP-57 listOrgRequests (rpc:list_org_requests), EP-58
// decideRequest (rpc:decide_org_request: Admins only, BR-34; the animal is reserved on accept; email to the
// applicant in their language with the organisation's contacts on accept, BR-36) and EP-63 submitOrgRequest
// (rpc:submit_org_request: the pet must be listed on EP-62 right now; idempotent per key for 24 h, API §3.3;
// 5 per user per hour, API §11). Everything runs on the server because the session lives in httpOnly cookies.
// EP-63's notification to the organisation's admins has no Design §9.1 template (CR-24) and is not sent.

export type OrgRequestKind = "adoption_request" | "breeder_inquiry";
export type OrgRequestStatus = "pending" | "accepted" | "rejected";

/** API §6 RecordTransfer. */
export type RecordTransfer = {
  id: string;
  pet_id: string;
  status: "pending" | "accepted" | "declined" | "expired";
  recipient_email: string;
  sent_at: string;
  expires_at: string;
  is_expired: boolean;
  accepted_at: string | null;
};

/** API §6 AdoptionRequest / BreederInquiry (pet.price only on inquiries). */
export type OrgRequest = {
  id: string;
  status: OrgRequestStatus;
  requester_id: string;
  name: string;
  phone: string;
  email: string;
  message: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  pet: {
    pet_id: string;
    name: string;
    species: string;
    species_other: string | null;
    breed: string | null;
    sex: "male" | "female" | "unknown";
    approx_age_text: string | null;
    birth_date: string | null;
    birth_year: number | null;
    price?: { amount_minor: number; currency: "RSD" } | null;
  };
  transfer: RecordTransfer | null;
};

/** EP-57 Response. */
export type OrgRequestsPage = {
  kind: OrgRequestKind;
  items: OrgRequest[];
  total: number;
  status_counts: Record<OrgRequestStatus, number>;
  access: OrganisationAccess;
};

/** EP-63 Request. */
export type SubmitOrgRequestInput = {
  pet_id: string;
  name: string;
  phone: string;
  email: string;
  message?: string | null;
  idempotency_key: string;
};

/** EP-63 Response. */
export type SubmittedOrgRequest = { id: string; kind: OrgRequestKind; status: "pending"; created_at: string };

/** API §11: EP-63, 5 per user per hour. */
const REQUESTS_PER_HOUR = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** EP-57 — the organisation's adoption requests (shelter) or inquiries (breeder), newest first, offset pages. */
export async function listOrgRequests(
  input: { status?: OrgRequestStatus | null; limit?: number; offset?: number } = {},
): Promise<ActionResult<OrgRequestsPage>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  const { data, error } = await supabase.rpc("list_org_requests", {
    ...(input?.status ? { p_status: input.status } : {}),
    p_limit: input?.limit ?? 20,
    p_offset: input?.offset ?? 0,
  });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as OrgRequestsPage);
}

type DecideRpcResult = {
  request: OrgRequest;
  applicant_locale: string | null;
  organisation: { name: string; slug: string; phone: string | null; email: string | null };
};

/**
 * EP-58 — accept or reject (Admins only). Accept → the animal is Reserved (+ pet_status_history); both send the
 * applicant the Design §9.1 email in their profiles.locale. The decision stands even if the email fails (logged).
 */
export async function decideRequest(input: {
  kind: OrgRequestKind;
  id: string;
  decision: "accept" | "reject";
}): Promise<ActionResult<OrgRequest>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  if (input?.kind !== "adoption_request" && input?.kind !== "breeder_inquiry") fields.kind = "invalid";
  if (input?.decision !== "accept" && input?.decision !== "reject") fields.decision = "invalid";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });
  if (!UUID.test(String(input.id))) return fail("not_found");

  const { data, error } = await supabase.rpc("decide_org_request", {
    p_kind: input.kind,
    p_id: input.id,
    p_decision: input.decision,
  });
  if (error) return { ok: false, error: fromRpcError(error) };
  const decided = data as unknown as DecideRpcResult;
  const request = decided.request;
  const organisation = decided.organisation;
  const locale = fromProfileLocale(decided.applicant_locale);
  const accepted = input.decision === "accept";

  const sent = await sendEmail({
    to: request.email,
    locale,
    template: accepted
      ? {
          id: input.kind === "adoption_request" ? "adoption_request_accepted" : "breeder_inquiry_accepted",
          variables: {
            organisation: organisation.name,
            pet: request.pet.name,
            org_phone: organisation.phone ?? "—",
            org_email: organisation.email ?? "—",
          },
        }
      : {
          id: input.kind === "adoption_request" ? "adoption_request_rejected" : "breeder_inquiry_rejected",
          variables: { organisation: organisation.name, pet: request.pet.name, url: `${siteUrl()}/o/${organisation.slug}` },
        },
  });
  if (sent.status === "failed") console.error("[lib/actions/org-requests] decision email failed:", sent.error);
  return ok(request);
}

/** EP-63 Request checks with field codes (the database checks them again). */
function validateSubmit(input: SubmitOrgRequestInput): Record<string, string> {
  const fields: Record<string, string> = {};
  const key = typeof input?.idempotency_key === "string" ? input.idempotency_key : "";
  if (!key) fields.idempotency_key = "required";
  else if (!UUID_V4.test(key)) fields.idempotency_key = "invalid";
  const name = trimmed(input?.name);
  if (!name) fields.name = "required";
  else if (name.length > 120) fields.name = "too_long";
  const phone = trimmed(input?.phone);
  if (!phone) fields.phone = "required";
  else if (phone.length < 6 || phone.length > 30) fields.phone = "invalid";
  const email = trimmed(input?.email);
  if (!email) fields.email = "required";
  else if (!EMAIL.test(email) || email.length > 254) fields.email = "invalid";
  if (trimmed(input?.message).length > 2000) fields.message = "too_long";
  return fields;
}

/**
 * EP-63 — a signed-in user asks to adopt (shelter animal) or sends an inquiry (breeder offspring). A Visitor →
 * 401 unauthenticated (S23 shows the sign-in prompt, E-17). A repeat with the same key within 24 h returns the
 * original row; the 6th new request within an hour → 429 rate_limited (details.retry_after_s).
 */
export async function submitOrgRequest(input: SubmitOrgRequestInput): Promise<ActionResult<SubmittedOrgRequest>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const fields = validateSubmit(input);
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });
  if (!UUID.test(String(input.pet_id))) return fail("not_found");

  const userId = caller.data.user.id;
  return withIdempotency(supabase, { userId, key: input.idempotency_key, operation: "org_request" }, async () => {
    const limited = await checkRateLimit(supabase, {
      userId,
      operation: "org_requests.create",
      limit: REQUESTS_PER_HOUR,
      windowSeconds: 60 * 60,
    });
    if (limited) return { ok: false, error: limited };

    const message = trimmed(input.message);
    const { data, error } = await supabase.rpc("submit_org_request", {
      p_pet_id: input.pet_id,
      p_name: trimmed(input.name),
      p_phone: trimmed(input.phone),
      p_email: trimmed(input.email).toLowerCase(),
      p_message: (message || null) as string,
    });
    if (error) return { ok: false, error: fromRpcError(error) };
    return ok(data as unknown as SubmittedOrgRequest);
  });
}
