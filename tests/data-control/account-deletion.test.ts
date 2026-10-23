// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-40 — EP-51 requestAccountDeletion / cancelAccountDeletion (lib/actions/data-control.ts) over a fake server
// client that behaves like the Step 23 database functions request_account_deletion / cancel_account_deletion
// and the profiles trigger (deletion_due_at = requested + 30 days): the request sets both columns and sends the
// Design §9.1 account_deletion_scheduled email; every protected call afterwards answers 403
// account_pending_deletion (API §4.1 gate 3); cancel passes gate 3, clears both columns, leaves profile, pets and
// subscription rows exactly as before the request and sends no email (no §9.1 template, CR-24). The
// permanent deletion after 30 days is Step 30.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const SITE = "https://mojljubimac.test";
const DAY = 86_400_000;

const state = {
  profile: {} as Row,
  pets: [] as Row[],
  subscriptions: [] as Row[],
  rpcCalls: [] as string[],
};

const emails: { to: string; locale: string; template: { id: string; variables: Record<string, string> } }[] = [];
vi.mock("@/lib/integrations/resend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/resend")>();
  return {
    ...actual,
    sendEmail: async (input: (typeof emails)[number]) => {
      emails.push(input);
      return { status: "delivered" as const, id: "re_1" };
    },
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { requestAccountDeletion, cancelAccountDeletion, requestDataExport } = await import("@/lib/actions/data-control");
const { setAutoRenew } = await import("@/lib/actions/subscription");
const { renderEmail } = await import("@/lib/integrations/resend");

function me() {
  const due = state.profile.deletion_due_at as string | null;
  return {
    id: IVANA,
    email: state.profile.email,
    full_name: state.profile.full_name,
    locale: state.profile.locale,
    deletion_requested_at: state.profile.deletion_requested_at,
    deletion_due_at: due,
    deletion_days_left: due ? Math.ceil((new Date(due).getTime() - Date.now()) / DAY) : null,
  };
}

function rpc(name: string) {
  state.rpcCalls.push(name);
  if (name === "request_account_deletion") {
    if (state.profile.deletion_requested_at) return { data: null, error: { code: "P0001", message: "account_pending_deletion" } };
    const now = new Date();
    state.profile.deletion_requested_at = now.toISOString();
    state.profile.deletion_due_at = new Date(now.getTime() + 30 * DAY).toISOString();
    return { data: null, error: null };
  }
  if (name === "cancel_account_deletion") {
    state.profile.deletion_requested_at = null;
    state.profile.deletion_due_at = null;
    return { data: null, error: null };
  }
  if (name === "get_me") return { data: me(), error: null };
  throw new Error(`unexpected rpc ${name}`);
}

function query(table: string) {
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => ({
      data: table === "profiles" ? { id: IVANA, deletion_requested_at: state.profile.deletion_requested_at } : null,
      error: null,
    }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: IVANA, email: "ivana@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string) => rpc(name),
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${SITE}/`);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T10:00:00Z"));
  state.profile = {
    id: IVANA,
    email: "ivana@mojljubimac.test",
    full_name: "Ivana Petrović",
    locale: "sr-Latn",
    city_id: "c0000000-0000-4000-8000-000000000001",
    trial_used: false,
    deletion_requested_at: null,
    deletion_due_at: null,
  };
  state.pets = [{ id: "p1", owner_id: IVANA, name: "Luna", lifecycle: "active" }];
  state.subscriptions = [{ id: "s1", user_id: IVANA, plan: "premium_monthly", status: "active", auto_renew: true }];
  state.rpcCalls = [];
  emails.length = 0;
});

describe("EP-51 requestAccountDeletion", () => {
  it("confirm must be true → 422 validation_failed (fields.confirm = required)", async () => {
    expect(await requestAccountDeletion({ confirm: false })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { confirm: "required" } },
    });
    expect(state.rpcCalls).toEqual([]);
  });

  it("FR-40 #1: sets deletion_requested_at and deletion_due_at = +30 days, emails account_deletion_scheduled", async () => {
    const result = await requestAccountDeletion({ confirm: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      deletion_requested_at: "2026-10-23T10:00:00.000Z",
      deletion_due_at: "2026-11-22T10:00:00.000Z",
      deletion_days_left: 30,
    });
    expect(emails).toEqual([
      {
        to: "ivana@mojljubimac.test",
        locale: "sr",
        template: { id: "account_deletion_scheduled", variables: { date: "22. 11. 2026.", url: `${SITE}/profil/podaci` } },
      },
    ]);
  });

  it("FR-40 #1: a protected call afterwards → 403 account_pending_deletion", async () => {
    await requestAccountDeletion({ confirm: true });
    expect(await requestAccountDeletion({ confirm: true })).toMatchObject({ ok: false, error: { code: "account_pending_deletion" } });
    expect(await requestDataExport()).toMatchObject({ ok: false, error: { code: "account_pending_deletion" } });
    expect(await setAutoRenew({ auto_renew: false })).toMatchObject({ ok: false, error: { code: "account_pending_deletion" } });
  });

  it("the email in the recipient's language (Design §9.1)", () => {
    const sr = renderEmail({ id: "account_deletion_scheduled", variables: { date: "22. 11. 2026.", url: `${SITE}/profil/podaci` } }, "sr");
    expect(sr.subject).toBe("Nalog će biti obrisan 22. 11. 2026.");
    expect(sr.text).toContain("Nalog je isključen, a 22. 11. 2026. brišemo ga trajno sa svim podacima.");
    expect(sr.text).toContain(`Otkaži brisanje: ${SITE}/profil/podaci`);
    const en = renderEmail({ id: "account_deletion_scheduled", variables: { date: "22 Nov 2026", url: `${SITE}/profil/podaci` } }, "en");
    expect(en.subject).toBe("Your account will be deleted on 22 Nov 2026");
    expect(en.html).toContain("Cancel deletion");
  });
});

describe("EP-51 cancelAccountDeletion", () => {
  it("FR-40 #2: passes gate 3, clears both columns, everything else unchanged, no email", async () => {
    const before = structuredClone({ profile: state.profile, pets: state.pets, subscriptions: state.subscriptions });
    await requestAccountDeletion({ confirm: true });
    emails.length = 0;

    const result = await cancelAccountDeletion();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ deletion_requested_at: null, deletion_due_at: null, deletion_days_left: null });
    expect({ profile: state.profile, pets: state.pets, subscriptions: state.subscriptions }).toEqual(before);
    expect(emails).toEqual([]);

    // The account works again.
    expect((await requestAccountDeletion({ confirm: false })).ok).toBe(false);
    expect(await requestAccountDeletion({ confirm: false })).toMatchObject({ error: { code: "validation_failed" } });
  });

  it("nothing pending → a no-op returning ok", async () => {
    const result = await cancelAccountDeletion();
    expect(result).toMatchObject({ ok: true, data: { deletion_due_at: null } });
  });
});
