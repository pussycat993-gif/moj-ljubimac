// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-31 #1, FR-40 #1 (route side), EP-52 steps 1–5, route auth — EP-52 POST /api/internal/retention-nightly with
// the service-role client and R2 faked (succession, the cascade, the queue triggers, the purges and the expiry are
// proven in supabase/tests/retention_job.test.sql and succession_job.test.sql). Secret check; the job works only at
// 03:xx Europe/Belgrade; the steps run in EP-52 order; queued keys are dequeued only after R2 confirms; orphans
// older than 24 h that no row uses are deleted (≤ 1000 listed per run); expired archives are deleted; without R2
// credentials R2 is skipped and the keys stay queued; counts per EP-52. Step 31 (EP-52 v1.4, E-16): before the
// accounts are deleted, each due account's non-expired Paddle subscription is cancelled immediately (mocked fetch)
// and marked expired; a failed cancel skips that account tonight (p_skip); an empty PADDLE_API_KEY makes no call.

type Rpc = { data: unknown; error: { message: string } | null };
type Listed = { key: string; last_modified: string };

const fake = vi.hoisted(() => ({
  rpcQueues: {} as Record<string, Rpc[]>,
  rpcCalls: [] as { fn: string; args: unknown }[],
  queue: [] as string[],
  inUse: new Set<string>(),
  configured: true,
  objects: {} as Record<string, Listed[]>,
  listCalls: [] as { prefix: string; maxKeys?: number; continuationToken?: string | null }[],
  removed: [] as string[],
  failRemove: new Set<string>(),
  dueProfiles: [] as { id: string }[],
  providerSubs: [] as { id: string; user_id: string; provider_subscription_id: string; status: string }[],
  updates: [] as { table: string; values: Record<string, unknown>; eq: unknown[] }[],
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        lte: () => chain,
        in: () => chain,
        neq: () => chain,
        not: () => chain,
        update: (values: Record<string, unknown>) => ({
          eq: async (...eq: unknown[]) => {
            fake.updates.push({ table, values, eq });
            const row = fake.providerSubs.find((s) => s.id === eq[1]);
            if (row) Object.assign(row, values);
            return { error: null };
          },
        }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: table === "profiles" ? fake.dueProfiles : fake.providerSubs.filter((s) => s.status !== "expired"),
            error: null,
          }).then(resolve),
      };
      return chain;
    },
    rpc: async (fn: string, args?: unknown) => {
      fake.rpcCalls.push({ fn, args });
      const queued = fake.rpcQueues[fn];
      if (queued && queued.length > 0) return queued.shift();
      switch (fn) {
        case "retention_delete_due_accounts":
          return { data: { accounts_deleted: 0, households_transferred: 0, organisations_deleted: 0, failed: 0 }, error: null };
        case "r2_deletion_batch":
          return { data: fake.queue.slice(0, (args as { p_limit: number }).p_limit), error: null };
        case "r2_dequeue": {
          const keys = (args as { p_keys: string[] }).p_keys;
          fake.queue = fake.queue.filter((k) => !keys.includes(k));
          return { data: keys.length, error: null };
        }
        case "r2_keys_in_use":
          return { data: (args as { p_keys: string[] }).p_keys.filter((k) => fake.inUse.has(k)), error: null };
        case "retention_purge_deliveries":
          return { data: 0, error: null };
        case "retention_expire_invitations":
          return { data: { invitations_expired: 0, transfers_expired: 0 }, error: null };
        case "retention_expire_exports":
          return { data: { exports_expired: 0, r2_keys: [] }, error: null };
        case "retention_purge_server_support":
          return { data: { idempotency_keys: 0, rate_limit_counters: 0 }, error: null };
        default:
          return { data: null, error: null };
      }
    },
  }),
}));

vi.mock("@/lib/integrations/r2", () => ({
  r2Configured: () => fake.configured,
  r2: () => ({
    remove: async (key: string) => {
      if (fake.failRemove.has(key)) return false;
      fake.removed.push(key);
      return true;
    },
    list: async (prefix: string, opts: { maxKeys?: number; continuationToken?: string | null } = {}) => {
      fake.listCalls.push({ prefix, ...opts });
      const all = fake.objects[prefix] ?? [];
      const start = opts.continuationToken ? Number(opts.continuationToken) : 0;
      const size = Math.min(opts.maxKeys ?? 1000, 2);
      const objects = all.slice(start, start + size);
      const next = start + size < all.length ? String(start + size) : null;
      return { objects, next_token: next };
    },
  }),
}));

const { POST } = await import("@/app/api/internal/retention-nightly/route");

const SECRET = "dispatch-secret-for-tests";
/** 03:30 Belgrade in winter (CET, UTC+1) — the 02:30 UTC call. */
const WINTER = "2026-11-01T02:30:00Z";
/** 03:30 Belgrade in summer (CEST, UTC+2) — the 01:30 UTC call. */
const SUMMER = "2026-07-01T01:30:00Z";
const OLD = "2026-10-30T00:00:00Z";
const FRESH = "2026-11-01T01:00:00Z";

const ZERO = {
  accounts_deleted: 0,
  households_transferred: 0,
  r2_objects_deleted: 0,
  deliveries_purged: 0,
  invitations_expired: 0,
  transfers_expired: 0,
  exports_expired: 0,
};

function request(headers: Record<string, string> = { "x-dispatch-secret": SECRET }) {
  return new NextRequest("http://localhost/api/internal/retention-nightly", { method: "POST", headers });
}

const calls = (fn: string) => fake.rpcCalls.filter((c) => c.fn === fn);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(WINTER));
  vi.stubEnv("DISPATCH_SECRET", SECRET);
  fake.rpcQueues = {};
  fake.rpcCalls = [];
  fake.queue = [];
  fake.inUse = new Set();
  fake.configured = true;
  fake.objects = {};
  fake.listCalls = [];
  fake.removed = [];
  fake.failRemove = new Set();
  fake.dueProfiles = [];
  fake.providerSubs = [];
  fake.updates = [];
  vi.stubEnv("PADDLE_API_KEY", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("EP-52 route auth", () => {
  it.each([
    ["missing", {}],
    ["wrong", { "x-dispatch-secret": "nope" }],
    ["prefix of the right", { "x-dispatch-secret": SECRET.slice(0, -1) }],
  ])("%s X-Dispatch-Secret → 401 unauthenticated, nothing done", async (_label, headers) => {
    const response = await POST(request(headers as Record<string, string>));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthenticated" });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.removed).toHaveLength(0);
  });

  it("an unset DISPATCH_SECRET rejects every call", async () => {
    vi.stubEnv("DISPATCH_SECRET", "");
    expect((await POST(request({ "x-dispatch-secret": "" }))).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe("EP-52 the Belgrade 03:30 window", () => {
  it.each([
    ["winter 01:30 UTC (02:30 Belgrade)", "2026-11-01T01:30:00Z"],
    ["summer 02:30 UTC (04:30 Belgrade)", "2026-07-01T02:30:00Z"],
  ])("%s → zero counts, nothing done", async (_label, at) => {
    vi.setSystemTime(new Date(at));
    const response = await POST(request());
    expect(await response.json()).toEqual(ZERO);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("03:30 Belgrade in summer runs the job", async () => {
    vi.setSystemTime(new Date(SUMMER));
    await POST(request());
    expect(calls("retention_delete_due_accounts")).toHaveLength(1);
  });
});

describe("EP-52 steps 1–5", () => {
  it("run in EP-52 order, then the TC §5.9 purge; the response has exactly the EP-52 counts", async () => {
    fake.rpcQueues.retention_delete_due_accounts = [
      { data: { accounts_deleted: 2, households_transferred: 1, organisations_deleted: 0, failed: 0 }, error: null },
    ];
    fake.rpcQueues.retention_purge_deliveries = [{ data: 7, error: null }];
    fake.rpcQueues.retention_expire_invitations = [{ data: { invitations_expired: 3, transfers_expired: 1 }, error: null }];
    fake.rpcQueues.retention_expire_exports = [{ data: { exports_expired: 1, r2_keys: ["exports/u1/e1.zip"] }, error: null }];
    fake.queue = ["u/a/pets/p/photo/1.jpg"];
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accounts_deleted: 2,
      households_transferred: 1,
      r2_objects_deleted: 2,
      deliveries_purged: 7,
      invitations_expired: 3,
      transfers_expired: 1,
      exports_expired: 1,
    });
    expect(fake.rpcCalls.map((c) => c.fn)).toEqual([
      "retention_delete_due_accounts",
      "r2_deletion_batch",
      "r2_dequeue",
      "retention_purge_deliveries",
      "retention_expire_invitations",
      "retention_expire_exports",
      "r2_dequeue",
      "retention_purge_server_support",
    ]);
  });

  it("FR-31 #1 / FR-40 #1: account batches repeat while full; a batch of failures stops the loop", async () => {
    fake.rpcQueues.retention_delete_due_accounts = [
      { data: { accounts_deleted: 100, households_transferred: 4, organisations_deleted: 1, failed: 0 }, error: null },
      { data: { accounts_deleted: 3, households_transferred: 1, organisations_deleted: 0, failed: 0 }, error: null },
    ];
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ accounts_deleted: 103, households_transferred: 5 });
    expect(calls("retention_delete_due_accounts")).toHaveLength(2);

    fake.rpcCalls = [];
    fake.rpcQueues.retention_delete_due_accounts = [
      { data: { accounts_deleted: 0, households_transferred: 0, organisations_deleted: 0, failed: 100 }, error: null },
    ];
    await POST(request());
    expect(calls("retention_delete_due_accounts")).toHaveLength(1);
  });

  it("FR-40 #1: queued keys are deleted from R2 and dequeued only after R2 confirms", async () => {
    fake.queue = ["u/x/pets/p/photo/a.jpg", "u/x/pets/p/photo/b.jpg", "exports/x/e.zip"];
    fake.failRemove.add("u/x/pets/p/photo/b.jpg");
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ r2_objects_deleted: 2 });
    expect(fake.removed).toEqual(["u/x/pets/p/photo/a.jpg", "exports/x/e.zip"]);
    expect(calls("r2_dequeue")[0].args).toEqual({ p_keys: ["u/x/pets/p/photo/a.jpg", "exports/x/e.zip"] });
    expect(fake.queue).toEqual(["u/x/pets/p/photo/b.jpg"]);
  });

  it("API §10 item 7: orphans older than 24 h that no row uses are deleted; used or newer objects stay", async () => {
    fake.objects["u/"] = [
      { key: "u/used.jpg", last_modified: OLD },
      { key: "u/orphan.jpg", last_modified: OLD },
      { key: "u/fresh.jpg", last_modified: FRESH },
    ];
    fake.objects["exports/"] = [{ key: "exports/old.zip", last_modified: OLD }];
    fake.inUse = new Set(["u/used.jpg"]);
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ r2_objects_deleted: 2 });
    expect(fake.removed).toEqual(["u/orphan.jpg", "exports/old.zip"]);
    expect(fake.listCalls.map((c) => c.prefix)).toEqual(["u/", "u/", "o/", "p/", "exports/"]);
    expect(calls("r2_keys_in_use").map((c) => c.args)).toEqual([
      { p_keys: ["u/used.jpg", "u/orphan.jpg"] },
      { p_keys: ["exports/old.zip"] },
    ]);
  });

  it("the orphan scan lists at most 1000 objects per run", async () => {
    fake.objects["u/"] = Array.from({ length: 1200 }, (_, i) => ({ key: `u/${i}.jpg`, last_modified: FRESH }));
    await POST(request());
    const listed = fake.listCalls.reduce((sum, c) => sum + Math.min(c.maxKeys ?? 1000, 2), 0);
    expect(listed).toBeLessThanOrEqual(1000);
    expect(fake.listCalls.every((c) => c.prefix === "u/")).toBe(true);
    expect(fake.listCalls.at(-1)?.maxKeys).toBeGreaterThan(0);
  });

  it("EP-52 step 5: the expired archive is deleted from R2 and dequeued", async () => {
    fake.rpcQueues.retention_expire_exports = [{ data: { exports_expired: 2, r2_keys: ["exports/u/1.zip"] }, error: null }];
    fake.queue = [];
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ exports_expired: 2, r2_objects_deleted: 1 });
    expect(fake.removed).toEqual(["exports/u/1.zip"]);
    expect(calls("r2_dequeue").at(-1)?.args).toEqual({ p_keys: ["exports/u/1.zip"] });
  });

  it("without R2 credentials R2 is skipped and every key stays queued", async () => {
    fake.configured = false;
    fake.queue = ["u/x/pets/p/photo/a.jpg"];
    fake.rpcQueues.retention_expire_exports = [{ data: { exports_expired: 1, r2_keys: ["exports/u/1.zip"] }, error: null }];
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ r2_objects_deleted: 0, exports_expired: 1 });
    expect(fake.removed).toHaveLength(0);
    expect(fake.listCalls).toHaveLength(0);
    expect(calls("r2_deletion_batch")).toHaveLength(0);
    expect(calls("r2_dequeue")).toHaveLength(0);
    expect(fake.queue).toEqual(["u/x/pets/p/photo/a.jpg"]);
  });

  it("a database error → 500 internal_error", async () => {
    fake.rpcQueues.retention_purge_deliveries = [{ data: null, error: { message: "boom" } }];
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "internal_error" });
  });
});

describe("R2 adapter list (orphan scan)", () => {
  it("signs a ListObjectsV2 request and parses keys, dates and the continuation token", async () => {
    const actual = await vi.importActual<typeof import("@/lib/integrations/r2")>("@/lib/integrations/r2");
    const requests: Request[] = [];
    const storage = actual.createR2({
      accountId: "acc",
      accessKeyId: "AKID",
      secretAccessKey: "secret",
      bucket: "files",
      fetch: (async (input: RequestInfo | URL) => {
        requests.push(input as Request);
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>true</IsTruncated>` +
            `<Contents><Key>u/a/pets/p/photo/1-a&amp;b.jpg</Key><LastModified>2026-10-30T00:00:00.000Z</LastModified></Contents>` +
            `<Contents><Key>u/b.jpg</Key><LastModified>2026-11-01T00:00:00.000Z</LastModified></Contents>` +
            `<NextContinuationToken>tok/2</NextContinuationToken></ListBucketResult>`,
          { status: 200 },
        );
      }) as typeof fetch,
    });
    const page = await storage.list("u/", { maxKeys: 5000, continuationToken: "tok/1" });
    expect(page).toEqual({
      objects: [
        { key: "u/a/pets/p/photo/1-a&b.jpg", last_modified: "2026-10-30T00:00:00.000Z" },
        { key: "u/b.jpg", last_modified: "2026-11-01T00:00:00.000Z" },
      ],
      next_token: "tok/2",
    });
    const url = new URL(requests[0].url);
    expect(url.origin + url.pathname).toBe("https://acc.r2.cloudflarestorage.com/files");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      "list-type": "2",
      prefix: "u/",
      "max-keys": "1000",
      "continuation-token": "tok/1",
    });
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it("a non-2xx answer throws; the last page has no token", async () => {
    const actual = await vi.importActual<typeof import("@/lib/integrations/r2")>("@/lib/integrations/r2");
    const config = { accountId: "acc", accessKeyId: "AKID", secretAccessKey: "secret", bucket: "files" };
    const failing = actual.createR2({ ...config, fetch: (async () => new Response("no", { status: 403 })) as typeof fetch });
    await expect(failing.list("u/")).rejects.toThrow("R2 list failed with 403");
    const last = actual.createR2({
      ...config,
      fetch: (async () => new Response("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>")) as typeof fetch,
    });
    expect(await last.list("p/")).toEqual({ objects: [], next_token: null });
  });
});

describe("EP-52 step 1 — Paddle cancellation (v1.4)", () => {
  const ANA = "a1000000-0000-4000-8000-000000000006";
  const MARKO = "a1000000-0000-4000-8000-000000000002";
  let fetchCalls: { url: string; method: string; body: unknown }[];

  beforeEach(() => {
    vi.stubEnv("PADDLE_API_KEY", "pdl_test_key");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
    fake.dueProfiles = [{ id: ANA }, { id: MARKO }];
    fake.providerSubs = [
      { id: "s-ana", user_id: ANA, provider_subscription_id: "sub_test_ana", status: "cancelled" },
      { id: "s-marko", user_id: MARKO, provider_subscription_id: "sub_test_marko", status: "active" },
    ];
    fetchCalls = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      fetchCalls.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("sub_test_marko")) return new Response(JSON.stringify({ error: { code: "internal_error" } }), { status: 500 });
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("cancels each due account's non-expired Paddle subscription immediately; a failed cancel skips that account", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(fetchCalls).toEqual([
      { url: "https://sandbox-api.paddle.com/subscriptions/sub_test_ana/cancel", method: "POST", body: { effective_from: "immediately" } },
      { url: "https://sandbox-api.paddle.com/subscriptions/sub_test_marko/cancel", method: "POST", body: { effective_from: "immediately" } },
    ]);
    // The cancelled one is marked expired, so a later run never cancels it twice.
    expect(fake.updates).toEqual([{ table: "subscriptions", values: { status: "expired", auto_renew: false }, eq: ["id", "s-ana"] }]);
    // Marko's cancel failed: skipped tonight, retried the next night.
    expect(calls("retention_delete_due_accounts")[0].args).toEqual({ p_limit: 100, p_skip: [MARKO] });
    expect(console.warn).toHaveBeenCalledWith(
      "[retention-nightly] Paddle cancellation failed — account skipped tonight:",
      MARKO,
      expect.any(String),
    );
  });

  it("the next night the expired row is not cancelled again", async () => {
    await POST(request());
    fetchCalls = [];
    fake.rpcCalls = [];
    await POST(request());
    expect(fetchCalls.map((c) => c.url)).toEqual(["https://sandbox-api.paddle.com/subscriptions/sub_test_marko/cancel"]);
  });

  it("PADDLE_API_KEY empty → no call, nobody skipped", async () => {
    vi.stubEnv("PADDLE_API_KEY", "");
    await POST(request());
    expect(fetchCalls).toEqual([]);
    expect(calls("retention_delete_due_accounts")[0].args).toEqual({ p_limit: 100, p_skip: [] });
  });
});
