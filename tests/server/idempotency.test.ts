import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { withIdempotency } = await import("@/lib/server/idempotency");

type Row = Record<string, unknown>;

// In-memory stand-in for the caller's Data API client: filters by the columns the
// code asks for, like RLS + PostgREST would for the caller's own rows.
function fakeDb(tables: Record<string, Row[]> = {}) {
  function from(table: string) {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let insert: Row | null = null;
    const matching = () => rows.filter((r) => filters.every((f) => f(r)));
    const builder = {
      select: () => builder,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), builder),
      insert: (row: Row) => ((insert = row), builder),
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (insert) rows.push({ created_at: new Date().toISOString(), ...insert });
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }
  return { from, tables };
}

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";
const KEY = "6f1c1d3e-6a3b-4f8e-9a51-1c2f3b4a5d6e";

describe("withIdempotency (API §3.3)", () => {
  it("runs the operation once and stores its result in idempotency_keys", async () => {
    const db = fakeDb();
    const run = vi.fn(async () => ({ ok: true as const, data: { id: "inv-1" } }));

    const result = await withIdempotency(db as never, { userId: ALICE, key: KEY, operation: "invitations.send" }, run);

    expect(result).toEqual({ ok: true, data: { id: "inv-1" } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(db.tables.idempotency_keys).toEqual([
      expect.objectContaining({ user_id: ALICE, key: KEY, operation: "invitations.send", result }),
    ]);
  });

  it("a repeat with the same key within 24 h replays the stored result and performs nothing", async () => {
    const db = fakeDb();
    const run = vi.fn(async () => ({ ok: true as const, data: { id: "inv-1" } }));
    const first = await withIdempotency(db as never, { userId: ALICE, key: KEY, operation: "invitations.send" }, run);

    const later = new Date(Date.now() + 23 * 60 * 60 * 1000);
    const again = vi.fn(async () => ({ ok: true as const, data: { id: "inv-2" } }));
    const second = await withIdempotency(
      db as never,
      { userId: ALICE, key: KEY, operation: "invitations.send", now: later },
      again,
    );

    expect(second).toEqual(first);
    expect(again).not.toHaveBeenCalled();
    expect(db.tables.idempotency_keys).toHaveLength(1);
  });

  it("after 24 h the stored result no longer replays", async () => {
    const db = fakeDb();
    await withIdempotency(db as never, { userId: ALICE, key: KEY, operation: "op" }, async () => ({
      ok: true as const,
      data: 1,
    }));

    const run = vi.fn(async () => ({ ok: true as const, data: 2 }));
    const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
    await withIdempotency(db as never, { userId: ALICE, key: KEY, operation: "op", now: later }, run);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a different user's identical key is independent", async () => {
    const db = fakeDb();
    await withIdempotency(db as never, { userId: ALICE, key: KEY, operation: "op" }, async () => ({
      ok: true as const,
      data: "alice",
    }));

    const run = vi.fn(async () => ({ ok: true as const, data: "bob" }));
    const result = await withIdempotency(db as never, { userId: BOB, key: KEY, operation: "op" }, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, data: "bob" });
  });

  it("a failed attempt is not stored, so the same intent can run again", async () => {
    const db = fakeDb();
    await withIdempotency(db as never, { userId: ALICE, key: KEY, operation: "op" }, async () => ({
      ok: false as const,
      error: { code: "rate_limited", message: "x" },
    }));

    expect(db.tables.idempotency_keys).toHaveLength(0);
  });
});
