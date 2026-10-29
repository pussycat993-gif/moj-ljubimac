import "server-only";

// Paddle Billing adapter — TC ADR-09 (v1.8), ADR-17 (fetch only, no Paddle Node SDK), API §5.6 "Payment
// provider", EP-46 and §9.2 / §9.4. Server only.
//   - A fetch client for https://api.paddle.com (https://sandbox-api.paddle.com unless NEXT_PUBLIC_PADDLE_ENV is
//     exactly "production") with Authorization: Bearer PADDLE_API_KEY: cancel at period end / immediately
//     (EP-48, EP-51, EP-52, duplicate purchase in EP-46), resume renewal (EP-48, EP-51), read a subscription
//     (EP-49 reconciliation) and the customer portal session (EP-89). No retry inside a request (API §9.4).
//   - verifyPaddleSignature: Paddle-Signature "ts=<unix>;h1=<hex>" — HMAC-SHA256(secret, "<ts>:<raw body>") as
//     lowercase hex, compared in constant time with each h1 (any may match during secret rotation), and
//     |now − ts| ≤ 300 s. An empty secret never verifies.
//   - mapPaddleEvent / mapPaddleSubscription: the Paddle envelope → the neutral event of EP-46 that the database
//     function apply_payment_event applies.
// Env vars are read at call time. With PADDLE_API_KEY empty (local mode) no call is made: paddleConfigured() is
// false and every call throws PaddleError("not_configured").

export const PADDLE_API_URL = "https://api.paddle.com";
export const PADDLE_SANDBOX_API_URL = "https://sandbox-api.paddle.com";
/** EP-46: replay window of 5 minutes. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type PaddleEnvironment = "sandbox" | "production";

export class PaddleError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "PaddleError";
  }
}

/** "production" only when NEXT_PUBLIC_PADDLE_ENV is exactly "production", else "sandbox". */
export function paddleEnvironment(): PaddleEnvironment {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
}

export function paddleApiUrl(): string {
  return paddleEnvironment() === "production" ? PADDLE_API_URL : PADDLE_SANDBOX_API_URL;
}

/** False in local mode (PADDLE_API_KEY empty): no Paddle call is made. */
export function paddleConfigured(): boolean {
  return (process.env.PADDLE_API_KEY ?? "") !== "";
}

async function call(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<Record<string, unknown>> {
  const key = process.env.PADDLE_API_KEY ?? "";
  if (!key) throw new PaddleError("not_configured");
  let response: Response;
  try {
    response = await fetch(`${paddleApiUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new PaddleError(`network: ${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    const error = json.error as { code?: string; detail?: string } | undefined;
    throw new PaddleError(`${method} ${path}: ${response.status} ${error?.code ?? ""} ${error?.detail ?? ""}`.trim(), response.status);
  }
  return json;
}

/** POST /subscriptions/{id}/cancel — at period end (EP-48, EP-51) or immediately (EP-52, duplicate purchase). */
export async function cancelSubscription(id: string, effectiveFrom: "next_billing_period" | "immediately"): Promise<void> {
  await call("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { effective_from: effectiveFrom });
}

/** PATCH /subscriptions/{id} { scheduled_change: null } — removes a scheduled cancellation (EP-48, EP-51). */
export async function resumeSubscription(id: string): Promise<void> {
  await call("PATCH", `/subscriptions/${encodeURIComponent(id)}`, { scheduled_change: null });
}

/** GET /subscriptions/{id} — the Paddle subscription entity (EP-49 reconciliation). */
export async function getSubscription(id: string): Promise<PaddleSubscription> {
  const json = await call("GET", `/subscriptions/${encodeURIComponent(id)}`);
  const data = json.data as PaddleSubscription | undefined;
  if (!data || typeof data !== "object") throw new PaddleError(`GET /subscriptions/${id}: no data`);
  return data;
}

/** POST /customers/{id}/portal-sessions → data.urls.general.overview (EP-89; short-lived, never stored). */
export async function createPortalSession(customerId: string, subscriptionId: string | null): Promise<string> {
  const json = await call("POST", `/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
    subscription_ids: subscriptionId ? [subscriptionId] : [],
  });
  const url = (json.data as { urls?: { general?: { overview?: unknown } } } | undefined)?.urls?.general?.overview;
  if (typeof url !== "string" || !url) throw new PaddleError("portal session without urls.general.overview");
  return url;
}

// Signature ------------------------------------------------------------------------------------------------------

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison: the time does not depend on where the strings differ. */
function constantTimeEqual(given: string, expected: string): boolean {
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/** "ts=<unix>;h1=<hex>[;h1=<hex>…]" → { ts, h1[] }, or null when malformed. */
export function parseSignatureHeader(header: string | null | undefined): { ts: number; h1: string[] } | null {
  if (!header) return null;
  let ts: number | null = null;
  const h1: string[] = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) return null;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === "ts") {
      if (!/^\d+$/.test(value) || ts !== null) return null;
      ts = Number(value);
    } else if (name === "h1") {
      if (!/^[0-9a-fA-F]+$/.test(value)) return null;
      h1.push(value.toLowerCase());
    }
  }
  if (ts === null || h1.length === 0) return null;
  return { ts, h1 };
}

/**
 * EP-46: true when one h1 equals HMAC-SHA256(secret, "<ts>:<raw body>") and |now − ts| ≤ 300 s. A missing or
 * malformed header, no matching h1, a stale ts or an empty secret → false.
 */
export async function verifyPaddleSignature(
  header: string | null | undefined,
  rawBody: string | Uint8Array,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(nowSeconds - parsed.ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const body = typeof rawBody === "string" ? encoder.encode(rawBody) : rawBody;
  const prefix = encoder.encode(`${parsed.ts}:`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix, 0);
  message.set(body, prefix.length);

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const expected = toHex(await crypto.subtle.sign("HMAC", key, message));
  let match = false;
  for (const candidate of parsed.h1) {
    if (constantTimeEqual(candidate, expected)) match = true;
  }
  return match;
}

// Event mapping ----------------------------------------------------------------------------------------------------

/** The Paddle subscription entity fields EP-46 reads. */
export type PaddleSubscription = {
  id?: string;
  status?: string;
  customer_id?: string;
  custom_data?: { user_id?: string; plan?: string } | null;
  items?: { price?: { id?: string }; trial_dates?: { ends_at?: string | null } | null }[];
  current_billing_period?: { ends_at?: string | null } | null;
  scheduled_change?: { action?: string } | null;
  canceled_at?: string | null;
  paused_at?: string | null;
  updated_at?: string;
};

/** The Paddle transaction entity fields EP-46 reads. */
export type PaddleTransaction = {
  id?: string;
  subscription_id?: string | null;
  origin?: string;
  currency_code?: string;
  details?: { totals?: { grand_total?: string } };
  payments?: { method_details?: { type?: string; card?: { type?: string; last4?: string } | null } | null }[];
};

export type SubscriptionEvent = {
  event_id: string | null;
  type: "subscription";
  occurred_at: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  provider_status: string | null;
  user_id: string | null;
  plan: string | null;
  price_id: string | null;
  period_ends_at: string | null;
  trial_ends_at: string | null;
  cancel_scheduled: boolean;
  ended_at: string;
};

export type PaymentEvent = {
  event_id: string | null;
  type: "payment_succeeded" | "payment_failed";
  occurred_at: string;
  provider_transaction_id: string | null;
  provider_subscription_id: string | null;
  kind: "initial" | "renewal";
  amount_minor: number | null;
  currency: string | null;
  card_brand: string | null;
  card_last4: string | null;
};

export type NeutralEvent = SubscriptionEvent | PaymentEvent;

export type MappedEvent =
  | { kind: "event"; event: NeutralEvent }
  | { kind: "ignored"; event_type: string }
  | { kind: "invalid"; reason: string };

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.trialing",
  "subscription.updated",
  "subscription.past_due",
  "subscription.paused",
  "subscription.canceled",
]);

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/** A Paddle subscription entity → the neutral subscription event (EP-46; EP-49 passes occurred_at = updated_at). */
export function mapPaddleSubscription(data: PaddleSubscription, occurredAt: string, eventId: string | null = null): SubscriptionEvent {
  const item = data.items?.[0];
  return {
    event_id: eventId,
    type: "subscription",
    occurred_at: occurredAt,
    provider_subscription_id: str(data.id),
    provider_customer_id: str(data.customer_id),
    provider_status: str(data.status),
    user_id: str(data.custom_data?.user_id),
    plan: str(data.custom_data?.plan),
    price_id: str(item?.price?.id),
    period_ends_at: str(data.current_billing_period?.ends_at),
    trial_ends_at: str(item?.trial_dates?.ends_at),
    cancel_scheduled: data.scheduled_change?.action === "cancel",
    ended_at: str(data.canceled_at) ?? str(data.paused_at) ?? occurredAt,
  };
}

/** A Paddle transaction entity → the neutral payment event (EP-46). */
export function mapPaddleTransaction(
  data: PaddleTransaction,
  type: PaymentEvent["type"],
  occurredAt: string,
  eventId: string | null,
): PaymentEvent {
  const total = data.details?.totals?.grand_total;
  const amount = typeof total === "string" && /^\d+$/.test(total) ? Number(total) : typeof total === "number" ? total : null;
  const card = data.payments?.find((p) => p.method_details?.type === "card")?.method_details?.card ?? null;
  return {
    event_id: eventId,
    type,
    occurred_at: occurredAt,
    provider_transaction_id: str(data.id),
    provider_subscription_id: str(data.subscription_id),
    kind: data.origin === "subscription_recurring" ? "renewal" : "initial",
    amount_minor: amount,
    currency: str(data.currency_code),
    card_brand: str(card?.type),
    card_last4: str(card?.last4),
  };
}

/**
 * The Paddle envelope { event_id, event_type, occurred_at, notification_id, data } → the neutral EP-46 event.
 * Event types outside the nine of API §9.2 → ignored; a mapped event without its required fields → invalid.
 */
export function mapPaddleEvent(envelope: unknown): MappedEvent {
  if (!envelope || typeof envelope !== "object") return { kind: "invalid", reason: "envelope" };
  const e = envelope as { event_id?: unknown; event_type?: unknown; occurred_at?: unknown; data?: unknown };
  const eventType = str(e.event_type);
  if (!eventType) return { kind: "invalid", reason: "event_type" };
  const isSubscription = SUBSCRIPTION_EVENTS.has(eventType);
  const paymentType =
    eventType === "transaction.completed"
      ? "payment_succeeded"
      : eventType === "transaction.payment_failed"
        ? "payment_failed"
        : null;
  if (!isSubscription && !paymentType) return { kind: "ignored", event_type: eventType };

  const eventId = str(e.event_id);
  const occurredAt = str(e.occurred_at);
  if (!eventId) return { kind: "invalid", reason: "event_id" };
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) return { kind: "invalid", reason: "occurred_at" };
  if (!e.data || typeof e.data !== "object") return { kind: "invalid", reason: "data" };

  if (isSubscription) {
    const event = mapPaddleSubscription(e.data as PaddleSubscription, occurredAt, eventId);
    for (const field of ["provider_subscription_id", "provider_customer_id", "provider_status", "price_id"] as const) {
      if (!event[field]) return { kind: "invalid", reason: field };
    }
    return { kind: "event", event };
  }

  const event = mapPaddleTransaction(e.data as PaddleTransaction, paymentType!, occurredAt, eventId);
  if (!event.provider_transaction_id) return { kind: "invalid", reason: "provider_transaction_id" };
  if (event.provider_subscription_id && event.amount_minor === null) return { kind: "invalid", reason: "amount_minor" };
  return { kind: "event", event };
}
