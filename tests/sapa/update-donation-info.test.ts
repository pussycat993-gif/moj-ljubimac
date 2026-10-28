// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-88 updateDonationInfo (lib/actions/organisation.ts) over a fake server client that models
// rpc:get_my_organisation (Organisation.donation from the four organisations donation columns) and the Data API
// organisations update. FR-72 #1 the Shelter Admin saves → organisations update of donation_bank_account /
// donation_url / dropoff_address / dropoff_hours and DonationInfo back; FR-72 #2 Volunteer and breeder →
// forbidden_role; FR-72 #3 non-https link → fields.payment_url "invalid", bad account → fields.bank_account
// "invalid"; no organisation → not_found. The database side is proven in supabase/tests/sapa_profile_donation.test.sql.

type Row = Record<string, unknown>;

const USER = "a1000000-0000-4000-8000-000000000004";
const ORG = "b2000000-0000-4000-8000-000000000001";

const state = {
  hasOrganisation: true,
  type: "shelter" as "shelter" | "breeder",
  role: "org_admin" as "org_admin" | "volunteer",
  approval: "approved" as "approved" | "pending",
  columns: {
    donation_bank_account: null as string | null,
    donation_url: null as string | null,
    dropoff_address: null as string | null,
    dropoff_hours: null as string | null,
  },
  updates: [] as { table: string; payload: Row; filters: [string, unknown][] }[],
};

vi.mock("@/lib/integrations/r2", () => ({
  r2: () => {
    throw new Error("r2 not configured in tests");
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { updateDonationInfo } = await import("@/lib/actions/organisation");

function myOrganisation() {
  const c = state.columns;
  const donation =
    state.type === "shelter"
      ? {
          organisation_id: ORG,
          organisation_name: "Azil Šapica",
          city: null,
          bank_account: c.donation_bank_account,
          payment_url: c.donation_url,
          dropoff_address: c.dropoff_address,
          dropoff_hours: c.dropoff_hours,
          payment_purpose: null,
          has_any: Object.values(c).some((v) => v !== null),
        }
      : null;
  return {
    organisation: {
      id: ORG,
      type: state.type,
      name: "Azil Šapica",
      slug: "azil-sapica",
      public_path: "/o/azil-sapica",
      city: null,
      approval_status: state.approval,
      logo_r2_key: null,
      donation,
    },
    team: [],
    pending_invitations: [],
    breeder_plan_active: true,
    access: { role: state.role, can_edit: state.role === "org_admin", can_delete: state.role === "org_admin" },
  };
}

function query(table: string) {
  const filters: [string, unknown][] = [];
  let op: "select" | "update" = "select";
  let payload: Row = {};
  const run = async () => {
    if (table === "profiles") return { data: [{ id: USER, deletion_requested_at: null }], error: null };
    if (table === "organisation_memberships") {
      return {
        data: state.hasOrganisation ? [{ organisation_id: ORG, organisations: { approval_status: state.approval } }] : [],
        error: null,
      };
    }
    if (table === "organisations" && op === "update") {
      state.updates.push({ table, payload, filters: [...filters] });
      if (typeof payload.donation_url === "string" && !payload.donation_url.startsWith("https://")) {
        return { data: null, error: { code: "23514", message: "organisations_donation_url_check" } };
      }
      Object.assign(state.columns, payload);
      return { data: [{ id: ORG }], error: null };
    }
    return { data: [], error: null };
  };
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push([column, value]), api),
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
        data: { user: { id: USER, email: "milica@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string) => {
      if (name !== "get_my_organisation") return { data: null, error: { code: "P0001", message: "internal_error" } };
      if (!state.hasOrganisation) return { data: null, error: { code: "P0001", message: "not_found" } };
      return { data: myOrganisation(), error: null };
    },
  };
}

beforeEach(() => {
  state.hasOrganisation = true;
  state.type = "shelter";
  state.role = "org_admin";
  state.approval = "approved";
  state.columns = { donation_bank_account: null, donation_url: null, dropoff_address: null, dropoff_hours: null };
  state.updates = [];
});

describe("EP-88 updateDonationInfo — Shelter Admin (FR-72 #1)", () => {
  it("updates the four donation columns of the caller's organisation and returns DonationInfo", async () => {
    const result = await updateDonationInfo({
      bank_account: " 160-0000012345678-90 ",
      payment_url: "https://azilsapica.rs/doniraj",
      dropoff_address: "Temerinski put 120, Novi Sad",
      dropoff_hours: "Subota 10:00 – 14:00",
    });
    expect(state.updates).toEqual([
      {
        table: "organisations",
        payload: {
          donation_bank_account: "160-0000012345678-90",
          donation_url: "https://azilsapica.rs/doniraj",
          dropoff_address: "Temerinski put 120, Novi Sad",
          dropoff_hours: "Subota 10:00 – 14:00",
        },
        filters: [["id", ORG]],
      },
    ]);
    expect(result).toEqual({
      ok: true,
      data: {
        organisation_id: ORG,
        organisation_name: "Azil Šapica",
        city: null,
        bank_account: "160-0000012345678-90",
        payment_url: "https://azilsapica.rs/doniraj",
        dropoff_address: "Temerinski put 120, Novi Sad",
        dropoff_hours: "Subota 10:00 – 14:00",
        payment_purpose: null,
        has_any: true,
      },
    });
  });

  it("only the fields sent change; null (or an empty string) clears a field", async () => {
    state.columns = {
      donation_bank_account: "160-0000012345678-90",
      donation_url: "https://azilsapica.rs/doniraj",
      dropoff_address: "Temerinski put 120",
      dropoff_hours: "Subota",
    };
    const result = await updateDonationInfo({ payment_url: null, dropoff_hours: "" });
    expect(state.updates[0].payload).toEqual({ donation_url: null, dropoff_hours: null });
    expect(result.ok && result.data.bank_account).toBe("160-0000012345678-90");
    expect(result.ok && result.data.payment_url).toBeNull();
    expect(result.ok && result.data.dropoff_hours).toBeNull();
  });
});

describe("EP-88 roles (FR-72 #2)", () => {
  it("a Volunteer → forbidden_role, nothing written", async () => {
    state.role = "volunteer";
    const result = await updateDonationInfo({ dropoff_hours: "Subota" });
    expect(result).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(state.updates).toEqual([]);
  });

  it("a breeder organisation → forbidden_role, nothing written", async () => {
    state.type = "breeder";
    const result = await updateDonationInfo({ bank_account: "160-0000012345678-90" });
    expect(result).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(state.updates).toEqual([]);
  });

  it("no organisation → not_found", async () => {
    state.hasOrganisation = false;
    const result = await updateDonationInfo({ dropoff_hours: "Subota" });
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(state.updates).toEqual([]);
  });

  it("a pending shelter → organisation_pending_approval (gate 4)", async () => {
    state.approval = "pending";
    const result = await updateDonationInfo({ dropoff_hours: "Subota" });
    expect(result).toMatchObject({ ok: false, error: { code: "organisation_pending_approval" } });
    expect(state.updates).toEqual([]);
  });
});

describe("EP-88 validation (FR-72 #3)", () => {
  it.each(["http://azilsapica.rs/doniraj", "azilsapica.rs", "https://", `https://azilsapica.rs/${"a".repeat(500)}`])(
    "payment_url %s → fields.payment_url = invalid",
    async (payment_url) => {
      const result = await updateDonationInfo({ payment_url });
      expect(result).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { payment_url: "invalid" } } });
      expect(state.updates).toEqual([]);
    },
  );

  it.each(["160-123", "1600000012345678", "16-0000012345678-90", "160-00000123456789-90", "160-ABC-90"])(
    "bank_account %s → fields.bank_account = invalid",
    async (bank_account) => {
      const result = await updateDonationInfo({ bank_account });
      expect(result).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { bank_account: "invalid" } } });
      expect(state.updates).toEqual([]);
    },
  );

  it("drop-off address and hours over 200 characters → too_long", async () => {
    const result = await updateDonationInfo({ dropoff_address: "a".repeat(201), dropoff_hours: "b".repeat(201) });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { dropoff_address: "too_long", dropoff_hours: "too_long" } },
    });
  });
});
