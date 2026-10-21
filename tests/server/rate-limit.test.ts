import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { checkRateLimit } = await import("@/lib/server/rate-limit");

type Row = Record<string, unknown>;

// In-memory stand-in for the caller's Data API client (rate_limit_counters).
function fakeDb(tables: Record<string, Row[]> = {}) {
  function from(table: string) {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let write: { op: "insert" | "update"; row: Row } | null = null;
    const matching = () => rows.filter((r) => filters.every((f) => f(r)));
    const builder = {
      select: () => builder,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
      insert: (row: Row) => ((write = { op: "insert", row }), builder),
      update: (row: Row) => ((write = { op: "update", row }), builder),
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (write?.op === "insert") rows.push({ ...write.row });
        if (write?.op === "update") for (const r of matching()) Object.assign(r, write.row);
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }
  return { from, tables };
}

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";
const HOUR = 3600;
// 10:15:00 UTC → the 1-hour window started at 10:00:00.
const T0 = new Date("2026-10-21T10:15:00Z");

describe("checkRateLimit (API §11)", () => {
  it("calls up to the limit pass and are counted per user, operation and window", async () => {
    const db = fakeDb();
    for (let i = 0; i < 5; i++) {
      const at = new Date(T0.getTime() + i * 1000);
      expect(
        await checkRateLimit(db as never, { userId: ALICE, operation: "requests.submit", limit: 5, windowSeconds: HOUR, now: at }),
      ).toBeNull();
    }
    expect(db.tables.rate_limit_counters).toEqual([
      { user_id: ALICE, operation: "requests.submit", window_start: "2026-10-21T10:00:00.000Z", count: 5 },
    ]);
  });

  it("the next call over the limit returns rate_limited with retry_after_s until the window ends", async () => {
    const db = fakeDb();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(db as never, { userId: ALICE, operation: "requests.submit", limit: 5, windowSeconds: HOUR, now: T0 });
    }

    const error = await checkRateLimit(db as never, {
      userId: ALICE,
      operation: "requests.submit",
      limit: 5,
      windowSeconds: HOUR,
      now: T0,
    });

    expect(error).toMatchObject({ code: "rate_limited", details: { retry_after_s: 45 * 60 } });
    expect(db.tables.rate_limit_counters[0].count).toBe(5);
  });

  it("a new window resets the count", async () => {
    const db = fakeDb();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(db as never, { userId: ALICE, operation: "requests.submit", limit: 5, windowSeconds: HOUR, now: T0 });
    }

    const nextWindow = new Date("2026-10-21T11:00:01Z");
    expect(
      await checkRateLimit(db as never, {
        userId: ALICE,
        operation: "requests.submit",
        limit: 5,
        windowSeconds: HOUR,
        now: nextWindow,
      }),
    ).toBeNull();
  });

  it("other users and other operations have their own counters", async () => {
    const db = fakeDb();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(db as never, { userId: ALICE, operation: "requests.submit", limit: 5, windowSeconds: HOUR, now: T0 });
    }

    expect(
      await checkRateLimit(db as never, { userId: BOB, operation: "requests.submit", limit: 5, windowSeconds: HOUR, now: T0 }),
    ).toBeNull();
    expect(
      await checkRateLimit(db as never, { userId: ALICE, operation: "whatsapp.send_code", limit: 5, windowSeconds: HOUR, now: T0 }),
    ).toBeNull();
  });
});
