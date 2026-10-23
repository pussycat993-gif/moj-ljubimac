// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-32 GET /api/a/done?t=<dn_ token> with the service-role client faked (mark_occurrence_done_for is
// proven in supabase/tests/claim_due_occurrences.test.sql). FR-24 from the message: a valid token marks
// the instance done as the recipient; a reused token on a done instance shows the success page; bad or
// expired → invalid_action_token; lost access → not_found; read-only household → household_read_only;
// HEAD and prefetch requests mark nothing. Pages use Design §9.1 action_done_page / action_expired_page
// in the recipient's locale.

const fake = vi.hoisted(() => ({
  profiles: {} as Record<string, { locale: string }>,
  rpcResult: { data: null, error: null } as { data: unknown; error: { message: string; code?: string } | null },
  rpcCalls: [] as { fn: string; args: unknown }[],
  profileReads: 0,
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      fake.rpcCalls.push({ fn, args });
      return fake.rpcResult;
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => {
            fake.profileReads++;
            return { data: fake.profiles[id] ?? null, error: null };
          },
        }),
      }),
    }),
  }),
}));

const { GET, HEAD } = await import("@/app/api/a/done/route");
const { signDoneToken, signActionToken } = await import("@/lib/server/action-tokens");

const OCC = "f9000000-0000-4000-8000-0000000000a1";
const RECIPIENT = "a1000000-0000-4000-8000-000000000002";

function doneOccurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: OCC,
    reminder_id: "f9000000-0000-4000-8000-000000000001",
    type: "vaccination",
    title: "Besnilo",
    pet_name: "Luna",
    display_status: "done",
    status: "done",
    // 08:15 Belgrade (CEST)
    done_at: "2026-10-23T06:15:00+00:00",
    done_by: RECIPIENT,
    ...overrides,
  };
}

function get(token: string | null, headers: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/a/done");
  if (token !== null) url.searchParams.set("t", token);
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  fake.profiles = { [RECIPIENT]: { locale: "sr-Latn" } };
  fake.rpcResult = { data: doneOccurrence(), error: null };
  fake.rpcCalls = [];
  fake.profileReads = 0;
  vi.stubEnv("ACTION_TOKEN_SECRET", "action-secret-for-tests");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mojljubimac.rs");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("EP-32 success", () => {
  it("a valid token marks the instance done as the recipient and shows action_done_page", async () => {
    const response = await GET(get(await signDoneToken(OCC, RECIPIENT, new Date())));
    expect(fake.rpcCalls).toEqual([{ fn: "mark_occurrence_done_for", args: { p_occurrence_id: OCC, p_recipient_id: RECIPIENT } }]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('<html lang="sr-Latn">');
    expect(html).toContain("<h1>Označeno kao urađeno</h1>");
    expect(html).toContain("Luna: Besnilo — označeno u 08:15.");
    expect(html).toMatch(/<a class="button" href="https:\/\/mojljubimac\.rs\/podsetnici">Otvori aplikaciju<\/a>/);
    expect(html).toContain('<img class="logo" src="/brand/logo-full.png" alt="Moj Ljubimac">');
  });

  it("renders in the recipient's locale (en)", async () => {
    fake.profiles[RECIPIENT] = { locale: "en" };
    const html = await (await GET(get(await signDoneToken(OCC, RECIPIENT, new Date())))).text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<h1>Marked as done</h1>");
    expect(html).toContain("Luna: Besnilo — marked at 08:15.");
    expect(html).toContain(">Open the app</a>");
  });

  it("with Accept: application/json returns { occurrence } with done_by = recipient", async () => {
    const response = await GET(get(await signDoneToken(OCC, RECIPIENT, new Date()), { accept: "application/json" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { occurrence: { done_by: string } };
    expect(body).toEqual({ occurrence: doneOccurrence() });
    expect(body.occurrence.done_by).toBe(RECIPIENT);
  });

  it("a reused token on an instance already done shows the same success page (no new write)", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, new Date());
    await GET(get(token));
    // mark_occurrence_done_for returns the done instance unchanged (original done_at / done_by).
    const html = await (await GET(get(token))).text();
    expect(html).toContain("Označeno kao urađeno");
    expect(html).toContain("označeno u 08:15.");
  });

  it("personal reminders and null meal titles use the shared labels; values are escaped", async () => {
    fake.rpcResult = { data: doneOccurrence({ type: "meal", title: null, pet_name: "<b>Maks</b>" }), error: null };
    const html = await (await GET(get(await signDoneToken(OCC, RECIPIENT, new Date())))).text();
    expect(html).toContain("&lt;b&gt;Maks&lt;/b&gt;: Obrok — &lt;b&gt;Maks&lt;/b&gt; — označeno u 08:15.");
    fake.rpcResult = { data: doneOccurrence({ type: "manual", title: "Plati račun", pet_name: null }), error: null };
    expect(await (await GET(get(await signDoneToken(OCC, RECIPIENT, new Date())))).text()).toContain("Za mene: Plati račun");
  });
});

describe("EP-32 errors", () => {
  it("a bad signature → 400 action_expired_page, nothing marked", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, new Date());
    vi.stubEnv("ACTION_TOKEN_SECRET", "another-secret");
    const response = await GET(get(token));
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("<h1>Link je istekao</h1>");
    expect(html).toContain("Link važi 24 sata i samo jednom. Otvori aplikaciju i označi podsetnik tamo.");
    expect(fake.rpcCalls).toEqual([]);
  });

  it("an expired token (> 24 h) → 400 invalid_action_token, in the recipient's locale", async () => {
    fake.profiles[RECIPIENT] = { locale: "en" };
    const token = await signDoneToken(OCC, RECIPIENT, new Date(Date.now() - 25 * 60 * 60 * 1000));
    const response = await GET(get(token));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("<h1>This link has expired</h1>");
    expect(fake.rpcCalls).toEqual([]);
  });

  it.each([
    ["no token", null],
    ["garbage", "dn_nope"],
  ])("%s → 400 invalid_action_token", async (_label, token) => {
    const response = await GET(get(token));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Link je istekao");
  });

  it("a signed token of another kind or shape → 400", async () => {
    const hh = await signActionToken("hh", [OCC], new Date(Date.now() + 60_000));
    expect((await GET(get(hh))).status).toBe(400);
    const notUuid = await signActionToken("dn", ["x", "y"], new Date(Date.now() + 60_000));
    expect((await GET(get(notUuid))).status).toBe(400);
    expect(fake.rpcCalls).toEqual([]);
  });

  it("JSON clients get the ApiError", async () => {
    const response = await GET(get("dn_nope", { accept: "application/json" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_action_token" });
  });

  it("the recipient lost access → 404 not_found page", async () => {
    fake.rpcResult = { data: null, error: { message: "not_found", code: "P0001" } };
    const response = await GET(get(await signDoneToken(OCC, RECIPIENT, new Date())));
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain("<h1>Podsetnik nije dostupan</h1>");
    expect(html).toContain("Više nemaš pristup ovom podsetniku.");
  });

  it("a deleted recipient account → 404 not_found", async () => {
    delete fake.profiles[RECIPIENT];
    const response = await GET(get(await signDoneToken(OCC, RECIPIENT, new Date()), { accept: "application/json" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not_found" });
    expect(fake.rpcCalls).toEqual([]);
  });

  it("a member of a read-only household → 403 household_read_only page", async () => {
    fake.profiles[RECIPIENT] = { locale: "en" };
    fake.rpcResult = { data: null, error: { message: "household_read_only", code: "P0001" } };
    const response = await GET(get(await signDoneToken(OCC, RECIPIENT, new Date())));
    expect(response.status).toBe(403);
    const html = await response.text();
    expect(html).toContain("<h1>The household is read-only</h1>");
    expect(html).toContain("The household owner&#39;s Premium has ended, so you can&#39;t mark this reminder.");
  });

  it("another database error → 500", async () => {
    fake.rpcResult = { data: null, error: { message: "connection reset", code: "08006" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(get(await signDoneToken(OCC, RECIPIENT, new Date()), { accept: "application/json" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "internal_error" });
  });
});

describe("EP-32 mail-scanner guard", () => {
  it("HEAD → 200 with an empty body and marks nothing", async () => {
    const response = await HEAD();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(fake.rpcCalls).toEqual([]);
  });

  it.each([
    ["Purpose", "prefetch"],
    ["Sec-Purpose", "prefetch"],
    ["Sec-Purpose", "prefetch;prerender"],
  ])("%s: %s → 200 with an empty body and marks nothing", async (header, value) => {
    const response = await GET(get(await signDoneToken(OCC, RECIPIENT, new Date()), { [header]: value }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(fake.rpcCalls).toEqual([]);
    expect(fake.profileReads).toBe(0);
  });
});
