// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-48 — EP-61 (lib/actions/litters.ts) over a fake server client: createLitter validates the Request with field
// codes, then makes ONE database call (rpc:create_litter — the litter, its offspring pets rows and their history rows
// in a single transaction; the rows themselves are proven in supabase/tests/litters.test.sql) and returns the Litter
// from rpc:list_litters: 3 offspring with litter_id, the mother's species / breed, birth_date = born_on, available.
// Both father fields or a non-female mother → 422 validation_failed. updateOffspring is a Data API pets update of
// offspring_status / price_minor restricted to offspring (litter_id is not null); E-21 passes through.

type Row = Record<string, unknown>;

const NIKOLA = "a1000000-0000-4000-8000-000000000005";
const ORG = "b2000000-0000-4000-8000-000000000002";
const BELA = "f9260000-0000-4000-8000-000000000001";
const ARES = "f9260000-0000-4000-8000-000000000002";
const LITTER = "e2600000-0000-4000-8000-000000000001";

type Pet = Row & { id: string };

const state = {
  rpcCalls: [] as { name: string; args: Row }[],
  writes: [] as { table: string; payload: Row; filters: [string, unknown][]; nots: [string, string, unknown][] }[],
  createError: null as null | { code: string; message: string; details?: string },
  updateError: null as null | { code: string; message: string },
  litters: [] as Row[],
  pets: [] as Pet[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { createLitter, updateOffspring } = await import("@/lib/actions/litters");

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date());
}

/** The fake database: create_litter writes the rows the migration writes; list_litters reads them back. */
function createLitterRows(args: Row) {
  const mother = state.pets.find((p) => p.id === args.p_mother_id);
  if (!mother || mother.sex !== "female") {
    return { data: null, error: { code: "P0001", message: "validation_failed", details: "mother_id:invalid" } };
  }
  state.litters.push({
    id: LITTER,
    organisation_id: ORG,
    mother_id: mother.id,
    father_id: args.p_father_id,
    father_name: args.p_father_name,
    born_on: args.p_born_on,
    offspring_count: args.p_offspring_count,
  });
  for (let i = 1; i <= Number(args.p_offspring_count); i++) {
    state.pets.push({
      id: `e2600000-0000-4000-8000-00000000010${i}`,
      organisation_id: ORG,
      litter_id: LITTER,
      name: `Mladunče ${i}`,
      species: mother.species,
      breed: mother.breed,
      sex: "unknown",
      birth_date: args.p_born_on,
      offspring_status: "available",
      price_minor: null,
      history: ["available"],
    });
  }
  return { data: LITTER, error: null };
}

function listLitters() {
  return {
    data: {
      items: state.litters.map((l) => {
        const mother = state.pets.find((p) => p.id === l.mother_id)!;
        const offspring = state.pets.filter((p) => p.litter_id === l.id);
        return {
          id: l.id,
          mother: { pet_id: mother.id, name: mother.name },
          breed: mother.breed,
          father_id: l.father_id,
          father_name: l.father_name,
          father_external: l.father_name !== null,
          born_on: l.born_on,
          offspring_count: l.offspring_count,
          available_count: offspring.filter((p) => p.offspring_status === "available").length,
          offspring: offspring.map((p) => ({
            pet_id: p.id,
            name: p.name,
            sex: p.sex,
            offspring_status: p.offspring_status,
            price: p.price_minor === null ? null : { amount_minor: p.price_minor, currency: "RSD" },
          })),
        };
      }),
      eligible_mothers: [{ pet_id: BELA, name: "Bela" }],
      eligible_fathers: [{ pet_id: ARES, name: "Ares" }],
      access: { role: "org_admin", can_edit: true, can_delete: true },
    },
    error: null,
  };
}

function query(table: string) {
  const filters: [string, unknown][] = [];
  const nots: [string, string, unknown][] = [];
  let payload: Row | null = null;
  const run = async () => {
    if (table === "profiles") return { data: [{ id: NIKOLA, deletion_requested_at: null }], error: null };
    if (table === "organisation_memberships") {
      return { data: [{ organisation_id: ORG, organisations: { approval_status: "approved" } }], error: null };
    }
    if (table === "pets" && payload) {
      state.writes.push({ table, payload, filters, nots });
      if (state.updateError) return { data: null, error: state.updateError };
      const hit = state.pets.filter(
        (p) => filters.every(([c, v]) => p[c] === v) && nots.every(([c]) => p[c] !== null && p[c] !== undefined),
      );
      for (const p of hit) {
        if ("offspring_status" in payload && payload.offspring_status !== p.offspring_status) {
          (p.history as string[]).push(String(payload.offspring_status));
        }
        Object.assign(p, payload);
      }
      return { data: hit, error: null };
    }
    return { data: [], error: null };
  };
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push([column, value]), api),
    not: (column: string, op: string, value: unknown) => (nots.push([column, op, value]), api),
    update: (value: Row) => ((payload = value), api),
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
        data: { user: { id: NIKOLA, email: "nikola.djordjevic@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string, args: Row = {}) => {
      state.rpcCalls.push({ name, args });
      if (name === "create_litter") return state.createError ? { data: null, error: state.createError } : createLitterRows(args);
      if (name === "list_litters") return listLitters();
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

beforeEach(() => {
  state.rpcCalls = [];
  state.writes = [];
  state.createError = null;
  state.updateError = null;
  state.litters = [];
  state.pets = [
    { id: BELA, organisation_id: ORG, litter_id: null, name: "Bela", species: "dog", breed: "Zlatni retriver", sex: "female" },
    { id: ARES, organisation_id: ORG, litter_id: null, name: "Ares", species: "dog", breed: "Zlatni retriver", sex: "male" },
  ];
});

describe("EP-61 createLitter (FR-48)", () => {
  it("creates the litter and 3 offspring linked to it in one database call, and returns the Litter", async () => {
    const result = await createLitter({ mother_id: BELA, father_name: " Rex ", born_on: "2026-08-15", offspring_count: 3 });

    expect(state.rpcCalls.filter((c) => c.name === "create_litter")).toEqual([
      {
        name: "create_litter",
        args: { p_mother_id: BELA, p_father_id: null, p_father_name: "Rex", p_born_on: "2026-08-15", p_offspring_count: 3 },
      },
    ]);
    expect(state.writes).toEqual([]);

    const offspring = state.pets.filter((p) => p.litter_id === LITTER);
    expect(offspring).toHaveLength(3);
    for (const pet of offspring) {
      expect(pet).toMatchObject({
        litter_id: LITTER,
        species: "dog",
        breed: "Zlatni retriver",
        birth_date: "2026-08-15",
        offspring_status: "available",
        history: ["available"],
      });
    }

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      id: LITTER,
      mother: { pet_id: BELA, name: "Bela" },
      breed: "Zlatni retriver",
      father_name: "Rex",
      father_external: true,
      born_on: "2026-08-15",
      offspring_count: 3,
      available_count: 3,
    });
    expect(result.data.offspring.map((o) => [o.name, o.offspring_status, o.price])).toEqual([
      ["Mladunče 1", "available", null],
      ["Mladunče 2", "available", null],
      ["Mladunče 3", "available", null],
    ]);
  });

  it("both father fields set → 422 validation_failed, nothing is written", async () => {
    const result = await createLitter({
      mother_id: BELA,
      father_id: ARES,
      father_name: "Rex",
      born_on: "2026-08-15",
      offspring_count: 3,
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "validation_failed", message: "validation_failed", fields: { father_id: "invalid" } },
    });
    expect(state.rpcCalls).toEqual([]);
  });

  it("a non-female mother → 422 validation_failed (fields.mother_id) from the database", async () => {
    const result = await createLitter({ mother_id: ARES, born_on: "2026-08-15", offspring_count: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("validation_failed");
    expect(result.error.fields).toEqual({ mother_id: "invalid" });
    expect(state.litters).toEqual([]);
  });

  it("checks the Request first: count 1–20, born_on not in the future, mother required", async () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const result = await createLitter({ mother_id: "", born_on: tomorrow, offspring_count: 21 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fields).toEqual({ mother_id: "required", born_on: "invalid", offspring_count: "out_of_range" });
    expect(state.rpcCalls).toEqual([]);

    const zero = await createLitter({ mother_id: BELA, born_on: today(), offspring_count: 0 });
    expect(!zero.ok && zero.error.fields).toEqual({ offspring_count: "out_of_range" });
  });

  it("passes the database's E-21 and role answers through", async () => {
    state.createError = { code: "P0001", message: "breeder_plan_required" };
    const plan = await createLitter({ mother_id: BELA, born_on: today(), offspring_count: 1 });
    expect(!plan.ok && plan.error.code).toBe("breeder_plan_required");

    state.createError = { code: "P0001", message: "forbidden_role" };
    const shelter = await createLitter({ mother_id: BELA, born_on: today(), offspring_count: 1 });
    expect(!shelter.ok && shelter.error.code).toBe("forbidden_role");
  });
});

describe("EP-61 updateOffspring", () => {
  beforeEach(async () => {
    await createLitter({ mother_id: BELA, born_on: "2026-08-15", offspring_count: 2 });
    state.writes = [];
  });

  it("changes status and price of an offspring only (litter_id is not null) and returns the offspring row", async () => {
    const pet = state.pets.find((p) => p.name === "Mladunče 1")!;
    const result = await updateOffspring({
      pet_id: pet.id,
      offspring_status: "reserved",
      price: { amount_minor: 12_000_000, currency: "RSD" },
    });
    expect(state.writes).toEqual([
      {
        table: "pets",
        payload: { offspring_status: "reserved", price_minor: 12_000_000 },
        filters: [["id", pet.id]],
        nots: [["litter_id", "is", null]],
      },
    ]);
    expect(result).toEqual({
      ok: true,
      data: {
        pet_id: pet.id,
        name: "Mladunče 1",
        sex: "unknown",
        offspring_status: "reserved",
        price: { amount_minor: 12_000_000, currency: "RSD" },
      },
    });
    expect(pet.history).toEqual(["available", "reserved"]);
  });

  it("null clears the price; a negative price or another currency → 422", async () => {
    const pet = state.pets.find((p) => p.name === "Mladunče 2")!;
    const cleared = await updateOffspring({ pet_id: pet.id, price: null });
    expect(cleared.ok && cleared.data.price).toBeNull();
    expect(state.writes[0].payload).toEqual({ price_minor: null });

    const negative = await updateOffspring({ pet_id: pet.id, price: { amount_minor: -1, currency: "RSD" } });
    expect(!negative.ok && negative.error.fields).toEqual({ price: "out_of_range" });
    const euro = await updateOffspring({ pet_id: pet.id, price: { amount_minor: 100, currency: "EUR" as "RSD" } });
    expect(!euro.ok && euro.error.fields).toEqual({ price: "invalid" });
  });

  it("a breeding animal (no litter) → not_found; no plan → breeder_plan_required", async () => {
    const mother = await updateOffspring({ pet_id: BELA, offspring_status: "sold" });
    expect(!mother.ok && mother.error.code).toBe("not_found");

    state.updateError = { code: "P0001", message: "breeder_plan_required" };
    const pet = state.pets.find((p) => p.name === "Mladunče 1")!;
    const noPlan = await updateOffspring({ pet_id: pet.id, offspring_status: "sold" });
    expect(!noPlan.ok && noPlan.error.code).toBe("breeder_plan_required");
  });
});
