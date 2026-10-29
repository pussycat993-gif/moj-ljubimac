// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-25 #1 / #2, FR-32 (route side), route auth — EP-49 POST /api/internal/billing-nightly with the service-role
// client and Resend faked (the database functions — expiry, the 30 / 7 / 1 Belgrade-day candidates, the
// monthly first-day skip, last_notice_days, the household flag — are proven in supabase/tests/billing_job.test.sql).
// Secret check; the job works only at 03:xx Europe/Belgrade (CET and CEST); step 1 only logs (OQ-11); one
// premium_expiry_* email per candidate with the {renew_line} matching auto_renew, recorded only when Resend
// accepted it, so a re-run on the same date sends nothing; counts per EP-49. FR-25 #2: after expiry the Step 19/29
// dispatch sends a WhatsApp-configured reminder by email + push.

type Rpc = { data: unknown; error: { message: string } | null };
type Email = { to: string; locale: "sr" | "en"; template: { id: string; variables: Record<string, unknown> } };

const fake = vi.hoisted(() => ({
  rpcQueues: {} as Record<string, Rpc[]>,
  rpcCalls: [] as { fn: string; args: unknown }[],
  candidates: [] as Record<string, unknown>[],
  marked: new Map<string, number>(),
  emails: [] as Email[],
  failFor: new Set<string>(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (fn: string, args?: unknown) => {
      fake.rpcCalls.push({ fn, args });
      const queue = fake.rpcQueues[fn];
      if (queue && queue.length > 0) return queue.shift();
      if (fn === "billing_expire_subscriptions") return { data: { expired: 0, household_ids: [] }, error: null };
      if (fn === "billing_refresh_household_flags") return { data: [], error: null };
      if (fn === "billing_expiry_notice_candidates") {
        // As the database: a notice already recorded for these days is not a candidate again.
        const rows = fake.candidates.filter((row) => {
          const last = fake.marked.get(row.subscription_id as string);
          return last === undefined || (row.days_left as number) < last;
        });
        return { data: rows, error: null };
      }
      if (fn === "mark_expiry_notice_sent") {
        const { p_subscription_id, p_days } = args as { p_subscription_id: string; p_days: number };
        const last = fake.marked.get(p_subscription_id);
        if (last !== undefined && p_days >= last) return { data: false, error: null };
        fake.marked.set(p_subscription_id, p_days);
        return { data: true, error: null };
      }
      return { data: null, error: null };
    },
  }),
}));

vi.mock("@/lib/integrations/resend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/resend")>();
  return {
    ...actual,
    sendEmail: async (input: Email) => {
      fake.emails.push(input);
      if (fake.failFor.has(input.to)) return { status: "failed", error: "resend_500" };
      return { status: "delivered", id: `re_${fake.emails.length}` };
    },
  };
});

const { POST } = await import("@/app/api/internal/billing-nightly/route");
const { renderEmail } = await import("@/lib/integrations/resend");
const { runDispatch } = await import("@/lib/server/dispatch");

const SECRET = "dispatch-secret-for-tests";
/** 03:00 Belgrade in winter (CET, UTC+1) — the 02:00 UTC call. */
const WINTER_THREE = "2026-11-01T02:00:00Z";
/** 03:00 Belgrade in summer (CEST, UTC+2) — the 01:00 UTC call. */
const SUMMER_THREE = "2026-07-01T01:00:00Z";

function candidate(id: string, days: number, overrides: Record<string, unknown> = {}) {
  return {
    subscription_id: `5b000000-0000-4000-8000-00000000000${id}`,
    user_id: `a1000000-0000-4000-8000-00000000000${id}`,
    email: `user-${id}@mojljubimac.test`,
    locale: "sr-Latn",
    plan: "premium_monthly",
    // 23:30 UTC on 30 Nov = 00:30 on 1 Dec in Belgrade (the date is shown in Belgrade time).
    current_period_end: "2026-11-30T23:30:00+00:00",
    auto_renew: true,
    days_left: days,
    ...overrides,
  };
}

function request(headers: Record<string, string> = { "x-dispatch-secret": SECRET }) {
  return new NextRequest("http://localhost/api/internal/billing-nightly", { method: "POST", headers });
}

const calls = (fn: string) => fake.rpcCalls.filter((c) => c.fn === fn);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(WINTER_THREE));
  vi.stubEnv("DISPATCH_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mojljubimac.test/");
  fake.rpcQueues = {};
  fake.rpcCalls = [];
  fake.candidates = [];
  fake.marked = new Map();
  fake.emails = [];
  fake.failFor = new Set();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("EP-49 route auth", () => {
  it.each([
    ["missing", {}],
    ["wrong", { "x-dispatch-secret": "nope" }],
    ["prefix of the right", { "x-dispatch-secret": SECRET.slice(0, -1) }],
    ["longer than the right", { "x-dispatch-secret": `${SECRET}x` }],
  ])("%s X-Dispatch-Secret → 401 unauthenticated, nothing done", async (_label, headers) => {
    const response = await POST(request(headers as Record<string, string>));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthenticated" });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.emails).toHaveLength(0);
  });

  it("an unset DISPATCH_SECRET rejects every call, also an empty header", async () => {
    vi.stubEnv("DISPATCH_SECRET", "");
    expect((await POST(request({ "x-dispatch-secret": "" }))).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe("EP-49 the Belgrade 03:00 window", () => {
  it.each([
    ["winter 01:00 UTC (02:00 Belgrade)", "2026-11-01T01:00:00Z"],
    ["summer 02:00 UTC (04:00 Belgrade)", "2026-07-01T02:00:00Z"],
  ])("%s → zero counts, nothing done", async (_label, at) => {
    vi.setSystemTime(new Date(at));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ renewals_attempted: 0, expired: 0, notices_sent: 0, households_updated: 0 });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ["winter", WINTER_THREE],
    ["summer", SUMMER_THREE],
  ])("03:00 Belgrade in %s runs the job", async (_label, at) => {
    vi.setSystemTime(new Date(at));
    expect((await POST(request())).status).toBe(200);
    expect(calls("billing_expire_subscriptions")).toHaveLength(1);
  });
});

describe("EP-49 steps in order", () => {
  it("step 1 only logs (OQ-11); steps 2–4 run in order; the response has exactly the EP-49 counts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fake.rpcQueues.billing_expire_subscriptions = [
      { data: { expired: 3, household_ids: ["b1000000-0000-4000-8000-000000000001"] }, error: null },
    ];
    fake.rpcQueues.billing_refresh_household_flags = [
      { data: ["b1000000-0000-4000-8000-000000000001", "b1000000-0000-4000-8000-000000000002"], error: null },
    ];
    const response = await POST(request());
    expect(await response.json()).toEqual({ renewals_attempted: 0, expired: 3, notices_sent: 0, households_updated: 2 });
    expect(fake.rpcCalls.map((c) => c.fn)).toEqual([
      "billing_expire_subscriptions",
      "billing_expiry_notice_candidates",
      "billing_refresh_household_flags",
    ]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("OQ-11"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the candidates are read for the current time, so the database picks the Belgrade date", async () => {
    await POST(request());
    expect(calls("billing_expiry_notice_candidates")[0].args).toEqual({ p_now: new Date(WINTER_THREE).toISOString() });
  });

  it("a database error → 500 internal_error", async () => {
    fake.rpcQueues.billing_expire_subscriptions = [{ data: null, error: { message: "boom" } }];
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "internal_error" });
  });
});

describe("FR-25 #1 — expiry notices at 30 / 7 / 1 days", () => {
  it("one premium_expiry_* email per candidate, last_notice_days recorded, notices_sent counted", async () => {
    fake.candidates = [candidate("1", 30), candidate("2", 7, { auto_renew: false }), candidate("3", 1, { locale: "en" })];
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ notices_sent: 3 });
    expect(fake.emails.map((e) => [e.to, e.template.id, e.locale])).toEqual([
      ["user-1@mojljubimac.test", "premium_expiry_30", "sr"],
      ["user-2@mojljubimac.test", "premium_expiry_7", "sr"],
      ["user-3@mojljubimac.test", "premium_expiry_1", "en"],
    ]);
    expect(fake.emails[0].template.variables).toEqual({
      date: "1. 12. 2026.",
      auto_renew: true,
      url: "https://mojljubimac.test/profil",
    });
    expect(fake.emails[2].template.variables).toMatchObject({ date: "1 Dec 2026" });
    expect(calls("mark_expiry_notice_sent").map((c) => c.args)).toEqual([
      { p_subscription_id: "5b000000-0000-4000-8000-000000000001", p_days: 30 },
      { p_subscription_id: "5b000000-0000-4000-8000-000000000002", p_days: 7 },
      { p_subscription_id: "5b000000-0000-4000-8000-000000000003", p_days: 1 },
    ]);
  });

  it("a re-run on the same Belgrade date sends nothing", async () => {
    fake.candidates = [candidate("1", 30), candidate("2", 7)];
    await POST(request());
    expect(fake.emails).toHaveLength(2);
    const again = await POST(request());
    expect(await again.json()).toMatchObject({ notices_sent: 0 });
    expect(fake.emails).toHaveLength(2);
  });

  it("an email Resend did not accept is not recorded, so the next run can retry it", async () => {
    fake.candidates = [candidate("1", 7), candidate("2", 7)];
    fake.failFor.add("user-1@mojljubimac.test");
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ notices_sent: 1 });
    expect(calls("mark_expiry_notice_sent").map((c) => (c.args as { p_subscription_id: string }).p_subscription_id)).toEqual([
      "5b000000-0000-4000-8000-000000000002",
    ]);
  });

  it("the copy is Design §9.1: subject, date, renew line by auto_renew, button to the subscription", () => {
    const url = "https://mojljubimac.test/profil";
    const on = renderEmail({ id: "premium_expiry_30", variables: { date: "1. 12. 2026.", auto_renew: true, url } }, "sr");
    expect(on.subject).toBe("Premium ističe za 30 dana");
    expect(on.text).toContain("Tvoj Premium traje do 1. 12. 2026. Obnavlja se automatski — ne moraš ništa da radiš.");
    expect(on.text).toContain(`Pogledaj pretplatu: ${url}`);
    const off = renderEmail({ id: "premium_expiry_7", variables: { date: "1. 12. 2026.", auto_renew: false, url } }, "sr");
    expect(off.subject).toBe("Premium ističe za 7 dana");
    expect(off.text).toContain(
      "Tvoj Premium traje do 1. 12. 2026. Posle toga prelaziš na Free: ništa se ne briše, ali dodatni ljubimci i domaćinstvo postaju samo za čitanje.",
    );
    const en = renderEmail({ id: "premium_expiry_1", variables: { date: "1 Dec 2026", auto_renew: false, url } }, "en");
    expect(en.subject).toBe("Premium ends tomorrow");
    expect(en.text).toContain("Your Premium runs until 1 Dec 2026. After that you move to Free");
    expect(en.html).toContain(`href="${url}"`);
    expect(en.text).toContain("You're getting this email because you have an account.");
  });

  it("no web-push notice is sent (CR-24: no §9.1 template)", async () => {
    fake.candidates = [candidate("1", 1)];
    await POST(request());
    expect(fake.rpcCalls.map((c) => c.fn)).not.toContain("register_push_subscription");
    expect(fake.emails).toHaveLength(1);
  });
});

describe("FR-25 #2 — after expiry WhatsApp falls back to email + push", () => {
  it("the dispatch sends a WhatsApp-configured reminder of an expired owner by email and push", async () => {
    // claim_due_occurrences reports premium = is_premium(user), which the expiry made false (billing_job.test.sql).
    const occurrence = {
      occurrence_id: "0c000000-0000-4000-8000-000000000001",
      reminder_id: "0d000000-0000-4000-8000-000000000001",
      due_at: "2026-11-01T07:00:00Z",
      notify_at: "2026-11-01T07:00:00Z",
      type: "vaccination",
      title: "Besnilo",
      pet_id: "c1000000-0000-4000-8000-000000000001",
      pet_name: "Luna",
      viber_enabled: false,
      recipients: [
        {
          id: "a1000000-0000-4000-8000-000000000001",
          is_owner: true,
          email: "ivana.petrovic@mojljubimac.test",
          full_name: "Ivana Petrović",
          locale: "sr-Latn",
          premium: false,
          channels: ["whatsapp"],
          whatsapp_opted_in: true,
          viber_opted_in: false,
          cap_used: 0,
          push_subscriptions: [{ id: "p1", endpoint: "https://push.test/1", p256dh: "k", auth: "a" }],
        },
      ],
    };
    const inserted: Record<string, unknown>[] = [];
    let claimed = false;
    const supabase = {
      rpc: async (fn: string) => {
        if (fn === "claim_due_occurrences") {
          if (claimed) return { data: [], error: null };
          claimed = true;
          return { data: [occurrence], error: null };
        }
        if (fn === "claim_resend_occurrences") return { data: [], error: null };
        if (fn === "mark_missed_occurrences") return { data: 0, error: null };
        if (fn === "dispatch_watchdog_due") return { data: false, error: null };
        return { data: null, error: null };
      },
      from: () => ({
        insert: async (rows: Record<string, unknown>[]) => {
          inserted.push(...rows);
          return { error: null };
        },
      }),
    };
    const sendEmail = vi.fn(async () => ({ status: "delivered" as const, id: "re_1" }));
    const sendPush = vi.fn(async () => ({ status: "delivered" as const, accepted: 1, removed: 0, provider_message_id: null, error: null }));
    const sendWhatsApp = vi.fn(async () => ({ status: "delivered" as const, id: "wa_1" }));

    const counters = await runDispatch({
      supabase: supabase as unknown as Parameters<typeof runDispatch>[0]["supabase"],
      sendEmail,
      sendPush,
      sendWhatsApp,
      liveChannels: new Set(["whatsapp"] as const),
      signDoneToken: async () => "dn_test",
      siteUrl: "https://mojljubimac.test",
    });

    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(inserted.map((row) => row.channel)).toEqual(["email", "push"]);
    expect(counters).toMatchObject({ claimed: 1, delivered: 2, fell_back: 1 });
  });
});
