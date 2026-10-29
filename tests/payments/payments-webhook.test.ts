// @vitest-environment node
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-46 — POST /api/webhooks/payments (Step 31). Paddle-shaped JSON payloads are signed in-test with a test secret.
// The service-role client is faked with a small model of the database function apply_payment_event (event_id dedupe,
// provider_event_at ordering, the status table, trial_used, last_notice_days, payment rows, not_found for a
// transaction before its subscription, duplicate purchases) — the real function is proven in
// supabase/tests/payments.test.sql. Paddle API calls are a mocked fetch.

const SECRET = "pdl_ntfset_test_secret";
const MARKO = "a1000000-0000-4000-8000-000000000002";

type Sub = {
  provider_subscription_id: string;
  user_id: string;
  plan: string;
  status: string;
  auto_renew: boolean;
  current_period_end: string;
  trial_ends_at: string | null;
  provider_event_at: string;
  last_notice_days: number | null;
};
type Event = Record<string, unknown>;

const db = vi.hoisted(() => ({
  events: new Set<string>(),
  subs: [] as Sub[],
  payments: [] as { txn: string; result: string; kind: string; amount: number }[],
  trialUsed: new Set<string>(),
  rpcCalls: [] as { fn: string; args: { p_event: Event; p_record_event: boolean } }[],
  failNext: null as null | { code: string; message: string; details?: string },
}));

const PRICES: Record<string, { plan: string; trial: boolean }> = {
  pri_test_pm: { plan: "premium_monthly", trial: false },
  pri_test_pm_trial: { plan: "premium_monthly", trial: true },
  pri_test_bm: { plan: "breeder_monthly", trial: false },
};

function apply(e: Event, record: boolean): { data: string | null; error: { code: string; message: string } | null } {
  const err = (message: string) => ({ data: null, error: { code: "P0001", message } });
  const staged = new Set(db.events);
  if (record) {
    if (staged.has(String(e.event_id))) return { data: "duplicate", error: null };
    staged.add(String(e.event_id));
  }
  if (e.type !== "subscription") {
    const sub = db.subs.find((s) => s.provider_subscription_id === e.provider_subscription_id);
    if (!sub) return err("not_found:subscription"); // nothing recorded (rollback)
    const result = e.type === "payment_succeeded" ? "succeeded" : "failed";
    if (Number(e.amount_minor) > 0 && !db.payments.some((p) => p.txn === e.provider_transaction_id && p.result === result)) {
      db.payments.push({ txn: String(e.provider_transaction_id), result, kind: String(e.kind), amount: Number(e.amount_minor) });
    }
    db.events = staged;
    return { data: "applied", error: null };
  }
  const price = PRICES[String(e.price_id)];
  let sub = db.subs.find((s) => s.provider_subscription_id === e.provider_subscription_id);
  if (sub && String(e.occurred_at) < sub.provider_event_at) {
    db.events = staged;
    return { data: "ignored", error: null };
  }
  if (!price) {
    db.events = staged;
    return { data: "ignored", error: null };
  }
  const cancel = e.cancel_scheduled === true;
  const status = String(e.provider_status);
  const mapped =
    status === "trialing" || status === "active"
      ? { status: cancel ? "cancelled" : status, auto_renew: !cancel }
      : status === "past_due"
        ? { status: "payment_failed", auto_renew: true }
        : { status: "expired", auto_renew: false };
  if (!sub) {
    const user = String(e.user_id);
    if (db.subs.some((s) => s.user_id === user && ["trialing", "active", "cancelled"].includes(s.status))) {
      db.events = staged;
      return { data: mapped.status === "expired" ? "ignored" : "duplicate_subscription", error: null };
    }
    sub = {
      provider_subscription_id: String(e.provider_subscription_id),
      user_id: user,
      plan: price.plan,
      status: mapped.status,
      auto_renew: mapped.auto_renew,
      current_period_end: String(e.period_ends_at),
      trial_ends_at: status === "trialing" ? (e.trial_ends_at as string | null) : null,
      provider_event_at: String(e.occurred_at),
      last_notice_days: null,
    };
    db.subs.push(sub);
  } else {
    const end = String(e.period_ends_at ?? sub.current_period_end);
    if (end > sub.current_period_end) sub.last_notice_days = null;
    Object.assign(sub, { ...mapped, current_period_end: end, provider_event_at: String(e.occurred_at) });
  }
  if (status === "trialing" || price.trial) db.trialUsed.add(sub.user_id);
  db.events = staged;
  return { data: "applied", error: null };
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (fn: string, args: { p_event: Event; p_record_event: boolean }) => {
      db.rpcCalls.push({ fn, args });
      if (db.failNext) {
        const error = db.failNext;
        db.failNext = null;
        return { data: null, error };
      }
      return apply(args.p_event, args.p_record_event);
    },
  }),
}));

const { POST } = await import("@/app/api/webhooks/payments/route");

const fetchCalls: { url: string; method: string; body: unknown }[] = [];

function signed(payload: unknown, { ts = Math.floor(Date.now() / 1000), secret = SECRET, header }: { ts?: number; secret?: string; header?: string } = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/payments", {
    method: "POST",
    body,
    headers: header === undefined ? { "Paddle-Signature": `ts=${ts};h1=${h1}` } : header ? { "Paddle-Signature": header } : {},
  });
}

function subscriptionEnvelope(
  eventId: string,
  eventType: string,
  occurredAt: string,
  data: { id?: string; status: string; price?: string; ends?: string; trialEnds?: string | null; cancel?: boolean; user?: string },
) {
  return {
    event_id: eventId,
    event_type: eventType,
    occurred_at: occurredAt,
    notification_id: `ntf_${eventId}`,
    data: {
      id: data.id ?? "sub_test_marko",
      status: data.status,
      customer_id: "ctm_test_marko",
      custom_data: { user_id: data.user ?? MARKO, plan: "premium_monthly", idempotency_key: "00000000-0000-4000-8000-000000000001" },
      items: [{ price: { id: data.price ?? "pri_test_pm_trial" }, trial_dates: data.trialEnds ? { ends_at: data.trialEnds } : null }],
      current_billing_period: data.ends ? { ends_at: data.ends } : null,
      scheduled_change: data.cancel ? { action: "cancel" } : null,
      canceled_at: null,
      paused_at: null,
    },
  };
}

function transactionEnvelope(eventId: string, eventType: string, txn: string, origin: string, total: string, sub = "sub_test_marko") {
  return {
    event_id: eventId,
    event_type: eventType,
    occurred_at: "2026-11-05T10:00:05Z",
    data: {
      id: txn,
      subscription_id: sub,
      origin,
      currency_code: "EUR",
      details: { totals: { grand_total: total } },
      payments: [{ method_details: { type: "card", card: { type: "visa", last4: "4242" } } }],
    },
  };
}

beforeEach(() => {
  db.events = new Set();
  db.subs = [];
  db.payments = [];
  db.trialUsed = new Set();
  db.rpcCalls = [];
  db.failNext = null;
  fetchCalls.length = 0;
  vi.stubEnv("PADDLE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("PADDLE_API_KEY", "pdl_test_key");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const trialing = () =>
  subscriptionEnvelope("evt_test_1", "subscription.trialing", "2026-10-29T10:00:00Z", {
    status: "trialing",
    ends: "2026-11-05T10:00:00Z",
    trialEnds: "2026-11-05T10:00:00Z",
  });

describe("EP-46 signature", () => {
  it("a valid signature is processed → 200 {received: true}", async () => {
    const response = await POST(signed(trialing()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(db.rpcCalls).toHaveLength(1);
  });

  it("wrong h1, rotated second h1, missing header, ts 301 s old, empty secret", async () => {
    const body = JSON.stringify(trialing());
    const ts = Math.floor(Date.now() / 1000);
    const good = createHmac("sha256", SECRET).update(`${ts}:${body}`).digest("hex");
    const other = createHmac("sha256", "old_secret").update(`${ts}:${body}`).digest("hex");

    expect((await POST(signed(body, { header: `ts=${ts};h1=${other}` }))).status).toBe(401);
    expect((await POST(signed(body, { header: `ts=${ts};h1=${other};h1=${good}` }))).status).toBe(200);
    db.events.clear();
    db.subs = [];
    const missing = await POST(signed(body, { header: "" }));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ code: "invalid_signature" });
    expect((await POST(signed(body, { ts: ts - 301 }))).status).toBe(401);
    vi.stubEnv("PADDLE_WEBHOOK_SECRET", "");
    expect((await POST(signed(body, { secret: "" }))).status).toBe(401);
    expect(db.rpcCalls).toHaveLength(1); // only the rotated-h1 request reached the database
  });

  it("a valid signature over a non-JSON body → 422 validation_failed; unknown event types → 200, nothing applied", async () => {
    const response = await POST(signed("not json"));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "validation_failed" });
    const ignored = await POST(signed({ event_id: "evt_test_x", event_type: "customer.created", occurred_at: "2026-10-29T10:00:00Z", data: {} }));
    expect(ignored.status).toBe(200);
    expect(db.rpcCalls).toEqual([]);
  });

  it("a mapped event without a required field → 422", async () => {
    const envelope = trialing();
    envelope.data.items = [];
    const response = await POST(signed(envelope));
    expect(response.status).toBe(422);
    expect(db.rpcCalls).toEqual([]);
  });
});

describe("EP-46 events", () => {
  it("FR-37 #1: subscription.trialing → trialing with trial_ends_at from items[0].trial_dates.ends_at, trial_used set", async () => {
    await POST(signed(trialing()));
    expect(db.rpcCalls[0]).toEqual({
      fn: "apply_payment_event",
      args: {
        p_record_event: true,
        p_event: expect.objectContaining({
          event_id: "evt_test_1",
          type: "subscription",
          provider_subscription_id: "sub_test_marko",
          provider_customer_id: "ctm_test_marko",
          provider_status: "trialing",
          user_id: MARKO,
          plan: "premium_monthly",
          price_id: "pri_test_pm_trial",
          trial_ends_at: "2026-11-05T10:00:00Z",
          period_ends_at: "2026-11-05T10:00:00Z",
        }),
      },
    });
    expect(db.subs[0]).toMatchObject({ status: "trialing", trial_ends_at: "2026-11-05T10:00:00Z", auto_renew: true });
    expect(db.trialUsed.has(MARKO)).toBe(true);
  });

  it("FR-37 #2: subscription.updated (active, later period) + renewal transaction.completed → active, one renewal row", async () => {
    await POST(signed(trialing()));
    db.subs[0].last_notice_days = 7;
    await POST(
      signed(
        subscriptionEnvelope("evt_test_2", "subscription.updated", "2026-11-05T10:00:01Z", {
          status: "active",
          price: "pri_test_pm",
          ends: "2026-12-05T10:00:00Z",
        }),
      ),
    );
    const response = await POST(signed(transactionEnvelope("evt_test_3", "transaction.completed", "txn_test_1", "subscription_recurring", "363")));
    expect(response.status).toBe(200);
    expect(db.subs[0]).toMatchObject({ status: "active", current_period_end: "2026-12-05T10:00:00Z", last_notice_days: null });
    expect(db.payments).toEqual([{ txn: "txn_test_1", result: "succeeded", kind: "renewal", amount: 363 }]);
    expect(db.rpcCalls[2].args.p_event).toMatchObject({ type: "payment_succeeded", kind: "renewal", amount_minor: 363, card_brand: "visa" });
  });

  it("the same event_id twice changes the database once", async () => {
    await POST(signed(trialing()));
    const again = subscriptionEnvelope("evt_test_1", "subscription.canceled", "2026-10-30T10:00:00Z", { status: "canceled" });
    const response = await POST(signed(again));
    expect(response.status).toBe(200);
    expect(db.subs[0].status).toBe("trialing");
  });

  it("an event older than provider_event_at changes nothing", async () => {
    await POST(signed(trialing()));
    await POST(signed(subscriptionEnvelope("evt_test_old", "subscription.canceled", "2026-10-28T10:00:00Z", { status: "canceled" })));
    expect(db.subs[0].status).toBe("trialing");
    expect(db.events.has("evt_test_old")).toBe(true);
  });

  it("transaction.completed before its subscription → 500 and nothing recorded, then accepted on retry", async () => {
    const txn = transactionEnvelope("evt_test_early", "transaction.completed", "txn_test_early", "web", "300");
    const first = await POST(signed(txn));
    expect(first.status).toBe(500);
    expect(await first.json()).toMatchObject({ code: "internal_error" });
    expect(db.events.has("evt_test_early")).toBe(false);

    await POST(signed(subscriptionEnvelope("evt_test_sub", "subscription.created", "2026-10-29T10:00:00Z", { status: "active", price: "pri_test_pm", ends: "2026-11-29T10:00:00Z" })));
    const retry = await POST(signed(txn));
    expect(retry.status).toBe(200);
    expect(db.payments).toEqual([{ txn: "txn_test_early", result: "succeeded", kind: "initial", amount: 300 }]);
  });

  it("a zero-amount trial transaction is accepted and writes no payment row", async () => {
    await POST(signed(trialing()));
    expect((await POST(signed(transactionEnvelope("evt_test_zero", "transaction.completed", "txn_test_zero", "web", "0")))).status).toBe(200);
    expect(db.payments).toEqual([]);
  });

  it("duplicate purchase → duplicate_subscription: the route cancels the new Paddle subscription immediately", async () => {
    await POST(signed(trialing()));
    const second = subscriptionEnvelope("evt_test_dup", "subscription.created", "2026-10-29T11:00:00Z", {
      id: "sub_test_marko_2",
      status: "active",
      price: "pri_test_pm",
      ends: "2026-11-29T11:00:00Z",
    });
    const response = await POST(signed(second));
    expect(response.status).toBe(200);
    expect(db.subs).toHaveLength(1);
    expect(fetchCalls).toEqual([
      { url: "https://sandbox-api.paddle.com/subscriptions/sub_test_marko_2/cancel", method: "POST", body: { effective_from: "immediately" } },
    ]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("refund"), "sub_test_marko_2");
  });

  it("unknown price id → 200, ignored; a database validation_failed → 422; any other failure → 500", async () => {
    const unknown = subscriptionEnvelope("evt_test_unknown", "subscription.created", "2026-10-29T10:00:00Z", {
      status: "active",
      price: "pri_test_unknown",
      ends: "2026-11-29T10:00:00Z",
    });
    expect((await POST(signed(unknown))).status).toBe(200);
    expect(db.subs).toEqual([]);

    db.failNext = { code: "P0001", message: "validation_failed", details: "plan:required" };
    expect((await POST(signed(trialing()))).status).toBe(422);
    db.failNext = { code: "XX000", message: "connection lost" };
    expect((await POST(signed(trialing()))).status).toBe(500);
  });
});
