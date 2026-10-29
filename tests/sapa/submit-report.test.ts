// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-84 submitReport (lib/actions/reports.ts, Step 28c; FR-70 #1, #2) over a fake server client with in-memory
// listings (RLS: visible = active, or the caller's own) and reports (the Step 28a trigger sets reported_user_id to the
// listing's author; the unique partial indexes allow one open report per reporter and target). Also the EP-85
// wrappers' error mapping (an unknown user → not_found, owner decision).

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };

const IVANA = "a1000000-0000-4000-8000-000000000001";
const MARKO = "a1000000-0000-4000-8000-000000000002";
const JELENA = "a1000000-0000-4000-8000-000000000003";
const UNKNOWN = "a1000000-0000-4000-8000-0000000000ff";
const JELENA_LISTING = "f3000000-0000-4000-8000-000000000004";
const IVANA_LISTING = "f3000000-0000-4000-8000-000000000003";
const HIDDEN_LISTING = "f3000000-0000-4000-8000-000000000009";

const state = {
  user: IVANA as string | null,
  tables: {} as Record<string, Row[]>,
  inserts: [] as Row[],
  rpcResult: {} as Record<string, { data: unknown; error: DbError | null }>,
};

function visible(table: string): Row[] {
  const rows = (state.tables[table] ??= []);
  if (table === "listings") return rows.filter((l) => l.status === "active" || l.author_id === state.user);
  if (table === "reports") return rows.filter((r) => r.reporter_id === state.user);
  return rows;
}

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let insertRow: Row | null = null;
  const run = (): { data: Row[] | Row | null; error: DbError | null } => {
    if (insertRow) {
      const row = insertRow;
      if (row.reported_user_id === UNKNOWN) return { data: null, error: { code: "23503", message: "reports_reported_user_id_fkey" } };
      const reportedUser = row.listing_id
        ? (state.tables.listings.find((l) => l.id === row.listing_id)?.author_id ?? null)
        : row.reported_user_id;
      const report = {
        id: crypto.randomUUID(),
        reporter_id: state.user,
        status: "open",
        created_at: "2026-10-29T08:00:00.000Z",
        ...row,
        reported_user_id: reportedUser,
      };
      state.tables.reports.push(report);
      state.inserts.push(row);
      return { data: report, error: null };
    }
    return { data: visible(table).filter((r) => filters.every((f) => f(r))), error: null };
  };
  const builder = {
    select: () => builder,
    insert: (row: Row) => ((insertRow = row), builder),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), builder),
    maybeSingle: async () => {
      const result = run();
      return { data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error };
    },
    single: async () => run(),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.user
          ? { data: { user: { id: state.user, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } }, error: null }
          : { data: { user: null }, error: null },
    },
    from: (table: string) => (table === "profiles" ? profileQuery() : query(table)),
    rpc: async (name: string) => state.rpcResult[name] ?? { data: null, error: null },
  }),
}));

function profileQuery() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: { id: state.user, deletion_requested_at: null }, error: null }),
  };
  return builder;
}

const { submitReport, blockUser, unblockUser } = await import("@/lib/actions/reports");

beforeEach(() => {
  state.user = IVANA;
  state.tables = {
    listings: [
      { id: JELENA_LISTING, author_id: JELENA, status: "active" },
      { id: IVANA_LISTING, author_id: IVANA, status: "active" },
      { id: HIDDEN_LISTING, author_id: JELENA, status: "hidden" },
    ],
    reports: [],
    organisation_memberships: [],
  };
  state.inserts = [];
  state.rpcResult = {};
});

describe("FR-70 #1 — a report is recorded for the Operator", () => {
  it("a listing report names the listing; the author becomes reported_user_id", async () => {
    const result = await submitReport({ listing_id: JELENA_LISTING, reason: "scam", note: "  Traži uplatu unapred.  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.already_submitted).toBe(false);
    expect(result.data.report).toMatchObject({
      target: "listing",
      listing_id: JELENA_LISTING,
      reported_user_id: JELENA,
      reason: "scam",
      note: "Traži uplatu unapred.",
      status: "open",
    });
    expect(state.inserts).toEqual([
      { listing_id: JELENA_LISTING, reported_user_id: null, reason: "scam", note: "Traži uplatu unapred." },
    ]);
  });

  it("a user report names the user", async () => {
    const result = await submitReport({ user_id: MARKO, reason: "spam" });
    expect(result).toMatchObject({
      ok: true,
      data: { already_submitted: false, report: { target: "user", listing_id: null, reported_user_id: MARKO, note: null } },
    });
  });
});

describe("FR-70 #2 — the same target again while the earlier report is open", () => {
  it("returns the open report with already_submitted = true and writes nothing", async () => {
    const first = await submitReport({ listing_id: JELENA_LISTING, reason: "scam" });
    const again = await submitReport({ listing_id: JELENA_LISTING, reason: "spam", note: "Drugi put" });
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.data.already_submitted).toBe(true);
    expect(again.data.report.id).toBe(first.data.report.id);
    expect(state.inserts).toHaveLength(1);
  });

  it("for users too", async () => {
    await submitReport({ user_id: MARKO, reason: "spam" });
    expect(await submitReport({ user_id: MARKO, reason: "scam" })).toMatchObject({ ok: true, data: { already_submitted: true } });
    expect(state.inserts).toHaveLength(1);
  });

  it("a decided earlier report does not count", async () => {
    await submitReport({ user_id: MARKO, reason: "spam" });
    state.tables.reports[0].status = "dismissed";
    expect(await submitReport({ user_id: MARKO, reason: "spam" })).toMatchObject({ ok: true, data: { already_submitted: false } });
  });

  it("another reporter's open report on the same target does not count", async () => {
    await submitReport({ listing_id: JELENA_LISTING, reason: "scam" });
    state.user = MARKO;
    expect(await submitReport({ listing_id: JELENA_LISTING, reason: "scam" })).toMatchObject({
      ok: true,
      data: { already_submitted: false },
    });
  });
});

describe("validation and errors", () => {
  it("exactly one of listing_id and user_id", async () => {
    expect(await submitReport({ reason: "spam" })).toMatchObject({ ok: false, error: { fields: { listing_id: "invalid" } } });
    expect(await submitReport({ listing_id: JELENA_LISTING, user_id: MARKO, reason: "spam" })).toMatchObject({
      ok: false,
      error: { fields: { listing_id: "invalid" } },
    });
  });

  it("a note is required for Drugo and limited to 500 characters", async () => {
    expect(await submitReport({ user_id: MARKO, reason: "other", note: "  " })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { note: "required" } },
    });
    expect(await submitReport({ user_id: MARKO, reason: "spam", note: "a".repeat(501) })).toMatchObject({
      ok: false,
      error: { fields: { note: "too_long" } },
    });
    expect((await submitReport({ user_id: MARKO, reason: "other", note: "a".repeat(500) })).ok).toBe(true);
  });

  it("an unknown reason is refused", async () => {
    expect(await submitReport({ user_id: MARKO, reason: "boring" as never })).toMatchObject({
      ok: false,
      error: { fields: { reason: "required" } },
    });
  });

  it("the caller's own listing or own user → invalid", async () => {
    expect(await submitReport({ listing_id: IVANA_LISTING, reason: "spam" })).toMatchObject({
      ok: false,
      error: { fields: { listing_id: "invalid" } },
    });
    expect(await submitReport({ user_id: IVANA, reason: "spam" })).toMatchObject({ ok: false, error: { fields: { user_id: "invalid" } } });
  });

  it("a listing not visible to the caller → not_found", async () => {
    expect(await submitReport({ listing_id: HIDDEN_LISTING, reason: "spam" })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("an unknown user → not_found (FK error 23503, owner decision)", async () => {
    expect(await submitReport({ user_id: UNKNOWN, reason: "spam" })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("a Visitor → 401", async () => {
    state.user = null;
    expect(await submitReport({ user_id: MARKO, reason: "spam" })).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
  });
});

describe("EP-85 wrappers", () => {
  it("block returns the UserBlock; not_found and validation pass through", async () => {
    state.rpcResult.block_user = { data: { blocker_id: IVANA, blocked_id: MARKO, created_at: "2026-10-29T08:00:00Z" }, error: null };
    expect(await blockUser(MARKO)).toEqual({
      ok: true,
      data: { blocker_id: IVANA, blocked_id: MARKO, created_at: "2026-10-29T08:00:00Z" },
    });
    state.rpcResult.block_user = { data: null, error: { code: "P0001", message: "not_found" } };
    expect(await blockUser(UNKNOWN)).toMatchObject({ ok: false, error: { code: "not_found" } });
    state.rpcResult.block_user = { data: null, error: { code: "P0001", message: "validation_failed", details: "p_user_id:invalid" } };
    expect(await blockUser(IVANA)).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { p_user_id: "invalid" } } });
  });

  it("unblock answers ok(null)", async () => {
    expect(await unblockUser(MARKO)).toEqual({ ok: true, data: null });
    expect(await unblockUser("nije-uuid")).toMatchObject({ ok: false, error: { fields: { p_user_id: "invalid" } } });
  });
});
