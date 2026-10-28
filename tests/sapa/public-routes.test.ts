// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-61 #1 / #2 (route side), FR-62 #1, FR-67 #2, TC ADR-18 — the public Šapa pomoći routes EP-73
// GET /api/public/listings, EP-74 GET /api/public/listings/:id and EP-79 GET /api/public/users/:id with a fake
// session client standing in for rpc:list_listings / rpc:get_listing / rpc:get_public_profile (the SQL side —
// visibility, blocks, ordering — is proven in supabase/tests/sapa_listings_api.test.sql) and a fake R2: filters
// reach the rpc, bad query values → 422, photos are presigned and R2 keys stripped, no email or phone anywhere,
// Cache-Control: no-store on every answer and no X-Robots-Tag.

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };

const AUTHOR = "a1000000-0000-4000-8000-000000000001";
const CITY = "d1000000-0000-4000-8000-000000000001";
const LISTING = "e1000000-0000-4000-8000-000000000001";
const LISTING_2 = "e1000000-0000-4000-8000-000000000002";
const PHOTO = "f1000000-0000-4000-8000-000000000001";

const state = {
  rpcCalls: [] as { name: string; args: Row }[],
  fail: null as DbError | null,
  throws: false,
  presignFails: false,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: Row) => {
      state.rpcCalls.push({ name, args });
      if (state.throws) throw new Error("connection reset");
      if (state.fail) return { data: null, error: state.fail };
      if (name === "list_listings") return { data: { items: [summary(LISTING, "cover.jpg"), summary(LISTING_2, null)], total: 2 }, error: null };
      if (name === "get_listing") {
        return args.p_listing_id === LISTING ? { data: listing(), error: null } : { data: null, error: { code: "P0001", message: "not_found" } };
      }
      if (name === "get_public_profile") {
        return args.p_user_id === AUTHOR ? { data: profile(), error: null } : { data: null, error: { code: "P0001", message: "not_found" } };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  }),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    throw new Error("public Šapa routes use the caller's own session, never the service role");
  },
}));
vi.mock("@/lib/integrations/r2", () => ({
  r2: () => ({
    presignGet: async (key: string) => {
      if (state.presignFails) throw new Error("R2 down");
      return { url: `https://r2.test/get/${key}?sig=1`, expires_at: "2026-10-29T08:10:00.000Z" };
    },
  }),
}));

const listRoute = await import("@/app/api/public/listings/route");
const detailRoute = await import("@/app/api/public/listings/[id]/route");
const userRoute = await import("@/app/api/public/users/[id]/route");

const city = { id: CITY, name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.25, longitude: 19.84 };

/** private.listing_summary_json — with the internal cover_photo_r2_key the route must sign and drop. */
function summary(id: string, cover: string | null) {
  return {
    id,
    type: "selling",
    title: "Transporter",
    category: "carriers",
    species: "cat",
    city,
    price: { amount_minor: 250_000, currency: "RSD" },
    price_negotiable: false,
    published_at: "2026-10-20T08:00:00Z",
    photo_count: cover ? 1 : 0,
    cover_photo: null,
    cover_photo_r2_key: cover ? `u/${AUTHOR}/listings/${id}/0f000000-0000-4000-8000-000000000001-${cover}` : null,
    author: { kind: "user", display_name: "Ivana P." },
  };
}

/** public.get_listing — photos carry the internal r2_key. */
function listing() {
  return {
    id: LISTING,
    type: "selling",
    title: "Transporter",
    description: "Malo korišćen.",
    category: "carriers",
    species: "cat",
    city,
    price: { amount_minor: 250_000, currency: "RSD" },
    price_negotiable: false,
    status: "active",
    resolved_outcome: null,
    resolved_at: null,
    published_at: "2026-10-20T08:00:00Z",
    expires_at: "2026-11-19T08:00:00Z",
    days_left: 21,
    photos: [
      {
        id: PHOTO,
        listing_id: LISTING,
        position: 1,
        file_name: "slika.jpg",
        url: null,
        r2_key: `u/${AUTHOR}/listings/${LISTING}/0f000000-0000-4000-8000-000000000001-slika.jpg`,
      },
    ],
    author: {
      kind: "user",
      user_id: AUTHOR,
      display_name: "Ivana P.",
      initials: "IP",
      city,
      member_since: "2026-01-01T00:00:00Z",
      active_listing_count: 2,
      organisation_id: null,
      organisation_slug: null,
    },
    has_donation_info: false,
    viewer: { signed_in: false, is_author: false, my_conversation_id: null, can_message: false, conversation_count: null },
    created_at: "2026-10-20T08:00:00Z",
    updated_at: "2026-10-20T08:00:00Z",
  };
}

/** public.get_public_profile. */
function profile() {
  return {
    user_id: AUTHOR,
    display_name: "Ivana P.",
    initials: "IP",
    city,
    member_since: "2026-01-01T00:00:00Z",
    active_listing_count: 2,
    listings: [summary(LISTING, "cover.jpg"), summary(LISTING_2, null)],
    listings_total: 2,
    viewer: { signed_in: false, is_me: false, i_blocked: false },
  };
}

const list = (qs = "") => listRoute.GET(new Request(`http://localhost/api/public/listings${qs}`));
const detail = (id: string) => detailRoute.GET(new Request(`http://localhost/api/public/listings/${id}`), { params: Promise.resolve({ id }) });
const user = (id: string, qs = "") =>
  userRoute.GET(new Request(`http://localhost/api/public/users/${id}${qs}`), { params: Promise.resolve({ id }) });

type Body = Row & { total: number; items: Row[]; photos: Row[]; listings: Row[] };
const json = async (response: Response) => (await response.json()) as Body;

function expectHeaders(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Robots-Tag")).toBeNull();
}

/** Every key, at any depth. */
function allKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) allKeys(v, keys);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      keys.push(k);
      allKeys(v, keys);
    }
  }
  return keys;
}

beforeEach(() => {
  state.rpcCalls = [];
  state.fail = null;
  state.throws = false;
  state.presignFails = false;
});

describe("EP-73 GET /api/public/listings (FR-61 #1, #2)", () => {
  it("lists with the defaults (limit 20, offset 0) and no filters", async () => {
    const response = await list();
    expect(response.status).toBe(200);
    expectHeaders(response);
    expect(state.rpcCalls).toEqual([{ name: "list_listings", args: { p_limit: 20, p_offset: 0 } }]);
    const body = await json(response);
    expect(body.total).toBe(2);
    expect(body.items.map((i: Row) => i.id)).toEqual([LISTING, LISTING_2]);
  });

  it("passes every filter and the paging to rpc:list_listings", async () => {
    const response = await list(`?type=selling&category=carriers&species=cat&city_id=${CITY}&limit=10&offset=30`);
    expect(response.status).toBe(200);
    expect(state.rpcCalls[0].args).toEqual({
      p_type: "selling",
      p_category: "carriers",
      p_species: "cat",
      p_city_id: CITY,
      p_limit: 10,
      p_offset: 30,
    });
  });

  it("treats empty filter values as absent", async () => {
    await list("?type=&category=&species=&city_id=");
    expect(state.rpcCalls[0].args).toEqual({ p_limit: 20, p_offset: 0 });
  });

  it.each([
    ["?type=trade", { type: "invalid" }],
    ["?category=toys", { category: "invalid" }],
    ["?species=bird", { species: "invalid" }],
    ["?city_id=novi-sad", { city_id: "unknown" }],
    ["?limit=0", { limit: "out_of_range" }],
    ["?limit=51", { limit: "out_of_range" }],
    ["?limit=abc", { limit: "out_of_range" }],
    ["?limit=2.5", { limit: "out_of_range" }],
    ["?offset=-1", { offset: "out_of_range" }],
  ])("%s → 422 validation_failed without calling the rpc", async (qs, fields) => {
    const response = await list(qs);
    expect(response.status).toBe(422);
    expectHeaders(response);
    expect(await response.json()).toEqual({ code: "validation_failed", message: "validation_failed", fields });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("signs the cover photos (FileUrl id = listing id) and removes cover_photo_r2_key", async () => {
    const body = await json(await list());
    expect(body.items[0].cover_photo).toEqual({
      kind: "listing_photo",
      id: LISTING,
      url: `https://r2.test/get/u/${AUTHOR}/listings/${LISTING}/0f000000-0000-4000-8000-000000000001-cover.jpg?sig=1`,
      expires_at: "2026-10-29T08:10:00.000Z",
      mime_type: null,
    });
    expect(body.items[1].cover_photo).toBeNull();
    expect(allKeys(body)).not.toContain("cover_photo_r2_key");
    expect(JSON.stringify(body)).not.toContain("r2_key");
  });

  it("a failed presign gives a FileUrl with url null, not an error", async () => {
    state.presignFails = true;
    const response = await list();
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.items[0].cover_photo).toEqual({ kind: "listing_photo", id: LISTING, url: null, expires_at: null, mime_type: null });
  });

  it("maps an rpc validation error with its DETAIL field, and anything else to 500 — always no-store", async () => {
    state.fail = { code: "P0001", message: "validation_failed", details: "city_id:unknown" };
    const r1 = await list();
    expect(r1.status).toBe(422);
    expectHeaders(r1);
    expect(await r1.json()).toMatchObject({ code: "validation_failed", fields: { city_id: "unknown" } });

    state.fail = { code: "XX000", message: "boom" };
    const r2 = await list();
    expect(r2.status).toBe(500);
    expectHeaders(r2);
    expect(await r2.json()).toMatchObject({ code: "internal_error" });

    state.fail = null;
    state.throws = true;
    const r3 = await list();
    expect(r3.status).toBe(500);
    expectHeaders(r3);
  });
});

describe("EP-74 GET /api/public/listings/:id (FR-62 #1)", () => {
  it("returns the listing with every field, photos signed and r2_key stripped", async () => {
    const response = await detail(LISTING);
    expect(response.status).toBe(200);
    expectHeaders(response);
    expect(state.rpcCalls).toEqual([{ name: "get_listing", args: { p_listing_id: LISTING } }]);
    const body = await json(response);
    const { photos, ...rest } = listing();
    expect(body).toMatchObject(rest);
    expect(body.photos).toEqual([
      {
        id: PHOTO,
        listing_id: LISTING,
        position: 1,
        file_name: "slika.jpg",
        url: {
          kind: "listing_photo",
          id: PHOTO,
          url: `https://r2.test/get/${photos[0].r2_key}?sig=1`,
          expires_at: "2026-10-29T08:10:00.000Z",
          mime_type: null,
        },
      },
    ]);
    expect(allKeys(body)).not.toContain("r2_key");
  });

  it("not_found from the rpc → 404 not_found", async () => {
    const response = await detail(LISTING_2);
    expect(response.status).toBe(404);
    expectHeaders(response);
    expect(await response.json()).toMatchObject({ code: "not_found" });
  });

  it("a malformed id → 404 without calling the rpc", async () => {
    const response = await detail("not-a-uuid");
    expect(response.status).toBe(404);
    expectHeaders(response);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("an unexpected failure → 500 with no-store", async () => {
    state.throws = true;
    const response = await detail(LISTING);
    expect(response.status).toBe(500);
    expectHeaders(response);
    expect(await response.json()).toMatchObject({ code: "internal_error" });
  });
});

describe("EP-79 GET /api/public/users/:id (FR-67)", () => {
  it("returns the public profile with paging defaults (18, 0) and signed cover photos", async () => {
    const response = await user(AUTHOR);
    expect(response.status).toBe(200);
    expectHeaders(response);
    expect(state.rpcCalls).toEqual([{ name: "get_public_profile", args: { p_user_id: AUTHOR, p_limit: 18, p_offset: 0 } }]);
    const body = await json(response);
    expect(body).toMatchObject({ user_id: AUTHOR, display_name: "Ivana P.", active_listing_count: 2, listings_total: 2 });
    expect(body.listings[0].cover_photo).toMatchObject({ kind: "listing_photo", id: LISTING, url: expect.stringContaining("cover.jpg") });
    expect(body.listings[1].cover_photo).toBeNull();
    expect(allKeys(body)).not.toContain("cover_photo_r2_key");
  });

  it("passes limit and offset", async () => {
    await user(AUTHOR, "?limit=6&offset=12");
    expect(state.rpcCalls[0].args).toEqual({ p_user_id: AUTHOR, p_limit: 6, p_offset: 12 });
  });

  it.each([
    ["?limit=0", { limit: "out_of_range" }],
    ["?limit=51", { limit: "out_of_range" }],
    ["?limit=x", { limit: "out_of_range" }],
    ["?offset=-5", { offset: "out_of_range" }],
  ])("%s → 422", async (qs, fields) => {
    const response = await user(AUTHOR, qs);
    expect(response.status).toBe(422);
    expectHeaders(response);
    expect(await response.json()).toMatchObject({ code: "validation_failed", fields });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("an unknown, suspended or pending-deletion user (rpc not_found) and a malformed id → 404", async () => {
    const unknown = await user("a1000000-0000-4000-8000-0000000000ff");
    expect(unknown.status).toBe(404);
    expectHeaders(unknown);
    const malformed = await user("nope");
    expect(malformed.status).toBe(404);
    expectHeaders(malformed);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("an unexpected failure → 500 with no-store", async () => {
    state.throws = true;
    const response = await user(AUTHOR);
    expect(response.status).toBe(500);
    expectHeaders(response);
  });
});

describe("FR-67 #2 — no email or phone in EP-73, EP-74, EP-79", () => {
  it("no response carries a key named or containing email / phone", async () => {
    const bodies = [await (await list()).json(), await (await detail(LISTING)).json(), await (await user(AUTHOR)).json()];
    for (const body of bodies) {
      const keys = allKeys(body).map((k) => k.toLowerCase());
      expect(keys.length).toBeGreaterThan(10);
      expect(keys.filter((k) => k.includes("email") || k.includes("phone"))).toEqual([]);
    }
  });
});
