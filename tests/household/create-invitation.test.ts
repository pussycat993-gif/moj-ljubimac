// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-26 #1, #3, #4 and API §11 — EP-35 create_household_invitation (lib/actions/household.ts) over a fake
// server client: email and link invitations by a Premium owner (hh_ token signed per API §9.3, only its
// SHA-256 hash sent to the database, raw token only in invite_url; the Design §9.1 household_invitation
// email for email invitations only), a Free owner → 403 premium_required with details.limit = "household",
// owner + 5 members → 409 household_full, the 21st call in a day → 429 rate_limited, and the 24 h
// idempotency replay (API §3.3). The database rules themselves are proven in
// supabase/tests/household_invitations.test.sql.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const HOUSEHOLD = "b1000000-0000-4000-8000-000000000001";
const SITE = "https://mojljubimac.test";

const state = {
  user: IVANA as string | null,
  premium: true,
  members: 2,
  memberEmails: ["ivana.petrovic@mojljubimac.test", "jelena.nikolic@mojljubimac.test"],
  household: true,
  sharedPets: ["Luna", "Maks"],
  recipientLocale: null as string | null,
  tables: { idempotency_keys: [] as Row[], rate_limit_counters: [] as Row[] } as Record<string, Row[]>,
  rpcCalls: [] as { name: string; args: Row }[],
  emails: [] as { to: string; locale: string; template: { id: string; variables: Record<string, unknown> } }[],
  emailFails: false,
};

const sendEmail = vi.fn(async (input: (typeof state.emails)[number]) => {
  state.emails.push(input);
  return state.emailFails ? { status: "failed" as const, error: "resend_500" } : { status: "delivered" as const, id: "re_1" };
});
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: (input: (typeof state.emails)[number]) => sendEmail(input) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { createHouseholdInvitation } = await import("@/lib/actions/household");
const { hashToken } = await import("@/lib/server/action-tokens");

function dbError(message: string) {
  return { data: null, error: { code: "P0001", message, details: null as string | null } };
}

/** create_household_invitation as the database does it (supabase/migrations/*_household_sharing.sql). */
function createRpc(args: Row) {
  if (!state.premium) return dbError("premium_required:household");
  if (!state.household && !args.p_household_name) {
    return { data: null, error: { code: "P0001", message: "validation_failed", details: "household_name:required" } };
  }
  if (state.members >= 6) return dbError("household_full");
  const email = (args.p_email as string | undefined) ?? null;
  if (email && state.memberEmails.includes(email)) return dbError("already_member");
  state.household = true;
  return {
    data: {
      invitation: {
        id: args.p_invitation_id,
        household_id: HOUSEHOLD,
        kind: email ? "email" : "link",
        email,
        status: "pending",
        created_at: "2026-10-23T08:00:00Z",
        expires_at: "2026-10-30T08:00:00Z",
        decided_at: null,
        accepted_by: null,
      },
      household_name: "Domaćinstvo Petrović",
      inviter_name: "Ivana Petrović",
      inviter_locale: "sr-Latn",
      recipient_locale: state.recipientLocale,
      shared_pets: state.sharedPets,
    },
    error: null,
  };
}

function query(table: string) {
  const filters: [string, string, unknown][] = [];
  let op: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  const rows = () =>
    (state.tables[table] ?? []).filter((r) =>
      filters.every(([kind, column, value]) => (kind === "eq" ? r[column] === value : String(r[column]) >= String(value))),
    );
  const run = async () => {
    if (table === "profiles") return { data: [{ id: state.user, deletion_requested_at: null }], error: null };
    if (table === "organisation_memberships") return { data: [], error: null };
    if (op === "insert") {
      state.tables[table].push({ ...payload, created_at: new Date().toISOString() });
      return { data: null, error: null };
    }
    if (op === "update") {
      for (const r of rows()) Object.assign(r, payload);
      return { data: null, error: null };
    }
    return { data: rows(), error: null };
  };
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push(["eq", column, value]), api),
    gte: (column: string, value: unknown) => (filters.push(["gte", column, value]), api),
    insert: (value: Row) => ((op = "insert"), (payload = value), api),
    update: (value: Row) => ((op = "update"), (payload = value), api),
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
        data: { user: state.user ? { id: state.user, email: "ivana.petrovic@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } : null },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string, args: Row) => {
      state.rpcCalls.push({ name, args });
      if (name === "create_household_invitation") return createRpc(args);
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

let keyCounter = 0;
const newKey = () => `00000000-0000-4000-8000-${String(++keyCounter).padStart(12, "0")}`;

beforeEach(() => {
  vi.stubEnv("ACTION_TOKEN_SECRET", "household-test-secret");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${SITE}/`);
  Object.assign(state, {
    user: IVANA,
    premium: true,
    members: 2,
    household: true,
    sharedPets: ["Luna", "Maks"],
    recipientLocale: null,
    tables: { idempotency_keys: [], rate_limit_counters: [] },
    rpcCalls: [],
    emails: [],
    emailFails: false,
  });
  sendEmail.mockClear();
});

describe("EP-35 create_household_invitation", () => {
  it("FR-26 #1: a Premium owner invites by email — hh_ link, hash only in the database, household_invitation email", async () => {
    const result = await createHouseholdInvitation({ email: " Gost@MojLjubimac.test ", idempotency_key: newKey() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.invitation).toMatchObject({ kind: "email", email: "gost@mojljubimac.test", status: "pending" });
    expect(result.data.invite_url).toMatch(new RegExp(`^${SITE}/poziv/hh_[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$`));

    const token = result.data.invite_url.slice(`${SITE}/poziv/`.length);
    const call = state.rpcCalls.find((c) => c.name === "create_household_invitation")!;
    expect(call.args.p_token_hash).toBe(await hashToken(token));
    expect(JSON.stringify(call.args)).not.toContain(token);
    expect(call.args.p_email).toBe("gost@mojljubimac.test");
    expect(call.args.p_invitation_id).toMatch(/^[0-9a-f-]{36}$/);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(state.emails[0]).toMatchObject({
      to: "gost@mojljubimac.test",
      locale: "sr",
      template: {
        id: "household_invitation",
        variables: {
          inviter: "Ivana Petrović",
          household: "Domaćinstvo Petrović",
          pets: "Luna i Maks",
          date: "30. 10. 2026.",
          url: result.data.invite_url,
        },
      },
    });
  });

  it("FR-26 #1: a link invitation (email null) sends nothing and returns the link", async () => {
    const result = await createHouseholdInvitation({ email: null, idempotency_key: newKey() });
    expect(result.ok && result.data.invitation.kind).toBe("link");
    expect(result.ok && result.data.invite_url).toMatch(/\/poziv\/hh_/);
    expect(state.rpcCalls[0].args).not.toHaveProperty("p_email");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("the email follows the recipient's language and drops the pet list when nothing is shared", async () => {
    state.recipientLocale = "en";
    state.sharedPets = [];
    await createHouseholdInvitation({ email: "sara@mojljubimac.test", idempotency_key: newKey() });
    expect(state.emails[0]).toMatchObject({ locale: "en", template: { variables: { pets: null, date: "30 Oct 2026" } } });
  });

  it("API §3.3: a repeat with the same idempotency_key returns the original result and sends nothing", async () => {
    const key = newKey();
    const first = await createHouseholdInvitation({ email: "gost@mojljubimac.test", idempotency_key: key });
    const second = await createHouseholdInvitation({ email: "gost@mojljubimac.test", idempotency_key: key });
    expect(second).toEqual(first);
    expect(state.rpcCalls.filter((c) => c.name === "create_household_invitation")).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("FR-26 #3: a Free owner → 403 premium_required with details.limit = household", async () => {
    state.premium = false;
    const result = await createHouseholdInvitation({ email: null, idempotency_key: newKey() });
    expect(result).toEqual({
      ok: false,
      error: { code: "premium_required", message: "premium_required:household", details: { limit: "household" } },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("FR-26 #4: owner + 5 members → 409 household_full", async () => {
    state.members = 6;
    const result = await createHouseholdInvitation({ email: "gost@mojljubimac.test", idempotency_key: newKey() });
    expect(!result.ok && result.error.code).toBe("household_full");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("already_member for a current member's address", async () => {
    const result = await createHouseholdInvitation({ email: "jelena.nikolic@mojljubimac.test", idempotency_key: newKey() });
    expect(!result.ok && result.error.code).toBe("already_member");
  });

  it("validation: email, idempotency_key and household_name", async () => {
    const bad = await createHouseholdInvitation({ email: "nije-mejl", idempotency_key: newKey() });
    expect(!bad.ok && bad.error).toMatchObject({ code: "validation_failed", fields: { email: "invalid" } });
    const noKey = await createHouseholdInvitation({ email: null, idempotency_key: "" });
    expect(!noKey.ok && noKey.error.fields).toEqual({ idempotency_key: "required" });
    const notV4 = await createHouseholdInvitation({ email: null, idempotency_key: "not-a-uuid" });
    expect(!notV4.ok && notV4.error.fields).toEqual({ idempotency_key: "invalid" });
    const long = await createHouseholdInvitation({ email: null, household_name: "x".repeat(61), idempotency_key: newKey() });
    expect(!long.ok && long.error.fields).toEqual({ household_name: "too_long" });
    expect(state.rpcCalls).toHaveLength(0);

    state.household = false;
    const noName = await createHouseholdInvitation({ email: null, idempotency_key: newKey() });
    expect(!noName.ok && noName.error).toMatchObject({ code: "validation_failed", fields: { household_name: "required" } });
    const created = await createHouseholdInvitation({ email: null, household_name: " Kuća Ilić ", idempotency_key: newKey() });
    expect(created.ok).toBe(true);
    expect(state.rpcCalls.at(-1)!.args.p_household_name).toBe("Kuća Ilić");
  });

  it("API §11: the 21st invitation in a day → 429 rate_limited with retry_after_s", async () => {
    for (let i = 0; i < 20; i++) {
      const result = await createHouseholdInvitation({ email: null, idempotency_key: newKey() });
      expect(result.ok).toBe(true);
    }
    const result = await createHouseholdInvitation({ email: null, idempotency_key: newKey() });
    expect(!result.ok && result.error.code).toBe("rate_limited");
    expect(!result.ok && (result.error.details?.retry_after_s as number)).toBeGreaterThan(0);
    expect(state.rpcCalls.filter((c) => c.name === "create_household_invitation")).toHaveLength(20);
  });

  it("no session → 401 unauthenticated", async () => {
    state.user = null;
    const result = await createHouseholdInvitation({ email: null, idempotency_key: newKey() });
    expect(!result.ok && result.error.code).toBe("unauthenticated");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("a failed email is an error (the next try replaces the pending invitation)", async () => {
    state.emailFails = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await createHouseholdInvitation({ email: "gost@mojljubimac.test", idempotency_key: newKey() });
    expect(!result.ok && result.error.code).toBe("internal_error");
    expect(state.tables.idempotency_keys).toHaveLength(0);
  });
});
