// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-30 — EP-36 change_household_membership (lib/actions/household.ts): after remove_member (owner) and
// after leave (member) the user can no longer read the shared pet and every entry they made stays; the
// owner cannot leave, a member cannot remove; remove_member in a read-only household → household_read_only
// (leave stays allowed); revoke_invitation expires a pending invitation and answers invitation_used
// otherwise. Also EP-37 (shared-pets Switch) and EP-38 (member opt-in). The fake server client models the
// Step 05 / 06 RLS and triggers that supabase/tests/household_*.test.sql prove against the database.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const MARKO = "a1000000-0000-4000-8000-000000000002";
const JELENA = "a1000000-0000-4000-8000-000000000003";
const HH = "b1000000-0000-4000-8000-000000000001";
const LUNA = "c1000000-0000-4000-8000-000000000001";
const MAKS = "c1000000-0000-4000-8000-000000000002";
const INV = "e1000000-0000-4000-8000-000000000001";

const state = {
  user: IVANA,
  db: {} as Record<string, Row[]>,
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { changeHouseholdMembership, setSharedPet, setMyReminderOptIn } = await import("@/lib/actions/household");

function seed() {
  return {
    profiles: [IVANA, MARKO, JELENA].map((id) => ({ id, deletion_requested_at: null })),
    organisation_memberships: [],
    households: [{ id: HH, owner_id: IVANA, name: "Domaćinstvo Petrović", read_only: false }],
    household_memberships: [
      { id: "m1", household_id: HH, user_id: JELENA, reminders_enabled: false },
      { id: "m2", household_id: HH, user_id: MARKO, reminders_enabled: false },
    ],
    household_invitations: [{ id: INV, household_id: HH, status: "pending" }],
    household_pets: [{ household_id: HH, pet_id: LUNA }],
    pets: [
      { id: LUNA, owner_id: IVANA, name: "Luna" },
      { id: MAKS, owner_id: IVANA, name: "Maks" },
    ],
    weight_entries: [
      { id: "w1", pet_id: LUNA, created_by: JELENA },
      { id: "w2", pet_id: LUNA, created_by: MARKO },
    ],
  } as Record<string, Row[]>;
}

const p0001 = (message: string) => ({ code: "P0001", message });
const isOwner = (hh: unknown) => state.db.households.some((h) => h.id === hh && h.owner_id === state.user);
const isMember = (hh: unknown) => state.db.household_memberships.some((m) => m.household_id === hh && m.user_id === state.user);

/** RLS select visibility (Step 05 / 06 policies). */
function visible(table: string, row: Row): boolean {
  switch (table) {
    case "households":
      return row.owner_id === state.user || isMember(row.id);
    case "household_invitations":
      return isOwner(row.household_id);
    case "pets":
      return row.owner_id === state.user || canReadShared(row.id);
    case "household_memberships":
      return row.user_id === state.user || isOwner(row.household_id) || isMember(row.household_id);
    default:
      return true;
  }
}

function canReadShared(petId: unknown) {
  return state.db.household_pets.some((hp) => hp.pet_id === petId && isMember(hp.household_id));
}

/** BEFORE triggers of Step 05 / 06. */
function beforeWrite(table: string, op: string, row: Row): { code: string; message: string } | null {
  const readOnly = (hh: unknown) => state.db.households.some((h) => h.id === hh && h.read_only);
  if (table === "household_memberships" && op === "delete" && row.user_id !== state.user) {
    if (!isOwner(row.household_id)) return p0001("forbidden_role");
    if (readOnly(row.household_id)) return p0001("household_read_only");
  }
  if (table === "household_pets") {
    if (isMember(row.household_id) && !isOwner(row.household_id)) return p0001("forbidden_role");
    if (isOwner(row.household_id) && readOnly(row.household_id)) return p0001("household_read_only");
  }
  return null;
}

function query(table: string) {
  const filters: [string, unknown][] = [];
  let op: "select" | "update" | "delete" | "upsert" = "select";
  let payload: Row = {};
  const matching = () =>
    (state.db[table] ?? []).filter((r) => visible(table, r) && filters.every(([c, v]) => r[c] === v));
  const run = async (): Promise<{ data: Row[] | null; error: { code: string; message: string } | null }> => {
    if (op === "upsert") {
      if (!isOwner(payload.household_id)) {
        return { data: null, error: beforeWrite(table, "insert", payload) ?? { code: "42501", message: "rls" } };
      }
      const err = beforeWrite(table, "insert", payload);
      if (err) return { data: null, error: err };
      if (!state.db[table].some((r) => r.household_id === payload.household_id && r.pet_id === payload.pet_id)) {
        state.db[table].push({ ...payload });
      }
      return { data: null, error: null };
    }
    const rows = matching();
    if (op === "delete") {
      for (const r of rows) {
        const err = beforeWrite(table, "delete", r);
        if (err) return { data: null, error: err };
      }
      state.db[table] = state.db[table].filter((r) => !rows.includes(r));
      return { data: rows, error: null };
    }
    if (op === "update") {
      // Update policies: invitations → household owner; memberships → own row only.
      const allowed = rows.filter((r) => (table === "household_memberships" ? r.user_id === state.user : true));
      for (const r of allowed) Object.assign(r, payload);
      return { data: allowed, error: null };
    }
    return { data: rows, error: null };
  };
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push([column, value]), api),
    update: (value: Row) => ((op = "update"), (payload = value), api),
    delete: () => ((op = "delete"), api),
    upsert: (value: Row) => ((op = "upsert"), (payload = value), api),
    maybeSingle: async () => {
      const r = await run();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: state.user, email: "x@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string, args: Row) => {
      if (name !== "get_household") throw new Error(`unexpected rpc ${name}`);
      const h = state.db.households.find((x) => x.id === args.p_household_id && visible("households", x));
      if (!h) return { data: null, error: p0001("not_found") };
      return {
        data: {
          household: {
            id: h.id,
            members: [
              { user_id: h.owner_id, role: "owner" },
              ...state.db.household_memberships
                .filter((m) => m.household_id === h.id)
                .map((m) => ({ user_id: m.user_id, role: "member" })),
            ],
            pending_invitations: state.db.household_invitations.filter((i) => i.household_id === h.id && i.status === "pending"),
          },
          my_households: [],
        },
        error: null,
      };
    },
  };
}

function canRead(user: string, petId: string) {
  const previous = state.user;
  state.user = user;
  const result = state.db.pets.some((p) => p.id === petId && visible("pets", p));
  state.user = previous;
  return result;
}

beforeEach(() => {
  state.user = IVANA;
  state.db = seed();
});

describe("EP-36 change_household_membership", () => {
  it("FR-30: after remove_member the user can no longer read the shared pet; their entries remain", async () => {
    expect(canRead(JELENA, LUNA)).toBe(true);
    const result = await changeHouseholdMembership({ op: "remove_member", household_id: HH, user_id: JELENA });
    expect(result.ok).toBe(true);
    if (result.ok && "members" in result.data) {
      expect(result.data.members.map((m) => m.user_id)).toEqual([IVANA, MARKO]);
    }
    expect(canRead(JELENA, LUNA)).toBe(false);
    expect(state.db.weight_entries.filter((w) => w.created_by === JELENA)).toHaveLength(1);
  });

  it("FR-30: after leave the member can no longer read the shared pet; their entries remain", async () => {
    state.user = MARKO;
    const result = await changeHouseholdMembership({ op: "leave", household_id: HH });
    expect(result).toEqual({ ok: true, data: { left: true } });
    expect(canRead(MARKO, LUNA)).toBe(false);
    expect(state.db.weight_entries.filter((w) => w.created_by === MARKO)).toHaveLength(1);
    // Leaving again: no membership any more and no relation → not_found.
    expect(await changeHouseholdMembership({ op: "leave", household_id: HH })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("roles: the owner cannot leave, a member cannot remove (BR-25)", async () => {
    expect(await changeHouseholdMembership({ op: "leave", household_id: HH })).toMatchObject({
      ok: false,
      error: { code: "forbidden_role" },
    });
    state.user = MARKO;
    expect(await changeHouseholdMembership({ op: "remove_member", household_id: HH, user_id: JELENA })).toMatchObject({
      ok: false,
      error: { code: "forbidden_role" },
    });
    expect(canRead(JELENA, LUNA)).toBe(true);
  });

  it("read-only household: remove_member → household_read_only, leave stays allowed", async () => {
    state.db.households[0].read_only = true;
    expect(await changeHouseholdMembership({ op: "remove_member", household_id: HH, user_id: JELENA })).toMatchObject({
      ok: false,
      error: { code: "household_read_only" },
    });
    state.user = JELENA;
    expect(await changeHouseholdMembership({ op: "leave", household_id: HH })).toEqual({ ok: true, data: { left: true } });
  });

  it("not_found for an unrelated household or a user who is not a member", async () => {
    expect(
      await changeHouseholdMembership({ op: "remove_member", household_id: HH, user_id: "a1000000-0000-4000-8000-000000000006" }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    state.user = "a1000000-0000-4000-8000-000000000006";
    expect(await changeHouseholdMembership({ op: "leave", household_id: HH })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("revoke_invitation expires a pending invitation; a decided one → invitation_used", async () => {
    const result = await changeHouseholdMembership({ op: "revoke_invitation", invitation_id: INV });
    expect(result.ok).toBe(true);
    expect(state.db.household_invitations[0].status).toBe("expired");
    expect(state.db.household_invitations[0].expires_at).toBeTruthy();
    expect(result.ok && "pending_invitations" in result.data && result.data.pending_invitations).toEqual([]);
    expect(await changeHouseholdMembership({ op: "revoke_invitation", invitation_id: INV })).toMatchObject({
      ok: false,
      error: { code: "invitation_used" },
    });
    state.user = JELENA;
    state.db.household_invitations[0].status = "pending";
    expect(await changeHouseholdMembership({ op: "revoke_invitation", invitation_id: INV })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("an unknown op → validation_failed", async () => {
    expect(await changeHouseholdMembership({ op: "transfer" } as never)).toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
  });
});

describe("EP-37 / EP-38", () => {
  it("FR-27: the owner shares and un-shares a pet; members gain and lose access", async () => {
    expect(canRead(JELENA, MAKS)).toBe(false);
    expect(await setSharedPet({ household_id: HH, pet_id: MAKS, shared: true })).toMatchObject({ ok: true });
    expect(await setSharedPet({ household_id: HH, pet_id: MAKS, shared: true })).toMatchObject({ ok: true });
    expect(state.db.household_pets.filter((hp) => hp.pet_id === MAKS)).toHaveLength(1);
    expect(canRead(JELENA, MAKS)).toBe(true);
    expect(await setSharedPet({ household_id: HH, pet_id: MAKS, shared: false })).toMatchObject({ ok: true });
    expect(canRead(JELENA, MAKS)).toBe(false);
  });

  it("a member cannot change shared pets; a read-only household refuses", async () => {
    state.user = JELENA;
    expect(await setSharedPet({ household_id: HH, pet_id: LUNA, shared: false })).toMatchObject({
      ok: false,
      error: { code: "forbidden_role" },
    });
    state.user = IVANA;
    state.db.households[0].read_only = true;
    expect(await setSharedPet({ household_id: HH, pet_id: LUNA, shared: false })).toMatchObject({
      ok: false,
      error: { code: "household_read_only" },
    });
  });

  it("FR-29: a member switches their own reminders; the owner has no membership row → not_found", async () => {
    state.user = JELENA;
    expect(await setMyReminderOptIn({ household_id: HH, reminders_enabled: true })).toEqual({
      ok: true,
      data: expect.objectContaining({ household_id: HH, reminders_enabled: true }),
    });
    expect(state.db.household_memberships.find((m) => m.user_id === MARKO)?.reminders_enabled).toBe(false);
    state.user = IVANA;
    expect(await setMyReminderOptIn({ household_id: HH, reminders_enabled: true })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});
