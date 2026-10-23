// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-45 startCheckout — the provider-neutral stub (Step 23, OQ-11). Over a fake server client: the EP-45
// Request validation still surfaces (validation_failed with plan_not_allowed, trial_already_used,
// subscription_already_active, forbidden_role, idempotency_key), and a valid request returns 503
// payment_provider_unavailable and writes nothing — no subscriptions row, no idempotency_keys row, no RPC.
// The active plans row exists only as a fixture in this test (migrations and seed keep plans empty, OQ-03).

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";

const state = {
  profile: { account_type: "owner", trial_used: false } as Row,
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
    insert: () => (state.writes.push(`insert:${table}`), api),
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

beforeEach(() => {
  state.profile = { account_type: "owner", trial_used: false };
  state.memberships = [];
  state.writes = [];
  state.tables = {
    // Test fixture only: an active priced plan (OQ-03 keeps the real table empty).
    plans: [
      { code: "premium_monthly", active: true },
      { code: "premium_yearly", active: false },
      { code: "breeder_monthly", active: true },
    ],
    subscriptions: [],
    idempotency_keys: [],
  };
});

describe("EP-45 startCheckout (stub until OQ-11)", () => {
  it("a valid request → 503 payment_provider_unavailable and nothing is written", async () => {
    const result = await startCheckout({ plan: "premium_monthly", expect_trial: true, idempotency_key: key() });
    expect(result).toMatchObject({ ok: false, error: { code: "payment_provider_unavailable" } });
    expect(httpStatus("payment_provider_unavailable")).toBe(503);
    expect(state.writes).toEqual([]);
    expect(state.tables.subscriptions).toEqual([]);
    expect(state.tables.idempotency_keys).toEqual([]);
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
