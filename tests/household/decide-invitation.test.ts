// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-26 #1, #2 — EP-39 get_household_invitation and EP-40 decide_household_invitation
// (lib/actions/invitations.ts) over a fake server client that models the database functions of the
// household_sharing migration: a different signed-in user accepts a Premium owner's invitation and becomes
// a member (joined_at set, reminders_enabled = false); a Visitor viewing gets is_signed_in = false and
// deciding gets 401 unauthenticated; tr_ tokens are not handled yet (not_found, the S14 error state; og_ is Step 24);
// the EP-40 error codes pass through. Only the SHA-256 hash of the token reaches the database.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const MARKO = "a1000000-0000-4000-8000-000000000002";
const HOUSEHOLD = "b1000000-0000-4000-8000-000000000001";
const TOKEN = "hh_ZXhhbXBsZS10b2tlbi1wYXlsb2Fk.c2lnbmF0dXJl";

const state = {
  user: MARKO as string | null,
  invitation: null as null | { hash: string; status: string; expires_at: string },
  memberships: [] as { household_id: string; user_id: string; joined_at: string; reminders_enabled: boolean }[],
  readOnly: false,
  rpcCalls: [] as { name: string; args: Row }[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { getHouseholdInvitation, decideHouseholdInvitation } = await import("@/lib/actions/invitations");
const { hashToken } = await import("@/lib/server/action-tokens");

const raise = (message: string) => ({ data: null, error: { code: "P0001", message, details: null } });

function lookup(hash: unknown) {
  const inv = state.invitation;
  if (!inv || inv.hash !== hash) return { error: raise("not_found") };
  if (inv.status === "expired" || Date.parse(inv.expires_at) < Date.now()) return { error: raise("invitation_expired") };
  return { inv };
}

function rpc(name: string, args: Row) {
  state.rpcCalls.push({ name, args });
  if (name === "get_household_invitation") {
    const found = lookup(args.p_token_hash);
    if (found.error) return found.error;
    const signedIn = state.user !== null;
    return {
      data: {
        kind: "household",
        status: found.inv.status,
        expires_at: found.inv.expires_at,
        household_name: "Domaćinstvo Petrović",
        organisation_name: null,
        organisation_type: null,
        role: null,
        inviter_name: "Ivana Petrović",
        inviter_city: null,
        shared_pets: signedIn ? [{ name: "Luna", sex: "female", species: "cat", breed: null }] : null,
        member_count: signedIn ? 1 + state.memberships.length : null,
        member_limit: signedIn ? 6 : null,
        is_signed_in: signedIn,
        already_member: signedIn ? state.memberships.some((m) => m.user_id === state.user) || state.user === IVANA : null,
      },
      error: null,
    };
  }
  if (name === "decide_household_invitation") {
    const inv = state.invitation;
    if (!inv || inv.hash !== args.p_token_hash) return raise("not_found");
    if (inv.status === "accepted" || inv.status === "declined") return raise("invitation_used");
    if (inv.status === "expired" || Date.parse(inv.expires_at) < Date.now()) return raise("invitation_expired");
    if (args.p_decision === "decline") {
      inv.status = "declined";
      return { data: { kind: "household", status: "declined", household_id: HOUSEHOLD, organisation_id: null }, error: null };
    }
    if (state.user === IVANA || state.memberships.some((m) => m.user_id === state.user)) return raise("already_member");
    if (state.readOnly) return raise("household_read_only");
    if (1 + state.memberships.length >= 6) return raise("household_full");
    state.memberships.push({ household_id: HOUSEHOLD, user_id: state.user!, joined_at: new Date().toISOString(), reminders_enabled: false });
    inv.status = "accepted";
    return { data: { kind: "household", status: "accepted", household_id: HOUSEHOLD, organisation_id: null }, error: null };
  }
  throw new Error(`unexpected rpc ${name}`);
}

function client() {
  const table = (rows: Row[]) => {
    const api = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return api;
  };
  return {
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: state.user, email: "x@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } : null },
        error: null,
      }),
    },
    from: (name: string) => table(name === "profiles" && state.user ? [{ id: state.user, deletion_requested_at: null }] : []),
    rpc: async (name: string, args: Row) => rpc(name, args),
  };
}

beforeEach(async () => {
  Object.assign(state, {
    user: MARKO,
    invitation: { hash: await hashToken(TOKEN), status: "pending", expires_at: new Date(Date.now() + 86_400_000).toISOString() },
    memberships: [{ household_id: HOUSEHOLD, user_id: "a1000000-0000-4000-8000-000000000003", joined_at: "2026-10-01T00:00:00Z", reminders_enabled: false }],
    readOnly: false,
    rpcCalls: [],
  });
});

describe("EP-39 get_household_invitation", () => {
  it("a signed-in invitee gets the full view; only the token hash is sent", async () => {
    const result = await getHouseholdInvitation({ token: TOKEN });
    expect(result.ok && result.data).toMatchObject({
      kind: "household",
      status: "pending",
      household_name: "Domaćinstvo Petrović",
      is_signed_in: true,
      already_member: false,
      member_count: 2,
    });
    expect(state.rpcCalls[0]).toEqual({ name: "get_household_invitation", args: { p_token_hash: await hashToken(TOKEN) } });
  });

  it("FR-26 #2: a Visitor gets the limited fields (is_signed_in = false)", async () => {
    state.user = null;
    const result = await getHouseholdInvitation({ token: TOKEN });
    expect(result.ok && result.data).toMatchObject({ is_signed_in: false, shared_pets: null, already_member: null });
  });

  it("410 invitation_expired and 404 not_found pass through", async () => {
    state.invitation!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await getHouseholdInvitation({ token: TOKEN })).toMatchObject({ ok: false, error: { code: "invitation_expired" } });
    expect(await getHouseholdInvitation({ token: "hh_drugi.token" })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  // Step 24 handles og_ tokens (tests/organisation/team-invitation-accept.test.ts); tr_ comes in Step 25.
  it("tr_ tokens (Step 25) and malformed tokens → not_found without a database call", async () => {
    for (const token of ["tr_abc.def", "", "hh_bez-potpisa", "og_bez-potpisa"]) {
      expect(await getHouseholdInvitation({ token })).toMatchObject({ ok: false, error: { code: "not_found" } });
    }
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("EP-40 decide_household_invitation", () => {
  it("FR-26 #1: a different signed-in user accepts and becomes a member (joined_at set, reminders off)", async () => {
    const result = await decideHouseholdInvitation({ token: TOKEN, decision: "accept" });
    expect(result).toEqual({
      ok: true,
      data: { kind: "household", status: "accepted", household_id: HOUSEHOLD, organisation_id: null },
    });
    expect(state.rpcCalls[0]).toEqual({
      name: "decide_household_invitation",
      args: { p_token_hash: await hashToken(TOKEN), p_decision: "accept" },
    });
    const membership = state.memberships.find((m) => m.user_id === MARKO);
    expect(membership).toMatchObject({ household_id: HOUSEHOLD, reminders_enabled: false });
    expect(membership?.joined_at).toBeTruthy();
    // EP-39 now shows the accepted state to the new member.
    const view = await getHouseholdInvitation({ token: TOKEN });
    expect(view.ok && view.data).toMatchObject({ status: "accepted", already_member: true });
  });

  it("FR-26 #2: without a session → 401 unauthenticated and nothing is decided", async () => {
    state.user = null;
    const result = await decideHouseholdInvitation({ token: TOKEN, decision: "accept" });
    expect(result).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("decline → status declined, no membership", async () => {
    const result = await decideHouseholdInvitation({ token: TOKEN, decision: "decline" });
    expect(result.ok && result.data.status).toBe("declined");
    expect(state.memberships.some((m) => m.user_id === MARKO)).toBe(false);
  });

  it("EP-40 errors: invitation_used, already_member, household_full, household_read_only, invitation_expired", async () => {
    state.readOnly = true;
    expect(await decideHouseholdInvitation({ token: TOKEN, decision: "accept" })).toMatchObject({
      ok: false,
      error: { code: "household_read_only" },
    });
    state.readOnly = false;
    state.user = IVANA;
    expect(await decideHouseholdInvitation({ token: TOKEN, decision: "accept" })).toMatchObject({
      ok: false,
      error: { code: "already_member" },
    });
    state.user = MARKO;
    for (let i = 0; i < 4; i++) {
      state.memberships.push({ household_id: HOUSEHOLD, user_id: `m${i}`, joined_at: "", reminders_enabled: false });
    }
    expect(await decideHouseholdInvitation({ token: TOKEN, decision: "accept" })).toMatchObject({
      ok: false,
      error: { code: "household_full" },
    });
    state.invitation!.status = "accepted";
    expect(await decideHouseholdInvitation({ token: TOKEN, decision: "decline" })).toMatchObject({
      ok: false,
      error: { code: "invitation_used" },
    });
    state.invitation!.status = "expired";
    expect(await decideHouseholdInvitation({ token: TOKEN, decision: "accept" })).toMatchObject({
      ok: false,
      error: { code: "invitation_expired" },
    });
  });

  it("an unknown decision → validation_failed; a tr_ token (Step 25) → not_found", async () => {
    expect(await decideHouseholdInvitation({ token: TOKEN, decision: "maybe" as "accept" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { decision: "invalid" } },
    });
    expect(await decideHouseholdInvitation({ token: "tr_abc.def", decision: "accept" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(state.rpcCalls).toHaveLength(0);
  });
});
