import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-13 request_upload / confirm_upload and EP-15 get_file_urls for pet photos (API §10), with a
// fake server client (RLS-visible pets rows) and a fake R2.

type Row = Record<string, unknown>;

const OWNER = "a1000000-0000-4000-8000-000000000001";
const MEMBER = "a1000000-0000-4000-8000-000000000003";
const LUNA = "c1000000-0000-4000-8000-000000000001";
const OTHER_PET = "c1000000-0000-4000-8000-000000000099";

const state = {
  supabase: null as ReturnType<typeof fakeSupabase> | null,
  queued: [] as Row[],
  objects: {} as Record<string, { size: number; type: string }>,
  removed: [] as string[],
  presigned: [] as { method: string; key: string; opts: unknown }[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.supabase }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      upsert: async (row: Row) => {
        state.queued.push({ table, ...row });
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/integrations/r2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/r2")>("@/lib/integrations/r2");
  return {
    ...actual,
    r2: () => ({
      presignPut: async (key: string, opts: unknown) => {
        state.presigned.push({ method: "PUT", key, opts });
        return { url: `https://r2.test/put/${key}?sig=1`, expires_at: "2026-10-23T08:10:00.000Z" };
      },
      presignGet: async (key: string, opts: unknown) => {
        state.presigned.push({ method: "GET", key, opts });
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

const { requestUpload, confirmUpload } = await import("@/lib/actions/uploads");
const { getFileUrls } = await import("@/lib/actions/files");

function fakeSupabase(userId: string, pets: Row[]) {
  const tables: Record<string, Row[]> = {
    profiles: [{ id: userId, deletion_requested_at: null }],
    organisation_memberships: [],
    pets,
  };
  const updates: { table: string; values: Row; id: unknown }[] = [];
  return {
    updates,
    auth: {
      getUser: async () => ({
        data: { user: { id: userId, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let update: Row | null = null;
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const result = () => {
        const matching = rows();
        if (update) {
          for (const r of matching) Object.assign(r, update);
          updates.push({ table, values: update, id: matching[0]?.id });
        }
        return matching;
      };
      const builder = {
        select: () => builder,
        update: (values: Row) => ((update = values), builder),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), builder),
        maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: result(), error: null }),
      };
      return builder;
    },
  };
}

function luna(extra: Row = {}): Row {
  return {
    id: LUNA,
    owner_id: OWNER,
    organisation_id: null,
    name: "Luna",
    species: "cat",
    sex: "female",
    photo_r2_key: null,
    price_minor: null,
    ...extra,
  };
}

const request = {
  purpose: "pet_photo" as const,
  target_id: LUNA,
  file_name: "Luna Profil.JPG",
  mime_type: "image/jpeg",
  size_bytes: 2048,
};

beforeEach(() => {
  vi.stubEnv("ACTION_TOKEN_SECRET", "test-action-token-secret");
  state.supabase = fakeSupabase(OWNER, [luna()]);
  state.queued = [];
  state.objects = {};
  state.removed = [];
  state.presigned = [];
});

async function ticket() {
  const result = await requestUpload(request);
  if (!result.ok) throw new Error(result.error.code);
  return { ...result.data, key: state.presigned.at(-1)!.key };
}

describe("EP-13 request_upload (pet_photo)", () => {
  it("returns a 10-minute presigned PUT under u/<owner_id>/pets/<pet_id>/photo/<uuid>-<safe_file_name>", async () => {
    const t = await ticket();
    expect(t.key).toMatch(new RegExp(`^u/${OWNER}/pets/${LUNA}/photo/[0-9a-f-]{36}-luna-profil\\.jpg$`));
    expect(t.method).toBe("PUT");
    expect(t.headers).toEqual({ "Content-Type": "image/jpeg", "Content-Length": "2048" });
    expect(t.expires_at).toBe("2026-10-23T08:10:00.000Z");
    expect(t.file_name).toBe("Luna Profil.JPG");
    expect(t.position).toBeNull();
    expect(t.upload_token).toMatch(/^up_[\w-]+\.[\w-]+$/);
    expect(JSON.stringify(t)).not.toContain(`"r2_key"`);
    expect(state.presigned[0].opts).toEqual({ contentType: "image/jpeg", contentLength: 2048 });
  });

  it("organisation animals use the o/<org_id>/ prefix", async () => {
    const ORG = "b2000000-0000-4000-8000-000000000001";
    const client = fakeSupabase(OWNER, [luna({ owner_id: null, organisation_id: ORG })]);
    client.from = ((orig) => (table: string) => {
      if (table === "organisation_memberships") {
        const rows = [{ organisation_id: ORG, organisations: { approval_status: "approved" } }];
        const b = { select: () => b, eq: () => b, then: (r: (v: unknown) => void) => r({ data: rows, error: null }) };
        return b as never;
      }
      return orig.call(client, table);
    })(client.from);
    state.supabase = client;
    await ticket();
    expect(state.presigned[0].key).toMatch(new RegExp(`^o/${ORG}/pets/${LUNA}/photo/`));
  });

  it("a file over 10 MB → file_too_large (BR-05)", async () => {
    const result = await requestUpload({ ...request, size_bytes: 10_485_761 });
    expect(result).toMatchObject({ ok: false, error: { code: "file_too_large" } });
    expect(state.presigned).toHaveLength(0);
  });

  it("10 MB exactly is allowed", async () => {
    expect((await requestUpload({ ...request, size_bytes: 10_485_760 })).ok).toBe(true);
  });

  it.each(["application/pdf", "image/gif", "text/plain"])("type %s → file_type_not_allowed", async (mime) => {
    const result = await requestUpload({ ...request, mime_type: mime });
    expect(result).toMatchObject({ ok: false, error: { code: "file_type_not_allowed" } });
  });

  it("purpose attachment is handled since Step 15: a pet id is not a vet visit → not_found", async () => {
    const result = await requestUpload({ ...request, purpose: "attachment" });
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("a household member → forbidden_role", async () => {
    state.supabase = fakeSupabase(MEMBER, [luna()]);
    expect(await requestUpload(request)).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
  });

  it("a pet the caller has no relation to → not_found", async () => {
    expect(await requestUpload({ ...request, target_id: OTHER_PET })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("EP-13 confirm_upload (pet_photo)", () => {
  it("bad or tampered token → validation_failed (upload_token = invalid)", async () => {
    const t = await ticket();
    for (const token of ["nonsense", `${t.upload_token}x`, t.upload_token.replace("up_", "up_A")]) {
      expect(await confirmUpload({ upload_token: token })).toMatchObject({
        ok: false,
        error: { code: "validation_failed", fields: { upload_token: "invalid" } },
      });
    }
  });

  it("expired token → invalid", async () => {
    const t = await ticket();
    vi.useFakeTimers({ now: Date.now() + 11 * 60 * 1000 });
    try {
      expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({
        ok: false,
        error: { fields: { upload_token: "invalid" } },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("object missing in R2 → validation_failed (upload_token = not_uploaded)", async () => {
    const t = await ticket();
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { upload_token: "not_uploaded" } },
    });
  });

  it("HEAD size mismatch → the object is deleted and file_too_large", async () => {
    const t = await ticket();
    state.objects[t.key] = { size: 99_999_999, type: "image/jpeg" };
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({ ok: false, error: { code: "file_too_large" } });
    expect(state.removed).toEqual([t.key]);
    expect(state.supabase!.updates).toHaveLength(0);
  });

  it("HEAD content-type mismatch → the object is deleted and file_type_not_allowed", async () => {
    const t = await ticket();
    state.objects[t.key] = { size: 2048, type: "application/pdf" };
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({
      ok: false,
      error: { code: "file_type_not_allowed" },
    });
    expect(state.removed).toEqual([t.key]);
  });

  it("sets pets.photo_r2_key, returns the Pet without the key, and queues the old key", async () => {
    state.supabase = fakeSupabase(OWNER, [luna({ photo_r2_key: `u/${OWNER}/pets/${LUNA}/photo/old-luna.jpg` })]);
    const t = await ticket();
    state.objects[t.key] = { size: 2048, type: "image/jpeg" };
    const result = await confirmUpload({ upload_token: t.upload_token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state.supabase!.updates).toEqual([{ table: "pets", values: { photo_r2_key: t.key }, id: LUNA }]);
    expect(result.data).toMatchObject({ id: LUNA, has_photo: true, photo_file_name: t.key.split("/").pop() });
    expect(result.data).not.toHaveProperty("photo_r2_key");
    expect(state.queued).toEqual([{ table: "r2_deletion_queue", r2_key: `u/${OWNER}/pets/${LUNA}/photo/old-luna.jpg` }]);
    expect(state.removed).toHaveLength(0);
  });

  it("first photo: nothing to queue", async () => {
    const t = await ticket();
    state.objects[t.key] = { size: 2048, type: "image/jpeg" };
    expect((await confirmUpload({ upload_token: t.upload_token })).ok).toBe(true);
    expect(state.queued).toHaveLength(0);
  });
});

describe("EP-15 get_file_urls (pet_photo)", () => {
  it("1–50 items, else validation_failed (items = out_of_range)", async () => {
    for (const items of [[], Array.from({ length: 51 }, () => ({ kind: "pet_photo" as const, id: LUNA }))]) {
      expect(await getFileUrls({ items })).toMatchObject({
        ok: false,
        error: { code: "validation_failed", fields: { items: "out_of_range" } },
      });
    }
  });

  it("presigned GET for a visible pet's photo; url = null for an invisible pet or no photo, in request order", async () => {
    const key = `u/${OWNER}/pets/${LUNA}/photo/0b1c-luna.jpg`;
    state.supabase = fakeSupabase(OWNER, [luna({ photo_r2_key: key }), luna({ id: "c1000000-0000-4000-8000-000000000002", photo_r2_key: null })]);
    const result = await getFileUrls({
      items: [
        { kind: "pet_photo", id: OTHER_PET },
        { kind: "pet_photo", id: LUNA },
        { kind: "pet_photo", id: "c1000000-0000-4000-8000-000000000002" },
      ],
    });
    expect(result).toEqual({
      ok: true,
      data: [
        { kind: "pet_photo", id: OTHER_PET, url: null, expires_at: null, mime_type: null },
        { kind: "pet_photo", id: LUNA, url: `https://r2.test/get/${key}?sig=1`, expires_at: "2026-10-23T08:10:00.000Z", mime_type: null },
        { kind: "pet_photo", id: "c1000000-0000-4000-8000-000000000002", url: null, expires_at: null, mime_type: null },
      ],
    });
    expect(state.presigned).toEqual([{ method: "GET", key, opts: { fileName: "0b1c-luna.jpg" } }]);
  });
});
