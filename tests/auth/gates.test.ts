import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { checkGates } = await import("@/lib/server/gates");

type Row = Record<string, unknown>;

const USER_ID = "00000000-0000-0000-0000-000000000001";

// The caller's own Supabase client: auth.getUser plus the profile and membership reads.
function fakeSupabase({
  user = { id: USER_ID, email: "ivana.petrovic@gmail.com", email_confirmed_at: "2026-10-01T08:00:00Z" } as Row | null,
  profile = { id: USER_ID, deletion_requested_at: null } as Row | null,
  memberships = [] as Row[],
} = {}) {
  const tables: Record<string, Row[]> = {
    profiles: profile ? [profile] : [],
    organisation_memberships: memberships.map((m) => ({ user_id: USER_ID, ...m })),
  };
  return {
    auth: {
      getUser: vi.fn(async () =>
        user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { name: "AuthSessionMissingError", message: "Auth session missing!" } },
      ),
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const matching = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: matching(), error: null }),
      };
      return builder;
    },
  };
}

const pendingShelter = { organisation_id: "org-1", organisations: { approval_status: "pending" } };
const approvedBreeder = { organisation_id: "org-2", organisations: { approval_status: "approved" } };

describe("checkGates — API §4.1, in order", () => {
  it("1. no session → 401 unauthenticated", async () => {
    const result = await checkGates(fakeSupabase({ user: null }) as never, { access: "read" });
    expect(result).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
  });

  it("2. email not verified → 403 email_not_verified (before the deletion and organisation gates)", async () => {
    const result = await checkGates(
      fakeSupabase({
        user: { id: USER_ID, email_confirmed_at: null },
        profile: { id: USER_ID, deletion_requested_at: "2026-10-20T10:00:00Z" },
        memberships: [pendingShelter],
      }) as never,
      { access: "write" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "email_not_verified" } });
  });

  it("3. deletion requested → 403 account_pending_deletion (before the organisation gate)", async () => {
    const result = await checkGates(
      fakeSupabase({
        profile: { id: USER_ID, deletion_requested_at: "2026-10-20T10:00:00Z" },
        memberships: [pendingShelter],
      }) as never,
      { access: "write" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "account_pending_deletion" } });
  });

  it("3. reads are refused too during pending deletion", async () => {
    const result = await checkGates(
      fakeSupabase({ profile: { id: USER_ID, deletion_requested_at: "2026-10-20T10:00:00Z" } }) as never,
      { access: "read" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "account_pending_deletion" } });
  });

  it.each(["cancel_deletion", "sign_out"] as const)("3. %s is exempt from the deletion gate", async (exempt) => {
    const result = await checkGates(
      fakeSupabase({ profile: { id: USER_ID, deletion_requested_at: "2026-10-20T10:00:00Z" } }) as never,
      { access: "write", exempt },
    );
    expect(result.ok).toBe(true);
  });

  it("4. member of a pending organisation → writes return 403 organisation_pending_approval", async () => {
    const result = await checkGates(fakeSupabase({ memberships: [pendingShelter] }) as never, { access: "write" });
    expect(result).toMatchObject({ ok: false, error: { code: "organisation_pending_approval" } });
  });

  it("4. reads pass for a pending organisation", async () => {
    const result = await checkGates(fakeSupabase({ memberships: [pendingShelter] }) as never, { access: "read" });
    expect(result).toMatchObject({
      ok: true,
      data: { organisations: [{ organisation_id: "org-1", approval_status: "pending" }] },
    });
  });

  it("an approved organisation member and an owner pass every gate", async () => {
    expect((await checkGates(fakeSupabase({ memberships: [approvedBreeder] }) as never, { access: "write" })).ok).toBe(
      true,
    );
    const owner = await checkGates(fakeSupabase() as never, { access: "write" });
    expect(owner).toMatchObject({ ok: true, data: { user: { id: USER_ID }, profile: { id: USER_ID } } });
  });
});
