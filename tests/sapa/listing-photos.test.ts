// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-63 #5, BR-55 — EP-13 request_upload / confirm_upload with purpose listing_photo (lib/actions/uploads.ts) and
// EP-15 get_file_urls kind listing_photo (lib/actions/files.ts), with a fake server client over in-memory tables
// and a fake R2: the listing's author only, active or expired listing, at most 5 photos (too_many_photos at
// ticket time), JPEG / PNG / WebP / HEIC up to 10 MB, key u/<author_id>/listings/<listing_id>/<uuid>-<safe name>;
// confirm inserts listing_photos at the lowest free position. RLS on listing_photos is modelled in `visible`.

type Row = Record<string, unknown>;

const AUTHOR = "a1000000-0000-4000-8000-000000000001";
const OTHER = "a1000000-0000-4000-8000-000000000002";
const LISTING = "e1000000-0000-4000-8000-000000000001";
const OTHERS_LISTING = "e1000000-0000-4000-8000-000000000002";
const HIDDEN_LISTING = "e1000000-0000-4000-8000-000000000003";
const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const state = {
  user: AUTHOR,
  tables: {} as Record<string, Row[]>,
  objects: {} as Record<string, { size: number; type: string }>,
  removed: [] as string[],
  presigned: [] as { method: string; key: string }[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    throw new Error("listing photos never need the service role");
  },
}));
vi.mock("@/lib/integrations/r2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/r2")>("@/lib/integrations/r2");
  return {
    ...actual,
    r2: () => ({
      presignPut: async (key: string) => {
        state.presigned.push({ method: "PUT", key });
        return { url: `https://r2.test/put/${key}?sig=1`, expires_at: "2026-10-29T08:10:00.000Z" };
      },
      presignGet: async (key: string) => {
        state.presigned.push({ method: "GET", key });
        return { url: `https://r2.test/get/${key}?sig=1`, expires_at: "2026-10-29T08:10:00.000Z" };
      },
      head: async (key: string) => {
        const o = state.objects[key];
        return o ? { size: o.size, content_type: o.type } : null;
      },
      remove: async (key: string) => {
        state.removed.push(key);
        delete state.objects[key];
        return true;
      },
    }),
  };
});

const { requestUpload, confirmUpload } = await import("@/lib/actions/uploads");
const { getFileUrls } = await import("@/lib/actions/files");
const { safeFileName } = await import("@/lib/integrations/r2");

/** RLS: listings — the author any status, others active only; listing_photos follow their listing. */
function visible(table: string): Row[] {
  const rows = state.tables[table] ?? [];
  const listingVisible = (l: Row) => l.author_id === state.user || l.status === "active";
  if (table === "listings") return rows.filter(listingVisible);
  if (table === "listing_photos") {
    return rows.filter((p) => {
      const l = state.tables.listings.find((x) => x.id === p.listing_id);
      return !!l && listingVisible(l);
    });
  }
  return rows;
}

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" = "select";
  let payload: Row = {};
  const run = (): { data: Row[]; error: null } => {
    if (op === "insert") {
      const row = { id: crypto.randomUUID(), ...payload };
      state.tables[table].push(row);
      return { data: [row], error: null };
    }
    return { data: visible(table).filter((r) => filters.every((f) => f(r))), error: null };
  };
  const builder = {
    select: () => builder,
    insert: (row: Row) => ((op = "insert"), (payload = row), builder),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), builder),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    single: async () => ({ data: run().data[0] ?? null, error: null }),
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
    rpc: async (name: string) => {
      throw new Error(`unexpected rpc ${name}`);
    },
    from: (table: string) => query(table),
  };
}

function photo(n: number, listingId = LISTING, author = AUTHOR): Row {
  return {
    id: `f1000000-0000-4000-8000-00000000000${n}`,
    listing_id: listingId,
    position: n,
    r2_key: `u/${author}/listings/${listingId}/0f000000-0000-4000-8000-00000000000${n}-slika-${n}.jpg`,
  };
}

const request = {
  purpose: "listing_photo" as const,
  target_id: LISTING,
  file_name: "Moja Šapa 1.JPG",
  mime_type: "image/jpeg",
  size_bytes: 1_200_000,
};

const puts = () => state.presigned.filter((p) => p.method === "PUT").map((p) => p.key);

beforeEach(() => {
  vi.stubEnv("ACTION_TOKEN_SECRET", "test-action-token-secret");
  state.user = AUTHOR;
  state.tables = {
    profiles: [AUTHOR, OTHER].map((id) => ({ id, deletion_requested_at: null, marketplace_suspended_at: null })),
    organisation_memberships: [],
    listings: [
      { id: LISTING, author_id: AUTHOR, type: "giving", status: "active" },
      { id: OTHERS_LISTING, author_id: OTHER, type: "giving", status: "active" },
      { id: HIDDEN_LISTING, author_id: OTHER, type: "giving", status: "hidden" },
    ],
    listing_photos: [],
  };
  state.objects = {};
  state.removed = [];
  state.presigned = [];
});

async function ticket(input: Partial<typeof request> = {}) {
  const result = await requestUpload({ ...request, ...input });
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

function upload(t: { put_url: string; headers: Record<string, string> }, override: Partial<{ size: number; type: string }> = {}) {
  const key = t.put_url.replace("https://r2.test/put/", "").replace("?sig=1", "");
  state.objects[key] = { size: Number(t.headers["Content-Length"]), type: t.headers["Content-Type"], ...override };
  return key;
}

describe("EP-13 request_upload, purpose listing_photo", () => {
  it("hands out a PUT under u/<author_id>/listings/<listing_id>/<uuid>-<safe file name> at the first free position", async () => {
    const data = await ticket();
    expect(puts()).toHaveLength(1);
    const escaped = safeFileName("Moja Šapa 1.JPG").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(puts()[0]).toMatch(new RegExp(`^u/${AUTHOR}/listings/${LISTING}/${UUID_RE}-${escaped}$`));
    expect(data).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": "1200000" },
      expires_at: "2026-10-29T08:10:00.000Z",
      file_name: "Moja Šapa 1.JPG",
      position: 1,
    });
    expect(data.upload_token).toMatch(/^up_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(state.tables.listing_photos).toHaveLength(0);
  });

  it("offers the lowest free position", async () => {
    state.tables.listing_photos.push(photo(1), photo(3));
    expect((await ticket()).position).toBe(2);
  });

  it("5 existing photos → too_many_photos at ticket time (FR-63 #5)", async () => {
    state.tables.listing_photos.push(...[1, 2, 3, 4, 5].map((n) => photo(n)));
    expect(await requestUpload(request)).toMatchObject({ ok: false, error: { code: "too_many_photos" } });
    expect(puts()).toHaveLength(0);
  });

  it.each(["image/jpeg", "image/png", "image/webp", "image/heic"])("accepts %s", async (mime) => {
    expect((await requestUpload({ ...request, mime_type: mime })).ok).toBe(true);
  });

  it.each(["application/pdf", "image/gif", "image/svg+xml", "text/plain", "video/mp4"])("%s → file_type_not_allowed", async (mime) => {
    expect(await requestUpload({ ...request, mime_type: mime })).toMatchObject({ ok: false, error: { code: "file_type_not_allowed" } });
    expect(puts()).toHaveLength(0);
  });

  it("more than 10 MB → file_too_large; exactly 10 MB is accepted", async () => {
    expect(await requestUpload({ ...request, size_bytes: 10_485_761 })).toMatchObject({ ok: false, error: { code: "file_too_large" } });
    expect((await requestUpload({ ...request, size_bytes: 10_485_760 })).ok).toBe(true);
  });

  it.each(["resolved", "hidden"])("a %s listing → listing_not_active", async (status) => {
    state.tables.listings[0].status = status;
    expect(await requestUpload(request)).toMatchObject({ ok: false, error: { code: "listing_not_active" } });
    expect(puts()).toHaveLength(0);
  });

  it("an expired listing still takes photos", async () => {
    state.tables.listings[0].status = "expired";
    expect((await requestUpload(request)).ok).toBe(true);
  });

  it("a suspended author → marketplace_suspended", async () => {
    state.tables.profiles[0].marketplace_suspended_at = "2026-10-20T10:00:00Z";
    expect(await requestUpload(request)).toMatchObject({ ok: false, error: { code: "marketplace_suspended" } });
    expect(puts()).toHaveLength(0);
  });

  it("someone else's visible listing → forbidden_role; an invisible or unknown one → not_found", async () => {
    expect(await requestUpload({ ...request, target_id: OTHERS_LISTING })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(await requestUpload({ ...request, target_id: HIDDEN_LISTING })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await requestUpload({ ...request, target_id: "e1000000-0000-4000-8000-0000000000ff" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(puts()).toHaveLength(0);
  });

  it("a need of a pending shelter → organisation_pending_approval", async () => {
    state.tables.listings[0].type = "need";
    state.tables.organisation_memberships.push({
      user_id: AUTHOR,
      organisation_id: "b2000000-0000-4000-8000-000000000001",
      organisations: { approval_status: "pending" },
    });
    expect(await requestUpload(request)).toMatchObject({ ok: false, error: { code: "organisation_pending_approval" } });
  });
});

describe("EP-13 confirm_upload, purpose listing_photo", () => {
  it("inserts listing_photos at the lowest free position and returns a ListingPhoto with a signed url", async () => {
    state.tables.listing_photos.push(photo(1), photo(2), photo(4));
    const t = await ticket();
    const key = upload(t);
    const result = await confirmUpload({ upload_token: t.upload_token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inserted = state.tables.listing_photos.find((p) => p.r2_key === key)!;
    expect(inserted).toMatchObject({ listing_id: LISTING, position: 3 });
    expect(result.data).toEqual({
      id: inserted.id,
      listing_id: LISTING,
      position: 3,
      file_name: safeFileName("Moja Šapa 1.JPG"),
      url: {
        kind: "listing_photo",
        id: inserted.id,
        url: `https://r2.test/get/${key}?sig=1`,
        expires_at: "2026-10-29T08:10:00.000Z",
        mime_type: "image/jpeg",
      },
    });
    expect(JSON.stringify(result.data)).not.toContain("r2_key");
  });

  it("a photo not uploaded yet → validation_failed (upload_token not_uploaded); nothing inserted", async () => {
    const t = await ticket();
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { upload_token: "not_uploaded" } },
    });
    expect(state.tables.listing_photos).toHaveLength(0);
  });

  it("a size or type mismatch deletes the object", async () => {
    const t1 = await ticket();
    const k1 = upload(t1, { size: 20_000_000 });
    expect(await confirmUpload({ upload_token: t1.upload_token })).toMatchObject({ ok: false, error: { code: "file_too_large" } });
    const t2 = await ticket();
    const k2 = upload(t2, { type: "application/pdf" });
    expect(await confirmUpload({ upload_token: t2.upload_token })).toMatchObject({ ok: false, error: { code: "file_type_not_allowed" } });
    expect(state.removed).toEqual([k1, k2]);
    expect(state.tables.listing_photos).toHaveLength(0);
  });

  it("the listing filled up between ticket and confirm → too_many_photos and the object is removed", async () => {
    state.tables.listing_photos.push(...[1, 2, 3, 4].map((n) => photo(n)));
    const t = await ticket();
    const key = upload(t);
    state.tables.listing_photos.push(photo(5));
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({ ok: false, error: { code: "too_many_photos" } });
    expect(state.removed).toEqual([key]);
  });

  it("re-checks the listing at confirm: resolved meanwhile → listing_not_active; suspended → marketplace_suspended", async () => {
    const t = await ticket();
    upload(t);
    state.tables.listings[0].status = "resolved";
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({ ok: false, error: { code: "listing_not_active" } });
    state.tables.listings[0].status = "active";
    state.tables.profiles[0].marketplace_suspended_at = "2026-10-29T00:00:00Z";
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({ ok: false, error: { code: "marketplace_suspended" } });
    expect(state.tables.listing_photos).toHaveLength(0);
  });

  it("another user replaying the token → forbidden_role", async () => {
    const t = await ticket();
    upload(t);
    state.user = OTHER;
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
  });

  it("a tampered token → validation_failed (upload_token invalid)", async () => {
    const t = await ticket();
    expect(await confirmUpload({ upload_token: `${t.upload_token}x` })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { upload_token: "invalid" } },
    });
  });
});

describe("EP-15 get_file_urls, kind listing_photo", () => {
  it("signs the caller's readable listing photos and answers url null for rows it cannot read", async () => {
    const own = photo(1);
    const others = photo(2, OTHERS_LISTING, OTHER);
    const hidden = photo(3, HIDDEN_LISTING, OTHER);
    state.tables.listing_photos.push(own, others, hidden);
    const unknown = "f1000000-0000-4000-8000-0000000000ff";
    const result = await getFileUrls({
      items: [own, others, hidden].map((p) => ({ kind: "listing_photo" as const, id: String(p.id) })).concat({ kind: "listing_photo", id: unknown }),
    });
    expect(result).toEqual({
      ok: true,
      data: [
        { kind: "listing_photo", id: own.id, url: `https://r2.test/get/${own.r2_key}?sig=1`, expires_at: "2026-10-29T08:10:00.000Z", mime_type: null },
        { kind: "listing_photo", id: others.id, url: `https://r2.test/get/${others.r2_key}?sig=1`, expires_at: "2026-10-29T08:10:00.000Z", mime_type: null },
        { kind: "listing_photo", id: hidden.id, url: null, expires_at: null, mime_type: null },
        { kind: "listing_photo", id: unknown, url: null, expires_at: null, mime_type: null },
      ],
    });
    expect(state.presigned.filter((p) => p.method === "GET").map((p) => p.key)).toEqual([own.r2_key, others.r2_key]);
  });

  it("the author still gets a URL for a photo of the own hidden listing", async () => {
    state.user = OTHER;
    const hidden = photo(3, HIDDEN_LISTING, OTHER);
    state.tables.listing_photos.push(hidden);
    const result = await getFileUrls({ items: [{ kind: "listing_photo", id: String(hidden.id) }] });
    expect(result).toMatchObject({ ok: true, data: [{ id: hidden.id, url: expect.stringContaining(String(hidden.r2_key)) }] });
  });
});
