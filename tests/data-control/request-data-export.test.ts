// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-41 (request side) — EP-50 requestDataExport / getMyDataOverview (lib/actions/data-control.ts) over a fake
// server client that behaves like the Step 23 database functions request_data_export and
// get_my_data_overview_base: the request inserts a `preparing` row and returns DataExport; a second call →
// 409 export_in_progress; nothing else is called (the archive is built by /api/internal/exports, Step 30a).
// getMyDataOverview returns the latest export (a presigned R2 GET when ready), the summary and the deletion
// block. Archive delivery itself is verified in Step 30a.

type Row = Record<string, unknown>;

const MARKO = "a1000000-0000-4000-8000-000000000002";

const state = {
  exports: [] as Row[],
  rpcCalls: [] as string[],
  heir: null as string | null,
};

const presignGet = vi.fn(async (key: string, opts?: { fileName?: string | null }) => ({
  url: `https://r2.test/${key}?signed=1&name=${opts?.fileName ?? ""}`,
  expires_at: "2026-10-23T10:10:00.000Z",
}));
vi.mock("@/lib/integrations/r2", () => ({ r2: () => ({ presignGet }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

const { requestDataExport, getMyDataOverview } = await import("@/lib/actions/data-control");
const { httpStatus } = await import("@/lib/server/result");

let seq = 0;

function rpc(name: string) {
  state.rpcCalls.push(name);
  if (name === "request_data_export") {
    if (state.exports.some((e) => e.status === "preparing")) return { data: null, error: { code: "P0001", message: "export_in_progress" } };
    const row = {
      id: `e1000000-0000-4000-8000-00000000000${++seq}`,
      user_id: MARKO,
      status: "preparing",
      r2_key: null,
      size_bytes: null,
      requested_at: new Date().toISOString(),
      ready_at: null,
      expires_at: null,
    };
    state.exports.push(row);
    return { data: row, error: null };
  }
  if (name === "get_my_data_overview_base") {
    return {
      data: {
        summary: { pet_names: ["Kiki"], attachment_count: 3, moment_count: 1 },
        deletion: { requested_at: null, due_at: null, days_left: null, heir_full_name: state.heir },
      },
      error: null,
    };
  }
  throw new Error(`unexpected rpc ${name}`);
}

function query(table: string) {
  const api = {
    select: () => api,
    eq: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: async () => {
      if (table === "profiles") return { data: { id: MARKO, deletion_requested_at: null }, error: null };
      const latest = [...state.exports].sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))[0];
      return { data: latest ?? null, error: null };
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: MARKO, email: "marko@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string) => rpc(name),
  };
}

beforeEach(() => {
  state.exports = [];
  state.rpcCalls = [];
  state.heir = null;
  presignGet.mockClear();
  fetchSpy.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T10:00:00Z"));
});

describe("EP-50 requestDataExport", () => {
  it("inserts a preparing row and returns DataExport", async () => {
    const result = await requestDataExport();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      id: state.exports[0].id,
      status: "preparing",
      file_name: "moj-ljubimac-podaci-2026-10-23.zip",
      size_bytes: null,
      requested_at: "2026-10-23T10:00:00.000Z",
      ready_at: null,
      expires_at: null,
      download_url: null,
    });
    expect(state.exports).toHaveLength(1);
    // Only the row is inserted — no call to the archive builder (Step 30a) and nothing signed.
    expect(state.rpcCalls).toEqual(["request_data_export"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(presignGet).not.toHaveBeenCalled();
  });

  it("a second call while preparing → 409 export_in_progress", async () => {
    await requestDataExport();
    const second = await requestDataExport();
    expect(second).toMatchObject({ ok: false, error: { code: "export_in_progress" } });
    expect(httpStatus("export_in_progress")).toBe(409);
    expect(state.exports).toHaveLength(1);
  });
});

describe("EP-50 getMyDataOverview", () => {
  it("returns the summary and deletion block, and latest_export null without an export", async () => {
    state.heir = "Jelena Nikolić";
    const result = await getMyDataOverview();
    expect(result).toEqual({
      ok: true,
      data: {
        latest_export: null,
        summary: { pet_names: ["Kiki"], attachment_count: 3, moment_count: 1 },
        deletion: { requested_at: null, due_at: null, days_left: null, heir_full_name: "Jelena Nikolić" },
      },
    });
  });

  it("a preparing export has no download_url", async () => {
    await requestDataExport();
    const result = await getMyDataOverview();
    expect(result.ok && result.data.latest_export).toMatchObject({ status: "preparing", download_url: null });
  });

  it("a ready export carries a presigned R2 GET (10 min) of its r2_key", async () => {
    state.exports.push({
      id: "e1000000-0000-4000-8000-000000000009",
      user_id: MARKO,
      status: "ready",
      r2_key: `exports/${MARKO}/e1000000-0000-4000-8000-000000000009.zip`,
      size_bytes: 248000000,
      requested_at: "2026-10-19T08:00:00.000Z",
      ready_at: "2026-10-19T08:05:00.000Z",
      expires_at: "2026-10-26T08:05:00.000Z",
    });
    const result = await getMyDataOverview();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(presignGet).toHaveBeenCalledWith(`exports/${MARKO}/e1000000-0000-4000-8000-000000000009.zip`, {
      fileName: "moj-ljubimac-podaci-2026-10-19.zip",
    });
    expect(result.data.latest_export).toMatchObject({
      status: "ready",
      file_name: "moj-ljubimac-podaci-2026-10-19.zip",
      size_bytes: 248000000,
      expires_at: "2026-10-26T08:05:00.000Z",
      download_url: {
        id: "e1000000-0000-4000-8000-000000000009",
        url: expect.stringContaining("https://r2.test/exports/"),
        expires_at: "2026-10-23T10:10:00.000Z",
      },
    });
  });
});
