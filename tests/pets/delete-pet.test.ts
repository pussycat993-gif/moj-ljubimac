import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-05 delete_pet (FR-13): confirm must be true; Member and Volunteer get forbidden_role
// (raised by the pets role trigger, BR-25, BR-34); no relation → not_found. The cascade and the
// R2 key queueing are database-side and covered by supabase/tests/pet_delete.test.sql.

type Row = Record<string, unknown>;

const OWNER = "a1000000-0000-4000-8000-000000000001";
const MEMBER = "a1000000-0000-4000-8000-000000000003";
const VOLUNTEER = "a1000000-0000-4000-8000-000000000007";
const ORG_ADMIN = "a1000000-0000-4000-8000-000000000004";
const ORG = "b2000000-0000-4000-8000-000000000001";
const LUNA = "c1000000-0000-4000-8000-000000000001";
const ZUCA = "c1000000-0000-4000-8000-000000000004";

const state = { supabase: null as ReturnType<typeof fakeSupabase> | null };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.supabase }));

const { deletePet } = await import("@/lib/actions/pets");

// The server client as RLS and the pets role trigger see the caller: `visible` are the pets rows
// the caller may read; deleting one raises forbidden_role unless the caller is its owner or an
// Admin of its organisation (pets_check_write).
function fakeSupabase(
  userId: string,
  { visible, memberships = [] }: { visible: Row[]; memberships?: { organisation_id: string; role: string }[] },
) {
  const pets = [...visible];
  const deleted: string[] = [];
  const client = {
    pets,
    deleted,
    auth: {
      getUser: async () => ({
        data: { user: { id: userId, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let op: "select" | "delete" = "select";
      const run = () => {
        if (table === "profiles") return { data: [{ id: userId, deletion_requested_at: null }], error: null };
        if (table === "organisation_memberships") {
          return {
            data: memberships.map((m) => ({ organisation_id: m.organisation_id, organisations: { approval_status: "approved" } })),
            error: null,
          };
        }
        const matching = pets.filter((r) => filters.every((f) => f(r)));
        if (op === "delete") {
          for (const row of matching) {
            const role = memberships.find((m) => m.organisation_id === row.organisation_id)?.role;
            const allowed = row.owner_id === userId || role === "admin";
            if (!allowed) return { data: null, error: { code: "P0001", message: "forbidden_role" } };
          }
          for (const row of matching) {
            pets.splice(pets.indexOf(row), 1);
            deleted.push(row.id as string);
          }
          return { data: matching.map((r) => ({ id: r.id })), error: null };
        }
        return { data: matching, error: null };
      };
      const builder = {
        select: () => builder,
        delete: () => ((op = "delete"), builder),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        maybeSingle: async () => {
          const r = run();
          return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return builder;
    },
  };
  return client;
}

const luna = { id: LUNA, owner_id: OWNER, organisation_id: null };
const zuca = { id: ZUCA, owner_id: null, organisation_id: ORG };

beforeEach(() => {
  state.supabase = fakeSupabase(OWNER, { visible: [luna] });
});

describe("EP-05 delete_pet", () => {
  it("the owner confirming the single 'Da, obriši' prompt deletes the pet", async () => {
    expect(await deletePet({ pet_id: LUNA, confirm: true })).toEqual({ ok: true, data: { deleted_pet_id: LUNA } });
    expect(state.supabase!.deleted).toEqual([LUNA]);
  });

  it.each([false, undefined, "true", 1])("confirm = %s → validation_failed (confirm = required), nothing deleted", async (confirm) => {
    const result = await deletePet({ pet_id: LUNA, confirm: confirm as boolean });
    expect(result).toEqual({
      ok: false,
      error: { code: "validation_failed", message: "validation_failed", fields: { confirm: "required" } },
    });
    expect(state.supabase!.deleted).toHaveLength(0);
  });

  it("a household Member → forbidden_role", async () => {
    state.supabase = fakeSupabase(MEMBER, { visible: [luna] });
    expect(await deletePet({ pet_id: LUNA, confirm: true })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(state.supabase.deleted).toHaveLength(0);
  });

  it("an organisation Volunteer → forbidden_role", async () => {
    state.supabase = fakeSupabase(VOLUNTEER, { visible: [zuca], memberships: [{ organisation_id: ORG, role: "volunteer" }] });
    expect(await deletePet({ pet_id: ZUCA, confirm: true })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
  });

  it("an organisation Admin may delete the organisation's animal", async () => {
    state.supabase = fakeSupabase(ORG_ADMIN, { visible: [zuca], memberships: [{ organisation_id: ORG, role: "admin" }] });
    expect(await deletePet({ pet_id: ZUCA, confirm: true })).toEqual({ ok: true, data: { deleted_pet_id: ZUCA } });
  });

  it("a pet the caller has no relation to → not_found", async () => {
    state.supabase = fakeSupabase(OWNER, { visible: [] });
    expect(await deletePet({ pet_id: LUNA, confirm: true })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("the §4.1 gates run first: no session → unauthenticated", async () => {
    const client = fakeSupabase(OWNER, { visible: [luna] });
    client.auth.getUser = async () => ({ data: { user: null }, error: null }) as never;
    state.supabase = client;
    expect(await deletePet({ pet_id: LUNA, confirm: true })).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(client.deleted).toHaveLength(0);
  });
});
