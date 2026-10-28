// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-63 #1–#4, #6, #7 and FR-64 #2 — EP-75 saveListing (lib/actions/listings.ts) with a fake server client over
// in-memory tables and a fake R2. The fake rpc:save_listing / rpc:get_listing / rpc:get_me stand in for the
// Step 28a/28b database (the triggers themselves are proven in the pgTAP files): create → status active and
// expires_at = published_at + 30 days; need only with Me.marketplace.can_post_need; medicine_care only on needs;
// the selling price rule; the Free 3-active limit (premium_required:listings) and no block for Premium / shelter
// needs; update keeps published_at / expires_at and passes photo_ids through.

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };

const AUTHOR = "a1000000-0000-4000-8000-000000000001";
const OTHER = "a1000000-0000-4000-8000-000000000002";
const PREMIUM = "a1000000-0000-4000-8000-000000000003";
const SHELTER_ADMIN = "a1000000-0000-4000-8000-000000000004";
const ORG = "b2000000-0000-4000-8000-000000000001";
const CITY = "d1000000-0000-4000-8000-000000000001";
const UNKNOWN_CITY = "d1000000-0000-4000-8000-0000000000ff";
const LISTING = "e1000000-0000-4000-8000-000000000001";
const OTHERS_LISTING = "e1000000-0000-4000-8000-000000000002";
const NEED_LISTING = "e1000000-0000-4000-8000-000000000003";
const PHOTO = (n: number) => `f1000000-0000-4000-8000-00000000000${n}`;
const DAY_MS = 86_400_000;

const state = {
  user: AUTHOR,
  tables: {} as Record<string, Row[]>,
  premium: new Set<string>(),
  marketplace: {} as Record<string, Row>,
  rpcCalls: [] as { name: string; args: Row }[],
  rpcFail: {} as Record<string, DbError>,
  queue: [] as string[],
  presigned: [] as string[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/integrations/r2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/r2")>("@/lib/integrations/r2");
  return {
    ...actual,
    r2: () => ({
      presignGet: async (key: string) => {
        state.presigned.push(key);
        return { url: `https://r2.test/get/${key}?sig=1`, expires_at: "2026-10-29T08:10:00.000Z" };
      },
    }),
  };
});

const { saveListing } = await import("@/lib/actions/listings");

/** RLS on listings: the author sees every status, everyone else only active listings. */
function visible(table: string): Row[] {
  const rows = state.tables[table] ?? [];
  if (table === "listings") return rows.filter((l) => l.author_id === state.user || l.status === "active");
  return rows;
}

function rawListing(l: Row) {
  const photos = state.tables.listing_photos
    .filter((p) => p.listing_id === l.id)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((p) => ({ id: p.id, listing_id: p.listing_id, position: p.position, file_name: "slika.jpg", url: null, r2_key: p.r2_key }));
  return {
    id: l.id,
    type: l.type,
    title: l.title,
    description: l.description,
    category: l.category,
    species: l.species,
    city: { id: l.city_id, name_sr: "Novi Sad", name_en: "Novi Sad", latitude: 45.25, longitude: 19.84 },
    price: l.price_minor === null ? null : { amount_minor: l.price_minor, currency: "RSD" },
    price_negotiable: l.price_negotiable,
    status: l.status,
    resolved_outcome: l.resolved_outcome ?? null,
    resolved_at: null,
    published_at: l.published_at,
    expires_at: l.expires_at,
    days_left: 30,
    photos,
    author: {
      kind: l.organisation_id ? "shelter" : "user",
      user_id: l.author_id,
      display_name: "Ivana",
      initials: "I",
      city: null,
      member_since: "2026-01-01T00:00:00Z",
      active_listing_count: 1,
      organisation_id: l.organisation_id ?? null,
      organisation_slug: null,
    },
    has_donation_info: false,
    viewer: { signed_in: true, is_author: true, my_conversation_id: null, can_message: false, conversation_count: 0 },
    created_at: l.published_at,
    updated_at: l.published_at,
  };
}

/** The Step 28a rules the fake rpc:save_listing reproduces: the Free 3-active limit, published / expires on create. */
function saveListingRpc(args: Row) {
  const author = state.user;
  if (args.p_id === null) {
    const active = state.tables.listings.filter((l) => l.author_id === author && l.status === "active" && !l.organisation_id);
    if (!args.p_organisation_id && !state.premium.has(author) && active.length >= 3) {
      return { data: null, error: { code: "P0001", message: "premium_required:listings" } };
    }
    const now = Date.now();
    const id = crypto.randomUUID();
    state.tables.listings.push({
      id,
      author_id: author,
      organisation_id: args.p_organisation_id ?? null,
      type: args.p_type,
      status: "active",
      title: args.p_title,
      description: args.p_description,
      category: args.p_category,
      species: args.p_species,
      city_id: args.p_city_id,
      price_minor: args.p_price_minor,
      price_negotiable: args.p_price_negotiable,
      published_at: new Date(now).toISOString(),
      expires_at: new Date(now + 30 * DAY_MS).toISOString(),
    });
    return { data: id, error: null };
  }
  const row = state.tables.listings.find((l) => l.id === args.p_id)!;
  Object.assign(row, {
    type: args.p_type,
    title: args.p_title,
    description: args.p_description,
    category: args.p_category,
    species: args.p_species,
    city_id: args.p_city_id,
    price_minor: args.p_price_minor,
    price_negotiable: args.p_price_negotiable,
  });
  const ids = args.p_photo_ids as string[] | undefined;
  if (ids) {
    const photos = state.tables.listing_photos.filter((p) => p.listing_id === row.id);
    for (const p of photos.filter((p) => !ids.includes(String(p.id)))) state.queue.push(String(p.r2_key));
    state.tables.listing_photos = state.tables.listing_photos.filter((p) => p.listing_id !== row.id || ids.includes(String(p.id)));
    for (const [i, id] of ids.entries()) {
      const photo = state.tables.listing_photos.find((p) => p.id === id);
      if (photo) photo.position = i + 1;
    }
  }
  return { data: row.id, error: null };
}

function rpc(name: string, args: Row = {}) {
  state.rpcCalls.push({ name, args });
  if (state.rpcFail[name]) return { data: null, error: state.rpcFail[name] };
  if (name === "get_me") return { data: { marketplace: state.marketplace[state.user] }, error: null };
  if (name === "save_listing") return saveListingRpc(args);
  if (name === "get_listing") {
    const l = visible("listings").find((r) => r.id === args.p_listing_id);
    return l ? { data: rawListing(l), error: null } : { data: null, error: { code: "P0001", message: "not_found" } };
  }
  throw new Error(`unexpected rpc ${name}`);
}

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const run = () => ({ data: visible(table).filter((r) => filters.every((f) => f(r))), error: null });
  const builder = {
    select: () => builder,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: state.user, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    rpc: async (name: string, args?: Row) => rpc(name, args),
    from: (table: string) => query(table),
  };
}

function marketplace(overrides: Row = {}) {
  return {
    suspended_at: null,
    active_listings: 0,
    active_listing_limit: 3,
    can_post_need: false,
    need_organisation: null,
    unread_conversations: 0,
    ...overrides,
  };
}

function listing(overrides: Row = {}): Row {
  return {
    id: LISTING,
    author_id: AUTHOR,
    organisation_id: null,
    type: "giving",
    status: "active",
    title: "Transporter za mačke",
    description: "Malo korišćen, čist.",
    category: "carriers",
    species: "cat",
    city_id: CITY,
    price_minor: null,
    price_negotiable: false,
    published_at: "2026-10-10T08:00:00.000Z",
    expires_at: "2026-11-09T08:00:00.000Z",
    ...overrides,
  };
}

const create = {
  type: "giving" as const,
  title: "  Ogrlica za psa  ",
  description: "Nova, nekorišćena.",
  category: "equipment_toys" as const,
  species: "dog" as const,
  city_id: CITY,
};

const saveCalls = () => state.rpcCalls.filter((c) => c.name === "save_listing");

beforeEach(() => {
  state.user = AUTHOR;
  state.premium = new Set([PREMIUM]);
  state.marketplace = {
    [AUTHOR]: marketplace(),
    [PREMIUM]: marketplace({ active_listing_limit: null }),
    [SHELTER_ADMIN]: marketplace({ active_listing_limit: null, can_post_need: true, need_organisation: { id: ORG, name: "Azil Šapa" } }),
  };
  state.tables = {
    profiles: [AUTHOR, OTHER, PREMIUM, SHELTER_ADMIN].map((id) => ({ id, deletion_requested_at: null, marketplace_suspended_at: null })),
    organisation_memberships: [
      { user_id: SHELTER_ADMIN, organisation_id: ORG, role: "admin", organisations: { approval_status: "approved" } },
    ],
    cities: [{ id: CITY }],
    listings: [],
    listing_photos: [],
  };
  state.rpcCalls = [];
  state.rpcFail = {};
  state.queue = [];
  state.presigned = [];
});

describe("EP-75 saveListing — create (FR-63 #1)", () => {
  it("creates an active listing expiring 30 days after publication and calls save_listing with the validated args", async () => {
    const result = await saveListing(create);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("active");
    expect(Date.parse(result.data.expires_at) - Date.parse(result.data.published_at)).toBe(30 * DAY_MS);
    expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0].args).toEqual({
      p_id: null,
      p_type: "giving",
      p_title: "Ogrlica za psa",
      p_description: "Nova, nekorišćena.",
      p_category: "equipment_toys",
      p_species: "dog",
      p_city_id: CITY,
      p_price_minor: null,
      p_price_negotiable: false,
    });
    expect(state.rpcCalls.at(-1)).toEqual({ name: "get_listing", args: { p_listing_id: result.data.id } });
  });

  it("saves a selling listing with a whole-RSD price, or po dogovoru without one", async () => {
    const priced = await saveListing({ ...create, type: "selling", price: { amount_minor: 250_000, currency: "RSD" } });
    expect(priced).toMatchObject({ ok: true, data: { price: { amount_minor: 250_000, currency: "RSD" }, price_negotiable: false } });
    expect(saveCalls()[0].args).toMatchObject({ p_price_minor: 250_000, p_price_negotiable: false });

    const negotiable = await saveListing({ ...create, type: "selling", price: null, price_negotiable: true });
    expect(negotiable).toMatchObject({ ok: true, data: { price: null, price_negotiable: true } });
    expect(saveCalls()[1].args).toMatchObject({ p_price_minor: null, p_price_negotiable: true });
  });

  it("requires the fields and an existing city", async () => {
    expect(await saveListing({})).toMatchObject({
      ok: false,
      error: {
        code: "validation_failed",
        fields: { type: "required", title: "required", description: "required", category: "required", species: "required", city_id: "required" },
      },
    });
    expect(await saveListing({ ...create, city_id: UNKNOWN_CITY })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { city_id: "unknown" } },
    });
    expect(await saveListing({ ...create, type: "trade" as never })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { type: "invalid" } },
    });
    expect(saveCalls()).toHaveLength(0);
  });

  it("limits the title to 80 and the description to 2,000 characters", async () => {
    expect(await saveListing({ ...create, title: "a".repeat(81) })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { title: "too_long" } },
    });
    expect(await saveListing({ ...create, description: "a".repeat(2001) })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { description: "too_long" } },
    });
    expect((await saveListing({ ...create, title: "a".repeat(80), description: "b".repeat(2000) })).ok).toBe(true);
  });

  it("rejects photo_ids on create (photos are added through EP-13 after the listing exists)", async () => {
    expect(await saveListing({ ...create, photo_ids: [PHOTO(1)] })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { photo_ids: "invalid" } },
    });
  });
});

describe("EP-75 saveListing — need (FR-63 #2)", () => {
  it("saves a need for Me.marketplace.need_organisation when can_post_need", async () => {
    state.user = SHELTER_ADMIN;
    const result = await saveListing({ ...create, type: "need", category: "food" });
    expect(result).toMatchObject({ ok: true, data: { type: "need", status: "active", author: { kind: "shelter", organisation_id: ORG } } });
    expect(state.rpcCalls.map((c) => c.name)).toContain("get_me");
    expect(saveCalls()[0].args).toMatchObject({ p_type: "need", p_organisation_id: ORG, p_price_minor: null, p_price_negotiable: false });
  });

  it("answers listing_type_not_allowed for a caller without can_post_need, and writes nothing", async () => {
    expect(await saveListing({ ...create, type: "need", category: "food" })).toMatchObject({
      ok: false,
      error: { code: "listing_type_not_allowed" },
    });
    state.marketplace[AUTHOR] = marketplace({ can_post_need: true, need_organisation: null });
    expect(await saveListing({ ...create, type: "need", category: "food" })).toMatchObject({
      ok: false,
      error: { code: "listing_type_not_allowed" },
    });
    expect(saveCalls()).toHaveLength(0);
  });

  it("does not ask get_me for other types", async () => {
    await saveListing(create);
    expect(state.rpcCalls.map((c) => c.name)).not.toContain("get_me");
    expect(saveCalls()[0].args).not.toHaveProperty("p_organisation_id");
  });

  it("answers organisation_pending_approval for a need by a member of a pending shelter", async () => {
    state.user = SHELTER_ADMIN;
    state.tables.organisation_memberships[0].organisations = { approval_status: "pending" };
    expect(await saveListing({ ...create, type: "need", category: "food" })).toMatchObject({
      ok: false,
      error: { code: "organisation_pending_approval" },
    });
  });
});

describe("EP-75 saveListing — category and price rules (FR-63 #3, #4)", () => {
  it.each(["giving", "selling", "seeking"] as const)("medicine_care on %s → category_not_allowed under category", async (type) => {
    const result = await saveListing({ ...create, type, category: "medicine_care", ...(type === "selling" ? { price_negotiable: true } : {}) });
    expect(result).toEqual({
      ok: false,
      error: { code: "category_not_allowed", message: "category_not_allowed", fields: { category: "not_allowed" } },
    });
    expect(saveCalls()).toHaveLength(0);
  });

  it("allows medicine_care on a need", async () => {
    state.user = SHELTER_ADMIN;
    expect((await saveListing({ ...create, type: "need", category: "medicine_care" })).ok).toBe(true);
  });

  it("maps the listings_category_check violation (SQLSTATE 23514) from the rpc to category_not_allowed", async () => {
    state.rpcFail.save_listing = {
      code: "23514",
      message: 'new row for relation "listings" violates check constraint "listings_category_check"',
    };
    expect(await saveListing(create)).toMatchObject({
      ok: false,
      error: { code: "category_not_allowed", fields: { category: "not_allowed" } },
    });
  });

  it("selling without an amount and not negotiable → price required", async () => {
    expect(await saveListing({ ...create, type: "selling" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { price: "required" } },
    });
    expect(await saveListing({ ...create, type: "selling", price: null, price_negotiable: false })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { price: "required" } },
    });
    expect(saveCalls()).toHaveLength(0);
  });

  it("selling with an amount and po dogovoru → price invalid", async () => {
    expect(
      await saveListing({ ...create, type: "selling", price: { amount_minor: 250_000, currency: "RSD" }, price_negotiable: true }),
    ).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { price: "invalid" } } });
  });

  it("rejects fractional dinars, zero and out-of-range prices, and a price on other types", async () => {
    const selling = (amount_minor: number) => saveListing({ ...create, type: "selling", price: { amount_minor, currency: "RSD" } });
    expect(await selling(250_050)).toMatchObject({ ok: false, error: { fields: { price: "invalid" } } });
    expect(await selling(0)).toMatchObject({ ok: false, error: { fields: { price: "out_of_range" } } });
    expect(await selling(1_000_000_000)).toMatchObject({ ok: false, error: { fields: { price: "out_of_range" } } });
    expect(await saveListing({ ...create, price: { amount_minor: 100, currency: "RSD" } })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { price: "invalid" } },
    });
  });
});

describe("EP-75 saveListing — the Free limit (FR-63 #6, #7)", () => {
  const threeActive = (author: string) =>
    [1, 2, 3].map((i) => listing({ id: `e2000000-0000-4000-8000-00000000000${i}`, author_id: author }));

  it("a Free owner's 4th active listing → premium_required with details.limit = listings", async () => {
    state.tables.listings.push(...threeActive(AUTHOR));
    const result = await saveListing(create);
    expect(result).toEqual({
      ok: false,
      error: { code: "premium_required", message: "premium_required:listings", details: { limit: "listings" } },
    });
    expect(state.tables.listings).toHaveLength(3);
  });

  it("the rpc error itself maps to premium_required (listings)", async () => {
    state.rpcFail.save_listing = { code: "P0001", message: "premium_required:listings" };
    expect(await saveListing(create)).toMatchObject({ ok: false, error: { code: "premium_required", details: { limit: "listings" } } });
  });

  it("a Premium owner with 3 active listings is not blocked", async () => {
    state.user = PREMIUM;
    state.tables.listings.push(...threeActive(PREMIUM));
    expect(await saveListing(create)).toMatchObject({ ok: true, data: { status: "active" } });
  });

  it("a shelter account's need listing is not blocked", async () => {
    state.user = SHELTER_ADMIN;
    state.tables.listings.push(...threeActive(SHELTER_ADMIN));
    expect(await saveListing({ ...create, type: "need", category: "food" })).toMatchObject({ ok: true, data: { type: "need" } });
  });
});

describe("EP-75 saveListing — update (FR-64 #2)", () => {
  beforeEach(() => {
    state.tables.listings.push(
      listing(),
      listing({ id: OTHERS_LISTING, author_id: OTHER }),
      listing({ id: NEED_LISTING, author_id: SHELTER_ADMIN, organisation_id: ORG, type: "need", category: "food" }),
    );
    state.tables.listing_photos.push(
      ...[1, 2, 3].map((n) => ({ id: PHOTO(n), listing_id: LISTING, position: n, r2_key: `u/${AUTHOR}/listings/${LISTING}/k${n}-slika.jpg` })),
    );
  });

  it("changes only the sent fields, keeps published_at and expires_at, and never sends them", async () => {
    const result = await saveListing({ id: LISTING, title: "Transporter (veliki)" });
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: LISTING,
        title: "Transporter (veliki)",
        description: "Malo korišćen, čist.",
        category: "carriers",
        published_at: "2026-10-10T08:00:00.000Z",
        expires_at: "2026-11-09T08:00:00.000Z",
      },
    });
    const args = saveCalls()[0].args;
    expect(args).toEqual({
      p_id: LISTING,
      p_type: "giving",
      p_title: "Transporter (veliki)",
      p_description: "Malo korišćen, čist.",
      p_category: "carriers",
      p_species: "cat",
      p_city_id: CITY,
      p_price_minor: null,
      p_price_negotiable: false,
    });
    expect(Object.keys(args).some((k) => k.includes("published") || k.includes("expires"))).toBe(false);
  });

  it("passes photo_ids as p_photo_ids (reorder; omitted photos deleted with their keys queued) and signs the photos", async () => {
    const result = await saveListing({ id: LISTING, photo_ids: [PHOTO(3), PHOTO(1)] });
    expect(saveCalls()[0].args.p_photo_ids).toEqual([PHOTO(3), PHOTO(1)]);
    expect(state.queue).toEqual([`u/${AUTHOR}/listings/${LISTING}/k2-slika.jpg`]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.photos.map((p) => [p.id, p.position])).toEqual([
      [PHOTO(3), 1],
      [PHOTO(1), 2],
    ]);
    expect(result.data.photos[0].url).toMatchObject({ kind: "listing_photo", id: PHOTO(3), url: expect.stringContaining("k3-slika.jpg") });
    expect(JSON.stringify(result.data)).not.toContain("r2_key");
  });

  it("rejects more than 5 photo ids or malformed ids", async () => {
    expect(await saveListing({ id: LISTING, photo_ids: [1, 2, 3, 4, 5, 6].map((n) => PHOTO(n)) })).toMatchObject({
      ok: false,
      error: { fields: { photo_ids: "invalid" } },
    });
    expect(await saveListing({ id: LISTING, photo_ids: ["nope"] })).toMatchObject({ ok: false, error: { fields: { photo_ids: "invalid" } } });
  });

  it("someone else's listing → forbidden_role; unknown or malformed id → not_found", async () => {
    expect(await saveListing({ id: OTHERS_LISTING, title: "x" })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(await saveListing({ id: "e1000000-0000-4000-8000-0000000000ff", title: "x" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await saveListing({ id: "not-a-uuid", title: "x" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(saveCalls()).toHaveLength(0);
  });

  it.each(["resolved", "hidden"])("a %s listing → listing_not_active", async (status) => {
    state.tables.listings[0].status = status;
    expect(await saveListing({ id: LISTING, title: "x" })).toMatchObject({ ok: false, error: { code: "listing_not_active" } });
    expect(saveCalls()).toHaveLength(0);
  });

  it("an expired listing can still be edited", async () => {
    state.tables.listings[0].status = "expired";
    expect((await saveListing({ id: LISTING, title: "Izmenjeno" })).ok).toBe(true);
  });

  it("changing the type to or from need → fields.type invalid_state", async () => {
    expect(await saveListing({ id: LISTING, type: "need", category: "food" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { type: "invalid_state" } },
    });
    state.user = SHELTER_ADMIN;
    expect(await saveListing({ id: NEED_LISTING, type: "giving" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { type: "invalid_state" } },
    });
    expect(saveCalls()).toHaveLength(0);
  });

  it("allows switching between the non-need types (giving → selling with a price)", async () => {
    const result = await saveListing({ id: LISTING, type: "selling", price: { amount_minor: 150_000, currency: "RSD" } });
    expect(result).toMatchObject({ ok: true, data: { type: "selling", price: { amount_minor: 150_000 } } });
    expect(saveCalls()[0].args).toMatchObject({ p_type: "selling", p_price_minor: 150_000 });
  });

  it("does not re-check can_post_need when a shelter edits its need", async () => {
    state.user = SHELTER_ADMIN;
    expect((await saveListing({ id: NEED_LISTING, title: "Hrana za pse" })).ok).toBe(true);
    expect(state.rpcCalls.map((c) => c.name)).not.toContain("get_me");
    expect(saveCalls()[0].args).not.toHaveProperty("p_organisation_id");
  });
});
