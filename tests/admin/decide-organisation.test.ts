// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-42 #1 (approval side) and FR-57 #1 — EP-68 decideOrganisation (lib/actions/admin.ts) over fake clients
// that model the session (profiles.is_operator, organisation memberships for the API §4.1 gates) and the
// service-role rpc:decide_organisation. approve → approved, the creator gets shelter_approved (button
// NEXT_PUBLIC_SITE_URL/organizacija) in their locale and the shelter member's writes pass gate 4 (they were
// organisation_pending_approval before); reject → rejected + rejection_reason and shelter_rejected with
// "Razlog: …"; a second decision → 409 already_decided and no email; a non-Operator → 403 forbidden_role and
// nothing is decided. Resend is faked. The database side is proven in supabase/tests/admin_access.test.sql.

type Row = Record<string, unknown>;

const ANA = "a1000000-0000-4000-8000-000000000006"; // Operator
const IVANA = "a1000000-0000-4000-8000-000000000001";
const MILICA = "a1000000-0000-4000-8000-000000000004";
const SHELTER = "b2000000-0000-4000-8000-000000000001";
const SITE = "https://mojljubimac.test";

type Org = { id: string; name: string; approval_status: string; rejection_reason: string | null; creator: string; locale: string };

const state = {
  user: ANA as string | null,
  operators: new Set([ANA]),
  orgs: [] as Org[],
  memberships: [] as { user_id: string; organisation_id: string }[],
  rpcCalls: 0,
  emails: [] as { to: string; locale: string; template: { id: string; variables: Record<string, unknown> } }[],
};

const sendEmail = vi.fn(async (input: (typeof state.emails)[number]) => {
  state.emails.push(input);
  return { status: "delivered" as const, id: "re_1" };
});
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: (input: (typeof state.emails)[number]) => sendEmail(input) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sessionClient() }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => serviceClient() }));

const { decideOrganisation } = await import("@/lib/actions/admin");
const { checkGates } = await import("@/lib/server/gates");
const { renderEmail } = await vi.importActual<typeof import("@/lib/integrations/resend")>("@/lib/integrations/resend");

function pendingOrganisation(o: Org) {
  return {
    id: o.id,
    type: "shelter",
    name: o.name,
    city: { id: "c", name_sr: "Bečej", name_en: "Becej", latitude: 45.6, longitude: 20.0 },
    tax_id: null,
    registration_note: null,
    email: null,
    phone: null,
    contact_full_name: "Milica Stojanović",
    contact_email: o.creator,
    approval_status: o.approval_status,
    rejection_reason: o.rejection_reason,
    registered_at: "2026-10-18T08:00:00Z",
  };
}

/** The user's own session (RLS): own profile row and memberships with their organisation's status. */
function sessionClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: state.user, email: "x@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } : null },
        error: null,
      }),
    },
    from: (table: string) => {
      const filters: Row = {};
      const api = {
        select: () => api,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return api;
        },
        maybeSingle: async () => {
          if (table === "profiles") {
            return {
              data: { id: state.user, deletion_requested_at: null, is_operator: state.operators.has(String(state.user)) },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            table === "organisation_memberships"
              ? {
                  data: state.memberships
                    .filter((m) => m.user_id === filters.user_id)
                    .map((m) => ({
                      organisation_id: m.organisation_id,
                      organisations: { approval_status: state.orgs.find((o) => o.id === m.organisation_id)!.approval_status },
                    })),
                  error: null,
                }
              : { data: [], error: null },
          ).then(resolve),
      };
      return api;
    },
    rpc: async () => {
      throw new Error("the session client must not decide");
    },
  };
}

function dbError(message: string, details: string | null = null) {
  return { data: null, error: { code: "P0001", message, details } };
}

/** rpc:decide_organisation as supabase/migrations/*_operator_admin.sql does it. */
function serviceClient() {
  return {
    rpc: async (name: string, args: Row) => {
      if (name !== "decide_organisation") throw new Error(`unexpected rpc ${name}`);
      state.rpcCalls++;
      const org = state.orgs.find((o) => o.id === args.p_organisation_id);
      if (!org) return dbError("not_found");
      if (org.approval_status !== "pending") return dbError("already_decided");
      org.approval_status = args.p_decision === "approve" ? "approved" : "rejected";
      org.rejection_reason = args.p_decision === "approve" ? null : ((args.p_rejection_reason as string | undefined) ?? null);
      return { data: { organisation: pendingOrganisation(org), creator_locale: org.locale }, error: null };
    },
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  sendEmail.mockClear();
  state.user = ANA;
  state.rpcCalls = 0;
  state.emails = [];
  state.orgs = [
    { id: SHELTER, name: "Azil Šapica", approval_status: "pending", rejection_reason: null, creator: "milica.stojanovic@mojljubimac.test", locale: "sr-Latn" },
    { id: "b2000000-0000-4000-8000-000000000009", name: "Azil „Šapa nade“", approval_status: "pending", rejection_reason: null, creator: "sapanade@mojljubimac.test", locale: "en" },
  ];
  state.memberships = [{ user_id: MILICA, organisation_id: SHELTER }];
});

describe("decideOrganisation (EP-68)", () => {
  it("FR-42 #1: approve unblocks the shelter member's writes", async () => {
    state.user = MILICA;
    const before = await checkGates((await sessionClient()) as never, { access: "write" });
    expect(before).toMatchObject({ ok: false, error: { code: "organisation_pending_approval" } });

    state.user = ANA;
    const result = await decideOrganisation({ organisation_id: SHELTER, decision: "approve" });
    expect(result).toMatchObject({ ok: true, data: { id: SHELTER, approval_status: "approved", rejection_reason: null } });

    state.user = MILICA;
    const after = await checkGates((await sessionClient()) as never, { access: "write" });
    expect(after.ok).toBe(true);
  });

  it("FR-57 #1: approve emails the creator shelter_approved with the organisation link, in their language", async () => {
    await decideOrganisation({ organisation_id: SHELTER, decision: "approve" });
    expect(state.emails).toHaveLength(1);
    const [email] = state.emails;
    expect(email).toMatchObject({
      to: "milica.stojanovic@mojljubimac.test",
      locale: "sr",
      template: { id: "shelter_approved", variables: { organisation: "Azil Šapica", url: `${SITE}/organizacija` } },
    });
    const rendered = renderEmail(email.template as never, "sr");
    expect(rendered.subject).toBe("Azil je odobren: Azil Šapica");
    expect(rendered.text).toContain("Dobro došao/la! Azil Šapica je odobren");
    expect(rendered.text).toContain(`Otvori organizaciju: ${SITE}/organizacija`);
  });

  it("FR-57 #1: reject stores the reason and emails shelter_rejected with it", async () => {
    const result = await decideOrganisation({
      organisation_id: "b2000000-0000-4000-8000-000000000009",
      decision: "reject",
      rejection_reason: "  Nedostaje dokaz o registraciji.  ",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { approval_status: "rejected", rejection_reason: "Nedostaje dokaz o registraciji." },
    });
    const [email] = state.emails;
    expect(email).toMatchObject({
      to: "sapanade@mojljubimac.test",
      locale: "en",
      template: { id: "shelter_rejected", variables: { organisation: "Azil „Šapa nade“", reason: "Nedostaje dokaz o registraciji." } },
    });
    const en = renderEmail(email.template as never, "en");
    expect(en.subject).toBe("Shelter not approved: Azil „Šapa nade“");
    expect(en.text).toContain("Reason: Nedostaje dokaz o registraciji.");
    const sr = renderEmail(email.template as never, "sr");
    expect(sr.text).toContain("odgovori na ovaj mejl. Razlog: Nedostaje dokaz o registraciji.");
  });

  it("FR-57 #1: reject without a reason sends the body alone", async () => {
    await decideOrganisation({ organisation_id: SHELTER, decision: "reject" });
    const rendered = renderEmail(state.emails[0].template as never, "sr");
    expect(rendered.text).not.toContain("Razlog");
    expect(rendered.html).not.toContain("Razlog");
  });

  it("FR-57 #1: a second decision → 409 already_decided and no email", async () => {
    await decideOrganisation({ organisation_id: SHELTER, decision: "approve" });
    const second = await decideOrganisation({ organisation_id: SHELTER, decision: "reject" });
    expect(second).toMatchObject({ ok: false, error: { code: "already_decided" } });
    expect(state.emails).toHaveLength(1);
  });

  it("FR-57 #1: a non-Operator → 403 forbidden_role and nothing is decided", async () => {
    state.user = IVANA;
    const result = await decideOrganisation({ organisation_id: SHELTER, decision: "approve" });
    expect(result).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(state.rpcCalls).toBe(0);
    expect(state.orgs[0].approval_status).toBe("pending");
    expect(state.emails).toHaveLength(0);
  });

  it("no session → 401 unauthenticated", async () => {
    state.user = null;
    expect(await decideOrganisation({ organisation_id: SHELTER, decision: "approve" })).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    });
  });

  it("validates the request: reason with approve, reason too long, bad decision, unknown organisation", async () => {
    expect(await decideOrganisation({ organisation_id: SHELTER, decision: "approve", rejection_reason: "x" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { rejection_reason: "invalid" } },
    });
    expect(
      await decideOrganisation({ organisation_id: SHELTER, decision: "reject", rejection_reason: "a".repeat(501) }),
    ).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { rejection_reason: "too_long" } } });
    expect(await decideOrganisation({ organisation_id: SHELTER, decision: "maybe" as never })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { decision: "invalid" } },
    });
    expect(
      await decideOrganisation({ organisation_id: "b2000000-0000-4000-8000-0000000000ff", decision: "approve" }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(state.emails).toHaveLength(0);
  });

  it("a failed email does not undo the decision", async () => {
    sendEmail.mockResolvedValueOnce({ status: "failed", error: "resend_500" } as never);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await decideOrganisation({ organisation_id: SHELTER, decision: "approve" });
    expect(result).toMatchObject({ ok: true, data: { approval_status: "approved" } });
    errors.mockRestore();
  });
});
