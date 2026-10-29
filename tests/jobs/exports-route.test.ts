// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-50 route — POST /api/internal/exports with the service-role client, R2 and Resend faked (the pg_cron
// schedule is proven in supabase/tests/export_schedule.test.sql). Without or with a wrong X-Dispatch-Secret → 401;
// with it the route builds only `preparing` rows (the oldest one per run) and reports counts; a second run does
// not rebuild `ready` rows; without R2 credentials nothing is built.

type Row = Record<string, unknown>;

const fake = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  objects: {} as Record<string, Uint8Array>,
  puts: [] as string[],
  configured: true,
  emails: [] as string[],
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let range: [number, number] | null = null;
      let limit: number | null = null;
      let order: string | null = null;
      let patch: Row | null = null;
      const run = () => {
        const rows = (fake.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        if (patch) {
          for (const row of rows) Object.assign(row, patch);
          return { data: null, error: null };
        }
        let out = rows.map((row) => ({ ...row }));
        if (order) out.sort((a, b) => String(a[order!]).localeCompare(String(b[order!])));
        if (range) out = out.slice(range[0], range[1] + 1);
        if (limit !== null) out = out.slice(0, limit);
        return { data: out, error: null };
      };
      const query = {
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return query;
        },
        in(column: string, values: readonly unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        order(column: string) {
          order = column;
          return query;
        },
        range(from: number, to: number) {
          range = [from, to];
          return query;
        },
        limit(count: number) {
          limit = count;
          return query;
        },
        then<T>(resolve: (value: ReturnType<typeof run>) => T, reject?: (reason: unknown) => T) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return {
        select: () => query,
        update: (values: Row) => {
          patch = values;
          return query;
        },
      };
    },
  }),
}));

vi.mock("@/lib/integrations/r2", () => ({
  r2Configured: () => fake.configured,
  r2: () => ({
    get: async (key: string) => {
      if (!(key in fake.objects)) throw new Error("R2 GET failed with 404");
      return fake.objects[key];
    },
    put: async (key: string) => {
      fake.puts.push(key);
    },
  }),
}));

vi.mock("@/lib/integrations/resend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/resend")>()),
  sendEmail: async (input: { to: string }) => {
    fake.emails.push(input.to);
    return { status: "delivered", id: "local-1" };
  },
}));

const { POST } = await import("@/app/api/internal/exports/route");

const SECRET = "test-dispatch-secret";
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

function request(secret?: string) {
  return new NextRequest("http://localhost/api/internal/exports", {
    method: "POST",
    headers: secret === undefined ? {} : { "X-Dispatch-Secret": secret },
  });
}

beforeEach(() => {
  process.env.DISPATCH_SECRET = SECRET;
  fake.configured = true;
  fake.puts = [];
  fake.emails = [];
  fake.objects = { [`u/${A}/pets/p1/photo/x.jpg`]: new TextEncoder().encode("photo") };
  fake.tables = {
    profiles: [
      { id: A, email: "a@example.com", locale: "sr-Latn" },
      { id: B, email: "b@example.com", locale: "en" },
    ],
    pets: [{ id: "p1", owner_id: A, name: "Kiki", photo_r2_key: `u/${A}/pets/p1/photo/x.jpg` }],
    data_exports: [
      { id: "x-ready", user_id: A, status: "ready", requested_at: "2026-10-01T08:00:00Z", r2_key: "exports/old.zip" },
      { id: "x-failed", user_id: A, status: "failed", requested_at: "2026-10-02T08:00:00Z" },
      { id: "x-expired", user_id: B, status: "expired", requested_at: "2026-10-03T08:00:00Z" },
      { id: "x-b", user_id: B, status: "preparing", requested_at: "2026-10-19T08:05:00Z" },
      { id: "x-a", user_id: A, status: "preparing", requested_at: "2026-10-19T08:00:00Z" },
    ],
  };
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.DISPATCH_SECRET;
  vi.restoreAllMocks();
});

const status = (id: string) => fake.tables.data_exports.find((row) => row.id === id)?.status;

describe("POST /api/internal/exports (EP-50, TC ADR-13)", () => {
  it.each([
    ["without the secret", undefined],
    ["with a wrong secret", "wrong-secret"],
    ["with a secret of another length", `${SECRET}x`],
  ])("answers 401 unauthenticated %s and builds nothing", async (_, secret) => {
    const response = await POST(request(secret));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthenticated" });
    expect(fake.puts).toEqual([]);
    expect(status("x-a")).toBe("preparing");
  });

  it("answers 401 when DISPATCH_SECRET is not set", async () => {
    delete process.env.DISPATCH_SECRET;
    expect((await POST(request(""))).status).toBe(401);
  });

  it("builds only the oldest preparing row per run and reports counts", async () => {
    const response = await POST(request(SECRET));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ exports_ready: 1, exports_failed: 0 });
    expect(fake.puts).toEqual([`exports/${A}/x-a.zip`]);
    expect(status("x-a")).toBe("ready");
    expect(status("x-b")).toBe("preparing");
    expect(status("x-ready")).toBe("ready");
    expect(status("x-failed")).toBe("failed");
    expect(status("x-expired")).toBe("expired");
    expect(fake.emails).toEqual(["a@example.com"]);
  });

  it("a second run does not rebuild ready rows; a run with nothing preparing builds nothing", async () => {
    await POST(request(SECRET));
    const second = await POST(request(SECRET));
    expect(await second.json()).toEqual({ exports_ready: 1, exports_failed: 0 });
    expect(fake.puts).toEqual([`exports/${A}/x-a.zip`, `exports/${B}/x-b.zip`]);

    const third = await POST(request(SECRET));
    expect(await third.json()).toEqual({ exports_ready: 0, exports_failed: 0 });
    expect(fake.puts).toHaveLength(2);
    expect(fake.tables.data_exports.find((row) => row.id === "x-ready")?.r2_key).toBe("exports/old.zip");
  });

  it("counts a failed build and sets the row failed", async () => {
    fake.objects = {};
    const response = await POST(request(SECRET));
    expect(await response.json()).toEqual({ exports_ready: 0, exports_failed: 1 });
    expect(status("x-a")).toBe("failed");
    expect(fake.emails).toEqual([]);
  });

  it("without R2 credentials builds nothing and the rows stay preparing", async () => {
    fake.configured = false;
    const response = await POST(request(SECRET));
    expect(await response.json()).toEqual({ exports_ready: 0, exports_failed: 0 });
    expect(status("x-a")).toBe("preparing");
    expect(fake.puts).toEqual([]);
  });
});
