import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL = "http://127.0.0.1:54321";
const AUTH_COOKIE = "sb-127-auth-token";
const USER = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "ivana.petrovic@gmail.com",
  email_confirmed_at: "2026-10-01T08:00:00Z",
};

function sessionCookie({ expired = false, accessToken = "access-token" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: accessToken,
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expired ? now - 60 : now + 3600,
    user: USER,
  };
  return `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

// Supabase Auth at the HTTP boundary: /token refreshes, /user validates the token.
function fakeAuthServer() {
  const fetch = vi.fn(async (input: RequestInfo | globalThis.URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/token")) {
      const now = Math.floor(Date.now() / 1000);
      return Response.json({
        access_token: "refreshed-access-token",
        refresh_token: "refreshed-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        user: USER,
      });
    }
    if (url.includes("/auth/v1/user")) return Response.json(USER);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie: `${AUTH_COOKIE}=${cookie}` } : {},
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const SIGNED_IN = [
  "/ljubimci",
  "/ljubimci/123/vakcine/nova",
  "/uspomene",
  "/podsetnici",
  "/podesavanja/podsetnici",
  "/domacinstvo",
  "/premium",
  "/profil",
  "/profil/podaci",
  "/partneri",
  "/partneri/abc",
  "/organizacija",
  "/organizacija/zahtevi",
  "/admin",
];

const PUBLIC = [
  "/",
  "/prijava",
  "/prijava/nova-lozinka",
  "/registracija",
  "/poziv/hh_abc",
  "/t/luna",
  "/o/azil-sapica",
  "/privatnost",
  "/uslovi",
  "/auth/callback",
  "/api/a/dn_token",
  "/ljubimcii",
];

describe("session refresh (API §4.1)", () => {
  it("validates the session with Supabase Auth on every request", async () => {
    const fetch = fakeAuthServer();
    const { updateSession } = await import("@/lib/supabase/middleware");

    await updateSession(request("/ljubimci", sessionCookie()));
    await updateSession(request("/prijava", sessionCookie()));

    const userCalls = fetch.mock.calls.filter(([input]) => String(input).includes("/auth/v1/user"));
    expect(userCalls).toHaveLength(2);
  });

  it("refreshes an expired session and writes the new cookies as httpOnly", async () => {
    const fetch = fakeAuthServer();
    const { updateSession } = await import("@/lib/supabase/middleware");

    const response = await updateSession(request("/ljubimci", sessionCookie({ expired: true })));

    expect(fetch.mock.calls.some(([input]) => String(input).includes("grant_type=refresh_token"))).toBe(true);
    expect(response.headers.get("location")).toBeNull();
    const written = response.cookies.getAll().filter((c) => c.name.startsWith(AUTH_COOKIE));
    expect(written.length).toBeGreaterThan(0);
    for (const cookie of written) expect(cookie.httpOnly).toBe(true);
    const value = written.map((c) => c.value).join("");
    expect(Buffer.from(value.replace(/^base64-/, ""), "base64url").toString()).toContain("refreshed-access-token");
  });

  it("proxy.ts runs the session refresh on every request", async () => {
    fakeAuthServer();
    const { proxy, config } = await import("@/proxy");

    const response = await proxy(request("/ljubimci"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/prijava");
    expect(config.matcher).toHaveLength(1);
  });
});

describe("route protection (API §4.1, Design §11 shells A, O, D)", () => {
  it.each(SIGNED_IN)("unauthenticated %s redirects to /prijava", async (path) => {
    fakeAuthServer();
    const { updateSession } = await import("@/lib/supabase/middleware");

    const response = await updateSession(request(path));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/prijava");
  });

  it.each(PUBLIC)("unauthenticated %s passes through", async (path) => {
    fakeAuthServer();
    const { updateSession } = await import("@/lib/supabase/middleware");

    const response = await updateSession(request(path));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("a signed-in request for a signed-in surface passes through", async () => {
    fakeAuthServer();
    const { updateSession } = await import("@/lib/supabase/middleware");

    const response = await updateSession(request("/ljubimci", sessionCookie()));

    expect(response.headers.get("location")).toBeNull();
  });
});
