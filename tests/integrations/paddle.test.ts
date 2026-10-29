// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// lib/integrations/paddle.ts (Step 31, TC ADR-09, API §5.6 "Payment provider", EP-46). The fetch client goes to the
// sandbox unless NEXT_PUBLIC_PADDLE_ENV is exactly "production", with Bearer PADDLE_API_KEY; local mode makes no
// call. verifyPaddleSignature: HMAC-SHA256(secret, "<ts>:<raw body>") lowercase hex, any h1 may match, 5-minute
// window, empty secret never verifies. mapPaddleEvent: the envelope → the neutral EP-46 event. Every Paddle call is
// a mocked fetch; signatures are made in-test with a test secret.

const paddle = await import("@/lib/integrations/paddle");

const SECRET = "pdl_ntfset_test_secret";
const NOW = 1_793_000_000;
const BODY = JSON.stringify({ event_id: "evt_test_1", event_type: "subscription.created" });

const sign = (ts: number, body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let reply: { status: number; json: unknown };

beforeEach(() => {
  calls = [];
  reply = { status: 200, json: { data: {} } };
  vi.stubEnv("PADDLE_API_KEY", "pdl_test_key");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: String(init.method),
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(reply.json), { status: reply.status });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("EP-46 signature", () => {
  it("accepts a correct Paddle-Signature", async () => {
    expect(await paddle.verifyPaddleSignature(`ts=${NOW};h1=${sign(NOW, BODY)}`, BODY, SECRET, NOW)).toBe(true);
    expect(await paddle.verifyPaddleSignature(`ts=${NOW};h1=${sign(NOW, BODY)}`, new TextEncoder().encode(BODY), SECRET, NOW)).toBe(true);
  });

  it("rejects a wrong h1", async () => {
    expect(await paddle.verifyPaddleSignature(`ts=${NOW};h1=${sign(NOW, BODY, "other")}`, BODY, SECRET, NOW)).toBe(false);
    expect(await paddle.verifyPaddleSignature(`ts=${NOW};h1=${sign(NOW, `${BODY} `)}`, BODY, SECRET, NOW)).toBe(false);
  });

  it("accepts any matching h1 during secret rotation", async () => {
    const header = `ts=${NOW};h1=${sign(NOW, BODY, "old_secret")};h1=${sign(NOW, BODY)}`;
    expect(await paddle.verifyPaddleSignature(header, BODY, SECRET, NOW)).toBe(true);
  });

  it("rejects a missing or malformed header", async () => {
    for (const header of [null, "", `h1=${sign(NOW, BODY)}`, `ts=${NOW}`, `ts=abc;h1=${sign(NOW, BODY)}`, "garbage", `ts=${NOW};h1=xyz`]) {
      expect(await paddle.verifyPaddleSignature(header, BODY, SECRET, NOW)).toBe(false);
    }
  });

  it("rejects a ts more than 300 s away; 300 s is still accepted", async () => {
    const old = NOW - 301;
    expect(await paddle.verifyPaddleSignature(`ts=${old};h1=${sign(old, BODY)}`, BODY, SECRET, NOW)).toBe(false);
    const edge = NOW - 300;
    expect(await paddle.verifyPaddleSignature(`ts=${edge};h1=${sign(edge, BODY)}`, BODY, SECRET, NOW)).toBe(true);
  });

  it("never verifies with an empty secret", async () => {
    expect(await paddle.verifyPaddleSignature(`ts=${NOW};h1=${sign(NOW, BODY, "")}`, BODY, "", NOW)).toBe(false);
  });
});

describe("Paddle API client", () => {
  it("cancel at period end / immediately: POST /subscriptions/{id}/cancel on the sandbox with the Bearer key", async () => {
    await paddle.cancelSubscription("sub_test_1", "next_billing_period");
    await paddle.cancelSubscription("sub_test_1", "immediately");
    expect(calls).toEqual([
      expect.objectContaining({
        url: "https://sandbox-api.paddle.com/subscriptions/sub_test_1/cancel",
        method: "POST",
        body: { effective_from: "next_billing_period" },
      }),
      expect.objectContaining({ body: { effective_from: "immediately" } }),
    ]);
    expect(calls[0].headers.Authorization).toBe("Bearer pdl_test_key");
  });

  it("resume: PATCH /subscriptions/{id} with scheduled_change null; production base URL only for 'production'", async () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    await paddle.resumeSubscription("sub_test_1");
    expect(calls[0]).toMatchObject({
      url: "https://api.paddle.com/subscriptions/sub_test_1",
      method: "PATCH",
      body: { scheduled_change: null },
    });
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "Production");
    expect(paddle.paddleApiUrl()).toBe("https://sandbox-api.paddle.com");
  });

  it("getSubscription returns data; createPortalSession returns urls.general.overview", async () => {
    reply.json = { data: { id: "sub_test_1", status: "active" } };
    expect(await paddle.getSubscription("sub_test_1")).toEqual({ id: "sub_test_1", status: "active" });
    expect(calls[0]).toMatchObject({ url: "https://sandbox-api.paddle.com/subscriptions/sub_test_1", method: "GET" });

    reply.json = { data: { urls: { general: { overview: "https://customer-portal.paddle.com/cpl_test" } } } };
    expect(await paddle.createPortalSession("ctm_test_1", "sub_test_1")).toBe("https://customer-portal.paddle.com/cpl_test");
    expect(calls[1]).toMatchObject({
      url: "https://sandbox-api.paddle.com/customers/ctm_test_1/portal-sessions",
      method: "POST",
      body: { subscription_ids: ["sub_test_1"] },
    });
  });

  it("a Paddle error throws PaddleError with the status", async () => {
    reply = { status: 400, json: { error: { code: "subscription_locked_pending_changes", detail: "x" } } };
    await expect(paddle.cancelSubscription("sub_test_1", "immediately")).rejects.toMatchObject({ name: "PaddleError", status: 400 });
  });

  it("local mode: PADDLE_API_KEY empty → not configured and no call", async () => {
    vi.stubEnv("PADDLE_API_KEY", "");
    expect(paddle.paddleConfigured()).toBe(false);
    await expect(paddle.getSubscription("sub_test_1")).rejects.toThrow("not_configured");
    expect(calls).toEqual([]);
  });
});

describe("EP-46 mapping", () => {
  const subscription = {
    id: "sub_test_1",
    status: "trialing",
    customer_id: "ctm_test_1",
    custom_data: { user_id: "a1000000-0000-4000-8000-000000000002", plan: "premium_monthly", idempotency_key: "k" },
    items: [{ price: { id: "pri_test_pm_trial" }, trial_dates: { starts_at: "2026-10-29T10:00:00Z", ends_at: "2026-11-05T10:00:00Z" } }],
    current_billing_period: { starts_at: "2026-10-29T10:00:00Z", ends_at: "2026-11-05T10:00:00Z" },
    scheduled_change: null,
    canceled_at: null,
    paused_at: null,
  };

  it("subscription events → the neutral subscription event", () => {
    const mapped = paddle.mapPaddleEvent({
      event_id: "evt_test_1",
      event_type: "subscription.trialing",
      occurred_at: "2026-10-29T10:00:01Z",
      notification_id: "ntf_test_1",
      data: subscription,
    });
    expect(mapped).toEqual({
      kind: "event",
      event: {
        event_id: "evt_test_1",
        type: "subscription",
        occurred_at: "2026-10-29T10:00:01Z",
        provider_subscription_id: "sub_test_1",
        provider_customer_id: "ctm_test_1",
        provider_status: "trialing",
        user_id: "a1000000-0000-4000-8000-000000000002",
        plan: "premium_monthly",
        price_id: "pri_test_pm_trial",
        period_ends_at: "2026-11-05T10:00:00Z",
        trial_ends_at: "2026-11-05T10:00:00Z",
        cancel_scheduled: false,
        ended_at: "2026-10-29T10:00:01Z",
      },
    });
  });

  it("cancel_scheduled from scheduled_change.action = cancel; ended_at from canceled_at", () => {
    const mapped = paddle.mapPaddleEvent({
      event_id: "evt_test_2",
      event_type: "subscription.canceled",
      occurred_at: "2026-11-05T10:00:01Z",
      data: { ...subscription, status: "canceled", scheduled_change: { action: "cancel" }, canceled_at: "2026-11-05T10:00:00Z" },
    });
    expect(mapped).toMatchObject({ kind: "event", event: { cancel_scheduled: true, ended_at: "2026-11-05T10:00:00Z", provider_status: "canceled" } });
  });

  it("transactions → payment events (renewal origin, grand_total, first card payment)", () => {
    const mapped = paddle.mapPaddleEvent({
      event_id: "evt_test_3",
      event_type: "transaction.completed",
      occurred_at: "2026-11-05T10:00:02Z",
      data: {
        id: "txn_test_1",
        subscription_id: "sub_test_1",
        origin: "subscription_recurring",
        currency_code: "EUR",
        details: { totals: { grand_total: "363" } },
        payments: [
          { method_details: { type: "paypal", card: null } },
          { method_details: { type: "card", card: { type: "visa", last4: "4242", expiry_month: 1 } } },
        ],
      },
    });
    expect(mapped).toEqual({
      kind: "event",
      event: {
        event_id: "evt_test_3",
        type: "payment_succeeded",
        occurred_at: "2026-11-05T10:00:02Z",
        provider_transaction_id: "txn_test_1",
        provider_subscription_id: "sub_test_1",
        kind: "renewal",
        amount_minor: 363,
        currency: "EUR",
        card_brand: "visa",
        card_last4: "4242",
      },
    });
    const failed = paddle.mapPaddleEvent({
      event_id: "evt_test_4",
      event_type: "transaction.payment_failed",
      occurred_at: "2026-11-05T10:00:02Z",
      data: { id: "txn_test_2", subscription_id: "sub_test_1", origin: "web", details: { totals: { grand_total: "300" } } },
    });
    expect(failed).toMatchObject({ kind: "event", event: { type: "payment_failed", kind: "initial", amount_minor: 300 } });
  });

  it("other event types are ignored; missing required fields are invalid", () => {
    expect(paddle.mapPaddleEvent({ event_id: "evt_test_5", event_type: "customer.updated", occurred_at: "2026-11-05T10:00:00Z", data: {} })).toEqual({
      kind: "ignored",
      event_type: "customer.updated",
    });
    expect(
      paddle.mapPaddleEvent({ event_id: "evt_test_6", event_type: "subscription.updated", occurred_at: "2026-11-05T10:00:00Z", data: { ...subscription, items: [] } }),
    ).toEqual({ kind: "invalid", reason: "price_id" });
    expect(paddle.mapPaddleEvent({ event_type: "subscription.updated", occurred_at: "2026-11-05T10:00:00Z", data: subscription })).toEqual({
      kind: "invalid",
      reason: "event_id",
    });
    expect(paddle.mapPaddleEvent("nope")).toEqual({ kind: "invalid", reason: "envelope" });
  });

  it("EP-49: mapPaddleSubscription uses the given occurred_at (the response's updated_at) and no event id", () => {
    expect(paddle.mapPaddleSubscription({ ...subscription, status: "active" }, "2026-11-05T11:00:00Z")).toMatchObject({
      event_id: null,
      occurred_at: "2026-11-05T11:00:00Z",
      provider_status: "active",
    });
  });
});
