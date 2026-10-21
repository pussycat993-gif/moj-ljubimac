import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const USER_ID = "00000000-0000-0000-0000-000000000001";
const supabase = { current: null as unknown };

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }));

const { GET } = await import("@/app/(auth)/auth/callback/route");

// The server client after a link click: exchangeCodeForSession plus the profile and
// membership reads the redirect matrix needs.
function fakeSupabase({
  exchange = "ok" as "ok" | "used",
  profile = { id: USER_ID, deletion_requested_at: null } as Row | null,
  memberships = [] as Row[],
} = {}) {
  const tables: Record<string, Row[]> = {
    profiles: profile ? [profile] : [],
    organisation_memberships: memberships.map((m) => ({ user_id: USER_ID, ...m })),
  };
  const client = {
    auth: {
      exchangeCodeForSession: vi.fn(async () =>
        exchange === "ok"
          ? { data: { user: { id: USER_ID }, session: {} }, error: null }
          : { data: { user: null, session: null }, error: { name: "AuthApiError", message: "invalid flow state" } },
      ),
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const matching = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: matching(), error: null }),
      };
      return builder;
    },
  };
  supabase.current = client;
  return client;
}

async function callback(query: string) {
  const response = await GET(new NextRequest(`http://localhost:3000/auth/callback${query}`));
  return { status: response.status, location: response.headers.get("location") };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /auth/callback (EP-42)", () => {
  it("exchanges the code for the cookie session", async () => {
    const client = fakeSupabase();
    await callback("?code=abc");
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("no profiles row → S15 completion step", async () => {
    fakeSupabase({ profile: null });
    expect((await callback("?code=abc")).location).toBe("http://localhost:3000/registracija");
  });

  it("deletion requested → /profil/podaci", async () => {
    fakeSupabase({ profile: { id: USER_ID, deletion_requested_at: "2026-10-20T10:00:00Z" } });
    expect((await callback("?code=abc&next=/podsetnici")).location).toBe("http://localhost:3000/profil/podaci");
  });

  it("organisation member → /organizacija", async () => {
    fakeSupabase({ memberships: [{ organisation_id: "org-1", organisations: { approval_status: "pending" } }] });
    expect((await callback("?code=abc")).location).toBe("http://localhost:3000/organizacija");
  });

  it("otherwise → /ljubimci", async () => {
    fakeSupabase();
    const { status, location } = await callback("?code=abc");
    expect(status).toBe(307);
    expect(location).toBe("http://localhost:3000/ljubimci");
  });

  it("otherwise → the next path when one is given", async () => {
    fakeSupabase();
    expect((await callback("?code=abc&next=%2Fpoziv%2Fhh_abc")).location).toBe("http://localhost:3000/poziv/hh_abc");
  });

  it.each(["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)"])(
    "an external next (%s) is refused → /ljubimci",
    async (next) => {
      fakeSupabase();
      expect((await callback(`?code=abc&next=${encodeURIComponent(next)}`)).location).toBe(
        "http://localhost:3000/ljubimci",
      );
    },
  );

  it("a password-reset link leads to S28 /prijava/nova-lozinka", async () => {
    fakeSupabase({ memberships: [{ organisation_id: "org-1", organisations: { approval_status: "approved" } }] });
    expect((await callback("?code=abc&next=/prijava/nova-lozinka")).location).toBe(
      "http://localhost:3000/prijava/nova-lozinka",
    );
  });

  it("a used or expired reset link still lands on S28, which then shows link-expired", async () => {
    fakeSupabase({ exchange: "used" });
    expect((await callback("?code=abc&next=/prijava/nova-lozinka")).location).toBe(
      "http://localhost:3000/prijava/nova-lozinka",
    );
    expect(
      (await callback("?error=access_denied&error_code=otp_expired&next=/prijava/nova-lozinka")).location,
    ).toBe("http://localhost:3000/prijava/nova-lozinka");
  });

  it("a failed exchange of any other link → /prijava", async () => {
    fakeSupabase({ exchange: "used" });
    expect((await callback("?code=abc")).location).toBe("http://localhost:3000/prijava");
    expect((await callback("")).location).toBe("http://localhost:3000/prijava");
  });
});
