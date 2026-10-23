import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-19 / BR-37 / BR-45 — EP-24 GET /api/public/moments/:slug (app/api/public/moments/[slug]/route.ts and
// lib/server/public-moments.ts) with a fake service-role client and a fake R2: a Visitor without a
// session gets exactly the PublicMoment fields — photos, text, pet name (and sex, date) — never health
// data, the owner or other moments; Cache-Control: no-store and X-Robots-Tag: noindex on every answer
// (TC ADR-18); 404 for an unknown, malformed or inactive slug.

type Row = Record<string, unknown>;

const SLUG = "Ab3dEf6hIj9kLm2nOp5qRs";

const state = {
  link: null as Row | null,
  selects: [] as string[],
  filters: [] as [string, unknown][],
  sessionUsed: false,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    state.sessionUsed = true;
    throw new Error("EP-24 must not need a session");
  },
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const builder = {
        select: (cols: string) => (state.selects.push(`${table}: ${cols}`), builder),
        eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
        maybeSingle: async () => {
          state.filters = filters;
          const link = state.link;
          const match = link && filters.every(([c, v]) => link[c] === v);
          return { data: match ? link : null, error: null };
        },
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/integrations/r2", () => ({
  r2: () => ({
    presignGet: async (key: string) => ({ url: `https://r2.test/get/${key}?sig=1`, expires_at: "2026-10-23T08:10:00.000Z" }),
  }),
}));

const { GET } = await import("@/app/api/public/moments/[slug]/route");

function linkRow(overrides: Row = {}): Row {
  return {
    slug: SLUG,
    active: true,
    moments: {
      moment_date: "2026-10-12",
      text: "Prvi put na Štrandu posle leta.",
      pets: { name: "Maks", sex: "male" },
      moment_photos: [
        { position: 2, r2_key: "u/o/pets/p/moments/m/2-b.jpg" },
        { position: 1, r2_key: "u/o/pets/p/moments/m/1-a.jpg" },
      ],
    },
    ...overrides,
  };
}

async function get(slug: string) {
  return GET(new Request(`https://mojljubimac.test/api/public/moments/${slug}`), { params: Promise.resolve({ slug }) });
}

beforeEach(() => {
  state.link = linkRow();
  state.selects = [];
  state.filters = [];
  state.sessionUsed = false;
});

describe("EP-24 Get public moment", () => {
  it("returns exactly the PublicMoment fields to a Visitor without a session (FR-19)", async () => {
    const response = await get(SLUG);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["moment_date", "pet_name", "pet_sex", "photos", "slug", "text"]);
    expect(body).toEqual({
      slug: SLUG,
      pet_name: "Maks",
      pet_sex: "male",
      moment_date: "2026-10-12",
      text: "Prvi put na Štrandu posle leta.",
      photos: [
        { position: 1, url: "https://r2.test/get/u/o/pets/p/moments/m/1-a.jpg?sig=1", expires_at: "2026-10-23T08:10:00.000Z" },
        { position: 2, url: "https://r2.test/get/u/o/pets/p/moments/m/2-b.jpg?sig=1", expires_at: "2026-10-23T08:10:00.000Z" },
      ],
    });
    expect(state.sessionUsed).toBe(false);
  });

  it("reads only the public fields with the service role — no health data, owner or other moments (BR-37, BR-45)", async () => {
    await get(SLUG);
    expect(state.selects).toEqual([
      "moment_public_links: slug, active, moments(moment_date, text, pets(name, sex), moment_photos(position, r2_key))",
    ]);
    expect(state.filters).toEqual([
      ["slug", SLUG],
      ["active", true],
    ]);
    const body = JSON.stringify(await (await get(SLUG)).json());
    for (const hidden of ["r2_key", "owner", "vaccin", "weight", "microchip", "created_by"]) expect(body).not.toContain(hidden);
  });

  it("is never cached and never indexed (TC ADR-18): Cache-Control: no-store, X-Robots-Tag: noindex", async () => {
    const ok = await get(SLUG);
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    expect(ok.headers.get("X-Robots-Tag")).toBe("noindex");
    const missing = await get("zzzzzzzzzzzzzzzzzzzzzz");
    expect(missing.headers.get("Cache-Control")).toBe("no-store");
    expect(missing.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("answers 404 not_found for an unknown slug, an inactive link and a malformed slug (E-07)", async () => {
    const unknown = await get("zzzzzzzzzzzzzzzzzzzzzz");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: "not_found" });

    state.link = linkRow({ active: false });
    expect((await get(SLUG)).status).toBe(404);

    state.link = linkRow();
    state.selects = [];
    for (const bad of ["short", `${SLUG}x`, "Ab3dEf6hIj9kLm2nOp5qR-"]) expect((await get(bad)).status).toBe(404);
    expect(state.selects).toEqual([]);
  });

  it("answers 404 when the moment behind the link is gone", async () => {
    state.link = linkRow({ moments: null });
    expect((await get(SLUG)).status).toBe(404);
  });

  it("returns an empty photos array for a text-only moment", async () => {
    state.link = linkRow({ moments: { moment_date: "2026-10-12", text: "Samo tekst", pets: { name: "Luna", sex: "female" }, moment_photos: [] } });
    expect(await (await get(SLUG)).json()).toMatchObject({ pet_name: "Luna", photos: [] });
  });
});
