// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-86 moderate (lib/actions/admin.ts, Step 28c; FR-71 #2–#5): the API §4.1 gates, then profiles.is_operator
// (forbidden_role otherwise), then the service-role functions — admin_decide_report (dismiss / hide / suspend, one
// transaction), admin_get_restriction + admin_restore_listing, admin_restore_user. The emails listing_hidden and
// marketplace_suspended (Resend fake) go to the author in their locale with {reason} = reason_note or the report
// reason label; reason_note is never sent to the database (OQ-17). The database behaviour itself (statuses, actioned
// reports, the limit fallback, RLS effects) is proven in supabase/tests/sapa_moderation_api.test.sql.

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };

const ANA = "a1000000-0000-4000-8000-000000000006";
const MARKO = "a1000000-0000-4000-8000-000000000002";
const JELENA = "a1000000-0000-4000-8000-000000000003";
const REPORT = "f3200000-0000-4000-8000-000000000001";
const LISTING = "f3000000-0000-4000-8000-000000000004";

const state = {
  user: ANA,
  operator: true,
  serviceCalls: [] as { name: string; args: Row }[],
  serviceResult: {} as Record<string, { data: unknown; error: DbError | null }>,
};

const sendEmail = vi.fn<(input: unknown) => Promise<{ status: "delivered" | "failed"; id?: string; error?: string }>>(
  async () => ({ status: "delivered", id: "re_1" }),
);
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: (input: unknown) => sendEmail(input) }));
vi.mock("@/lib/integrations/nominatim", () => ({ geocode: vi.fn() }));
vi.mock("@/lib/integrations/r2", () => ({ r2: vi.fn(), safeFileName: (s: string) => s }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: state.user, email: "ana.markovic@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: table === "profiles" ? { id: state.user, deletion_requested_at: null, is_operator: state.operator } : null,
          error: null,
        }),
        then: (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (name: string, args: Row) => {
      state.serviceCalls.push({ name, args });
      return state.serviceResult[name] ?? { data: null, error: null };
    },
  }),
}));

const { moderate } = await import("@/lib/actions/admin");

function item(extra: Row = {}) {
  return {
    report_id: REPORT,
    target: "listing",
    reason: "scam",
    note: "Traži uplatu unapred.",
    status: "actioned",
    created_at: "2026-10-26T08:00:00Z",
    handled_at: "2026-10-29T08:00:00Z",
    reporter: { user_id: MARKO, display_name: "Marko Jovanović" },
    listing: { id: LISTING, title: "Prodajem krevet za psa", status: "hidden" },
    reported_user: { user_id: JELENA, display_name: "Jelena Nikolić", suspended_at: null },
    same_target_open_count: 0,
    ...extra,
  };
}

const restriction = {
  kind: "listing",
  listing_id: LISTING,
  listing_title: "Prodajem krevet za psa",
  user_id: JELENA,
  user_display_name: "Jelena Nikolić",
  restricted_at: "2026-10-29T08:00:00Z",
  reason: "scam",
};

beforeEach(() => {
  state.user = ANA;
  state.operator = true;
  state.serviceCalls = [];
  state.serviceResult = {};
  sendEmail.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mojljubimac.test");
});

describe("access", () => {
  it("a non-Operator → 403 forbidden_role, nothing is called", async () => {
    state.user = MARKO;
    state.operator = false;
    expect(await moderate({ op: "dismiss_report", report_id: REPORT })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(state.serviceCalls).toEqual([]);
  });
});

describe("FR-71 #5 — dismiss", () => {
  it("marks the report dismissed and changes nothing else (no email)", async () => {
    state.serviceResult.admin_decide_report = { data: { item: item({ status: "dismissed" }), email: null }, error: null };
    const result = await moderate({ op: "dismiss_report", report_id: REPORT });
    expect(result).toEqual({ ok: true, data: { report: item({ status: "dismissed" }), restriction: null } });
    expect(state.serviceCalls).toEqual([
      { name: "admin_decide_report", args: { p_operator: ANA, p_report_id: REPORT, p_op: "dismiss_report" } },
    ]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a decided report → 409 already_decided", async () => {
    state.serviceResult.admin_decide_report = { data: null, error: { code: "P0001", message: "already_decided" } };
    expect(await moderate({ op: "dismiss_report", report_id: REPORT })).toMatchObject({ ok: false, error: { code: "already_decided" } });
  });

  it("an unknown report → 404 not_found", async () => {
    state.serviceResult.admin_decide_report = { data: null, error: { code: "P0001", message: "not_found" } };
    expect(await moderate({ op: "dismiss_report", report_id: REPORT })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("FR-71 #2 — hide a listing", () => {
  const email = { template: "listing_hidden", to: "jelena.nikolic@mojljubimac.test", locale: "sr-Latn", listing: "Prodajem krevet za psa", reason: "scam" };

  it("hides it and emails the author with the Operator's note (never stored)", async () => {
    state.serviceResult.admin_decide_report = { data: { item: item(), email }, error: null };
    const result = await moderate({ op: "hide_listing", report_id: REPORT, reason_note: "  Oglas traži uplatu unapred.  " });
    expect(result).toEqual({ ok: true, data: { report: item(), restriction: null } });
    expect(state.serviceCalls[0].args).toEqual({ p_operator: ANA, p_report_id: REPORT, p_op: "hide_listing" });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0][0]).toEqual({
      to: "jelena.nikolic@mojljubimac.test",
      locale: "sr",
      template: {
        id: "listing_hidden",
        variables: { listing: "Prodajem krevet za psa", reason: "Oglas traži uplatu unapred.", url: "https://mojljubimac.test/sapa-pomoci/moje" },
      },
    });
  });

  it("without a note {reason} is the report reason label in the author's language", async () => {
    state.serviceResult.admin_decide_report = { data: { item: item(), email }, error: null };
    await moderate({ op: "hide_listing", report_id: REPORT });
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ template: { variables: { reason: "Prevara" } } });

    state.serviceResult.admin_decide_report = { data: { item: item(), email: { ...email, locale: "en" } }, error: null };
    await moderate({ op: "hide_listing", report_id: REPORT, reason_note: "   " });
    expect(sendEmail.mock.calls[1][0]).toMatchObject({ locale: "en", template: { variables: { reason: "Scam" } } });
  });

  it("no email when the listing was not active (the function returns none)", async () => {
    state.serviceResult.admin_decide_report = { data: { item: item(), email: null }, error: null };
    expect((await moderate({ op: "hide_listing", report_id: REPORT })).ok).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a user report → 422 report_id invalid; a note over 500 → too_long", async () => {
    state.serviceResult.admin_decide_report = {
      data: null,
      error: { code: "P0001", message: "validation_failed", details: "report_id:invalid" },
    };
    expect(await moderate({ op: "hide_listing", report_id: REPORT })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { report_id: "invalid" } },
    });
    state.serviceCalls = [];
    expect(await moderate({ op: "hide_listing", report_id: REPORT, reason_note: "a".repeat(501) })).toMatchObject({
      ok: false,
      error: { fields: { reason_note: "too_long" } },
    });
    expect(state.serviceCalls).toEqual([]);
  });

  it("a failed email is logged and the decision stands", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendEmail.mockResolvedValueOnce({ status: "failed", error: "resend_500" } as never);
    state.serviceResult.admin_decide_report = { data: { item: item(), email }, error: null };
    expect((await moderate({ op: "hide_listing", report_id: REPORT })).ok).toBe(true);
  });
});

describe("FR-71 #3 — suspend a user", () => {
  it("suspends and emails marketplace_suspended for a new suspension", async () => {
    state.serviceResult.admin_decide_report = {
      data: { item: item({ target: "user" }), email: { template: "marketplace_suspended", to: "nikola@mojljubimac.test", locale: "en", reason: "spam" } },
      error: null,
    };
    const result = await moderate({ op: "suspend_user", report_id: REPORT, reason_note: null });
    expect(result.ok).toBe(true);
    expect(state.serviceCalls[0].args).toEqual({ p_operator: ANA, p_report_id: REPORT, p_op: "suspend_user" });
    expect(sendEmail.mock.calls[0][0]).toEqual({
      to: "nikola@mojljubimac.test",
      locale: "en",
      template: { id: "marketplace_suspended", variables: { reason: "Spam or advertising" } },
    });
  });

  it("no email when the user was already suspended", async () => {
    state.serviceResult.admin_decide_report = { data: { item: item({ target: "user" }), email: null }, error: null };
    await moderate({ op: "suspend_user", report_id: REPORT });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("FR-71 #4 — restore", () => {
  it("restore_listing reads the restriction, restores, and returns it (no email)", async () => {
    state.serviceResult.admin_get_restriction = { data: restriction, error: null };
    state.serviceResult.admin_restore_listing = { data: "active", error: null };
    const result = await moderate({ op: "restore_listing", listing_id: LISTING });
    expect(result).toEqual({ ok: true, data: { report: null, restriction } });
    expect(state.serviceCalls.map((c) => c.name)).toEqual(["admin_get_restriction", "admin_restore_listing"]);
    expect(state.serviceCalls[1].args).toEqual({ p_id: LISTING });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a listing that is not hidden → 422 listing_id invalid_state", async () => {
    state.serviceResult.admin_restore_listing = {
      data: null,
      error: { code: "P0001", message: "validation_failed", details: "listing_id:invalid_state" },
    };
    expect(await moderate({ op: "restore_listing", listing_id: LISTING })).toMatchObject({
      ok: false,
      error: { fields: { listing_id: "invalid_state" } },
    });
  });

  it("restore_user returns the lifted restriction", async () => {
    const lifted = { ...restriction, kind: "user", listing_id: null, listing_title: null };
    state.serviceResult.admin_restore_user = { data: lifted, error: null };
    expect(await moderate({ op: "restore_user", user_id: JELENA })).toEqual({ ok: true, data: { report: null, restriction: lifted } });
    expect(state.serviceCalls).toEqual([{ name: "admin_restore_user", args: { p_user_id: JELENA } }]);
  });

  it("a user who is not suspended → 422 user_id invalid_state; bad ids and ops → 422", async () => {
    state.serviceResult.admin_restore_user = {
      data: null,
      error: { code: "P0001", message: "validation_failed", details: "user_id:invalid_state" },
    };
    expect(await moderate({ op: "restore_user", user_id: JELENA })).toMatchObject({ ok: false, error: { fields: { user_id: "invalid_state" } } });
    expect(await moderate({ op: "restore_user", user_id: "x" })).toMatchObject({ ok: false, error: { fields: { user_id: "invalid" } } });
    expect(await moderate({ op: "delete_everything" } as never)).toMatchObject({ ok: false, error: { fields: { op: "invalid" } } });
  });
});
