// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-47 #1 / #2 and API §11 — EP-63 submitOrgRequest (lib/actions/org-requests.ts) over a fake server client that
// models rpc:submit_org_request, rpc:list_org_requests and the idempotency_keys / rate_limit_counters tables: a
// signed-in user's request on an available shelter animal becomes a pending adoption_requests row that the
// shelter sees through EP-57 (no admin notification email — CR-24); a Visitor → 401 unauthenticated; the 6th
// request within an hour → 429 rate_limited with details.retry_after_s; a repeat with the same key replays the
// original. The database rules are proven in supabase/tests/org_requests.test.sql.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const MILICA = "a1000000-0000-4000-8000-000000000004";
const ZUCA = "c1000000-0000-4000-8000-000000000004";
const KIKI = "c1000000-0000-4000-8000-000000000003";

const state = {
  user: IVANA as string | null,
  requests: [] as Row[],
  tables: { idempotency_keys: [] as Row[], rate_limit_counters: [] as Row[] } as Record<string, Row[]>,
  rpcCalls: [] as { name: string; args: Row }[],
};

const sendEmail = vi.fn<(input: unknown) => Promise<{ status: "delivered"; id: string }>>(async () => ({
  status: "delivered",
  id: "re_1",
}));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: (input: unknown) => sendEmail(input) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { submitOrgRequest, listOrgRequests } = await import("@/lib/actions/org-requests");

function dbError(message: string, details: string | null = null) {
  return { data: null, error: { code: "P0001", message, details } };
}

/** submit_org_request as the database does it: only Žuća (available, approved shelter) is listed. */
function submitRpc(args: Row) {
  if (args.p_pet_id !== ZUCA) return dbError("not_found");
  const row = {
    id: crypto.randomUUID(),
    pet_id: ZUCA,
    requester_id: state.user,
    name: args.p_name,
    phone: args.p_phone,
    email: args.p_email,
    message: args.p_message,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  state.requests.push(row);
  return { data: { id: row.id, kind: "adoption_request", status: "pending", created_at: row.created_at }, error: null };
}

/** list_org_requests for Milica's shelter. */
function listRpc() {
  if (state.user !== MILICA) return dbError("not_found");
  const items = [...state.requests].reverse().map((r) => ({
    id: r.id,
    status: r.status,
    requester_id: r.requester_id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    message: r.message,
    created_at: r.created_at,
    decided_at: null,
    decided_by_name: null,
    pet: { pet_id: ZUCA, name: "Žuća", species: "dog", species_other: null, breed: "Mešanac", sex: "female", approx_age_text: "oko 6 meseci", birth_date: null, birth_year: null },
    transfer: null,
  }));
  return {
    data: {
      kind: "adoption_request",
      items,
      total: items.length,
      status_counts: { pending: items.length, accepted: 0, rejected: 0 },
      access: { role: "org_admin", can_edit: true, can_delete: true },
    },
    error: null,
  };
}

function query(table: string) {
  const filters: [string, unknown][] = [];
  let op: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  const source = () => state.tables[table] ?? [];
  const rows = () => source().filter((r) => filters.every(([column, value]) => r[column] === value));
  const run = async () => {
    if (table === "profiles") return { data: [{ id: state.user, deletion_requested_at: null }], error: null };
    if (table === "organisation_memberships") {
      return {
        data: state.user === MILICA ? [{ organisation_id: "b2", organisations: { approval_status: "approved" } }] : [],
        error: null,
      };
    }
    if (op === "insert") {
      source().push({ ...payload, created_at: new Date().toISOString() });
      return { data: null, error: null };
    }
    if (op === "update") {
      for (const r of rows()) Object.assign(r, payload);
      return { data: null, error: null };
    }
    return { data: rows(), error: null };
  };
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push([column, value]), api),
    gte: () => api,
    insert: (value: Row) => ((op = "insert"), (payload = value), api),
    update: (value: Row) => ((op = "update"), (payload = value), api),
    maybeSingle: async () => {
      const r = await run();
      return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: state.user, email: "user@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } : null },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string, args: Row = {}) => {
      state.rpcCalls.push({ name, args });
      if (name === "submit_org_request") return submitRpc(args);
      if (name === "list_org_requests") return listRpc();
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

const input = (extra: Partial<Parameters<typeof submitOrgRequest>[0]> = {}) => ({
  pet_id: ZUCA,
  name: "Ivana Petrović",
  phone: "+381 64 123 4567",
  email: "Ivana.Petrovic@MojLjubimac.test",
  message: "Imam iskustva sa psima.",
  idempotency_key: crypto.randomUUID(),
  ...extra,
});

beforeEach(() => {
  state.user = IVANA;
  state.requests = [];
  state.tables = { idempotency_keys: [], rate_limit_counters: [] };
  state.rpcCalls = [];
  sendEmail.mockClear();
});

describe("FR-47 #1 — submitOrgRequest", () => {
  it("inserts a pending adoption request that the shelter sees in list_org_requests", async () => {
    const result = await submitOrgRequest(input());
    expect(result).toMatchObject({ ok: true, data: { kind: "adoption_request", status: "pending" } });
    const call = state.rpcCalls.find((c) => c.name === "submit_org_request");
    expect(call?.args).toMatchObject({ p_pet_id: ZUCA, p_name: "Ivana Petrović", p_email: "ivana.petrovic@mojljubimac.test" });

    state.user = MILICA;
    const list = await listOrgRequests();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data.total).toBe(1);
    expect(list.data.items[0]).toMatchObject({ status: "pending", name: "Ivana Petrović", pet: { name: "Žuća" } });
    expect(list.data.status_counts.pending).toBe(1);
  });

  it("sends no email to the organisation's admins (CR-24: no Design §9.1 template)", async () => {
    await submitOrgRequest(input());
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("an animal that is not listed → 404 not_found", async () => {
    const result = await submitOrgRequest(input({ pet_id: KIKI }));
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("validates the fields before calling the database (422 with fields)", async () => {
    const result = await submitOrgRequest(input({ name: " ", phone: "123", email: "nije-mejl", message: "a".repeat(2001) }));
    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { name: "required", phone: "invalid", email: "invalid", message: "too_long" } },
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("a repeat with the same idempotency key returns the original and inserts nothing", async () => {
    const key = crypto.randomUUID();
    const first = await submitOrgRequest(input({ idempotency_key: key }));
    const second = await submitOrgRequest(input({ idempotency_key: key }));
    expect(second).toEqual(first);
    expect(state.requests).toHaveLength(1);
  });
});

describe("FR-47 #2 — a Visitor must create an account first", () => {
  it("without a session → 401 unauthenticated and nothing is written", async () => {
    state.user = null;
    const result = await submitOrgRequest(input());
    expect(result).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.requests).toHaveLength(0);
  });
});

describe("API §11 — 5 requests per hour", () => {
  it("the 6th submitOrgRequest within an hour → 429 rate_limited with retry_after_s", async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await submitOrgRequest(input());
      expect(ok.ok).toBe(true);
    }
    const sixth = await submitOrgRequest(input());
    expect(sixth).toMatchObject({ ok: false, error: { code: "rate_limited" } });
    if (sixth.ok) return;
    expect(sixth.error.details?.retry_after_s).toBeGreaterThan(0);
    expect(sixth.error.details?.retry_after_s).toBeLessThanOrEqual(3600);
    expect(state.requests).toHaveLength(5);
    expect(state.tables.rate_limit_counters[0]).toMatchObject({ user_id: IVANA, operation: "org_requests.create", count: 5 });
  });
});
