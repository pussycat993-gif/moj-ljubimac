// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-33 POST /api/internal/dispatch with the service-role client and both adapters faked (database
// behaviour is proven in the pgTAP files). FR-20: a claimed vaccination occurrence produces one
// reminder_deliveries row per recipient × channel; NFR-01: secret check, counters, batches ≤ 200;
// RISK-14: the watchdog condition is logged at most once per hour and no alert email is sent.

type Rpc = { data: unknown; error: { message: string; code?: string } | null };

const fake = vi.hoisted(() => ({
  rpcQueues: {} as Record<string, Rpc[]>,
  rpcCalls: [] as { fn: string; args: unknown }[],
  inserts: [] as { table: string; rows: Record<string, unknown>[] }[],
  deletes: [] as { table: string; column: string; value: unknown }[],
  emails: [] as { to: string; template: { id: string; variables: Record<string, string | null> }; locale: string }[],
  pushes: [] as { endpoints: { id: string }[]; payload: Record<string, unknown> }[],
  emailResult: { status: "delivered", id: "re_1" } as { status: string; id?: string; error?: string },
  pushResult: { status: "delivered", accepted: 1, removed: 0, provider_message_id: "pm_1", error: null } as Record<string, unknown>,
  pushConfigured: true,
  removeEndpoint: null as null | ((id: string) => Promise<void>),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (fn: string, args?: unknown) => {
      fake.rpcCalls.push({ fn, args });
      const queue = fake.rpcQueues[fn];
      if (queue && queue.length > 0) return queue.shift();
      if (fn === "mark_missed_occurrences") return { data: 0, error: null };
      if (fn === "dispatch_watchdog_due") return { data: false, error: null };
      return { data: [], error: null };
    },
    from: (table: string) => ({
      insert: async (rows: Record<string, unknown>[]) => {
        fake.inserts.push({ table, rows });
        return { error: null };
      },
      delete: () => ({
        eq: async (column: string, value: unknown) => {
          fake.deletes.push({ table, column, value });
          return { error: null };
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/integrations/resend", () => ({
  sendEmail: async (input: (typeof fake.emails)[number]) => {
    fake.emails.push(input);
    return fake.emailResult;
  },
}));

vi.mock("@/lib/integrations/webpush", () => ({
  pushConfigFromEnv: () => (fake.pushConfigured ? { privateJWK: "{}", subject: "mailto:x@y.test" } : null),
  sendPush: async (endpoints: { id: string }[], payload: Record<string, unknown>, config: { removeEndpoint: (id: string) => Promise<void> }) => {
    fake.pushes.push({ endpoints, payload });
    fake.removeEndpoint = config.removeEndpoint;
    return fake.pushResult;
  },
}));

const { POST } = await import("@/app/api/internal/dispatch/route");
const { resetWatchdogForTests, BATCH_SIZE } = await import("@/lib/server/dispatch");
const { verifyActionToken } = await import("@/lib/server/action-tokens");

const SECRET = "dispatch-secret-for-tests";
const OWNER = "a1000000-0000-4000-8000-000000000001";
const MEMBER = "a1000000-0000-4000-8000-000000000003";

function recipient(overrides: Record<string, unknown> = {}) {
  return {
    id: OWNER,
    is_owner: true,
    email: "ivana.petrovic@mojljubimac.test",
    full_name: "Ivana Petrović",
    locale: "sr-Latn",
    premium: true,
    channels: ["email", "push"],
    whatsapp_opted_in: false,
    viber_opted_in: false,
    cap_used: 0,
    push_subscriptions: [{ id: "ps-1", endpoint: "https://push.example.test/1", p256dh: "k", auth: "a" }],
    ...overrides,
  };
}

function occurrence(overrides: Record<string, unknown> = {}) {
  return {
    occurrence_id: "f9000000-0000-4000-8000-0000000000a1",
    reminder_id: "f9000000-0000-4000-8000-000000000001",
    // 08:00 Belgrade on the day after the autumn DST change (CET, UTC+1).
    due_at: "2026-10-26T07:00:00+00:00",
    notify_at: "2026-10-26T07:00:00+00:00",
    type: "vaccination",
    title: "Besnilo",
    pet_id: "c1000000-0000-4000-8000-000000000001",
    pet_name: "Luna",
    viber_enabled: false,
    recipients: [recipient()],
    ...overrides,
  };
}

function request(headers: Record<string, string> = { "x-dispatch-secret": SECRET }, body: unknown = { run_at: "2026-10-26T07:00:05Z" }) {
  return new NextRequest("http://localhost/api/internal/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const deliveryRows = () => fake.inserts.filter((i) => i.table === "reminder_deliveries").flatMap((i) => i.rows);

beforeEach(() => {
  fake.rpcQueues = {};
  fake.rpcCalls = [];
  fake.inserts = [];
  fake.deletes = [];
  fake.emails = [];
  fake.pushes = [];
  fake.emailResult = { status: "delivered", id: "re_1" };
  fake.pushResult = { status: "delivered", accepted: 1, removed: 0, provider_message_id: "pm_1", error: null };
  fake.pushConfigured = true;
  vi.stubEnv("DISPATCH_SECRET", SECRET);
  vi.stubEnv("ACTION_TOKEN_SECRET", "action-secret-for-tests");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mojljubimac.rs/");
  vi.spyOn(console, "info").mockImplementation(() => {});
  resetWatchdogForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("EP-33 secret check (NFR-01, RISK-22)", () => {
  it.each([
    ["missing header", {}],
    ["wrong secret", { "x-dispatch-secret": "dispatch-secret-for-test" }],
    ["longer secret", { "x-dispatch-secret": `${SECRET}x` }],
  ])("%s → 401 invalid_signature and nothing runs", async (_label, headers) => {
    const response = await POST(request(headers));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "invalid_signature" });
    expect(fake.rpcCalls).toEqual([]);
  });

  it("an unset DISPATCH_SECRET rejects every call", async () => {
    vi.stubEnv("DISPATCH_SECRET", "");
    const response = await POST(request({ "x-dispatch-secret": "" }));
    expect(response.status).toBe(401);
    expect(fake.rpcCalls).toEqual([]);
  });
});

describe("EP-33 run", () => {
  it("FR-20: a claimed vaccination occurrence gets one delivery row per recipient × channel", async () => {
    fake.rpcQueues.claim_due_occurrences = [
      {
        data: [
          occurrence({
            recipients: [
              recipient(),
              recipient({
                id: MEMBER,
                is_owner: false,
                email: "jelena.nikolic@mojljubimac.test",
                full_name: "Jelena Nikolić",
                locale: "en",
                channels: ["email", "whatsapp"],
                push_subscriptions: [],
              }),
            ],
          }),
        ],
        error: null,
      },
    ];
    const response = await POST(request());
    expect(response.status).toBe(200);
    const counters = await response.json();
    expect(counters).toEqual({
      claimed: 1,
      delivered: 3,
      failed: 0,
      fell_back: 0,
      resent: 0,
      missed: 0,
      duration_ms: expect.any(Number),
    });

    const rows = deliveryRows();
    expect(rows.map((r) => [r.recipient_id, r.channel, r.status])).toEqual([
      [OWNER, "email", "delivered"],
      [OWNER, "push", "delivered"],
      [MEMBER, "email", "delivered"],
    ]);
    expect(rows.every((r) => r.occurrence_id === "f9000000-0000-4000-8000-0000000000a1")).toBe(true);
    expect(rows[0]).toMatchObject({ provider_message_id: "re_1", error: null, delivered_at: expect.any(String) });
    expect(rows[1]).toMatchObject({ provider_message_id: "pm_1" });
    // One insert per occurrence.
    expect(fake.inserts).toHaveLength(1);
  });

  it("emails and pushes in the recipient's locale, at 08:00 Belgrade, with a dn_ link bound to occurrence + recipient", async () => {
    fake.rpcQueues.claim_due_occurrences = [
      {
        data: [
          occurrence({
            recipients: [recipient(), recipient({ id: MEMBER, is_owner: false, locale: "en", full_name: "Jelena Nikolić", push_subscriptions: [] })],
          }),
        ],
        error: null,
      },
    ];
    await POST(request());

    expect(fake.emails.map((e) => [e.locale, e.template.id])).toEqual([
      ["sr", "reminder_email"],
      ["en", "reminder_email"],
    ]);
    expect(fake.emails[0].template.variables).toMatchObject({
      first_name: "Ivana",
      pet: "Luna",
      title: "Besnilo",
      date: "26. 10. 2026.",
      time: "08:00",
      app_url: "https://mojljubimac.rs/podsetnici",
    });
    expect(fake.emails[1].template.variables).toMatchObject({ first_name: "Jelena", date: "26 Oct 2026", time: "08:00" });

    for (const [i, who] of [OWNER, MEMBER].entries()) {
      const url = new URL(fake.emails[i].template.variables.done_url!);
      expect(url.origin + url.pathname).toBe("https://mojljubimac.rs/api/a/done");
      const check = await verifyActionToken(url.searchParams.get("t"), "dn");
      expect(check.ok && check.token.fields).toEqual(["f9000000-0000-4000-8000-0000000000a1", who]);
    }

    expect(fake.pushes).toHaveLength(1);
    expect(fake.pushes[0].payload).toEqual({
      title: "Luna: Besnilo",
      body: "26. 10. 2026. u 08:00",
      url: "https://mojljubimac.rs/podsetnici",
      done_url: fake.emails[0].template.variables.done_url,
    });
  });

  it("personal reminders say Za mene; null meal / birthday titles use the Step 17 labels", async () => {
    fake.rpcQueues.claim_due_occurrences = [
      {
        data: [
          occurrence({ occurrence_id: "o1", type: "manual", title: "Plati račun", pet_id: null, pet_name: null }),
          occurrence({ occurrence_id: "o2", type: "meal", title: null }),
          occurrence({ occurrence_id: "o3", type: "birthday", title: null, recipients: [recipient({ locale: "en" })] }),
        ],
        error: null,
      },
    ];
    await POST(request());
    expect(fake.emails.map((e) => [e.template.variables.pet, e.template.variables.title])).toEqual([
      ["Za mene", "Plati račun"],
      ["Luna", "Obrok — Luna"],
      ["Luna", "Birthday — Luna"],
    ]);
  });

  it("push with no stored endpoint is skipped without a row", async () => {
    fake.rpcQueues.claim_due_occurrences = [{ data: [occurrence({ recipients: [recipient({ push_subscriptions: [] })] })], error: null }];
    await POST(request());
    expect(fake.pushes).toEqual([]);
    expect(deliveryRows().map((r) => r.channel)).toEqual(["email"]);
  });

  it("push not configured (no VAPID keys) is skipped with a log line", async () => {
    fake.pushConfigured = false;
    fake.rpcQueues.claim_due_occurrences = [{ data: [occurrence()], error: null }];
    await POST(request());
    expect(fake.pushes).toEqual([]);
    expect(deliveryRows().map((r) => r.channel)).toEqual(["email"]);
    expect(vi.mocked(console.info).mock.calls.some((c) => String(c[0]).includes("push not configured"))).toBe(true);
  });

  it("gone endpoints are deleted from push_subscriptions through the adapter", async () => {
    fake.rpcQueues.claim_due_occurrences = [{ data: [occurrence()], error: null }];
    await POST(request());
    await fake.removeEndpoint!("ps-1");
    expect(fake.deletes).toEqual([{ table: "push_subscriptions", column: "id", value: "ps-1" }]);
  });

  it("failed sends are recorded as failed rows and counted", async () => {
    fake.emailResult = { status: "failed", error: "resend_500" };
    fake.pushResult = { status: "failed", accepted: 0, removed: 0, provider_message_id: null, error: "push_503" };
    fake.rpcQueues.claim_due_occurrences = [{ data: [occurrence()], error: null }];
    const counters = await (await POST(request())).json();
    expect(counters).toMatchObject({ delivered: 0, failed: 2 });
    expect(deliveryRows().map((r) => [r.channel, r.status, r.error, r.delivered_at])).toEqual([
      ["email", "failed", "resend_500", null],
      ["push", "failed", "push_503", null],
    ]);
  });

  it("FR-25: a WhatsApp preference falls back to email + push and counts fell_back", async () => {
    fake.rpcQueues.claim_due_occurrences = [
      { data: [occurrence({ recipients: [recipient({ premium: false, channels: ["whatsapp"] })] })], error: null },
    ];
    const counters = await (await POST(request())).json();
    expect(counters).toMatchObject({ claimed: 1, delivered: 2, fell_back: 1 });
    expect(deliveryRows().map((r) => r.channel)).toEqual(["email", "push"]);
  });

  it("claims in batches of 200 while a batch is full", async () => {
    const full = Array.from({ length: BATCH_SIZE }, (_, i) =>
      occurrence({ occurrence_id: `o-${i}`, recipients: [recipient({ push_subscriptions: [] })] }),
    );
    fake.rpcQueues.claim_due_occurrences = [
      { data: full, error: null },
      { data: [occurrence({ occurrence_id: "o-last", recipients: [recipient({ push_subscriptions: [] })] })], error: null },
    ];
    const counters = await (await POST(request())).json();
    const claims = fake.rpcCalls.filter((c) => c.fn === "claim_due_occurrences");
    expect(claims).toEqual([
      { fn: "claim_due_occurrences", args: { p_limit: 200 } },
      { fn: "claim_due_occurrences", args: { p_limit: 200 } },
    ]);
    expect(counters).toMatchObject({ claimed: 201, delivered: 201 });
  });

  it("runs the steps in order: claim, re-send, missed, watchdog", async () => {
    fake.rpcQueues.claim_resend_occurrences = [
      { data: [occurrence({ occurrence_id: "re-1", recipients: [recipient({ push_subscriptions: [] })] })], error: null },
    ];
    fake.rpcQueues.mark_missed_occurrences = [{ data: 2, error: null }];
    const counters = await (await POST(request())).json();
    expect(fake.rpcCalls.map((c) => c.fn)).toEqual([
      "claim_due_occurrences",
      "claim_resend_occurrences",
      "mark_missed_occurrences",
      "dispatch_watchdog_due",
    ]);
    expect(counters).toMatchObject({ claimed: 0, resent: 1, missed: 2, delivered: 1 });
    expect(deliveryRows()).toEqual([expect.objectContaining({ occurrence_id: "re-1", channel: "email" })]);
  });

  it("a database error → 500 internal_error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.rpcQueues.claim_due_occurrences = [{ data: null, error: { message: "boom" } }];
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "internal_error" });
  });
});

describe("RISK-14 watchdog", () => {
  it("logs the condition at most once per hour and sends no alert email", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T08:00:00Z"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const watchdogLogs = () => error.mock.calls.filter((c) => String(c[0]).includes("RISK-14")).length;

    fake.rpcQueues.dispatch_watchdog_due = [
      { data: true, error: null },
      { data: true, error: null },
      { data: true, error: null },
      { data: false, error: null },
    ];
    await POST(request());
    expect(watchdogLogs()).toBe(1);

    vi.setSystemTime(new Date("2026-10-23T08:30:00Z"));
    await POST(request());
    expect(watchdogLogs()).toBe(1);

    vi.setSystemTime(new Date("2026-10-23T09:00:01Z"));
    await POST(request());
    expect(watchdogLogs()).toBe(2);

    vi.setSystemTime(new Date("2026-10-23T10:30:00Z"));
    await POST(request());
    expect(watchdogLogs()).toBe(2);

    expect(fake.emails).toEqual([]);
  });
});
