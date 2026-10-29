// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-38 — EP-48 setAutoRenew (lib/actions/subscription.ts) over a fake server client that behaves like the
// Step 23 database functions set_auto_renew / get_my_subscription: auto_renew = false → status cancelled,
// auto_renew false, current_period_end unchanged and Premium still active (BR-08); true resumes (trialing
// while the trial runs); no running row → 409 subscription_not_active; shelter accounts → 403 forbidden_role.
// The database behaviour itself is proven in supabase/tests/subscription_read.test.sql.
// Step 31 (BR-08, EP-48 v1.4): a running row with a provider_subscription_id goes to Paddle first — false → POST
// /subscriptions/{id}/cancel {effective_from: next_billing_period}, true → PATCH {scheduled_change: null} — then
// set_auto_renew; a Paddle error or an empty PADDLE_API_KEY → 503 payment_provider_unavailable with the row unchanged;
// a row without a provider id (seed data) changes in the database only, with no fetch. Paddle is a mocked fetch.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const PERIOD_END = "2026-11-15T10:00:00.000Z";

const state = {
  user: IVANA as string | null,
  accountType: "owner" as "owner" | "shelter" | "breeder",
  deletionRequestedAt: null as string | null,
  subscription: null as Row | null,
  rpcCalls: [] as { name: string; args: Row | undefined }[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { setAutoRenew, getMySubscription } = await import("@/lib/actions/subscription");
const { httpStatus } = await import("@/lib/server/result");

const dbError = (message: string) => ({ data: null, error: { code: "P0001", message } });

function running(s: Row | null) {
  return !!s && ["trialing", "active", "cancelled"].includes(String(s.status)) && new Date(String(s.current_period_end)) > new Date();
}

/** get_my_subscription as the database computes it (supabase/migrations/*_subscription_and_data_control.sql). */
function subscriptionView() {
  const s = state.subscription;
  return {
    id: s?.id ?? null,
    plan: s?.plan ?? null,
    status: s?.status ?? null,
    trial_ends_at: s?.trial_ends_at ?? null,
    current_period_end: s?.current_period_end ?? null,
    auto_renew: s?.auto_renew ?? null,
    price: null,
    period_days: s ? 31 : null,
    days_remaining: s ? 23 : null,
    is_active: running(s),
    trial_available: true,
    card_brand: s?.card_brand ?? null,
    card_last4: s?.card_last4 ?? null,
    manage_billing_available: !!s?.provider_customer_id,
    over_limits: [],
  };
}

function rpc(name: string, args?: Row) {
  state.rpcCalls.push({ name, args });
  if (state.accountType === "shelter") return dbError("forbidden_role");
  if (name === "get_my_subscription") return { data: subscriptionView(), error: null };
  if (name === "set_auto_renew") {
    const s = state.subscription;
    if (!running(s)) return dbError("subscription_not_active");
    const on = args?.p_auto_renew === true;
    Object.assign(s!, {
      auto_renew: on,
      status: !on ? "cancelled" : s!.trial_ends_at && new Date(String(s!.trial_ends_at)) > new Date() ? "trialing" : "active",
    });
    return { data: { ...s }, error: null };
  }
  throw new Error(`unexpected rpc ${name}`);
}

function query(table: string) {
  const api = {
    select: () => api,
    eq: () => api,
    in: () => api,
    gt: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: async () => ({
      data:
        table === "profiles"
          ? { id: state.user, deletion_requested_at: state.deletionRequestedAt }
          : table === "subscriptions" && running(state.subscription)
            ? { id: state.subscription!.id, provider_subscription_id: state.subscription!.provider_subscription_id ?? null }
            : null,
      error: null,
    }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: state.user, email: "ivana@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } : null },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string, args?: Row) => rpc(name, args),
  };
}

const fetchCalls: { url: string; method: string; body: unknown }[] = [];
let paddleStatus = 200;

beforeEach(() => {
  fetchCalls.length = 0;
  paddleStatus = 200;
  vi.unstubAllEnvs();
  vi.stubEnv("PADDLE_API_KEY", "pdl_test_key");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(paddleStatus === 200 ? { data: {} } : { error: { code: "x" } }), { status: paddleStatus });
  });
  Object.assign(state, {
    user: IVANA,
    accountType: "owner",
    deletionRequestedAt: null,
    subscription: {
      id: "f1000000-0000-4000-8000-000000000001",
      plan: "premium_monthly",
      status: "active",
      trial_ends_at: null,
      current_period_end: PERIOD_END,
      auto_renew: true,
      card_brand: "visa",
      card_last4: "4242",
    },
    rpcCalls: [],
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T10:00:00Z"));
});

describe("EP-48 setAutoRenew", () => {
  it("FR-38: auto_renew = false → cancelled, auto_renew false, period end unchanged, Premium still active", async () => {
    const result = await setAutoRenew({ auto_renew: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ status: "cancelled", auto_renew: false, current_period_end: PERIOD_END, is_active: true });
    expect(state.rpcCalls.map((c) => c.name)).toEqual(["set_auto_renew", "get_my_subscription"]);
    expect(state.rpcCalls[0].args).toEqual({ p_auto_renew: false });

    // Entitlements.premium follows "Premium active" — still true until current_period_end.
    const read = await getMySubscription();
    expect(read.ok && read.data.is_active).toBe(true);
  });

  it("FR-38: auto_renew = true resumes renewal (active)", async () => {
    await setAutoRenew({ auto_renew: false });
    const result = await setAutoRenew({ auto_renew: true });
    expect(result.ok && result.data).toMatchObject({ status: "active", auto_renew: true, current_period_end: PERIOD_END });
  });

  it("resuming during a trial → trialing", async () => {
    Object.assign(state.subscription!, { status: "trialing", trial_ends_at: "2026-10-26T10:00:00.000Z", current_period_end: "2026-10-26T10:00:00.000Z" });
    await setAutoRenew({ auto_renew: false });
    const result = await setAutoRenew({ auto_renew: true });
    expect(result.ok && result.data.status).toBe("trialing");
  });

  it("no active row → 409 subscription_not_active", async () => {
    state.subscription = null;
    const none = await setAutoRenew({ auto_renew: false });
    expect(none).toMatchObject({ ok: false, error: { code: "subscription_not_active" } });

    state.subscription = { id: "x", plan: "premium_monthly", status: "expired", current_period_end: "2026-10-01T00:00:00Z", auto_renew: false };
    const expired = await setAutoRenew({ auto_renew: true });
    expect(expired).toMatchObject({ ok: false, error: { code: "subscription_not_active" } });
    expect(httpStatus("subscription_not_active")).toBe(409);
  });

  it("a shelter account → 403 forbidden_role", async () => {
    state.accountType = "shelter";
    expect(await setAutoRenew({ auto_renew: false })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
  });

  it("validates auto_renew and runs the §4.1 gates first", async () => {
    expect(await setAutoRenew({} as { auto_renew: boolean })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { auto_renew: "required" } },
    });

    state.deletionRequestedAt = "2026-10-20T10:00:00Z";
    expect(await setAutoRenew({ auto_renew: false })).toMatchObject({ ok: false, error: { code: "account_pending_deletion" } });

    state.user = null;
    expect(await setAutoRenew({ auto_renew: false })).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(state.rpcCalls.filter((c) => c.name === "set_auto_renew")).toHaveLength(0);
  });
});

describe("EP-48 setAutoRenew — Paddle (BR-08)", () => {
  beforeEach(() => {
    Object.assign(state.subscription!, { provider_subscription_id: "sub_test_ivana", provider_customer_id: "ctm_test_ivana" });
  });

  it("false → Paddle cancel at the end of the billing period, then cancelled", async () => {
    const result = await setAutoRenew({ auto_renew: false });
    expect(fetchCalls).toEqual([
      {
        url: "https://sandbox-api.paddle.com/subscriptions/sub_test_ivana/cancel",
        method: "POST",
        body: { effective_from: "next_billing_period" },
      },
    ]);
    expect(result).toMatchObject({ ok: true, data: { status: "cancelled", auto_renew: false } });
    expect(state.rpcCalls.map((c) => c.name)).toEqual(["set_auto_renew", "get_my_subscription"]);
  });

  it("true → Paddle resume (scheduled_change: null), then active", async () => {
    Object.assign(state.subscription!, { status: "cancelled", auto_renew: false });
    const result = await setAutoRenew({ auto_renew: true });
    expect(fetchCalls).toEqual([
      { url: "https://sandbox-api.paddle.com/subscriptions/sub_test_ivana", method: "PATCH", body: { scheduled_change: null } },
    ]);
    expect(result).toMatchObject({ ok: true, data: { status: "active", auto_renew: true } });
  });

  it("a Paddle error → 503 payment_provider_unavailable, row unchanged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    paddleStatus = 500;
    const result = await setAutoRenew({ auto_renew: false });
    expect(result).toMatchObject({ ok: false, error: { code: "payment_provider_unavailable" } });
    expect(httpStatus("payment_provider_unavailable")).toBe(503);
    expect(state.subscription).toMatchObject({ status: "active", auto_renew: true });
    expect(state.rpcCalls.filter((c) => c.name === "set_auto_renew")).toHaveLength(0);
  });

  it("PADDLE_API_KEY empty with a provider row → 503, no fetch, nothing changed", async () => {
    vi.stubEnv("PADDLE_API_KEY", "");
    expect(await setAutoRenew({ auto_renew: false })).toMatchObject({ ok: false, error: { code: "payment_provider_unavailable" } });
    expect(fetchCalls).toEqual([]);
    expect(state.subscription).toMatchObject({ status: "active", auto_renew: true });
  });

  it("provider id null (seed data) → database only, no fetch", async () => {
    Object.assign(state.subscription!, { provider_subscription_id: null });
    expect(await setAutoRenew({ auto_renew: false })).toMatchObject({ ok: true, data: { status: "cancelled" } });
    expect(fetchCalls).toEqual([]);
  });
});
