// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-47 #3 and FR-49 (inquiry part) — EP-58 decideRequest (lib/actions/org-requests.ts) over a fake server client
// that models rpc:decide_org_request: accept → the shelter animal becomes Reserved with a pet_status_history row and
// the applicant gets adoption_request_accepted (with the organisation's contacts, BR-36) in their profiles.locale;
// reject → adoption_request_rejected linking the public page; a second decision → 409 already_decided and no
// email; the breeder accepts / rejects an inquiry and the user is emailed either way (offspring Reserved on
// accept); a Volunteer → 403 forbidden_role. Resend is faked. The database side is proven in
// supabase/tests/org_requests.test.sql.

type Row = Record<string, unknown>;

const MILICA = "a1000000-0000-4000-8000-000000000004";
const NIKOLA = "a1000000-0000-4000-8000-000000000005";
const JELENA = "a1000000-0000-4000-8000-000000000003";
const REQ_A = "d1000000-0000-4000-8000-000000000001";
const REQ_B = "d1000000-0000-4000-8000-000000000002";
const INQ = "d2000000-0000-4000-8000-000000000001";
const SITE = "https://mojljubimac.test";

type Request = { id: string; kind: "adoption_request" | "breeder_inquiry"; status: string; pet: string; email: string; locale: string };

const state = {
  user: MILICA as string,
  requests: [] as Request[],
  pets: {} as Record<string, { shelter_status?: string; offspring_status?: string }>,
  history: [] as { pet: string; status: string; by: string }[],
  emails: [] as { to: string; locale: string; template: { id: string; variables: Record<string, string> } }[],
};

const sendEmail = vi.fn(async (input: (typeof state.emails)[number]) => {
  state.emails.push(input);
  return { status: "delivered" as const, id: "re_1" };
});
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: (input: (typeof state.emails)[number]) => sendEmail(input) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { decideRequest } = await import("@/lib/actions/org-requests");

function dbError(message: string) {
  return { data: null, error: { code: "P0001", message, details: null } };
}

/** decide_org_request as the database does it (supabase/migrations/*_org_requests_and_transfers.sql). */
function decideRpc(args: Row) {
  const r = state.requests.find((x) => x.id === args.p_id && x.kind === args.p_kind);
  if (!r) return dbError("not_found");
  if (state.user === JELENA) return dbError("forbidden_role");
  if (r.status !== "pending") return dbError("already_decided");
  r.status = args.p_decision === "accept" ? "accepted" : "rejected";
  if (args.p_decision === "accept") {
    const field = r.kind === "adoption_request" ? "shelter_status" : "offspring_status";
    state.pets[r.pet] = { ...state.pets[r.pet], [field]: "reserved" };
    state.history.push({ pet: r.pet, status: "reserved", by: state.user });
  }
  const shelter = r.kind === "adoption_request";
  return {
    data: {
      request: {
        id: r.id,
        status: r.status,
        requester_id: "a1000000-0000-4000-8000-000000000002",
        name: "Marko Jovanović",
        phone: "+381 64 123 4567",
        email: r.email,
        message: null,
        created_at: "2026-10-20T08:00:00Z",
        decided_at: "2026-10-23T08:00:00Z",
        decided_by_name: shelter ? "Milica Stojanović" : "Nikola Đorđević",
        pet: { pet_id: r.pet, name: r.pet === "zuca" ? "Žuća" : "Zlatko", species: "dog", species_other: null, breed: null, sex: "female", approx_age_text: null, birth_date: null, birth_year: null },
        transfer: null,
      },
      applicant_locale: r.locale,
      organisation: shelter
        ? { name: "Azil Šapica", slug: "azil-sapica", phone: "021 555 111", email: "azil@sapica.rs" }
        : { name: "Odgajivačnica Đorđević", slug: "odgajivacnica-djordjevic", phone: null, email: "nikola@mojljubimac.test" },
    },
    error: null,
  };
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: state.user, email: "org@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => {
      const api = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: { id: state.user, deletion_requested_at: null }, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            table === "organisation_memberships"
              ? { data: [{ organisation_id: "b2", organisations: { approval_status: "approved" } }], error: null }
              : { data: [], error: null },
          ).then(resolve),
      };
      return api;
    },
    rpc: async (name: string, args: Row = {}) => {
      if (name === "decide_org_request") return decideRpc(args);
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  state.user = MILICA;
  state.requests = [
    { id: REQ_A, kind: "adoption_request", status: "pending", pet: "zuca", email: "marko.jovanovic@mojljubimac.test", locale: "sr-Latn" },
    { id: REQ_B, kind: "adoption_request", status: "pending", pet: "zuca", email: "jelena.nikolic@mojljubimac.test", locale: "en" },
    { id: INQ, kind: "breeder_inquiry", status: "pending", pet: "zlatko", email: "ivana.petrovic@mojljubimac.test", locale: "sr-Latn" },
  ];
  state.pets = { zuca: { shelter_status: "available" }, zlatko: { offspring_status: "available" } };
  state.history = [];
  state.emails = [];
  sendEmail.mockClear();
});

describe("FR-47 #3 — the shelter decides an adoption request", () => {
  it("accept → the animal is Reserved, a history row is written and the applicant is emailed with the contacts", async () => {
    const result = await decideRequest({ kind: "adoption_request", id: REQ_A, decision: "accept" });
    expect(result).toMatchObject({ ok: true, data: { id: REQ_A, status: "accepted", decided_by_name: "Milica Stojanović" } });
    expect(state.pets.zuca.shelter_status).toBe("reserved");
    expect(state.history).toEqual([{ pet: "zuca", status: "reserved", by: MILICA }]);
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0]).toMatchObject({
      to: "marko.jovanovic@mojljubimac.test",
      locale: "sr",
      template: {
        id: "adoption_request_accepted",
        variables: { organisation: "Azil Šapica", pet: "Žuća", org_phone: "021 555 111", org_email: "azil@sapica.rs" },
      },
    });
  });

  it("other pending requests for the same pet are left unchanged", async () => {
    await decideRequest({ kind: "adoption_request", id: REQ_A, decision: "accept" });
    expect(state.requests.find((r) => r.id === REQ_B)?.status).toBe("pending");
  });

  it("reject → the applicant is emailed in their own language, with a link to the public page", async () => {
    const result = await decideRequest({ kind: "adoption_request", id: REQ_B, decision: "reject" });
    expect(result).toMatchObject({ ok: true, data: { status: "rejected" } });
    expect(state.pets.zuca.shelter_status).toBe("available");
    expect(state.emails[0]).toMatchObject({
      to: "jelena.nikolic@mojljubimac.test",
      locale: "en",
      template: { id: "adoption_request_rejected", variables: { organisation: "Azil Šapica", pet: "Žuća", url: `${SITE}/o/azil-sapica` } },
    });
  });

  it("a second decision → 409 already_decided and no second email", async () => {
    await decideRequest({ kind: "adoption_request", id: REQ_A, decision: "accept" });
    const again = await decideRequest({ kind: "adoption_request", id: REQ_A, decision: "reject" });
    expect(again).toMatchObject({ ok: false, error: { code: "already_decided" } });
    expect(state.emails).toHaveLength(1);
  });

  it("a Volunteer → 403 forbidden_role, nothing changes and no email is sent", async () => {
    state.user = JELENA;
    const result = await decideRequest({ kind: "adoption_request", id: REQ_A, decision: "accept" });
    expect(result).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(state.requests[0].status).toBe("pending");
    expect(state.emails).toHaveLength(0);
  });

  it("validates kind and decision", async () => {
    const result = await decideRequest({ kind: "adoption" as never, id: REQ_A, decision: "maybe" as never });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { kind: "invalid", decision: "invalid" } } });
  });
});

describe("FR-49 (inquiry part) — the breeder decides an inquiry; the user is emailed either way", () => {
  it("accept → offspring Reserved and breeder_inquiry_accepted", async () => {
    state.user = NIKOLA;
    const result = await decideRequest({ kind: "breeder_inquiry", id: INQ, decision: "accept" });
    expect(result).toMatchObject({ ok: true, data: { status: "accepted" } });
    expect(state.pets.zlatko.offspring_status).toBe("reserved");
    expect(state.emails[0]).toMatchObject({
      to: "ivana.petrovic@mojljubimac.test",
      template: {
        id: "breeder_inquiry_accepted",
        variables: { organisation: "Odgajivačnica Đorđević", pet: "Zlatko", org_phone: "—", org_email: "nikola@mojljubimac.test" },
      },
    });
  });

  it("reject → breeder_inquiry_rejected linking the breeder's page", async () => {
    state.user = NIKOLA;
    const result = await decideRequest({ kind: "breeder_inquiry", id: INQ, decision: "reject" });
    expect(result).toMatchObject({ ok: true, data: { status: "rejected" } });
    expect(state.emails[0]).toMatchObject({
      template: { id: "breeder_inquiry_rejected", variables: { url: `${SITE}/o/odgajivacnica-djordjevic` } },
    });
  });
});

describe("Design §9.1 — the four request emails render in both languages", () => {
  it("renders subject, body and button from lib/i18n", async () => {
    const { renderEmail } = await vi.importActual<typeof import("@/lib/integrations/resend")>("@/lib/integrations/resend");
    const accepted = renderEmail(
      { id: "adoption_request_accepted", variables: { organisation: "Azil Šapica", pet: "Žuća", org_phone: "021 555 111", org_email: "azil@sapica.rs" } },
      "sr",
    );
    expect(accepted.subject).toBe("Zahtev prihvaćen: Žuća");
    expect(accepted.text).toContain("Dobre vesti! Azil Šapica je prihvatio tvoj zahtev za udomljavanje (ljubimac: Žuća). Javi im se: 021 555 111, azil@sapica.rs.");
    const rejected = renderEmail(
      { id: "breeder_inquiry_rejected", variables: { organisation: "Odgajivačnica Đorđević", pet: "Zlatko", url: `${SITE}/o/x` } },
      "en",
    );
    expect(rejected.subject).toBe("Reply to your inquiry: Zlatko");
    expect(rejected.text).toContain(`View their page: ${SITE}/o/x`);
  });
});
