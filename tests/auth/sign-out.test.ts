import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const URL = "http://127.0.0.1:54321";
const AUTH_COOKIE = "sb-127-auth-token";
const USER = { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated" };

type StoredCookie = { name: string; value: string; options?: Record<string, unknown> };

// next/headers cookie store of the server action's request.
const jar = new Map<string, StoredCookie>();
const cookieStore = {
  getAll: () => [...jar.values()].filter((c) => c.value !== "").map(({ name, value }) => ({ name, value })),
  set: (name: string, value: string, options?: Record<string, unknown>) => jar.set(name, { name, value, options }),
};

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
}));

class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

function sessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: USER,
  };
  return `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  jar.clear();
  jar.set(AUTH_COOKIE, { name: AUTH_COOKIE, value: sessionCookie() });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("signOut (FR-34, EP-42)", () => {
  it("revokes the session, clears the httpOnly cookies and redirects to /prijava", async () => {
    const fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const { signOut } = await import("@/lib/actions/auth");

    await expect(signOut()).rejects.toMatchObject({ url: "/prijava" });

    expect(fetch.mock.calls.some(([input]) => String(input).includes("/auth/v1/logout"))).toBe(true);
    const cleared = jar.get(AUTH_COOKIE)!;
    expect(cleared.value).toBe("");
    expect(cleared.options).toMatchObject({ httpOnly: true, maxAge: 0 });
  });

  it("still clears the cookies when the server-side revoke fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "boom" }, { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { signOut } = await import("@/lib/actions/auth");

    await expect(signOut()).rejects.toMatchObject({ url: "/prijava" });

    expect(jar.get(AUTH_COOKIE)!.value).toBe("");
  });

  it("afterwards no data is visible: the middleware redirects a protected route to /prijava", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const { signOut } = await import("@/lib/actions/auth");
    await signOut().catch(() => {});

    const cookie = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const { updateSession } = await import("@/lib/supabase/middleware");
    const response = await updateSession(
      new NextRequest("http://localhost:3000/ljubimci", { headers: cookie ? { cookie } : {} }),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/prijava");
  });
});
