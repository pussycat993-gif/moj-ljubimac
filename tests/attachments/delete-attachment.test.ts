import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-14 delete_attachment (FR-08): the row is deleted (RLS + health_record_check_write), then the R2
// object; if R2 deletion fails the key stays queued for the nightly cleanup (the after-delete trigger
// queues it in the same transaction; a successful R2 delete takes it off the queue). A household
// member → forbidden_role (FR-28); no relation → not_found.

type Row = Record<string, unknown>;

const OWNER = "a1000000-0000-4000-8000-000000000001";
const MEMBER = "a1000000-0000-4000-8000-000000000003";
const KEY = `u/${OWNER}/pets/c1000000-0000-4000-8000-000000000001/visits/c3000000-0000-4000-8000-000000000001/0b1c-nalaz.pdf`;

const state = {
  supabase: null as ReturnType<typeof fakeSupabase> | null,
  r2Result: true as boolean | "throw",
  r2Removed: [] as string[],
  queue: [] as { op: string; key: unknown }[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.supabase }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      upsert: async (row: Row) => {
        state.queue.push({ op: `upsert:${table}`, key: row.r2_key });
        return { error: null };
      },
      delete: () => ({
        eq: async (_c: string, v: unknown) => {
          state.queue.push({ op: `delete:${table}`, key: v });
          return { error: null };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/integrations/r2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/r2")>("@/lib/integrations/r2");
  return {
    ...actual,
    r2: () => ({
      remove: async (key: string) => {
        state.r2Removed.push(key);
        if (state.r2Result === "throw") throw new Error("network");
        return state.r2Result;
      },
    }),
  };
});

const { deleteAttachment } = await import("@/lib/actions/attachments");

/** `deleteResult` is what the RLS-scoped delete answers (rows, or the trigger's error). */
function fakeSupabase(userId: string, deleteResult: { data: Row[] | null; error: Row | null }) {
  const deletes: unknown[] = [];
  return {
    deletes,
    auth: {
      getUser: async () => ({
        data: { user: { id: userId, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    from(table: string) {
      let deleting = false;
      const builder = {
        select: () => builder,
        delete: () => ((deleting = true), builder),
        eq: (_c: string, v: unknown) => {
          if (deleting) deletes.push({ table, id: v });
          return builder;
        },
        maybeSingle: async () =>
          table === "profiles" ? { data: { id: userId, deletion_requested_at: null }, error: null } : { data: null, error: null },
        then: (resolve: (v: unknown) => void) => resolve(deleting ? deleteResult : { data: [], error: null }),
      };
      return builder;
    },
  };
}

beforeEach(() => {
  state.supabase = fakeSupabase(OWNER, { data: [{ id: "a1", r2_key: KEY }], error: null });
  state.r2Result = true;
  state.r2Removed = [];
  state.queue = [];
});

describe("EP-14 delete_attachment", () => {
  it("deletes the row, then the R2 object, and takes the key off the queue", async () => {
    const result = await deleteAttachment({ attachment_id: "a1" });
    expect(result).toEqual({ ok: true, data: { deleted_attachment_id: "a1" } });
    expect(state.supabase!.deletes).toEqual([{ table: "attachments", id: "a1" }]);
    expect(state.r2Removed).toEqual([KEY]);
    expect(state.queue).toEqual([{ op: "delete:r2_deletion_queue", key: KEY }]);
  });

  it("R2 deletion fails → the key stays queued for the nightly cleanup; the delete still succeeds", async () => {
    state.r2Result = false;
    const result = await deleteAttachment({ attachment_id: "a1" });
    expect(result.ok).toBe(true);
    expect(state.r2Removed).toEqual([KEY]);
    expect(state.queue).toEqual([{ op: "upsert:r2_deletion_queue", key: KEY }]);
  });

  it("R2 unreachable (throws) → queued as well", async () => {
    state.r2Result = "throw";
    expect((await deleteAttachment({ attachment_id: "a1" })).ok).toBe(true);
    expect(state.queue).toEqual([{ op: "upsert:r2_deletion_queue", key: KEY }]);
  });

  it("FR-28: a household member → forbidden_role (raised by the database); nothing is removed from R2", async () => {
    state.supabase = fakeSupabase(MEMBER, { data: null, error: { code: "P0001", message: "forbidden_role" } });
    expect(await deleteAttachment({ attachment_id: "a1" })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(state.r2Removed).toHaveLength(0);
    expect(state.queue).toHaveLength(0);
  });

  it("no relation or unknown id (RLS hides the row) → not_found", async () => {
    state.supabase = fakeSupabase(OWNER, { data: [], error: null });
    expect(await deleteAttachment({ attachment_id: "missing" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(state.r2Removed).toHaveLength(0);
  });

  it("attachment_id is required", async () => {
    expect(await deleteAttachment({ attachment_id: "" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { attachment_id: "required" } },
    });
  });
});
