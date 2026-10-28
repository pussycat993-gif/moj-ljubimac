// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-65 #1 / #3 (route side), BR-56, daily job auth — EP-87 POST /api/internal/listings-daily with the service-role
// client and Resend faked (the database functions — candidates, suspended / pending-deletion authors, SKIP LOCKED —
// are proven in supabase/tests/sapa_expiry_job.test.sql). Secret check; the job works only at 09:xx Europe/Belgrade
// (CET and CEST); one listing_expiring per candidate, marked sent only when Resend accepted it; expire_listings rows
// → listing_expired for notify = true; counters.

type Rpc = { data: unknown; error: { message: string; code?: string } | null };

const fake = vi.hoisted(() => ({
  rpcQueues: {} as Record<string, Rpc[]>,
  rpcCalls: [] as { fn: string; args: unknown }[],
  emails: [] as { to: string; locale: string; template: { id: string; variables: Record<string, string> } }[],
  failFor: new Set<string>(),
  noticeSent: new Set<string>(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (fn: string, args?: unknown) => {
      fake.rpcCalls.push({ fn, args });
      const queue = fake.rpcQueues[fn];
      if (queue && queue.length > 0) return queue.shift();
      if (fn === "mark_listing_notices_sent") {
        const ids = (args as { p_listing_ids: string[] }).p_listing_ids;
        for (const id of ids) fake.noticeSent.add(id);
        return { data: ids.length, error: null };
      }
      return { data: [], error: null };
    },
  }),
}));

vi.mock("@/lib/integrations/resend", () => ({
  sendEmail: async (input: (typeof fake.emails)[number]) => {
    fake.emails.push(input);
    if (fake.failFor.has(input.to)) return { status: "failed", error: "resend 500" };
    return { status: "delivered", id: `re_${fake.emails.length}` };
  },
}));

const { POST } = await import("@/app/api/internal/listings-daily/route");

const SECRET = "dispatch-secret-for-tests";
const L1 = "e1000000-0000-4000-8000-000000000001";
const L2 = "e1000000-0000-4000-8000-000000000002";
const L3 = "e1000000-0000-4000-8000-000000000003";
const L4 = "e1000000-0000-4000-8000-000000000004";
/** 09:30 Belgrade in winter (CET, UTC+1). */
const WINTER_NINE = "2026-10-29T08:30:00Z";
/** 09:30 Belgrade in summer (CEST, UTC+2). */
const SUMMER_NINE = "2026-07-01T07:30:00Z";

function notice(id: string, overrides: Record<string, unknown> = {}) {
  return {
    listing_id: id,
    title: `Oglas ${id.slice(-1)}`,
    // 23:30 UTC on 31 Oct = 00:30 on 1 Nov in Belgrade (the date is shown in Belgrade time).
    expires_at: "2026-10-31T23:30:00+00:00",
    email: `author-${id.slice(-1)}@mojljubimac.test`,
    locale: "sr-Latn",
    ...overrides,
  };
}

function request(headers: Record<string, string> = { "x-dispatch-secret": SECRET }) {
  return new NextRequest("http://localhost/api/internal/listings-daily", { method: "POST", headers });
}

const calls = (fn: string) => fake.rpcCalls.filter((c) => c.fn === fn);
const emailsOf = (id: string) => fake.emails.filter((e) => e.template.id === id);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(WINTER_NINE));
  vi.stubEnv("DISPATCH_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mojljubimac.test/");
  fake.rpcQueues = {};
  fake.rpcCalls = [];
  fake.emails = [];
  fake.failFor = new Set();
  fake.noticeSent = new Set();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("EP-87 auth (daily job auth, derived)", () => {
  it.each([
    ["missing", {}],
    ["wrong", { "x-dispatch-secret": "nope" }],
    ["prefix of the right", { "x-dispatch-secret": SECRET.slice(0, -1) }],
    ["longer than the right", { "x-dispatch-secret": `${SECRET}x` }],
  ])("%s X-Dispatch-Secret → 401 invalid_signature, nothing done", async (_label, headers) => {
    const response = await POST(request(headers as Record<string, string>));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "invalid_signature" });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.emails).toHaveLength(0);
  });

  it("an unset DISPATCH_SECRET rejects every call, also an empty header", async () => {
    vi.stubEnv("DISPATCH_SECRET", "");
    expect((await POST(request({ "x-dispatch-secret": "" }))).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
  });
});

describe("EP-87 the Belgrade 09:00 window", () => {
  it.each([
    ["08:30 Belgrade (07:30 UTC in winter)", "2026-10-29T07:30:00Z"],
    ["10:30 Belgrade (09:30 UTC in winter)", "2026-10-29T09:30:00Z"],
    ["10:30 Belgrade (08:30 UTC in summer)", "2026-07-01T08:30:00Z"],
  ])("%s → zero counts without touching the database", async (_label, now) => {
    vi.setSystemTime(new Date(now));
    fake.rpcQueues.listings_expiry_notice_candidates = [{ data: [notice(L1)], error: null }];
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notices_sent: 0, expired: 0, emails_failed: 0, duration_ms: 0 });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.emails).toHaveLength(0);
  });

  it.each([
    ["winter (CET)", WINTER_NINE],
    ["summer (CEST)", SUMMER_NINE],
  ])("runs at 09:xx Belgrade in %s", async (_label, now) => {
    vi.setSystemTime(new Date(now));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(calls("listings_expiry_notice_candidates")).toEqual([{ fn: "listings_expiry_notice_candidates", args: { p_limit: 200 } }]);
    expect(calls("expire_listings")).toEqual([{ fn: "expire_listings", args: { p_limit: 200 } }]);
  });
});

describe("EP-87 3-day notice (FR-65 #1)", () => {
  it("sends one listing_expiring per candidate and marks only the ones Resend accepted", async () => {
    fake.rpcQueues.listings_expiry_notice_candidates = [
      { data: [notice(L1), notice(L2, { locale: "en", title: "Cat carrier" }), notice(L3)], error: null },
    ];
    fake.failFor.add("author-2@mojljubimac.test");

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notices_sent: 2, expired: 0, emails_failed: 1, duration_ms: 0 });

    expect(emailsOf("listing_expiring")).toHaveLength(3);
    expect(fake.emails[0]).toEqual({
      to: "author-1@mojljubimac.test",
      locale: "sr",
      template: {
        id: "listing_expiring",
        variables: {
          listing: "Oglas 1",
          date: new Intl.DateTimeFormat("sr-Latn", { timeZone: "Europe/Belgrade", day: "numeric", month: "numeric", year: "numeric" }).format(
            new Date("2026-10-31T23:30:00Z"),
          ),
          extend_url: `https://mojljubimac.test/sapa-pomoci/moje?produzi=${L1}`,
          manage_url: "https://mojljubimac.test/sapa-pomoci/moje",
        },
      },
    });
    expect(fake.emails[0].template.variables.date).toContain("2026");
    expect(fake.emails[0].template.variables.date).toMatch(/^1\./);
    expect(fake.emails[1]).toMatchObject({
      to: "author-2@mojljubimac.test",
      locale: "en",
      template: { variables: { listing: "Cat carrier", date: "1 Nov 2026", extend_url: `https://mojljubimac.test/sapa-pomoci/moje?produzi=${L2}` } },
    });

    expect(calls("mark_listing_notices_sent")).toEqual([{ fn: "mark_listing_notices_sent", args: { p_listing_ids: [L1, L3] } }]);
    expect([...fake.noticeSent]).toEqual([L1, L3]);
    // The marking happens after the sends.
    const order = fake.rpcCalls.map((c) => c.fn);
    expect(order.indexOf("mark_listing_notices_sent")).toBeGreaterThan(order.indexOf("listings_expiry_notice_candidates"));
  });

  it("does not call mark_listing_notices_sent when every send failed", async () => {
    fake.rpcQueues.listings_expiry_notice_candidates = [{ data: [notice(L1)], error: null }];
    fake.failFor.add("author-1@mojljubimac.test");
    const body = await (await POST(request())).json();
    expect(body).toMatchObject({ notices_sent: 0, emails_failed: 1 });
    expect(calls("mark_listing_notices_sent")).toHaveLength(0);
  });

  it("a second run whose candidates are empty sends nothing", async () => {
    fake.rpcQueues.listings_expiry_notice_candidates = [{ data: [notice(L1)], error: null }];
    await POST(request());
    expect(emailsOf("listing_expiring")).toHaveLength(1);

    fake.emails = [];
    fake.rpcCalls = [];
    const again = await POST(request());
    expect(await again.json()).toEqual({ notices_sent: 0, expired: 0, emails_failed: 0, duration_ms: 0 });
    expect(fake.emails).toHaveLength(0);
    expect(calls("mark_listing_notices_sent")).toHaveLength(0);
  });

  it("pages through full batches of 200 and does not retry a failed send in the same run", async () => {
    const full = Array.from({ length: 200 }, (_, i) =>
      notice(`e1000000-0000-4000-8000-${String(i).padStart(12, "0")}`, { email: `a${i}@mojljubimac.test` }),
    );
    fake.failFor.add("a0@mojljubimac.test");
    // The failed one stays a candidate and comes back in the next batch, together with one new listing.
    fake.rpcQueues.listings_expiry_notice_candidates = [
      { data: full, error: null },
      { data: [full[0], notice("e2000000-0000-4000-8000-000000000001")], error: null },
    ];
    const body = await (await POST(request())).json();
    expect(calls("listings_expiry_notice_candidates")).toHaveLength(2);
    expect(emailsOf("listing_expiring")).toHaveLength(201);
    expect(fake.emails.filter((e) => e.to === "a0@mojljubimac.test")).toHaveLength(1);
    expect(body).toMatchObject({ notices_sent: 200, emails_failed: 1 });
    expect(calls("mark_listing_notices_sent").map((c) => (c.args as { p_listing_ids: string[] }).p_listing_ids.length)).toEqual([199, 1]);
  });
});

describe("EP-87 expire (FR-65 #3)", () => {
  it("counts every expired row and sends listing_expired only for notify = true", async () => {
    fake.rpcQueues.expire_listings = [
      {
        data: [
          { ...notice(L1), notify: true },
          { ...notice(L2), notify: false },
          { ...notice(L3, { locale: "en" }), notify: true },
        ],
        error: null,
      },
    ];
    const response = await POST(request());
    expect(await response.json()).toEqual({ notices_sent: 0, expired: 3, emails_failed: 0, duration_ms: 0 });
    const expired = emailsOf("listing_expired");
    expect(expired.map((e) => e.to)).toEqual(["author-1@mojljubimac.test", "author-3@mojljubimac.test"]);
    expect(expired[0].template.variables).toEqual({
      listing: "Oglas 1",
      date: expect.stringContaining("2026"),
      url: "https://mojljubimac.test/sapa-pomoci/moje",
    });
    expect(expired[1]).toMatchObject({ locale: "en", template: { variables: { date: "1 Nov 2026" } } });
    expect(emailsOf("listing_expiring")).toHaveLength(0);
  });

  it("counts a failed listing_expired send in emails_failed", async () => {
    fake.rpcQueues.expire_listings = [{ data: [{ ...notice(L4), notify: true }], error: null }];
    fake.failFor.add("author-4@mojljubimac.test");
    expect(await (await POST(request())).json()).toEqual({ notices_sent: 0, expired: 1, emails_failed: 1, duration_ms: 0 });
  });

  it("notice and expiry in the same run add up", async () => {
    fake.rpcQueues.listings_expiry_notice_candidates = [{ data: [notice(L1), notice(L2)], error: null }];
    fake.rpcQueues.expire_listings = [{ data: [{ ...notice(L3), notify: true }], error: null }];
    expect(await (await POST(request())).json()).toEqual({ notices_sent: 2, expired: 1, emails_failed: 0, duration_ms: 0 });
    expect(fake.rpcCalls.map((c) => c.fn)).toEqual(["listings_expiry_notice_candidates", "mark_listing_notices_sent", "expire_listings"]);
  });

  it("a database error → 500 internal_error", async () => {
    fake.rpcQueues.expire_listings = [{ data: null, error: { message: "deadlock detected" } }];
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "internal_error" });
  });
});
