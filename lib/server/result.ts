import "server-only";

/** API §7.1 envelope. `message` is English, for logs only — never rendered. */
export type ApiError = {
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
};

/** API §3.6: server actions return this instead of throwing. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** API §7.2 error-code catalog. */
export const ERROR_CODES = [
  "unauthenticated",
  "email_not_verified",
  "account_pending_deletion",
  "organisation_pending_approval",
  "not_found",
  "forbidden_role",
  "household_read_only",
  "premium_required",
  "breeder_plan_required",
  "validation_failed",
  "file_too_large",
  "file_type_not_allowed",
  "too_many_photos",
  "household_full",
  "team_full",
  "featured_limit_reached",
  "already_member",
  "invitation_expired",
  "invitation_used",
  "whatsapp_cap_reached",
  "whatsapp_not_connected",
  "verification_code_invalid",
  "channel_disabled",
  "trial_already_used",
  "subscription_not_active",
  "payment_provider_unavailable",
  "subscription_already_active",
  "already_decided",
  "listing_type_not_allowed",
  "category_not_allowed",
  "listing_not_active",
  "cannot_message_self",
  "user_blocked",
  "marketplace_suspended",
  "export_in_progress",
  "rate_limited",
  "invalid_action_token",
  "invalid_signature",
  "geocoding_failed",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const CATALOG = new Set<string>(ERROR_CODES);

/** The `details` key a code puts its `'<code>:<detail>'` detail under (API §7.1). */
const DETAIL_KEYS: Partial<Record<ErrorCode, string>> = {
  premium_required: "limit",
  whatsapp_not_connected: "channel",
};

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: ErrorCode,
  extra: { message?: string; fields?: Record<string, string>; details?: Record<string, unknown> } = {},
): ActionResult<T> {
  return { ok: false, error: apiError(code, extra) };
}

export function apiError(
  code: ErrorCode,
  extra: { message?: string; fields?: Record<string, string>; details?: Record<string, unknown> } = {},
): ApiError {
  const error: ApiError = { code, message: extra.message ?? code };
  if (extra.fields) error.fields = extra.fields;
  if (extra.details) error.details = extra.details;
  return error;
}

function internal(original: string): ApiError {
  console.error("[lib/server] unmapped error:", original);
  return apiError("internal_error", { message: original });
}

/**
 * Database error → ApiError (TC §5.7.1, API §7.1). Triggers and RPC functions raise
 * ERRCODE P0001 with MESSAGE '<code>' or '<code>:<detail>'; anything else, and any
 * code outside the §7.2 catalog, is internal_error with the original message logged.
 */
export function fromDatabaseError(error: { code?: string; message: string }): ApiError {
  // API v1.3 §7.1: the BR-54 check on listings.category (medicine and care only for needs).
  if (error.code === "23514" && error.message.includes("listings_category_check")) {
    return apiError("category_not_allowed", { message: error.message });
  }
  if (error.code !== undefined && error.code !== "P0001") return internal(error.message);
  const separator = error.message.indexOf(":");
  const code = separator === -1 ? error.message : error.message.slice(0, separator);
  if (!CATALOG.has(code)) return internal(error.message);
  const detailKey = DETAIL_KEYS[code as ErrorCode];
  if (separator !== -1 && detailKey) {
    return apiError(code as ErrorCode, {
      message: error.message,
      details: { [detailKey]: error.message.slice(separator + 1) },
    });
  }
  return apiError(code as ErrorCode, { message: error.message });
}

/**
 * Supabase Auth error → ApiError (API EP-41, EP-42): wrong credentials → 401
 * unauthenticated (reason invalid_credentials); unconfirmed email → 403
 * email_not_verified; auth rate limits → 429 rate_limited; weak password → 422
 * validation_failed (fields.password = too_weak); no session → unauthenticated.
 */
export function fromAuthError(error: { code?: string; status?: number; message: string; name?: string }): ApiError {
  switch (error.code) {
    case "invalid_credentials":
      return apiError("unauthenticated", { message: error.message, details: { reason: "invalid_credentials" } });
    case "email_not_confirmed":
      return apiError("email_not_verified", { message: error.message });
    case "weak_password":
      return apiError("validation_failed", { message: error.message, fields: { password: "too_weak" } });
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return apiError("unauthenticated", { message: error.message });
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return apiError("rate_limited", { message: error.message });
  }
  if (error.status === 429) return apiError("rate_limited", { message: error.message });
  if (error.name === "AuthSessionMissingError") return apiError("unauthenticated", { message: error.message });
  return internal(error.message);
}

/** HTTP status for a route handler's ApiError body (API §7.2). */
export function httpStatus(code: string): number {
  switch (code) {
    case "unauthenticated":
    case "invalid_signature":
      return 401;
    case "email_not_verified":
    case "account_pending_deletion":
    case "organisation_pending_approval":
    case "forbidden_role":
    case "household_read_only":
    case "premium_required":
    case "breeder_plan_required":
    case "listing_type_not_allowed":
    case "user_blocked":
    case "marketplace_suspended":
      return 403;
    case "not_found":
      return 404;
    case "validation_failed":
    case "file_too_large":
    case "file_type_not_allowed":
    case "too_many_photos":
    case "verification_code_invalid":
    case "category_not_allowed":
      return 422;
    case "invitation_expired":
      return 410;
    case "rate_limited":
      return 429;
    case "invalid_action_token":
      return 400;
    case "geocoding_failed":
      return 502;
    case "payment_provider_unavailable":
      return 503;
    case "internal_error":
      return 500;
    default:
      return 409;
  }
}
