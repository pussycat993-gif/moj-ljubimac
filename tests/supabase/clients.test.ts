import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL = "http://127.0.0.1:54321";
const ANON_KEY = "test-anon-key";
const SERVICE_ROLE_KEY = "test-service-role-key";
// Default @supabase/ssr cookie name for the URL above.
const AUTH_COOKIE = "sb-127-auth-token";

type StoredCookie = { name: string; value: string; options?: Record<string, unknown> };

function fakeCookieStore(initial: StoredCookie[] = []) {
  const jar = new Map(initial.map((c) => [c.name, c]));
  return {
    jar,
    getAll: vi.fn(() => [...jar.values()].map(({ name, value }) => ({ name, value }))),
    set: vi.fn((name: string, value: string, options?: Record<string, unknown>) => {
      jar.set(name, { name, value, options });
    }),
  };
}

function sessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated" },
  };
  return { name: AUTH_COOKIE, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock("@supabase/ssr");
  vi.doUnmock("server-only");
});

describe("server client (API §4.1)", () => {
  it("reads the session from the cookie store it is given", async () => {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const store = fakeCookieStore([sessionCookie()]);

    const { data } = await createServerSupabase(store as never).auth.getSession();

    expect(store.getAll).toHaveBeenCalled();
    expect(data.session?.user.id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("writes auth cookies to the cookie store as httpOnly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const store = fakeCookieStore([sessionCookie()]);

    await createServerSupabase(store as never).auth.signOut();

    const written = store.set.mock.calls.filter(([name]) => name.startsWith(AUTH_COOKIE));
    expect(written.length).toBeGreaterThan(0);
    for (const [, , options] of written) {
      expect(options).toMatchObject({ httpOnly: true });
    }
  });
});

describe("browser client (ADR-06)", () => {
  it("is created from the two public variables only", async () => {
    const createBrowserClient = vi.fn(() => ({}));
    vi.doMock("@supabase/ssr", () => ({ createBrowserClient }));
    const { createClient } = await import("@/lib/supabase/browser");

    createClient();

    expect(createBrowserClient).toHaveBeenCalledWith(URL, ANON_KEY);
    expect(JSON.stringify(createBrowserClient.mock.calls)).not.toContain(SERVICE_ROLE_KEY);
  });
});

describe("service-role client (API §3.1)", () => {
  it("imports server-only, so a client import is an error", async () => {
    const source = readFileSync(join(process.cwd(), "lib/supabase/service-role.ts"), "utf8");
    expect(source).toMatch(/^import "server-only";/m);
    // Outside the react-server condition the guard throws on import.
    await expect(import("@/lib/supabase/service-role")).rejects.toThrow();
  });

  it("throws without SUPABASE_SERVICE_ROLE_KEY", async () => {
    vi.doMock("server-only", () => ({}));
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");

    expect(() => createServiceRoleClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("creates a client when the key is set", async () => {
    vi.doMock("server-only", () => ({}));
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");

    expect(createServiceRoleClient()).toBeDefined();
  });
});
