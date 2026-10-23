// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-46, FR-49 #1, E-21, TC ADR-18 — EP-62 GET /api/public/orgs/:slug (app/api/public/orgs/[slug]/route.ts and
// lib/server/public-org-page.ts) with a fake service-role client standing in for rpc:get_public_org_page and a fake
// R2. A Visitor without a session gets an approved organisation's available animals with exactly the PublicAnimal
// fields — never a health-record field or an R2 key — and photo / logo URLs presigned when the response is built;
// pending / rejected organisations and breeders without an active plan → 404; Cache-Control: no-store on every
// answer; a profile change saved through EP-72 shows on the next request (FR-60 #1). The database side of the filter
// is proven in supabase/tests/public_org_page.test.sql.

type Row = Record<string, unknown>;

type FakeOrg = {
  slug: string;
  type: "shelter" | "breeder";
  name: string;
  approval_status: "pending" | "approved" | "rejected";
  plan_active: boolean;
  description: string | null;
  logo_r2_key: string | null;
};

type FakePet = Row & { pet_id: string; status: string; photo_r2_key: string | null; price_minor: number | null };

const state = {
  orgs: [] as FakeOrg[],
  pets: {} as Record<string, FakePet[]>,
  rpcCalls: [] as { name: string; args: Row }[],
  failWith: null as null | { code: string; message: string },
  sessionUsed: false,
};

/** Health-record and internal columns the fake rows carry, which must never reach the response. */
const PRIVATE = {
  microchip_number: "688038000123456",
  passport_number: "RS-NS-0451-23",
  note: "Interna napomena",
  vet_name: "Dr Vet",
  owner_id: null,
  organisation_id: "b2000000-0000-4000-8000-000000000001",
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    state.sessionUsed = true;
    throw new Error("EP-62 must not need a session");
  },
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (name: string, args: Row) => {
      state.rpcCalls.push({ name, args });
      if (state.failWith) return { data: null, error: state.failWith };
      if (name !== "get_public_org_page") throw new Error(`unexpected rpc ${name}`);
      return getPublicOrgPage(args);
    },
  }),
}));
vi.mock("@/lib/integrations/r2", () => ({
  r2: () => ({
    presignGet: async (key: string) => ({ url: `https://r2.test/get/${key}?sig=1`, expires_at: "2026-10-23T08:10:00.000Z" }),
  }),
}));

const { GET } = await import("@/app/api/public/orgs/[slug]/route");

/** The fake of rpc:get_public_org_page for the service role (the R2 keys are included for presigning). */
function getPublicOrgPage(args: Row) {
  const o = state.orgs.find((org) => org.slug === args.p_slug);
  if (!o || o.approval_status !== "approved" || (o.type === "breeder" && !o.plan_active)) {
    return { data: null, error: { code: "P0001", message: "not_found" } };
  }
  const listed = (state.pets[o.slug] ?? []).filter((p) => p.status === "available");
  const page = listed.slice(Number(args.p_offset), Number(args.p_offset) + Number(args.p_limit));
  return {
    data: {
      organisation: {
        name: o.name,
        type: o.type,
        slug: o.slug,
        initials: "AŠ",
        city: { id: "c1", name_sr: "Bečej", name_en: "Bečej", latitude: 45.6, longitude: 20.0 },
        description: o.description,
        phone: "+381 21 400 500",
        email: "kontakt@azilsapica.rs",
        website: "https://azilsapica.rs",
        logo_url: null,
        logo_r2_key: o.logo_r2_key,
      },
      animals: page.map((p) => ({
        pet_id: p.pet_id,
        name: p.name,
        species: p.species,
        species_other: null,
        breed: p.breed ?? null,
        sex: p.sex,
        approx_age_text: p.approx_age_text ?? null,
        birth_date: null,
        birth_year: null,
        public_description: p.public_description ?? null,
        neutered: p.neutered,
        vaccinated: p.vaccinated,
        price: o.type === "breeder" && p.price_minor !== null ? { amount_minor: p.price_minor, currency: "RSD" } : null,
        photo_url: null,
        photo_r2_key: p.photo_r2_key,
      })),
      total: listed.length,
    },
    error: null,
  };
}

async function get(slug: string, query = "") {
  return GET(new Request(`https://mojljubimac.test/api/public/orgs/${slug}${query}`), {
    params: Promise.resolve({ slug }),
  });
}

const PUBLIC_ANIMAL_KEYS = [
  "approx_age_text",
  "birth_date",
  "birth_year",
  "breed",
  "name",
  "neutered",
  "pet_id",
  "photo_url",
  "price",
  "public_description",
  "sex",
  "species",
  "species_other",
  "vaccinated",
];

beforeEach(() => {
  state.rpcCalls = [];
  state.failWith = null;
  state.sessionUsed = false;
  state.orgs = [
    {
      slug: "azil-sapica",
      type: "shelter",
      name: "Azil Šapica",
      approval_status: "approved",
      plan_active: false,
      description: "Brinemo o napuštenim psima i mačkama.",
      logo_r2_key: "o/b2/logo-1.png",
    },
    {
      slug: "zlatna-sapa",
      type: "breeder",
      name: "Odgajivačnica „Zlatna šapa“",
      approval_status: "approved",
      plan_active: true,
      description: null,
      logo_r2_key: null,
    },
  ];
  state.pets = {
    "azil-sapica": [
      {
        ...PRIVATE,
        pet_id: "c1000000-0000-4000-8000-000000000004",
        name: "Žuća",
        species: "dog",
        breed: "Mešanac",
        sex: "female",
        approx_age_text: "oko 6 meseci",
        public_description: "Mazna i mirna.",
        neutered: "yes",
        vaccinated: true,
        status: "available",
        photo_r2_key: "o/b2/pets/zuca.jpg",
        price_minor: null,
      },
      {
        ...PRIVATE,
        pet_id: "c1000000-0000-4000-8000-000000000005",
        name: "Garfild",
        species: "cat",
        sex: "male",
        neutered: "no",
        vaccinated: false,
        status: "in_care",
        photo_r2_key: null,
        price_minor: null,
      },
    ],
    "zlatna-sapa": [
      {
        ...PRIVATE,
        pet_id: "f9260000-0000-4000-8000-000000000011",
        name: "Zlatko",
        species: "dog",
        breed: "Zlatni retriver",
        sex: "male",
        neutered: "no",
        vaccinated: true,
        status: "available",
        photo_r2_key: null,
        price_minor: 12_000_000,
      },
      {
        ...PRIVATE,
        pet_id: "f9260000-0000-4000-8000-000000000012",
        name: "Mila",
        species: "dog",
        sex: "female",
        neutered: "no",
        vaccinated: true,
        status: "reserved",
        photo_r2_key: null,
        price_minor: 13_000_000,
      },
    ],
  };
});

describe("EP-62 Public organisation page", () => {
  it("FR-46: an approved shelter → only available animals with exactly the PublicAnimal fields", async () => {
    const response = await get("azil-sapica");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { organisation: Row; animals: Row[]; total: number };
    expect(Object.keys(body).sort()).toEqual(["animals", "organisation", "total"]);
    expect(body.total).toBe(1);
    expect(body.animals.map((a) => a.name)).toEqual(["Žuća"]);
    expect(Object.keys(body.animals[0]).sort()).toEqual(PUBLIC_ANIMAL_KEYS);
    expect(body.animals[0]).toMatchObject({
      name: "Žuća",
      species: "dog",
      sex: "female",
      approx_age_text: "oko 6 meseci",
      public_description: "Mazna i mirna.",
      neutered: "yes",
      vaccinated: true,
      price: null,
      photo_url: {
        kind: "pet_photo",
        id: "c1000000-0000-4000-8000-000000000004",
        url: "https://r2.test/get/o/b2/pets/zuca.jpg?sig=1",
        expires_at: "2026-10-23T08:10:00.000Z",
        mime_type: null,
      },
    });
    expect(Object.keys(body.organisation).sort()).toEqual([
      "city",
      "description",
      "email",
      "initials",
      "logo_url",
      "name",
      "phone",
      "slug",
      "type",
      "website",
    ]);
    expect(body.organisation.logo_url).toMatchObject({ url: "https://r2.test/get/o/b2/logo-1.png?sig=1" });
    expect(state.sessionUsed).toBe(false);
  });

  it("BR-37: no health-record field and no R2 key in the response", async () => {
    const text = JSON.stringify(await (await get("azil-sapica")).json());
    for (const hidden of ["r2_key", "microchip", "passport", "Interna napomena", "vet_name", "owner_id", "organisation_id", "weight", "vaccinations"]) {
      expect(text).not.toContain(hidden);
    }
  });

  it("TC ADR-18: every answer carries Cache-Control: no-store", async () => {
    expect((await get("azil-sapica")).headers.get("Cache-Control")).toBe("no-store");
    expect((await get("nepoznato")).headers.get("Cache-Control")).toBe("no-store");
    expect((await get("azil-sapica", "?limit=99")).headers.get("Cache-Control")).toBe("no-store");
    state.failWith = { code: "XX000", message: "boom" };
    const failed = await get("azil-sapica");
    expect(failed.status).toBe(500);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
  });

  it("pending and rejected organisations and unknown slugs → 404 not_found", async () => {
    state.orgs[0].approval_status = "pending";
    const pending = await get("azil-sapica");
    expect(pending.status).toBe(404);
    expect(((await pending.json()) as Row).code).toBe("not_found");
    state.orgs[0].approval_status = "rejected";
    expect((await get("azil-sapica")).status).toBe(404);
    expect((await get("nepoznato")).status).toBe(404);
    expect((await get("Not A Slug!")).status).toBe(404);
  });

  it("FR-60 #1: a profile change saved through EP-72 shows on the next request (nothing is cached)", async () => {
    const before = (await (await get("azil-sapica")).json()) as { organisation: Row };
    expect(before.organisation.description).toBe("Brinemo o napuštenim psima i mačkama.");
    state.orgs[0].description = "Novi opis azila.";
    const after = (await (await get("azil-sapica")).json()) as { organisation: Row };
    expect(after.organisation.description).toBe("Novi opis azila.");
    expect(state.rpcCalls).toHaveLength(2);
  });

  it("FR-49 #1: a breeder with an active plan lists available offspring with the price as Money", async () => {
    const response = await get("zlatna-sapa");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { animals: Row[] };
    expect(body.animals.map((a) => [a.name, a.price])).toEqual([["Zlatko", { amount_minor: 12_000_000, currency: "RSD" }]]);
  });

  it("E-21: a breeder without an active plan → 404", async () => {
    state.orgs[1].plan_active = false;
    expect((await get("zlatna-sapa")).status).toBe(404);
  });

  it("paging: limit default 20 / max 50, offset ≥ 0; bad paging → 422 validation_failed", async () => {
    await get("azil-sapica");
    await get("azil-sapica", "?limit=5&offset=10");
    expect(state.rpcCalls.map((c) => c.args)).toEqual([
      { p_slug: "azil-sapica", p_limit: 20, p_offset: 0 },
      { p_slug: "azil-sapica", p_limit: 5, p_offset: 10 },
    ]);
    for (const query of ["?limit=51", "?limit=0", "?limit=abc", "?offset=-1"]) {
      const response = await get("azil-sapica", query);
      expect(response.status).toBe(422);
      expect(((await response.json()) as Row).code).toBe("validation_failed");
    }
  });
});
