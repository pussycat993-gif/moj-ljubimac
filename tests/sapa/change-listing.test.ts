// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-64 #3–#6 — EP-77 changeListing (lib/actions/listings.ts) with a fake server client over in-memory tables.
// extend (active / expired → active, expires_at = now + 30 days, expiry_notice_sent_at cleared), resolve (default
// outcome by type), delete (confirm = true; photos cascade with their keys queued). The database answers the
// Step 28a trigger errors (premium_required:listings, marketplace_suspended), which the fake replays.

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };

const AUTHOR = "a1000000-0000-4000-8000-000000000001";
const OTHER = "a1000000-0000-4000-8000-000000000002";
const CITY = "d1000000-0000-4000-8000-000000000001";
const LISTING = "e1000000-0000-4000-8000-000000000001";
const OTHERS_LISTING = "e1000000-0000-4000-8000-000000000002";
const DAY_MS = 86_400_000;

const state = {
  user: AUTHOR,
  tables: {} as Record<string, Row[]>,
  writes: [] as { table: string; op: string; payload?: Row; filters: [string, unknown][] }[],
  fail: null as null | { table: string; op: string; error: DbError },
  emptyWrites: false,
  queue: [] as string[],
  rpcCalls: [] as { name: string; args: Row }[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/integrations/r2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/r2")>("@/lib/integrations/r2");
  return {
    ...actual,
    r2: () => ({
      presignGet: async (key: string) => ({ url: `https://r2.test/get/${key}?sig=1`, expires_at: "2026-10-29T08:10:00.000Z" }),
    }),
  };
});

const { changeListing } = await import("@/lib/actions/listings");

function visible(table: string): Row[] {
  const rows = state.tables[table] ?? [];
  if (table === "listings") return rows.filter((l) => l.author_id === state.user || l.status === "active");
  return rows;
}

function rawListing(l: Row) {
  return {
    ...l,
    city: { id: l.city_id, name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.25, longitude: 19.84 },
    price: null,
    photos: state.tables.listing_photos
      .filter((p) => p.listing_id === l.id)
      .map((p) => ({ id: p.id, listing_id: p.listing_id, position: p.position, file_name: "slika.jpg", url: null, r2_key: p.r2_key })),
  };
}

function query(table: string) {
  const filters: [string, unknown][] = [];
  let op = "select";
  let payload: Row | undefined;
  const run = () => {
    if (op !== "select") state.writes.push({ table, op, payload, filters: [...filters] });
    if (state.fail && state.fail.table === table && state.fail.op === op) return { data: null, error: state.fail.error };
    const rows = visible(table).filter((r) => filters.every(([c, v]) => r[c] === v));
    if (op !== "select" && state.emptyWrites) return { data: [], error: null };
    if (op === "update") {
      for (const r of rows) Object.assign(r, payload);
      return { data: rows.map((r) => ({ id: r.id })), error: null };
    }
    if (op === "delete") {
      const ids = rows.map((r) => r.id);
      state.tables[table] = state.tables[table].filter((r) => !ids.includes(r.id));
      if (table === "listings") {
        // ON DELETE CASCADE + the listing_photos trigger queues the keys.
        for (const p of state.tables.listing_photos.filter((p) => ids.includes(p.listing_id))) state.queue.push(String(p.r2_key));
        state.tables.listing_photos = state.tables.listing_photos.filter((p) => !ids.includes(p.listing_id));
      }
      return { data: rows.map((r) => ({ id: r.id })), error: null };
    }
    return { data: rows, error: null };
  };
  const builder = {
    select: () => builder,
    update: (row: Row) => ((op = "update"), (payload = row), builder),
    delete: () => ((op = "delete"), builder),
    eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
    maybeSingle: async () => {
      const result = run();
      return { data: (result.data as Row[] | null)?.[0] ?? null, error: result.error };
    },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: state.user, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    rpc: async (name: string, args: Row) => {
      state.rpcCalls.push({ name, args });
      if (name !== "get_listing") throw new Error(`unexpected rpc ${name}`);
      const l = visible("listings").find((r) => r.id === args.p_listing_id);
      return l ? { data: rawListing(l), error: null } : { data: null, error: { code: "P0001", message: "not_found" } };
    },
    from: (table: string) => query(table),
  };
}

function listing(overrides: Row = {}): Row {
  return {
    id: LISTING,
    author_id: AUTHOR,
    organisation_id: null,
    type: "giving",
    status: "active",
    title: "Transporter za mačke",
    description: "Malo korišćen.",
    category: "carriers",
    species: "cat",
    city_id: CITY,
    price_minor: null,
    price_negotiable: false,
    resolved_outcome: null,
    published_at: "2026-10-01T08:00:00.000Z",
    expires_at: "2026-10-31T08:00:00.000Z",
    expiry_notice_sent_at: "2026-10-28T08:00:00.000Z",
    ...overrides,
  };
}

const updates = () => state.writes.filter((w) => w.table === "listings" && w.op === "update");
const deletes = () => state.writes.filter((w) => w.table === "listings" && w.op === "delete");

beforeEach(() => {
  state.user = AUTHOR;
  state.tables = {
    profiles: [AUTHOR, OTHER].map((id) => ({ id, deletion_requested_at: null })),
    organisation_memberships: [],
    listings: [listing(), listing({ id: OTHERS_LISTING, author_id: OTHER })],
    listing_photos: [1, 2].map((n) => ({
      id: `f1000000-0000-4000-8000-00000000000${n}`,
      listing_id: LISTING,
      position: n,
      r2_key: `u/${AUTHOR}/listings/${LISTING}/k${n}-slika.jpg`,
    })),
  };
  state.writes = [];
  state.fail = null;
  state.emptyWrites = false;
  state.queue = [];
  state.rpcCalls = [];
});

describe("EP-77 extend (FR-64 #3, #4)", () => {
  it.each(["active", "expired"])("a %s listing → active, expires_at = now + 30 days, expiry_notice_sent_at null", async (status) => {
    state.tables.listings[0].status = status;
    const before = Date.now();
    const result = await changeListing({ listing_id: LISTING, op: "extend" });
    const after = Date.now();

    expect(updates()).toHaveLength(1);
    const payload = updates()[0].payload!;
    expect(payload).toMatchObject({ status: "active", expiry_notice_sent_at: null });
    expect(Object.keys(payload).sort()).toEqual(["expires_at", "expiry_notice_sent_at", "status"]);
    const expires = Date.parse(String(payload.expires_at));
    expect(expires).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
    expect(expires).toBeLessThanOrEqual(after + 30 * DAY_MS);
    expect(updates()[0].filters).toEqual([["id", LISTING]]);

    expect(result).toMatchObject({ ok: true, data: { id: LISTING, status: "active", expires_at: payload.expires_at } });
    expect(state.tables.listings[0].expiry_notice_sent_at).toBeNull();
  });

  it.each(["resolved", "hidden"])("a %s listing → listing_not_active, nothing written", async (status) => {
    state.tables.listings[0].status = status;
    expect(await changeListing({ listing_id: LISTING, op: "extend" })).toMatchObject({ ok: false, error: { code: "listing_not_active" } });
    expect(updates()).toHaveLength(0);
  });

  it("an expired listing of a Free author with 3 active → premium_required (listings) from the trigger", async () => {
    state.tables.listings[0].status = "expired";
    state.fail = { table: "listings", op: "update", error: { code: "P0001", message: "premium_required:listings" } };
    expect(await changeListing({ listing_id: LISTING, op: "extend" })).toEqual({
      ok: false,
      error: { code: "premium_required", message: "premium_required:listings", details: { limit: "listings" } },
    });
    expect(state.tables.listings[0].status).toBe("expired");
  });
});

describe("EP-77 resolve (FR-64 #5)", () => {
  it.each([
    ["giving", "given"],
    ["selling", "sold"],
    ["need", "donated"],
    ["seeking", "found"],
  ])("a %s listing resolves with the default outcome %s", async (type, outcome) => {
    state.tables.listings[0].type = type;
    const result = await changeListing({ listing_id: LISTING, op: "resolve" });
    expect(updates()[0].payload).toEqual({ status: "resolved", resolved_outcome: outcome });
    expect(result).toMatchObject({ ok: true, data: { status: "resolved", resolved_outcome: outcome } });
  });

  it("uses an explicit outcome and rejects an unknown one", async () => {
    expect(await changeListing({ listing_id: LISTING, op: "resolve", outcome: "found" })).toMatchObject({
      ok: true,
      data: { resolved_outcome: "found" },
    });
    state.tables.listings[0].status = "active";
    expect(await changeListing({ listing_id: LISTING, op: "resolve", outcome: "lost" as never })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { outcome: "invalid" } },
    });
  });

  it.each(["expired", "resolved", "hidden"])("a %s listing → listing_not_active", async (status) => {
    state.tables.listings[0].status = status;
    expect(await changeListing({ listing_id: LISTING, op: "resolve" })).toMatchObject({ ok: false, error: { code: "listing_not_active" } });
    expect(updates()).toHaveLength(0);
  });
});

describe("EP-77 delete (FR-64 #6)", () => {
  it("requires confirm = true", async () => {
    for (const input of [{}, { confirm: false }, { confirm: "true" }]) {
      expect(await changeListing({ listing_id: LISTING, op: "delete", ...input } as never)).toEqual({
        ok: false,
        error: { code: "validation_failed", message: "validation_failed", fields: { confirm: "required" } },
      });
    }
    expect(deletes()).toHaveLength(0);
    expect(state.tables.listings).toHaveLength(2);
  });

  it("removes the listing and its photos (keys queued) and returns deleted_listing_id", async () => {
    expect(await changeListing({ listing_id: LISTING, op: "delete", confirm: true })).toEqual({
      ok: true,
      data: { deleted_listing_id: LISTING },
    });
    expect(deletes()[0].filters).toEqual([["id", LISTING]]);
    expect(state.tables.listings.map((l) => l.id)).toEqual([OTHERS_LISTING]);
    expect(state.tables.listing_photos).toHaveLength(0);
    expect(state.queue).toEqual([`u/${AUTHOR}/listings/${LISTING}/k1-slika.jpg`, `u/${AUTHOR}/listings/${LISTING}/k2-slika.jpg`]);
  });

  it("deletes a resolved listing too", async () => {
    state.tables.listings[0].status = "resolved";
    expect((await changeListing({ listing_id: LISTING, op: "delete", confirm: true })).ok).toBe(true);
  });
});

describe("EP-77 authorization and errors", () => {
  it("someone else's listing → forbidden_role; unknown or malformed id → not_found", async () => {
    for (const op of ["extend", "resolve"] as const) {
      expect(await changeListing({ listing_id: OTHERS_LISTING, op })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    }
    expect(await changeListing({ listing_id: OTHERS_LISTING, op: "delete", confirm: true })).toMatchObject({
      ok: false,
      error: { code: "forbidden_role" },
    });
    expect(await changeListing({ listing_id: "e1000000-0000-4000-8000-0000000000ff", op: "extend" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await changeListing({ listing_id: "nope", op: "extend" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(state.writes).toHaveLength(0);
  });

  it("an unknown op → validation_failed", async () => {
    expect(await changeListing({ listing_id: LISTING, op: "hide" } as never)).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { op: "invalid" } },
    });
  });

  it("a suspended author → marketplace_suspended from the database", async () => {
    state.fail = { table: "listings", op: "update", error: { code: "P0001", message: "marketplace_suspended" } };
    expect(await changeListing({ listing_id: LISTING, op: "extend" })).toMatchObject({
      ok: false,
      error: { code: "marketplace_suspended" },
    });
    expect(await changeListing({ listing_id: LISTING, op: "resolve" })).toMatchObject({
      ok: false,
      error: { code: "marketplace_suspended" },
    });
  });

  it("a need of a pending shelter → organisation_pending_approval", async () => {
    state.tables.listings[0].type = "need";
    state.tables.organisation_memberships.push({
      user_id: AUTHOR,
      organisation_id: "b2000000-0000-4000-8000-000000000001",
      organisations: { approval_status: "pending" },
    });
    expect(await changeListing({ listing_id: LISTING, op: "extend" })).toMatchObject({
      ok: false,
      error: { code: "organisation_pending_approval" },
    });
  });

  it("an update or delete that touches no row (RLS) → not_found", async () => {
    state.emptyWrites = true;
    expect(await changeListing({ listing_id: LISTING, op: "extend" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await changeListing({ listing_id: LISTING, op: "delete", confirm: true })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});
