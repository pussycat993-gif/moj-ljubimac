import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const USER_ID = "00000000-0000-0000-0000-000000000001";
const supabase = { current: null as unknown };

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }));

// next/navigation's redirect throws; the test reads the target from the thrown error.
class RedirectError extends Error {
  constructor(public readonly location: string) {
    super(`NEXT_REDIRECT:${location}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectError(location);
  },
}));

const { default: RootPage } = await import("@/app/page");

// The server client: auth.getUser plus the profile and membership reads of postSignInPath.
function fakeSupabase({
  user = { id: USER_ID, email: "ivana.petrovic@gmail.com", email_confirmed_at: "2026-10-01T08:00:00Z" } as Row | null,
  profile = { id: USER_ID, deletion_requested_at: null } as Row | null,
  memberships = [] as Row[],
} = {}) {
  const tables: Record<string, Row[]> = {
    profiles: profile ? [profile] : [],
    organisation_memberships: memberships.map((m) => ({ user_id: USER_ID, ...m })),
  };
  supabase.current = {
    auth: {
      getUser: vi.fn(async () =>
        user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { name: "AuthSessionMissingError", message: "Auth session missing!" } },
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
}

async function rootRedirect(): Promise<string> {
  try {
    await RootPage();
  } catch (error) {
    if (error instanceof RedirectError) return error.location;
    throw error;
  }
  throw new Error("RootPage did not redirect");
}

beforeEach(() => {
  supabase.current = null;
});

describe("/ (site root)", () => {
  it("sends a visitor without a session to /prijava", async () => {
    fakeSupabase({ user: null });
    expect(await rootRedirect()).toBe("/prijava");
  });

  it("sends a signed-in owner to /ljubimci", async () => {
    fakeSupabase();
    expect(await rootRedirect()).toBe("/ljubimci");
  });

  it("sends a signed-in user where the EP-42 redirect does", async () => {
    fakeSupabase({ profile: null });
    expect(await rootRedirect()).toBe("/registracija");

    fakeSupabase({ profile: { id: USER_ID, deletion_requested_at: "2026-10-20T08:00:00Z" } });
    expect(await rootRedirect()).toBe("/profil/podaci");

    fakeSupabase({ memberships: [{ organisation_id: "org-1", organisations: { approval_status: "approved" } }] });
    expect(await rootRedirect()).toBe("/organizacija");
  });
});
