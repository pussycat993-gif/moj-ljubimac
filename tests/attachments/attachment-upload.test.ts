import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-08 / BR-05 / BR-01 — EP-13 request_upload / confirm_upload with purpose `attachment` and EP-15
// get_file_urls with kind `attachment` (API §10), with a fake server client (RLS-visible rows) and a
// fake R2: ticket → PUT → confirm inserts the attachments row under the visit; the file can then be
// opened through a presigned GET; other types / sizes are rejected; a HEAD mismatch deletes the object;
// the Free limit (10 per pet) is checked at ticket time and by the insert trigger at confirm.

type Row = Record<string, unknown>;

const OWNER = "a1000000-0000-4000-8000-000000000001";
const MEMBER = "a1000000-0000-4000-8000-000000000003";
const ORG = "b2000000-0000-4000-8000-000000000001";
const LUNA = "c1000000-0000-4000-8000-000000000001";
const VISIT = "c3000000-0000-4000-8000-000000000001";
const OTHER_VISIT = "c3000000-0000-4000-8000-000000000099";

const state = {
  supabase: null as ReturnType<typeof fakeSupabase> | null,
  objects: {} as Record<string, { size: number; type: string }>,
  removed: [] as string[],
  presigned: [] as { method: string; key: string; opts: unknown }[],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.supabase }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ from: () => ({}) }) }));
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

function fakeSupabase(
  userId: string,
  { premium = false, attachments = [] as Row[], organisations = [] as Row[], pet = {} as Row, insertError = null as Row | null } = {},
) {
  const tables: Record<string, Row[]> = {
    profiles: [{ id: userId, deletion_requested_at: null }],
    organisation_memberships: organisations,
    pets: [{ id: LUNA, owner_id: OWNER, organisation_id: null, photo_r2_key: null, ...pet }],
    vet_visits: [{ id: VISIT, pet_id: LUNA }],
    attachments,
  };
  const inserted: Row[] = [];
  return {
    inserted,
    auth: {
      getUser: async () => ({
        data: { user: { id: userId, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    rpc: async (name: string) => (name === "is_premium" ? { data: premium, error: null } : { data: null, error: null }),
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let countHead = false;
      let insert: Row | null = null;
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const builder = {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => ((countHead = !!opts?.head), builder),
        insert: (row: Row) => ((insert = row), builder),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), builder),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => {
          if (insertError) return { data: null, error: insertError };
          const row = { id: "a-new", created_by: userId, created_at: "2026-10-23T08:00:00Z", ...insert! };
          inserted.push(row);
          tables[table].push(row);
          return { data: row, error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          resolve(countHead ? { data: null, count: rows().length, error: null } : { data: rows(), error: null }),
      };
      return builder;
    },
  };
}

const request = {
  purpose: "attachment" as const,
  target_id: VISIT,
  file_name: "Nalaz Oko 02.10.2026.PDF",
  mime_type: "application/pdf",
  size_bytes: 860_000,
};

function saved(i: number): Row {
  return { id: `a${i}`, pet_id: LUNA, vet_visit_id: VISIT, r2_key: `k${i}`, file_name: `f${i}.pdf`, mime_type: "application/pdf" };
}

beforeEach(() => {
  vi.stubEnv("ACTION_TOKEN_SECRET", "test-action-token-secret");
  state.supabase = fakeSupabase(OWNER);
  state.objects = {};
  state.removed = [];
  state.presigned = [];
});

async function ticket(input = request) {
  const result = await requestUpload(input);
  if (!result.ok) throw new Error(result.error.code);
  return { ...result.data, key: state.presigned.at(-1)!.key };
}

describe("EP-13 request_upload (attachment)", () => {
  it("returns a 10-minute presigned PUT under u/<owner_id>/pets/<pet_id>/visits/<vet_visit_id>/<uuid>-<safe_file_name>", async () => {
    const t = await ticket();
    expect(t.key).toMatch(new RegExp(`^u/${OWNER}/pets/${LUNA}/visits/${VISIT}/[0-9a-f-]{36}-nalaz-oko-02\\.10\\.2026\\.pdf$`));
    expect(t.method).toBe("PUT");
    expect(t.headers).toEqual({ "Content-Type": "application/pdf", "Content-Length": "860000" });
    expect(t.expires_at).toBe("2026-10-23T08:10:00.000Z");
    expect(t.file_name).toBe("Nalaz Oko 02.10.2026.PDF");
    expect(t.position).toBeNull();
    expect(JSON.stringify(t)).not.toContain(`"r2_key"`);
    expect(state.presigned[0].opts).toEqual({ contentType: "application/pdf", contentLength: 860_000 });
  });

  it("FR-08: any image type is accepted, not only the pet-photo formats", async () => {
    expect((await requestUpload({ ...request, file_name: "rtg.gif", mime_type: "image/gif" })).ok).toBe(true);
    expect((await requestUpload({ ...request, file_name: "luna.heic", mime_type: "image/heic" })).ok).toBe(true);
  });

  it("FR-08: a file over 10 MB → file_too_large; exactly 10 MB is allowed (BR-05, NFR-09)", async () => {
    expect(await requestUpload({ ...request, size_bytes: 10_485_761 })).toMatchObject({ ok: false, error: { code: "file_too_large" } });
    expect(state.presigned).toHaveLength(0);
    expect((await requestUpload({ ...request, size_bytes: 10_485_760 })).ok).toBe(true);
  });

  it("FR-08: another type → file_type_not_allowed (BR-05)", async () => {
    for (const mime_type of ["video/mp4", "application/msword", "text/plain"]) {
      expect(await requestUpload({ ...request, mime_type })).toMatchObject({ ok: false, error: { code: "file_type_not_allowed" } });
    }
    expect(state.presigned).toHaveLength(0);
  });

  it("FR-08 / FR-36: a Free owner's pet with 10 attachments → premium_required (limit = attachments) at ticket time", async () => {
    state.supabase = fakeSupabase(OWNER, { attachments: Array.from({ length: 10 }, (_, i) => saved(i)) });
    expect(await requestUpload(request)).toMatchObject({
      ok: false,
      error: { code: "premium_required", details: { limit: "attachments" } },
    });
    expect(state.presigned).toHaveLength(0);
  });

  it("FR-08: 9 attachments on Free → the 10th is still allowed", async () => {
    state.supabase = fakeSupabase(OWNER, { attachments: Array.from({ length: 9 }, (_, i) => saved(i)) });
    expect((await requestUpload(request)).ok).toBe(true);
  });

  it("FR-08: Premium has no per-pet limit", async () => {
    state.supabase = fakeSupabase(OWNER, { premium: true, attachments: Array.from({ length: 25 }, (_, i) => saved(i)) });
    expect((await requestUpload(request)).ok).toBe(true);
  });

  it("organisation animals: o/<org_id>/ prefix and no Free limit", async () => {
    state.supabase = fakeSupabase(MEMBER, {
      pet: { owner_id: null, organisation_id: ORG },
      organisations: [{ organisation_id: ORG, user_id: MEMBER, organisations: { approval_status: "approved" } }],
      attachments: Array.from({ length: 12 }, (_, i) => saved(i)),
    });
    await ticket();
    expect(state.presigned[0].key).toMatch(new RegExp(`^o/${ORG}/pets/${LUNA}/visits/${VISIT}/`));
  });

  it("a household member → forbidden_role (FR-28); an unknown visit → not_found", async () => {
    state.supabase = fakeSupabase(MEMBER);
    expect(await requestUpload(request)).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    state.supabase = fakeSupabase(OWNER);
    expect(await requestUpload({ ...request, target_id: OTHER_VISIT })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("EP-13 confirm_upload (attachment)", () => {
  it("FR-08: HEAD matches → inserts attachments under the visit and returns the Attachment without the key", async () => {
    const t = await ticket();
    state.objects[t.key] = { size: 860_000, type: "application/pdf" };
    const result = await confirmUpload({ upload_token: t.upload_token });
    expect(result.ok).toBe(true);
    expect(state.supabase!.inserted).toEqual([
      expect.objectContaining({
        vet_visit_id: VISIT,
        pet_id: LUNA,
        r2_key: t.key,
        file_name: "Nalaz Oko 02.10.2026.PDF",
        mime_type: "application/pdf",
        size_bytes: 860_000,
      }),
    ]);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ vet_visit_id: VISIT, file_name: "Nalaz Oko 02.10.2026.PDF", size_bytes: 860_000 });
    expect(state.removed).toHaveLength(0);
  });

  it("FR-08: HEAD size mismatch → the object is deleted and file_too_large", async () => {
    const t = await ticket();
    state.objects[t.key] = { size: 20_000_000, type: "application/pdf" };
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({ ok: false, error: { code: "file_too_large" } });
    expect(state.removed).toEqual([t.key]);
    expect(state.supabase!.inserted).toHaveLength(0);
  });

  it("FR-08: HEAD content-type mismatch → the object is deleted and file_type_not_allowed", async () => {
    const t = await ticket();
    state.objects[t.key] = { size: 860_000, type: "video/mp4" };
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({
      ok: false,
      error: { code: "file_type_not_allowed" },
    });
    expect(state.removed).toEqual([t.key]);
    expect(state.supabase!.inserted).toHaveLength(0);
  });

  it("object missing in R2 → validation_failed (upload_token = not_uploaded)", async () => {
    const t = await ticket();
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { upload_token: "not_uploaded" } },
    });
  });

  it("FR-08 / FR-36: the insert trigger's premium_required:attachments at confirm → premium_required (limit = attachments)", async () => {
    const t = await ticket();
    state.objects[t.key] = { size: 860_000, type: "application/pdf" };
    state.supabase = fakeSupabase(OWNER, { insertError: { code: "P0001", message: "premium_required:attachments" } });
    expect(await confirmUpload({ upload_token: t.upload_token })).toMatchObject({
      ok: false,
      error: { code: "premium_required", details: { limit: "attachments" } },
    });
  });

  it("a tampered token → validation_failed (upload_token = invalid)", async () => {
    const t = await ticket();
    const [body, sig] = t.upload_token.slice(3).split(".");
    expect(await confirmUpload({ upload_token: `up_${body}x.${sig}` })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { upload_token: "invalid" } },
    });
  });
});

describe("EP-15 get_file_urls (attachment)", () => {
  it("FR-08: a stored attachment can be opened — presigned GET with its file name and mime type; unseen → url = null", async () => {
    const key = `u/${OWNER}/pets/${LUNA}/visits/${VISIT}/0b1c-nalaz.pdf`;
    state.supabase = fakeSupabase(OWNER, {
      attachments: [{ id: "a1", pet_id: LUNA, vet_visit_id: VISIT, r2_key: key, file_name: "nalaz.pdf", mime_type: "application/pdf" }],
    });
    const result = await getFileUrls({
      items: [
        { kind: "attachment", id: "a1" },
        { kind: "attachment", id: "a-hidden" },
      ],
    });
    expect(result).toEqual({
      ok: true,
      data: [
        {
          kind: "attachment",
          id: "a1",
          url: `https://r2.test/get/${key}?sig=1`,
          expires_at: "2026-10-23T08:10:00.000Z",
          mime_type: "application/pdf",
        },
        { kind: "attachment", id: "a-hidden", url: null, expires_at: null, mime_type: null },
      ],
    });
    expect(state.presigned).toEqual([{ method: "GET", key, opts: { fileName: "nalaz.pdf" } }]);
  });
});
