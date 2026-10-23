import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const USER_ID = "00000000-0000-0000-0000-000000000012";
const CITY_ID = "11111111-1111-4111-8111-111111111111";
const supabase = { current: null as ReturnType<typeof fakeSupabase> | null };

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }));

const { completeRegistration, signUp } = await import("@/lib/actions/registration");
const { GET } = await import("@/app/(auth)/auth/callback/route");
const { TERMS_VERSION } = await import("@/lib/legal");

// The server client: auth user, the tables EP-41 writes, and rpc:get_me computed from them
// the way the database does (BR-32: shelter → pending, breeder → approved; creator → admin).
function fakeSupabase({
  verified = true,
  profile = null as Row | null,
  metadata = {} as Row,
  slugTaken = [] as string[],
} = {}) {
  const tables: Record<string, Row[]> = {
    profiles: profile ? [profile] : [],
    organisations: [],
    organisation_memberships: [],
    cities: [{ id: CITY_ID, name_sr: "Bečej", name_en: "Becej", latitude: 45.6, longitude: 20.0 }],
  };
  const user = {
    id: USER_ID,
    email: "novi@mojljubimac.test",
    email_confirmed_at: verified ? "2026-10-22T10:00:00Z" : null,
    user_metadata: metadata,
  };
  const inserts: { table: string; row: Row }[] = [];
  const client = {
    tables,
    inserts,
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
      exchangeCodeForSession: vi.fn(async () => ({ data: { user, session: {} }, error: null })),
      signUp: vi.fn(async () => ({ data: { user: { id: USER_ID, identities: [{}] }, session: null }, error: null })),
    },
    rpc: vi.fn(async (name: string) => {
      if (name !== "get_me") throw new Error(name);
      const p = tables.profiles[0];
      if (!p) return { data: null, error: null };
      const m = tables.organisation_memberships[0];
      const o = m ? tables.organisations.find((org) => org.id === m.organisation_id) : undefined;
      return {
        data: {
          id: p.id,
          email: p.email,
          account_type: p.account_type,
          locale: p.locale,
          terms_version: p.terms_version,
          organisation: o ? { id: o.id, name: o.name, type: o.type, slug: o.slug, role: m.role, approval_status: o.approval_status } : null,
        },
        error: null,
      };
    }),
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const matching = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        order: () => builder,
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: matching(), error: null }),
        insert: async (row: Row) => {
          inserts.push({ table, row });
          if (table === "organisations") {
            if (slugTaken.includes(row.slug as string)) return { error: { code: "23505", message: "duplicate key" } };
            tables.organisations.push({ ...row, approval_status: row.type === "shelter" ? "pending" : "approved" });
            tables.organisation_memberships.push({
              organisation_id: row.id,
              user_id: row.created_by,
              role: "admin",
              organisations: { approval_status: row.type === "shelter" ? "pending" : "approved" },
            });
          } else {
            tables[table].push(row);
          }
          return { error: null };
        },
      };
      return builder;
    },
  };
  supabase.current = client;
  return client;
}

const owner = { account_type: "owner" as const, locale: "sr-Latn" as const, terms_version: TERMS_VERSION };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("action:complete_registration (EP-41)", () => {
  it("inserts the profile with the chosen account type, locale and TERMS_VERSION", async () => {
    const client = fakeSupabase();
    const result = await completeRegistration({ ...owner, locale: "en" });
    expect(result.ok).toBe(true);
    const profile = client.inserts.find((i) => i.table === "profiles")!.row;
    expect(profile).toMatchObject({
      id: USER_ID,
      account_type: "owner",
      locale: "en",
      email: "novi@mojljubimac.test",
      terms_version: TERMS_VERSION,
    });
    expect(typeof profile.terms_accepted_at).toBe("string");
    expect(client.inserts.some((i) => i.table === "organisations")).toBe(false);
    if (result.ok) expect(result.data.terms_version).toBe(TERMS_VERSION);
  });

  it("rejects any other terms version with fields.terms_version = outdated and writes nothing", async () => {
    const client = fakeSupabase();
    const result = await completeRegistration({ ...owner, terms_version: "2020-01-01" });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { terms_version: "outdated" } } });
    expect(client.inserts).toHaveLength(0);
  });

  it("a missing terms version → fields.terms_version = required", async () => {
    fakeSupabase();
    const result = await completeRegistration({ ...owner, terms_version: "" });
    expect(result).toMatchObject({ ok: false, error: { fields: { terms_version: "required" } } });
  });

  it("shelter: inserts the organisation (pending) with the creator as admin", async () => {
    const client = fakeSupabase();
    const result = await completeRegistration({
      account_type: "shelter",
      locale: "sr-Latn",
      terms_version: TERMS_VERSION,
      org_name: "Udruženje „Druga šansa”",
      city_id: CITY_ID,
      tax_id: "108765432",
    });
    expect(result.ok).toBe(true);
    const org = client.inserts.find((i) => i.table === "organisations")!.row;
    expect(org).toMatchObject({
      type: "shelter",
      name: "Udruženje „Druga šansa”",
      slug: "udruzenje-druga-sansa",
      city_id: CITY_ID,
      tax_id: "108765432",
      created_by: USER_ID,
    });
    if (result.ok) expect(result.data.organisation).toMatchObject({ approval_status: "pending", role: "admin", type: "shelter" });
  });

  it("breeder: the organisation is approved (BR-32)", async () => {
    fakeSupabase();
    const result = await completeRegistration({
      account_type: "breeder",
      locale: "sr-Latn",
      terms_version: TERMS_VERSION,
      org_name: "Odgajivačnica Đurđevak",
      city_id: CITY_ID,
    });
    expect(result.ok && result.data.organisation).toMatchObject({ approval_status: "approved", role: "admin", slug: "odgajivacnica-djurdjevak" });
  });

  it("a taken slug gets a suffix", async () => {
    const client = fakeSupabase({ slugTaken: ["azil-sapica"] });
    await completeRegistration({ account_type: "shelter", locale: "sr-Latn", terms_version: TERMS_VERSION, org_name: "Azil Šapica", city_id: CITY_ID });
    const slugs = client.inserts.filter((i) => i.table === "organisations").map((i) => i.row.slug as string);
    expect(slugs[0]).toBe("azil-sapica");
    expect(slugs[1]).toMatch(/^azil-sapica-[0-9a-f]{6}$/);
  });

  it("shelter/breeder need an organisation name and an existing city", async () => {
    const client = fakeSupabase();
    const result = await completeRegistration({
      account_type: "shelter",
      locale: "sr-Latn",
      terms_version: TERMS_VERSION,
      org_name: " ",
      city_id: "22222222-2222-4222-8222-222222222222",
      tax_id: "12",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { org_name: "invalid", city_id: "unknown", tax_id: "invalid" } },
    });
    expect(client.inserts).toHaveLength(0);
  });

  it("is idempotent: an existing profile returns Me unchanged and inserts nothing", async () => {
    const client = fakeSupabase({
      profile: { id: USER_ID, account_type: "owner", locale: "sr-Latn", email: "novi@mojljubimac.test", terms_version: "seed", deletion_requested_at: null },
    });
    const result = await completeRegistration({ ...owner, account_type: "breeder", org_name: "X", city_id: CITY_ID });
    expect(result.ok && result.data).toMatchObject({ account_type: "owner", terms_version: "seed" });
    expect(client.inserts).toHaveLength(0);
  });

  it("refuses an unverified email (403 email_not_verified)", async () => {
    const client = fakeSupabase({ verified: false });
    expect(await completeRegistration(owner)).toMatchObject({ ok: false, error: { code: "email_not_verified" } });
    expect(client.inserts).toHaveLength(0);
  });
});

describe("EP-41 sign-up", () => {
  it("sends the payload as user_metadata with terms_version = TERMS_VERSION and redirects to /auth/callback", async () => {
    const client = fakeSupabase();
    const result = await signUp({ ...owner, email: "novi@mojljubimac.test", password: "dugalozinka" });
    expect(result).toEqual({ ok: true, data: { email: "novi@mojljubimac.test" } });
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "novi@mojljubimac.test",
      password: "dugalozinka",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback",
        data: expect.objectContaining({ account_type: "owner", locale: "sr-Latn", terms_version: TERMS_VERSION }),
      },
    });
  });

  it("an address that already has an account → fields.email = taken", async () => {
    const client = fakeSupabase();
    client.auth.signUp.mockResolvedValueOnce({ data: { user: { id: USER_ID, identities: [] }, session: null }, error: null });
    expect(await signUp({ ...owner, email: "ivana@mojljubimac.test", password: "dugalozinka" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { email: "taken" } },
    });
  });

  it("validates email, password and terms version before calling Supabase", async () => {
    const client = fakeSupabase();
    const result = await signUp({ ...owner, terms_version: "old", email: "ivana@gmail", password: "maks" });
    expect(result).toMatchObject({
      ok: false,
      error: { fields: { email: "invalid", password: "too_weak", terms_version: "outdated" } },
    });
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });
});

describe("GET /auth/callback completes the registration (EP-41/EP-42)", () => {
  it("a verified sign-up without a profile is completed from user_metadata, then redirected", async () => {
    const client = fakeSupabase({
      metadata: { account_type: "shelter", locale: "en", terms_version: TERMS_VERSION, org_name: "Azil Nada", city_id: CITY_ID },
    });
    const response = await GET(new NextRequest("http://localhost:3000/auth/callback?code=abc"));
    expect(client.inserts.find((i) => i.table === "profiles")!.row).toMatchObject({ account_type: "shelter", locale: "en" });
    expect(client.inserts.find((i) => i.table === "organisations")!.row).toMatchObject({ name: "Azil Nada" });
    expect(response.headers.get("location")).toBe("http://localhost:3000/organizacija");
  });

  it("an owner sign-up lands on /ljubimci", async () => {
    fakeSupabase({ metadata: { account_type: "owner", locale: "sr-Latn", terms_version: TERMS_VERSION } });
    const response = await GET(new NextRequest("http://localhost:3000/auth/callback?code=abc"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/ljubimci");
  });

  it("an outdated terms version in the metadata → the S15 completion step", async () => {
    const client = fakeSupabase({ metadata: { account_type: "owner", locale: "sr-Latn", terms_version: "old" } });
    const response = await GET(new NextRequest("http://localhost:3000/auth/callback?code=abc"));
    expect(client.inserts).toHaveLength(0);
    expect(response.headers.get("location")).toBe("http://localhost:3000/registracija");
  });

  it("a first Google sign-in (no account type in metadata) → the S15 completion step", async () => {
    const client = fakeSupabase({ metadata: { full_name: "Ivana Petrović" } });
    const response = await GET(new NextRequest("http://localhost:3000/auth/callback?code=abc"));
    expect(client.inserts).toHaveLength(0);
    expect(response.headers.get("location")).toBe("http://localhost:3000/registracija");
  });
});
