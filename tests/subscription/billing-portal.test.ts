// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-89 getBillingPortalUrl (lib/actions/subscription.ts, Step 31) over a fake server client: the Paddle portal URL
// (data.urls.general.overview of a mocked POST /customers/{id}/portal-sessions) for the caller's latest row of their
// family; no provider_customer_id → 409 subscription_not_active; PADDLE_API_KEY empty or Paddle failing → 503
// payment_provider_unavailable; a shelter account → 403 forbidden_role (EP-47 authorization). Nothing is stored.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";

const state = {
  accountType: "owner" as "owner" | "shelter",
  rows: [] as Row[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { getBillingPortalUrl } = await import("@/lib/actions/subscription");
const { httpStatus } = await import("@/lib/server/result");

function latest() {
  return [...state.rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}

function rpc(name: string) {
  if (name !== "get_my_subscription") throw new Error(`unexpected rpc ${name}`);
  if (state.accountType === "shelter") return { data: null, error: { code: "P0001", message: "forbidden_role" } };
  const s = latest();
  return {
    data: {
      id: s?.id ?? null,
      plan: s?.plan ?? null,
      status: s?.status ?? null,
      manage_billing_available: !!s?.provider_customer_id,
      is_active: !!s,
      trial_available: false,
      over_limits: [],
    },
    error: null,
  };
}

function query(table: string) {
  const api = {
    select: () => api,
    eq: () => api,
    order: () => api,
    maybeSingle: async () => ({ data: table === "profiles" ? { id: IVANA, deletion_requested_at: null } : null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: table === "subscriptions" ? [...state.rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) : [],
        error: null,
      }).then(resolve),
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
    rpc: async (name: string) => rpc(name),
  };
}

const fetchCalls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
let paddleStatus = 200;

beforeEach(() => {
  fetchCalls.length = 0;
  paddleStatus = 200;
  state.accountType = "owner";
  state.rows = [
    {
      id: "s-old",
      plan: "premium_monthly",
      status: "expired",
      created_at: "2026-01-01T00:00:00Z",
      current_period_end: "2026-02-01T00:00:00Z",
      provider_customer_id: "ctm_test_old",
      provider_subscription_id: "sub_test_old",
    },
    {
      id: "s-new",
      plan: "premium_yearly",
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
      current_period_end: "2027-10-01T00:00:00Z",
      provider_customer_id: "ctm_test_ivana",
      provider_subscription_id: "sub_test_ivana",
    },
  ];
  vi.stubEnv("PADDLE_API_KEY", "pdl_test_key");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    fetchCalls.push({
      url,
      method: String(init.method),
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (paddleStatus !== 200) return new Response(JSON.stringify({ error: { code: "internal_error" } }), { status: paddleStatus });
    return new Response(
      JSON.stringify({ data: { id: "cpls_test", urls: { general: { overview: "https://customer-portal.paddle.com/cpl_test?token=x" } } } }),
      { status: 201 },
    );
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EP-89 getBillingPortalUrl", () => {
  it("returns Paddle's portal URL for the caller's customer and latest subscription", async () => {
    expect(await getBillingPortalUrl()).toEqual({ ok: true, data: { url: "https://customer-portal.paddle.com/cpl_test?token=x" } });
    expect(fetchCalls).toEqual([
      {
        url: "https://sandbox-api.paddle.com/customers/ctm_test_ivana/portal-sessions",
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer pdl_test_key" }),
        body: { subscription_ids: ["sub_test_ivana"] },
      },
    ]);
  });

  it("no provider customer (manage_billing_available = false) → 409 subscription_not_active, no fetch", async () => {
    state.rows = [{ id: "s-seed", plan: "premium_monthly", status: "active", created_at: "2026-10-01T00:00:00Z", provider_customer_id: null }];
    expect(await getBillingPortalUrl()).toMatchObject({ ok: false, error: { code: "subscription_not_active" } });
    expect(httpStatus("subscription_not_active")).toBe(409);
    state.rows = [];
    expect(await getBillingPortalUrl()).toMatchObject({ ok: false, error: { code: "subscription_not_active" } });
    expect(fetchCalls).toEqual([]);
  });

  it("PADDLE_API_KEY empty → 503 payment_provider_unavailable, no fetch", async () => {
    vi.stubEnv("PADDLE_API_KEY", "");
    expect(await getBillingPortalUrl()).toMatchObject({ ok: false, error: { code: "payment_provider_unavailable" } });
    expect(httpStatus("payment_provider_unavailable")).toBe(503);
    expect(fetchCalls).toEqual([]);
  });

  it("Paddle failing → 503 payment_provider_unavailable", async () => {
    paddleStatus = 502;
    expect(await getBillingPortalUrl()).toMatchObject({ ok: false, error: { code: "payment_provider_unavailable" } });
  });

  it("a shelter account → 403 forbidden_role", async () => {
    state.accountType = "shelter";
    expect(await getBillingPortalUrl()).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(fetchCalls).toEqual([]);
  });
});
