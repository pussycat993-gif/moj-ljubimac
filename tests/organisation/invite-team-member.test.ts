// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-43 #1 and API §11 — EP-56 (lib/actions/team.ts) over a fake server client that models
// rpc:create_organisation_invitation and the Step 24 triggers: an Admin invites (og_ token signed per API §9.3,
// only its SHA-256 hash reaches the database, the raw token only in the team_invitation email link), roles are
// admin / volunteer only, members + pending invitations = 20 → 409 team_full, a member's address → 409
// already_member, a Volunteer → 403 forbidden_role, the 21st call in a day → 429 rate_limited, the 24 h
// idempotency replay, and revoke / remove / change role with the last_admin rule (fields.user_id). The
// database rules themselves are proven in supabase/tests/org_team.test.sql.

type Row = Record<string, unknown>;

const MILICA = "a1000000-0000-4000-8000-000000000004";
const JELENA = "a1000000-0000-4000-8000-000000000003";
const ORG = "b2000000-0000-4000-8000-000000000001";
const SITE = "https://mojljubimac.test";

const state = {
  user: MILICA as string | null,
  role: "admin" as "admin" | "volunteer",
  members: 2,
  pending: 0,
  memberEmails: ["milica.stojanovic@mojljubimac.test", "jelena.nikolic@mojljubimac.test"],
  admins: [MILICA] as string[],
  memberships: [] as Row[],
  invitations: [] as Row[],
  tables: { idempotency_keys: [] as Row[], rate_limit_counters: [] as Row[] } as Record<string, Row[]>,
  rpcCalls: [] as { name: string; args: Row }[],
  emails: [] as { to: string; locale: string; template: { id: string; variables: Record<string, unknown> } }[],
};

const sendEmail = vi.fn(async (input: (typeof state.emails)[number]) => {
  state.emails.push(input);
  return { status: "delivered" as const, id: "re_1" };
});
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: (input: (typeof state.emails)[number]) => sendEmail(input) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { inviteTeamMember, revokeInvitation, removeMember, changeMemberRole } = await import("@/lib/actions/team");
const { hashToken, verifyActionToken } = await import("@/lib/server/action-tokens");

function dbError(message: string, details: string | null = null) {
  return { data: null, error: { code: "P0001", message, details } };
}

/** create_organisation_invitation as the database does it (supabase/migrations/*_organisation_workspace.sql). */
function createRpc(args: Row) {
  if (state.role !== "admin") return dbError("forbidden_role");
  if (!["admin", "volunteer"].includes(String(args.p_role))) return dbError("validation_failed", "role:invalid");
  const email = String(args.p_email);
  if (state.memberEmails.includes(email)) return dbError("already_member");
  if (state.members + state.pending >= 20) return dbError("team_full");
  state.pending += 1;
  const invitation = {
    id: args.p_invitation_id,
    email,
    role: args.p_role,
    status: "pending",
    expires_at: "2026-10-30T08:00:00Z",
    created_at: "2026-10-23T08:00:00Z",
  };
  state.invitations.push({ ...invitation, token_hash: args.p_token_hash });
  return {
    data: {
      invitation,
      organisation_name: "Azil Šapica",
      inviter_name: "Milica Stojanović",
      inviter_locale: "sr-Latn",
      recipient_locale: email === "en@mojljubimac.test" ? "en" : null,
    },
    error: null,
  };
}

function query(table: string) {
  const filters: [string, string, unknown][] = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row = {};
  const source = () =>
    table === "organisation_memberships" ? state.memberships : table === "organisation_invitations" ? state.invitations : (state.tables[table] ?? []);
  const rows = () =>
    source().filter((r) =>
      filters.every(([kind, column, value]) => (kind === "eq" ? r[column] === value : String(r[column]) >= String(value))),
    );
  const run = async () => {
    if (table === "profiles") return { data: [{ id: state.user, deletion_requested_at: null }], error: null };
    if (table === "organisation_memberships" && op === "select" && filters.some(([, c]) => c === "user_id")) {
      const own = state.memberships.filter((m) => m.user_id === state.user);
      return { data: own.map((m) => ({ ...m, organisations: { approval_status: "approved" } })), error: null };
    }
    if (op === "insert") {
      source().push({ ...payload, created_at: new Date().toISOString() });
      return { data: null, error: null };
    }
    if (op === "update" || op === "delete") {
      const hit = rows();
      if (table === "organisation_memberships") {
        if (state.role !== "admin") return dbError("forbidden_role");
        for (const r of hit) {
          const leavesNoAdmin =
            r.role === "admin" && (op === "delete" || payload.role !== "admin") && state.admins.filter((a) => a !== r.user_id).length === 0;
          if (leavesNoAdmin) return dbError("validation_failed:last_admin", "user_id:last_admin");
        }
      }
      if (op === "update") for (const r of hit) Object.assign(r, payload);
      else for (const r of hit) source().splice(source().indexOf(r), 1);
      return { data: hit.map((r) => ({ id: r.id, user_id: r.user_id })), error: null };
    }
    return { data: rows(), error: null };
  };
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push(["eq", column, value]), api),
    gte: (column: string, value: unknown) => (filters.push(["gte", column, value]), api),
    order: () => api,
    limit: () => api,
    insert: (value: Row) => ((op = "insert"), (payload = value), api),
    update: (value: Row) => ((op = "update"), (payload = value), api),
    delete: () => ((op = "delete"), api),
    maybeSingle: async () => {
      const r = await run();
      return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: state.user, email: "milica.stojanovic@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } : null },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string, args: Row) => {
      state.rpcCalls.push({ name, args });
      if (name === "create_organisation_invitation") return createRpc(args);
      if (name === "get_my_organisation") {
        return {
          data: {
            team: state.memberships.map((m) => ({
              user_id: m.user_id,
              full_name: null,
              email: "x@mojljubimac.test",
              role: m.role,
              joined_at: "2026-10-01T00:00:00Z",
              is_me: m.user_id === state.user,
            })),
          },
          error: null,
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

let keyCounter = 0;
const newKey = () => `00000000-0000-4000-8000-${String(++keyCounter).padStart(12, "0")}`;

beforeEach(() => {
  vi.stubEnv("ACTION_TOKEN_SECRET", "team-test-secret");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${SITE}/`);
  Object.assign(state, {
    user: MILICA,
    role: "admin",
    members: 2,
    pending: 0,
    admins: [MILICA],
    memberships: [
      { id: "m1", organisation_id: ORG, user_id: MILICA, role: "admin", created_at: "2026-10-01T00:00:00Z" },
      { id: "m2", organisation_id: ORG, user_id: JELENA, role: "volunteer", created_at: "2026-10-02T00:00:00Z" },
    ],
    invitations: [],
    tables: { idempotency_keys: [], rate_limit_counters: [] },
    rpcCalls: [],
    emails: [],
  });
  sendEmail.mockClear();
});

describe("EP-56 inviteTeamMember", () => {
  it("an Admin invites: og_ token hashed in the database, team_invitation email with the raw link", async () => {
    const result = await inviteTeamMember({ email: " Novi@MojLjubimac.test ", role: "volunteer", idempotency_key: newKey() });
    expect(result.ok && result.data).toMatchObject({ email: "novi@mojljubimac.test", role: "volunteer", status: "pending" });

    const args = state.rpcCalls[0].args;
    expect(state.rpcCalls[0].name).toBe("create_organisation_invitation");
    expect(args).toMatchObject({ p_email: "novi@mojljubimac.test", p_role: "volunteer" });
    expect(String(args.p_token_hash)).toMatch(/^[0-9a-f]{64}$/);

    expect(state.emails).toHaveLength(1);
    const email = state.emails[0];
    expect(email).toMatchObject({ to: "novi@mojljubimac.test", locale: "sr", template: { id: "team_invitation" } });
    expect(email.template.variables).toMatchObject({
      inviter: "Milica Stojanović",
      organisation: "Azil Šapica",
      role: "volunteer",
      date: "30. 10. 2026.",
    });
    const url = String(email.template.variables.url);
    expect(url.startsWith(`${SITE}/poziv/og_`)).toBe(true);
    const token = url.slice(`${SITE}/poziv/`.length);
    expect(await hashToken(token)).toBe(args.p_token_hash);
    const check = await verifyActionToken(token, "og", { fieldCount: 1 });
    expect(check.ok && check.token.fields).toEqual([args.p_invitation_id]);
    // BR-47: valid 7 days, as household invitations.
    expect(check.ok && Math.round((check.token.expiresAt.getTime() - Date.now()) / 86_400_000)).toBe(7);
  });

  it("the email goes in the recipient's account language", async () => {
    await inviteTeamMember({ email: "en@mojljubimac.test", role: "admin", idempotency_key: newKey() });
    expect(state.emails[0]).toMatchObject({ locale: "en", template: { variables: { role: "admin", date: "30 Oct 2026" } } });
  });

  it("FR-43 #1: roles are admin / volunteer only; a bad email or key → validation_failed", async () => {
    expect(
      await inviteTeamMember({ email: "x@mojljubimac.test", role: "owner" as "admin", idempotency_key: newKey() }),
    ).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { role: "invalid" } } });
    expect(await inviteTeamMember({ email: "nije mejl", role: "admin", idempotency_key: newKey() })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { email: "invalid" } },
    });
    expect(await inviteTeamMember({ email: "x@mojljubimac.test", role: "admin", idempotency_key: "abc" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { idempotency_key: "invalid" } },
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("FR-43 #1: 20 memberships + pending invitations → 409 team_full, no email", async () => {
    state.members = 2;
    state.pending = 18;
    const result = await inviteTeamMember({ email: "dvadeseti@mojljubimac.test", role: "volunteer", idempotency_key: newKey() });
    expect(result).toMatchObject({ ok: false, error: { code: "team_full" } });
    expect(state.emails).toHaveLength(0);
  });

  it("a current member's address → 409 already_member; a Volunteer → 403 forbidden_role", async () => {
    expect(
      await inviteTeamMember({ email: "jelena.nikolic@mojljubimac.test", role: "volunteer", idempotency_key: newKey() }),
    ).toMatchObject({ ok: false, error: { code: "already_member" } });
    state.role = "volunteer";
    expect(await inviteTeamMember({ email: "novi@mojljubimac.test", role: "volunteer", idempotency_key: newKey() })).toMatchObject({
      ok: false,
      error: { code: "forbidden_role" },
    });
  });

  it("API §3.3: the same idempotency_key within 24 h returns the original invitation and sends nothing", async () => {
    const key = newKey();
    const first = await inviteTeamMember({ email: "novi@mojljubimac.test", role: "volunteer", idempotency_key: key });
    const second = await inviteTeamMember({ email: "novi@mojljubimac.test", role: "volunteer", idempotency_key: key });
    expect(second).toEqual(first);
    expect(state.rpcCalls.filter((c) => c.name === "create_organisation_invitation")).toHaveLength(1);
    expect(state.emails).toHaveLength(1);
  });

  it("API §11: the 21st invitation in a day → 429 rate_limited (own counter)", async () => {
    state.tables.rate_limit_counters.push({
      user_id: MILICA,
      operation: "organisation_invitations.create",
      window_start: new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString(),
      count: 20,
    });
    const result = await inviteTeamMember({ email: "novi@mojljubimac.test", role: "volunteer", idempotency_key: newKey() });
    expect(result).toMatchObject({ ok: false, error: { code: "rate_limited" } });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("without a session → 401 unauthenticated", async () => {
    state.user = null;
    expect(await inviteTeamMember({ email: "novi@mojljubimac.test", role: "volunteer", idempotency_key: newKey() })).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    });
  });
});

describe("EP-56 revoke / remove / change role", () => {
  it("revoke deletes a pending invitation; an unknown one → not_found", async () => {
    state.invitations.push({ id: "e2410000-0000-4000-8000-000000000001", status: "pending" });
    expect(await revokeInvitation({ invitation_id: "e2410000-0000-4000-8000-000000000001" })).toEqual({ ok: true, data: null });
    expect(state.invitations).toHaveLength(0);
    expect(await revokeInvitation({ invitation_id: "e2410000-0000-4000-8000-000000000002" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("change role returns the OrganisationMember; remove deletes the membership", async () => {
    const promoted = await changeMemberRole({ user_id: JELENA, role: "admin" });
    expect(promoted.ok && promoted.data).toMatchObject({ user_id: JELENA, role: "admin" });
    state.admins = [MILICA, JELENA];
    expect(await removeMember({ user_id: JELENA })).toEqual({ ok: true, data: null });
    expect(state.memberships.some((m) => m.user_id === JELENA)).toBe(false);
  });

  it("leaving the organisation without an admin → validation_failed with fields.user_id = last_admin", async () => {
    expect(await removeMember({ user_id: MILICA })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { user_id: "last_admin" } },
    });
    expect(await changeMemberRole({ user_id: MILICA, role: "volunteer" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { user_id: "last_admin" } },
    });
  });

  it("a Volunteer → 403 forbidden_role; a bad role → validation_failed", async () => {
    state.role = "volunteer";
    expect(await removeMember({ user_id: JELENA })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(await changeMemberRole({ user_id: JELENA, role: "owner" as "admin" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { role: "invalid" } },
    });
  });
});
