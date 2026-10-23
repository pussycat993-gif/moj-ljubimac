import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-17 / FR-19 — EP-21 prepare_moment / confirm_moment, EP-22 delete_moment and EP-15 moment_photo
// (lib/actions/moments.ts, lib/actions/files.ts) with a fake server client over in-memory tables and a
// fake R2: a moment with 6 photos → too_many_photos; the Free limit at step 1; keys under the moment's
// own prefix (API §10 item 6); the draft token, R2 HEAD checks and rpc:confirm_moment at step 3;
// delete_moment removes the moment, its link and queues its photo keys (the cascade and the
// moment_photos trigger proven in supabase/tests/moments_api.test.sql), after which EP-24 answers 404.

type Row = Record<string, unknown>;

const OWNER = "a1000000-0000-4000-8000-000000000001";
const MEMBER = "a1000000-0000-4000-8000-000000000003";
const LUNA = "c1000000-0000-4000-8000-000000000001";
const SLUG = "Ab3dEf6hIj9kLm2nOp5qRs";

const state = {
  db: null as ReturnType<typeof fakeDb> | null,
  user: OWNER,
  objects: {} as Record<string, { size: number; type: string }>,
  removed: [] as string[],
  presigned: [] as { method: string; key: string }[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client(state.user) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => serviceClient() }));
vi.mock("@/lib/integrations/r2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/r2")>("@/lib/integrations/r2");
  return {
    ...actual,
    r2: () => ({
      presignPut: async (key: string) => {
        state.presigned.push({ method: "PUT", key });
        return { url: `https://r2.test/put/${key}?sig=1`, expires_at: "2026-10-23T08:10:00.000Z" };
      },
      presignGet: async (key: string) => {
        state.presigned.push({ method: "GET", key });
        return { url: `https://r2.test/get/${key}?sig=1`, expires_at: "2026-10-23T08:10:00.000Z" };
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

const { prepareMoment, confirmMoment, deleteMoment } = await import("@/lib/actions/moments");
const { getFileUrls } = await import("@/lib/actions/files");
const { getPublicMoment } = await import("@/lib/server/public-moments");

function fakeDb({ premium = false, moments = [] as Row[], role = "owner", canLog = true, lifecycle = "active" } = {}) {
  const tables: Record<string, Row[]> = {
    profiles: [{ id: OWNER, deletion_requested_at: null }, { id: MEMBER, deletion_requested_at: null }],
    organisation_memberships: [],
    pets: [{ id: LUNA, owner_id: OWNER, organisation_id: null, lifecycle, name: "Luna", sex: "female" }],
    pet_summaries_api: [{ id: LUNA, can_log: canLog, access: { role, can_edit: role === "owner", can_delete: role === "owner" } }],
    moments: [...moments],
    moment_photos: [],
    moment_public_links: [],
  };
  const queue: string[] = [];
  const rpcCalls: { name: string; args: Row }[] = [];
  const view = (m: Row) => {
    const photos = tables.moment_photos
      .filter((p) => p.moment_id === m.id)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((p) => ({ id: p.id, moment_id: p.moment_id, position: p.position }));
    const link = tables.moment_public_links.find((l) => l.moment_id === m.id);
    return {
      ...m,
      photos,
      photo_count: photos.length,
      public_link: link ? { slug: link.slug, active: link.active, url: `https://mojljubimac.rs/t/${link.slug}` } : null,
      created_by_name: "Ivana Petrović",
      access: { role: "owner", can_edit: true, can_delete: true },
    };
  };
  return {
    tables,
    queue,
    rpcCalls,
    rpcError: null as Row | null,
    rows(table: string): Row[] {
      if (table === "moments_api") return tables.moments.map(view);
      return tables[table] ?? [];
    },
    remove(table: string, gone: Row[]) {
      tables[table] = tables[table].filter((r) => !gone.includes(r));
      if (table === "moments") {
        const ids = gone.map((m) => m.id);
        // ON DELETE CASCADE + moment_photos_queue_r2_key (Step 07 schema).
        for (const photo of tables.moment_photos.filter((p) => ids.includes(p.moment_id))) queue.push(String(photo.r2_key));
        tables.moment_photos = tables.moment_photos.filter((p) => !ids.includes(p.moment_id));
        tables.moment_public_links = tables.moment_public_links.filter((l) => !ids.includes(l.moment_id));
      }
    },
    rpc(name: string, args: Row) {
      rpcCalls.push({ name, args });
      if (name === "is_premium") return { data: premium, error: null };
      if (name === "confirm_moment") {
        if (this.rpcError) return { data: null, error: this.rpcError };
        if (tables.moments.some((m) => m.id === args.p_moment_id)) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"moments_pkey\"" } };
        }
        const moment = {
          id: args.p_moment_id,
          pet_id: args.p_pet_id,
          moment_date: args.p_moment_date,
          text: args.p_text,
          created_by: state.user,
          created_at: "2026-10-23T08:00:00Z",
        };
        tables.moments.push(moment);
        for (const [i, photo] of (args.p_photos as Row[]).entries()) {
          tables.moment_photos.push({ id: `p-${i + 1}`, moment_id: moment.id, r2_key: photo.r2_key, position: photo.position });
        }
        return { data: view(moment), error: null };
      }
      return { data: null, error: null };
    },
  };
}

function query(table: string) {
  const db = state.db!;
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row = {};
  let head = false;
  const run = () => {
    const rows = db.rows(table).filter((r) => filters.every((f) => f(r)));
    if (op === "insert") {
      const row = { id: `row-${Math.random()}`, ...payload };
      db.tables[table].push(row);
      return { data: [row], error: null, count: null };
    }
    if (op === "update") {
      for (const r of rows) Object.assign(r, payload);
      return { data: rows, error: null, count: null };
    }
    if (op === "delete") {
      db.remove(table, rows);
      return { data: rows, error: null, count: null };
    }
    return { data: head ? null : rows, error: null, count: rows.length };
  };
  const builder = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => ((head = !!opts?.head), builder),
    insert: (row: Row) => ((op = "insert"), (payload = row), builder),
    update: (row: Row) => ((op = "update"), (payload = row), builder),
    delete: () => ((op = "delete"), builder),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), builder),
    order: () => builder,
    range: () => builder,
    maybeSingle: async () => {
      const result = run();
      return { data: (result.data as Row[] | null)?.[0] ?? null, error: result.error };
    },
    single: async () => {
      const result = run();
      return { data: (result.data as Row[] | null)?.[0] ?? null, error: result.error };
    },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

function client(userId: string) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: userId, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    rpc: async (name: string, args: Row) => state.db!.rpc(name, args),
    from: (table: string) => query(table),
  };
}

/** EP-24's service-role read of moment_public_links with the embedded moment, pet and photos. */
function serviceClient() {
  const db = state.db!;
  return {
    from: () => {
      const filters: ((r: Row) => boolean)[] = [];
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        maybeSingle: async () => {
          const link = db.tables.moment_public_links.find((r) => filters.every((f) => f(r)));
          if (!link) return { data: null, error: null };
          const moment = db.tables.moments.find((m) => m.id === link.moment_id)!;
          const pet = db.tables.pets.find((p) => p.id === moment.pet_id)!;
          return {
            data: {
              slug: link.slug,
              active: link.active,
              moments: {
                moment_date: moment.moment_date,
                text: moment.text,
                pets: { name: pet.name, sex: pet.sex },
                moment_photos: db.tables.moment_photos.filter((p) => p.moment_id === moment.id),
              },
            },
            error: null,
          };
        },
      };
      return builder;
    },
  };
}

const photo = (i: number) => ({ file_name: `Štrand ${i}.JPG`, mime_type: "image/jpeg", size_bytes: 1_200_000 + i });
const request = { pet_id: LUNA, moment_date: "2026-10-12", text: "Prvi put na Štrandu.", photos: [photo(1), photo(2)] };

beforeEach(() => {
  vi.stubEnv("ACTION_TOKEN_SECRET", "test-action-token-secret");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mojljubimac.test");
  state.db = fakeDb();
  state.user = OWNER;
  state.objects = {};
  state.removed = [];
  state.presigned = [];
});

async function prepared(input = request) {
  const result = await prepareMoment(input);
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

function uploadAll(tickets: { put_url: string; headers: Record<string, string> }[]) {
  for (const t of tickets) {
    const key = t.put_url.replace("https://r2.test/put/", "").replace("?sig=1", "");
    state.objects[key] = { size: Number(t.headers["Content-Length"]), type: t.headers["Content-Type"] };
  }
}

describe("EP-21 prepare_moment", () => {
  it("blocks a moment with 6 photos with too_many_photos (FR-17, BR-06, E-08)", async () => {
    const result = await prepareMoment({ ...request, photos: [1, 2, 3, 4, 5, 6].map(photo) });
    expect(result).toMatchObject({ ok: false, error: { code: "too_many_photos" } });
    expect(state.presigned).toHaveLength(0);
  });

  it("accepts exactly 5 photos", async () => {
    const data = await prepared({ ...request, photos: [1, 2, 3, 4, 5].map(photo) });
    expect(data.tickets.map((t) => t.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("hands out one 10-minute PUT per photo under u/<owner>/pets/<pet>/moments/<moment_id>/<position>-<uuid>-<name>", async () => {
    const data = await prepared();
    const keys = state.presigned.map((p) => p.key);
    expect(keys).toHaveLength(2);
    const momentId = keys[0].split("/")[5];
    expect(momentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[0]).toMatch(new RegExp(`^u/${OWNER}/pets/${LUNA}/moments/${momentId}/1-[0-9a-f-]{36}--trand-1\\.jpg$`));
    expect(keys[1]).toMatch(new RegExp(`^u/${OWNER}/pets/${LUNA}/moments/${momentId}/2-[0-9a-f-]{36}--trand-2\\.jpg$`));
    expect(data.tickets[0]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": "1200001" },
      expires_at: "2026-10-23T08:10:00.000Z",
      file_name: "Štrand 1.JPG",
      position: 1,
      upload_token: data.draft_token,
    });
    expect(data.draft_token).toMatch(/^md_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(data)).not.toContain("r2_key");
  });

  it("writes nothing at step 1", async () => {
    await prepared();
    expect(state.db!.tables.moments).toHaveLength(0);
    expect(state.db!.rpcCalls.map((c) => c.name)).not.toContain("confirm_moment");
  });

  it("rejects other photo types and photos over 10 MB", async () => {
    expect(await prepareMoment({ ...request, photos: [{ ...photo(1), mime_type: "image/gif" }] })).toMatchObject({
      ok: false,
      error: { code: "file_type_not_allowed" },
    });
    expect(await prepareMoment({ ...request, photos: [{ ...photo(1), size_bytes: 10_485_761 }] })).toMatchObject({
      ok: false,
      error: { code: "file_too_large" },
    });
  });

  it("needs a photo or text, a date not in the future and text of at most 280 characters", async () => {
    expect(await prepareMoment({ ...request, text: "  ", photos: [] })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { text: "required" } },
    });
    expect(await prepareMoment({ ...request, moment_date: "2999-01-01" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { moment_date: "out_of_range" } },
    });
    expect(await prepareMoment({ ...request, text: "a".repeat(281) })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { text: "too_long" } },
    });
  });

  it("blocks a Free creator's 6th moment on the pet with premium_required, limit = moments (FR-17, FR-36)", async () => {
    const five = [1, 2, 3, 4, 5].map((i) => ({ id: `m${i}`, pet_id: LUNA, moment_date: "2026-10-01", created_at: "x" }));
    state.db = fakeDb({ premium: false, moments: five });
    expect(await prepareMoment(request)).toMatchObject({
      ok: false,
      error: { code: "premium_required", details: { limit: "moments" } },
    });
  });

  it("lets a Premium creator add a 6th moment (no limit)", async () => {
    const five = [1, 2, 3, 4, 5].map((i) => ({ id: `m${i}`, pet_id: LUNA, moment_date: "2026-10-01", created_at: "x" }));
    state.db = fakeDb({ premium: true, moments: five });
    expect((await prepareMoment(request)).ok).toBe(true);
  });

  it("answers household_read_only for a member of a read-only household and invalid_state for a memorial pet", async () => {
    state.db = fakeDb({ role: "member", canLog: false });
    state.user = MEMBER;
    expect(await prepareMoment(request)).toMatchObject({ ok: false, error: { code: "household_read_only" } });
    state.db = fakeDb({ lifecycle: "memorial" });
    state.user = OWNER;
    expect(await prepareMoment(request)).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { pet_id: "invalid_state" } },
    });
  });

  it("answers not_found for a pet the caller has no relation to", async () => {
    expect(await prepareMoment({ ...request, pet_id: "c1000000-0000-4000-8000-000000000099" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("EP-21 confirm_moment", () => {
  it("verifies every upload with HEAD, then inserts the moment and its photos through rpc:confirm_moment", async () => {
    const data = await prepared();
    uploadAll(data.tickets);
    const result = await confirmMoment({ draft_token: data.draft_token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const call = state.db!.rpcCalls.find((c) => c.name === "confirm_moment")!;
    const keys = state.presigned.filter((p) => p.method === "PUT").map((p) => p.key);
    expect(call.args).toEqual({
      p_moment_id: keys[0].split("/")[5],
      p_pet_id: LUNA,
      p_moment_date: "2026-10-12",
      p_text: "Prvi put na Štrandu.",
      p_photos: [
        { r2_key: keys[0], position: 1 },
        { r2_key: keys[1], position: 2 },
      ],
    });
    expect(result.data).toMatchObject({ pet_id: LUNA, text: "Prvi put na Štrandu.", photo_count: 2, public_link: null });
    expect(result.data.photos.map((p) => p.position)).toEqual([1, 2]);
  });

  it("serves the saved photo through EP-15 (kind moment_photo)", async () => {
    const data = await prepared();
    uploadAll(data.tickets);
    const saved = await confirmMoment({ draft_token: data.draft_token });
    if (!saved.ok) throw new Error(saved.error.code);
    const urls = await getFileUrls({ items: [{ kind: "moment_photo", id: saved.data.photos[0].id }, { kind: "moment_photo", id: "nope" }] });
    expect(urls.ok && urls.data[0].url).toMatch(/^https:\/\/r2\.test\/get\/u\/.+\/1-.+--trand-1.jpg\?sig=1$/);
    expect(urls.ok && urls.data[1].url).toBeNull();
  });

  it("answers not_uploaded while a photo is missing in R2", async () => {
    const data = await prepared();
    expect(await confirmMoment({ draft_token: data.draft_token })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { draft_token: "not_uploaded" } },
    });
    expect(state.db!.tables.moments).toHaveLength(0);
  });

  it("deletes an object whose size or type does not match the ticket", async () => {
    const data = await prepared();
    uploadAll(data.tickets);
    const key = Object.keys(state.objects)[1];
    state.objects[key].size = 99;
    expect(await confirmMoment({ draft_token: data.draft_token })).toMatchObject({ ok: false, error: { code: "file_too_large" } });
    expect(state.removed).toEqual([key]);
  });

  it("rejects a forged, tampered or expired draft token", async () => {
    const data = await prepared();
    uploadAll(data.tickets);
    const [body, signature] = data.draft_token.slice(3).split(".");
    const tampered = `md_${body.slice(0, -2)}AA.${signature}`;
    for (const token of ["nope", tampered, `${data.draft_token}x`]) {
      expect(await confirmMoment({ draft_token: token })).toMatchObject({
        ok: false,
        error: { code: "validation_failed", fields: { draft_token: "invalid" } },
      });
    }
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(await confirmMoment({ draft_token: data.draft_token })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { draft_token: "invalid" } },
    });
    vi.useRealTimers();
  });

  it("confirms a draft only once", async () => {
    const data = await prepared();
    uploadAll(data.tickets);
    expect((await confirmMoment({ draft_token: data.draft_token })).ok).toBe(true);
    expect(await confirmMoment({ draft_token: data.draft_token })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { draft_token: "invalid" } },
    });
  });

  it("maps the Free-limit trigger at step 3 to premium_required, limit = moments", async () => {
    const data = await prepared();
    uploadAll(data.tickets);
    state.db!.rpcError = { code: "P0001", message: "premium_required:moments", details: null };
    expect(await confirmMoment({ draft_token: data.draft_token })).toMatchObject({
      ok: false,
      error: { code: "premium_required", details: { limit: "moments" } },
    });
  });
});

describe("EP-22 delete_moment", () => {
  it("removes the moment with its public link and queues its photo keys; EP-24 then answers 404 (FR-19, BR-45)", async () => {
    const data = await prepared();
    uploadAll(data.tickets);
    const saved = await confirmMoment({ draft_token: data.draft_token });
    if (!saved.ok) throw new Error(saved.error.code);
    state.db!.tables.moment_public_links.push({ id: "l1", moment_id: saved.data.id, slug: SLUG, active: true });
    expect(await getPublicMoment(SLUG)).toMatchObject({ slug: SLUG, pet_name: "Luna" });

    expect(await deleteMoment({ moment_id: saved.data.id })).toEqual({ ok: true, data: { deleted_moment_id: saved.data.id } });
    expect(state.db!.tables.moments).toHaveLength(0);
    expect(state.db!.tables.moment_public_links).toHaveLength(0);
    expect(state.db!.queue).toEqual(state.presigned.filter((p) => p.method === "PUT").map((p) => p.key));
    expect(await getPublicMoment(SLUG)).toBeNull();
  });

  it("answers not_found for a moment the caller cannot see", async () => {
    expect(await deleteMoment({ moment_id: "nope" })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
