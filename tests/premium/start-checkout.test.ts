// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-45 startCheckout (Step 23 validation, Step 31 Paddle). Over a fake server client: the EP-45 Request validation
// surfaces first (validation_failed with plan_not_allowed, trial_already_used, subscription_already_active,
// forbidden_role, idempotency_key). Local mode (PADDLE_API_KEY empty): a valid request returns 503
// payment_provider_unavailable and writes nothing. With a key: the CheckoutSession for the Paddle.js overlay — the
// trial price id and trial_applied for an owner who never had the trial (BR-07), the plain price id otherwise
// (E-15) and always for breeder plans (BR-51); custom_data {user_id, plan, idempotency_key}; environment and
// client_token from the env; stored in idempotency_keys and replayed; a missing price id → 500. No Paddle call,
// no subscriptions row. Price ids are test fixtures.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";

const state = {
  profile: { account_type: "owner", trial_used: false, email: "ivana.petrovic@mojljubimac.test" } as Row,
  memberships: [] as Row[],
  tables: {} as Record<string, Row[]>,
  writes: [] as string[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { startCheckout } = await import("@/lib/actions/checkout");
const { httpStatus } = await import("@/lib/server/result");

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const rows = () => {
    if (table === "profiles") return [{ id: IVANA, deletion_requested_at: null, ...state.profile }];
    if (table === "organisation_memberships") return state.memberships;
    return (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  };
  const api = {
    select: () => api,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), api),
    gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), api),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), api),
    insert: (row: Row) => {
      state.writes.push(`insert:${table}`);
      (state.tables[table] ??= []).push({ ...row, created_at: new Date().toISOString() });
      return api;
    },
    update: () => (state.writes.push(`update:${table}`), api),
    upsert: () => (state.writes.push(`upsert:${table}`), api),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: IVANA, email: "ivana@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string) => {
      state.writes.push(`rpc:${name}`);
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

let n = 0;
const key = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PADDLE_API_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "");
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  state.profile = { account_type: "owner", trial_used: false, email: "ivana.petrovic@mojljubimac.test" };
  state.memberships = [];
  state.writes = [];
  state.tables = {
    // Test fixture: plans rows with fake provider price ids (the real ids are environment data).
    plans: [
      { code: "premium_monthly", active: true, price_minor: 300, currency: "EUR", provider_price_id: "pri_test_pm", provider_trial_price_id: "pri_test_pm_trial" },
      { code: "premium_yearly", active: false, price_minor: 3000, currency: "EUR", provider_price_id: "pri_test_py", provider_trial_price_id: "pri_test_py_trial" },
      { code: "breeder_monthly", active: true, price_minor: 1100, currency: "EUR", provider_price_id: "pri_test_bm", provider_trial_price_id: null },
    ],
    subscriptions: [],
    idempotency_keys: [],
  };
});

describe("EP-45 startCheckout — validation and local mode", () => {
  it("local mode: PADDLE_API_KEY empty → 503 payment_provider_unavailable after validation, nothing written", async () => {
    const result = await startCheckout({ plan: "premium_monthly", expect_trial: true, idempotency_key: key() });
    expect(result).toMatchObject({ ok: false, error: { code: "payment_provider_unavailable" } });
    expect(httpStatus("payment_provider_unavailable")).toBe(503);
    expect(state.writes).toEqual([]);
    expect(state.tables.subscriptions).toEqual([]);
    expect(state.tables.idempotency_keys).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("validation_failed: unknown, inactive or wrong-family plan → plan_not_allowed", async () => {
    for (const plan of ["gold_monthly", "premium_yearly", "breeder_monthly"]) {
      const result = await startCheckout({ plan: plan as "premium_monthly", idempotency_key: key() });
      expect(result).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { plan: "plan_not_allowed" } } });
    }
  });

  it("validation_failed: idempotency_key is required (API §3.3)", async () => {
    expect(await startCheckout({ plan: "premium_monthly" } as never)).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { idempotency_key: "required" } },
    });
    expect(await startCheckout({ plan: "premium_monthly", idempotency_key: "nope" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { idempotency_key: "invalid" } },
    });
  });

  it("E-15: expect_trial with the trial already used → 409 trial_already_used", async () => {
    state.profile.trial_used = true;
    expect(await startCheckout({ plan: "premium_monthly", expect_trial: true, idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "trial_already_used" },
    });
    // Without expect_trial the request is valid and reaches the stub.
    expect(await startCheckout({ plan: "premium_monthly", idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "payment_provider_unavailable" },
    });
  });

  it("a running subscription of the same family → 409 subscription_already_active", async () => {
    state.tables.subscriptions = [
      { id: "s1", user_id: IVANA, plan: "premium_yearly", status: "cancelled", current_period_end: "2999-01-01T00:00:00.000Z" },
    ];
    expect(await startCheckout({ plan: "premium_monthly", idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "subscription_already_active" },
    });
  });

  it("forbidden_role: shelter accounts and breeder volunteers; a breeder admin passes to the stub", async () => {
    state.profile.account_type = "shelter";
    expect(await startCheckout({ plan: "premium_monthly", idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "forbidden_role" },
    });

    state.profile.account_type = "breeder";
    state.memberships = [{ organisation_id: "o1", role: "volunteer", organisations: { type: "breeder", approval_status: "approved" } }];
    expect(await startCheckout({ plan: "breeder_monthly", idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "forbidden_role" },
    });

    state.memberships = [{ organisation_id: "o1", role: "admin", organisations: { type: "breeder", approval_status: "approved" } }];
    expect(await startCheckout({ plan: "breeder_monthly", idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "payment_provider_unavailable" },
    });
    expect(state.writes).toEqual([]);
  });
});

describe("EP-45 startCheckout — Paddle checkout session", () => {
  beforeEach(() => {
    vi.stubEnv("PADDLE_API_KEY", "pdl_test_key");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "test_client_token");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
  });

  it("FR-37 #1 / BR-07: an owner with trial_used = false gets the trial price id and trial_applied", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    const idempotencyKey = key();
    const result = await startCheckout({ plan: "premium_monthly", expect_trial: true, idempotency_key: idempotencyKey });
    vi.useRealTimers();
    expect(result).toEqual({
      ok: true,
      data: {
        price_id: "pri_test_pm_trial",
        customer_email: "ivana.petrovic@mojljubimac.test",
        custom_data: { user_id: IVANA, plan: "premium_monthly", idempotency_key: idempotencyKey },
        environment: "sandbox",
        client_token: "test_client_token",
        plan: "premium_monthly",
        trial_applied: true,
        trial_ends_at: "2026-11-05T10:00:00.000Z",
        amount: { amount_minor: 300, currency: "EUR" },
        first_charge_at: "2026-11-05T10:00:00.000Z",
      },
    });
    // No Paddle API call and no subscriptions row (rows come only from EP-46); the session is stored.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.tables.subscriptions).toEqual([]);
    expect(state.writes).toEqual(["insert:idempotency_keys"]);
    expect(state.tables.idempotency_keys[0]).toMatchObject({ user_id: IVANA, key: idempotencyKey, operation: "start_checkout" });
  });

  it("E-15: trial_used = true → the plain price id, trial_applied = false, charged now", async () => {
    state.profile.trial_used = true;
    const result = await startCheckout({ plan: "premium_monthly", idempotency_key: key() });
    expect(result).toMatchObject({ ok: true, data: { price_id: "pri_test_pm", trial_applied: false, trial_ends_at: null } });
    expect(await startCheckout({ plan: "premium_monthly", expect_trial: true, idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "trial_already_used" },
    });
  });

  it("FR-42 / BR-51: a breeder Admin gets the breeder plain price id and never a trial", async () => {
    state.profile.account_type = "breeder";
    state.memberships = [{ organisation_id: "o1", role: "admin", organisations: { type: "breeder", approval_status: "approved" } }];
    expect(await startCheckout({ plan: "breeder_monthly", idempotency_key: key() })).toMatchObject({
      ok: true,
      data: { price_id: "pri_test_bm", trial_applied: false, plan: "breeder_monthly", amount: { amount_minor: 1100, currency: "EUR" } },
    });
  });

  it("environment is production only for exactly 'production'", async () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    expect(await startCheckout({ plan: "premium_monthly", idempotency_key: key() })).toMatchObject({ ok: true, data: { environment: "production" } });
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "prod");
    expect(await startCheckout({ plan: "premium_monthly", idempotency_key: key() })).toMatchObject({ ok: true, data: { environment: "sandbox" } });
  });

  it("API §3.3: a repeat with the same idempotency_key returns the stored session", async () => {
    const idempotencyKey = key();
    const first = await startCheckout({ plan: "premium_monthly", idempotency_key: idempotencyKey });
    state.tables.plans[0].provider_trial_price_id = "pri_test_changed";
    const second = await startCheckout({ plan: "premium_monthly", idempotency_key: idempotencyKey });
    expect(second).toEqual(first);
    expect(state.tables.idempotency_keys).toHaveLength(1);
  });

  it("a needed price id that is null → 500 internal_error (logged), nothing stored", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.plans[0].provider_trial_price_id = null;
    expect(await startCheckout({ plan: "premium_monthly", idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "internal_error" },
    });
    expect(error).toHaveBeenCalled();
    expect(state.tables.idempotency_keys).toEqual([]);
    error.mockRestore();
  });

  it("validation still comes first: a running subscription → 409 subscription_already_active", async () => {
    state.tables.subscriptions = [
      { id: "s1", user_id: IVANA, plan: "premium_monthly", status: "trialing", current_period_end: "2999-01-01T00:00:00.000Z" },
    ];
    expect(await startCheckout({ plan: "premium_monthly", idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "subscription_already_active" },
    });
  });
});
