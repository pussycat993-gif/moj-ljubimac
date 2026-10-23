// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-45 — EP-55 (lib/actions/organisation.ts) over a fake server client: createIntake writes pet + intake +
// history through ONE database call (rpc:create_intake — a single transaction; the rows themselves are proven
// in supabase/tests/org_animals.test.sql), validates the Request with field codes first, and passes the
// database answers through (breeder → forbidden_role, pending organisation → organisation_pending_approval,
// DETAIL '<field>:<code>' → fields). The status change is a Data API pets update (the Step 09 trigger writes
// pet_status_history).

type Row = Record<string, unknown>;

const MILICA = "a1000000-0000-4000-8000-000000000004";
const ORG = "b2000000-0000-4000-8000-000000000001";
const PET = "c1000000-0000-4000-8000-000000000004";

const state = {
  approval: "approved" as "approved" | "pending",
  rpcCalls: [] as { name: string; args: Row }[],
  writes: [] as { table: string; op: string; payload: Row; filters: [string, unknown][] }[],
  rpcAnswer: null as null | { data: unknown; error: unknown },
  petRows: [{ id: PET, shelter_status: "intake", breeding_status: null, organisation_id: ORG }] as Row[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { createIntake, changeAnimalStatus } = await import("@/lib/actions/organisation");

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date());
}

const intake = {
  name: "  Lúna ",
  species: "cat",
  species_other: "",
  sex: "female" as const,
  breed: "",
  approx_age_text: "oko 2 godine",
  intake_on: "2026-10-20",
  arrival_type: "found" as const,
  place_found: "Liman 3, kod parka",
  note: "",
};

function query(table: string) {
  const filters: [string, unknown][] = [];
  let op = "select";
  let payload: Row = {};
  const run = async () => {
    if (table === "profiles") return { data: [{ id: MILICA, deletion_requested_at: null }], error: null };
    if (table === "organisation_memberships") {
      return { data: [{ organisation_id: ORG, organisations: { approval_status: state.approval } }], error: null };
    }
    state.writes.push({ table, op, payload, filters });
    if (table === "pets" && op === "update") {
      const hit = state.petRows.filter((r) => filters.every(([c, v]) => r[c] === v));
      for (const r of hit) Object.assign(r, payload);
      return { data: hit, error: null };
    }
    return { data: [], error: null };
  };
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push([column, value]), api),
    not: () => api,
    update: (value: Row) => ((op = "update"), (payload = value), api),
    maybeSingle: async () => {
      const r = await run();
      return { data: (r.data as Row[])[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: MILICA, email: "milica.stojanovic@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string, args: Row) => {
      state.rpcCalls.push({ name, args });
      if (name !== "create_intake") throw new Error(`unexpected rpc ${name}`);
      if (state.rpcAnswer) return state.rpcAnswer;
      return {
        data: {
          pet_id: "e2400000-0000-4000-8000-000000000001",
          organisation_id: ORG,
          name: args.p_name,
          species: args.p_species,
          species_other: args.p_species_other,
          sex: args.p_sex,
          breed: args.p_breed,
          approx_age_text: args.p_approx_age_text,
          shelter_status: "intake",
          intake_on: args.p_intake_on,
          arrival_type: args.p_arrival_type,
          place_found: args.p_place_found,
          note: args.p_note,
          created_by: MILICA,
          created_at: "2026-10-23T08:00:00Z",
        },
        error: null,
      };
    },
  };
}

beforeEach(() => {
  Object.assign(state, {
    approval: "approved",
    rpcCalls: [],
    writes: [],
    rpcAnswer: null,
    petRows: [{ id: PET, shelter_status: "intake", breeding_status: null, organisation_id: ORG }],
  });
});

describe("EP-55 createIntake", () => {
  it("FR-45: pet + intake + history in one transaction — a single rpc:create_intake call, no other writes", async () => {
    const result = await createIntake(intake);
    expect(result.ok && result.data).toMatchObject({
      name: "Lúna",
      shelter_status: "intake",
      intake_on: "2026-10-20",
      arrival_type: "found",
      created_by: MILICA,
    });
    expect(state.rpcCalls).toEqual([
      {
        name: "create_intake",
        args: {
          p_name: "Lúna",
          p_species: "cat",
          p_species_other: null,
          p_sex: "female",
          p_breed: null,
          p_approx_age_text: "oko 2 godine",
          p_intake_on: "2026-10-20",
          p_arrival_type: "found",
          p_place_found: "Liman 3, kod parka",
          p_note: null,
        },
      },
    ]);
    expect(state.writes).toHaveLength(0);
  });

  it("species other sends species_other", async () => {
    await createIntake({ ...intake, species: "other", species_other: "Tvor" });
    expect(state.rpcCalls[0].args).toMatchObject({ p_species: "other", p_species_other: "Tvor" });
  });

  it("Request checks with field codes, before any database call", async () => {
    const cases: [Partial<typeof intake> & Record<string, unknown>, Record<string, string>][] = [
      [{ name: " " }, { name: "required" }],
      [{ name: "x".repeat(81) }, { name: "too_long" }],
      [{ species: "dragon" }, { species: "invalid" }],
      [{ species: "other", species_other: "" }, { species_other: "required" }],
      [{ intake_on: "" }, { intake_on: "required" }],
      [{ intake_on: "2999-01-01" }, { intake_on: "in_future" }],
      [{ arrival_type: "stolen" as "found" }, { arrival_type: "invalid" }],
      [{ note: "x".repeat(2001) }, { note: "too_long" }],
    ];
    for (const [change, fields] of cases) {
      expect(await createIntake({ ...intake, ...change } as typeof intake)).toMatchObject({
        ok: false,
        error: { code: "validation_failed", fields },
      });
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("today is allowed (Belgrade calendar)", async () => {
    expect((await createIntake({ ...intake, intake_on: today() })).ok).toBe(true);
  });

  it("database answers pass through: breeder → forbidden_role; field DETAIL → fields", async () => {
    state.rpcAnswer = { data: null, error: { code: "P0001", message: "forbidden_role", details: null } };
    expect(await createIntake(intake)).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    state.rpcAnswer = { data: null, error: { code: "P0001", message: "validation_failed", details: "intake_on:in_future" } };
    expect(await createIntake(intake)).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { intake_on: "in_future" } },
    });
  });

  it("FR-42 #1: a member of a pending organisation → 403 organisation_pending_approval (gate 4)", async () => {
    state.approval = "pending";
    expect(await createIntake(intake)).toMatchObject({ ok: false, error: { code: "organisation_pending_approval" } });
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("EP-55 status change", () => {
  it("FR-45: a Data API pets update of shelter_status (the trigger records the history)", async () => {
    const result = await changeAnimalStatus({ pet_id: PET, shelter_status: "in_care" });
    expect(result).toEqual({ ok: true, data: { pet_id: PET, status_kind: "shelter", status: "in_care" } });
    expect(state.writes[0]).toMatchObject({ table: "pets", op: "update", payload: { shelter_status: "in_care" } });
  });

  it("an unknown status → validation_failed; another organisation's pet → not_found", async () => {
    expect(await changeAnimalStatus({ pet_id: PET, shelter_status: "lost" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { shelter_status: "invalid" } },
    });
    expect(
      await changeAnimalStatus({ pet_id: "c1000000-0000-4000-8000-0000000000ff", shelter_status: "in_care" }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
