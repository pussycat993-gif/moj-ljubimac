// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-69 — the EP-82 new-message notification (lib/actions/messages.ts, Step 28c; API §9.4): after the send, the
// recipient's `message` preference decides email (Resend template new_message in the recipient's locale: sender
// display name, listing title, preview, button to /poruke/<id>) and push (every push_subscriptions endpoint,
// { title, body, url }; 404 / 410 endpoints deleted); failures are logged and never fail the send; nothing is written to
// reminder_deliveries; nothing is sent when the send was refused (user_blocked) or the recipient's deletion is
// pending. Resend and Web Push run for real over a fake fetch (the Resend API and a fake push service); the VAPID
// request builder is stubbed.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const MARKO = "a1000000-0000-4000-8000-000000000002";
const CONVERSATION = "f3100000-0000-4000-8000-000000000001";
const SITE = "https://mojljubimac.test";

type Notification = {
  conversation_id: string;
  body: string;
  sender_name: string | null;
  listing_title: string | null;
  recipient: { id: string; email: string; locale: string; full_name: string | null; deletion_pending: boolean; channels: string[] };
  push_subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[];
};

const state = {
  sendError: null as null | { code: string; message: string },
  notification: null as Notification | null,
  tablesTouched: [] as string[],
  deletedEndpoints: [] as string[],
  fetches: [] as { url: string; body: string }[],
  resendStatus: 200,
  pushStatus: {} as Record<string, number>,
};

function notification(extra: Partial<Notification> = {}, recipient: Partial<Notification["recipient"]> = {}): Notification {
  return {
    conversation_id: CONVERSATION,
    body: "Zdravo! Da li je grebalica još dostupna? ".repeat(5).trim(),
    sender_name: "Ivana P.",
    listing_title: "Poklanjam grebalicu za mačke",
    recipient: {
      id: MARKO,
      email: "marko.jovanovic@mojljubimac.test",
      locale: "en",
      full_name: "Marko Jovanović",
      deletion_pending: false,
      channels: ["email", "push"],
      ...recipient,
    },
    push_subscriptions: [
      { id: "ps-1", endpoint: "https://push.test/ep-1", p256dh: "k1", auth: "a1" },
      { id: "ps-2", endpoint: "https://push.test/ep-2", p256dh: "k2", auth: "a2" },
    ],
    ...extra,
  };
}

function query(table: string) {
  state.tablesTouched.push(table);
  const builder = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    eq: () => builder,
    gte: () => builder,
    maybeSingle: async () => ({
      data: table === "profiles" ? { id: IVANA, deletion_requested_at: null } : null,
      error: null,
    }),
    then: (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: IVANA, email: "ivana@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } },
        error: null,
      }),
    },
    rpc: async (name: string) => {
      if (name !== "send_message") throw new Error(`unexpected rpc ${name}`);
      if (state.sendError) return { data: null, error: state.sendError };
      return {
        data: {
          conversation: { id: CONVERSATION },
          message: { id: "m-1", conversation_id: CONVERSATION, sender_id: IVANA, from_me: true, body: "x", created_at: "", read_at: null },
          created_conversation: false,
        },
        error: null,
      };
    },
    from: (table: string) => query(table),
  }),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (name: string, args: Row) => {
      expect(name).toBe("new_message_notification");
      expect(args).toEqual({ p_message_id: "m-1" });
      return { data: state.notification, error: null };
    },
    from: (table: string) => {
      state.tablesTouched.push(`service:${table}`);
      return {
        delete: () => ({
          eq: async (_c: string, id: string) => {
            state.deletedEndpoints.push(id);
            return { error: null };
          },
        }),
      };
    },
  }),
}));

vi.mock("@pushforge/builder", () => ({
  buildPushHTTPRequest: async ({ subscription, message }: { subscription: { endpoint: string }; message: { payload: unknown } }) => ({
    endpoint: subscription.endpoint,
    headers: { TTL: "60" },
    body: JSON.stringify(message.payload),
  }),
}));

const { sendMessage } = await import("@/lib/actions/messages");

async function send() {
  return sendMessage({ conversation_id: CONVERSATION, body: "Zdravo", idempotency_key: crypto.randomUUID() });
}

const emails = () => state.fetches.filter((f) => f.url === "https://api.resend.com/emails").map((f) => JSON.parse(f.body));
const pushes = () => state.fetches.filter((f) => f.url.startsWith("https://push.test/"));

beforeEach(() => {
  state.sendError = null;
  state.notification = notification();
  state.tablesTouched = [];
  state.deletedEndpoints = [];
  state.fetches = [];
  state.resendStatus = 200;
  state.pushStatus = {};
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Moj Ljubimac <podsetnici@mojljubimac.test>");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${SITE}/`);
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BPublicKey");
  vi.stubEnv("VAPID_PRIVATE_KEY_JWK", '{"kty":"EC"}');
  vi.stubEnv("VAPID_SUBJECT", "mailto:podrska@mojljubimac.test");
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    state.fetches.push({ url, body: init.body });
    const status = url.startsWith("https://push.test/") ? (state.pushStatus[url] ?? 201) : state.resendStatus;
    return new Response(status < 300 ? JSON.stringify({ id: "re_1" }) : "error", { status });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("FR-69 #1 — email and push after the send", () => {
  it("sends one new_message email in the recipient's locale with sender, listing and the conversation link", async () => {
    const result = await send();
    expect(result.ok).toBe(true);
    const sent = emails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["marko.jovanovic@mojljubimac.test"]);
    expect(sent[0].subject).toBe("New message: Poklanjam grebalicu za mačke");
    expect(sent[0].text).toContain("Hi Marko! You have a new message about Poklanjam grebalicu za mačke (from: Ivana P.)");
    expect(sent[0].text).toContain(`Reply: ${SITE}/poruke/${CONVERSATION}`);
    expect(sent[0].html).toContain("<strong>Poklanjam grebalicu za mačke</strong>");
    expect(sent[0].html).toContain(`href="${SITE}/poruke/${CONVERSATION}"`);
  });

  it("the preview is the first 120 characters (Serbian recipient)", async () => {
    state.notification = notification({}, { locale: "sr-Latn" });
    await send();
    const [email] = emails();
    expect(email.subject).toBe("Nova poruka: Poklanjam grebalicu za mačke");
    const preview = state.notification!.body.slice(0, 120);
    expect(email.text).toContain(`Zdravo, Marko! Imaš novu poruku o oglasu Poklanjam grebalicu za mačke (pošiljalac: Ivana P.): „${preview}“`);
    expect(email.text).not.toContain(state.notification!.body.slice(0, 121));
  });

  it("sends one push per endpoint with { title, body, url }", async () => {
    await send();
    const sent = pushes();
    expect(sent.map((p) => p.url)).toEqual(["https://push.test/ep-1", "https://push.test/ep-2"]);
    expect(JSON.parse(sent[0].body)).toEqual({
      title: "Ivana P.",
      body: `Poklanjam grebalicu za mačke: ${state.notification!.body.slice(0, 120)}`,
      url: `${SITE}/poruke/${CONVERSATION}`,
    });
  });

  it("endpoints answering 404 / 410 are deleted", async () => {
    state.pushStatus = { "https://push.test/ep-1": 410, "https://push.test/ep-2": 404 };
    const result = await send();
    expect(result.ok).toBe(true);
    expect(state.deletedEndpoints.sort()).toEqual(["ps-1", "ps-2"]);
  });

  it("a deleted listing is named 'listing deleted' and a missing sender name 'User'", async () => {
    state.notification = notification({ listing_title: null, sender_name: null });
    await send();
    expect(emails()[0].subject).toBe("New message: listing deleted");
    expect(JSON.parse(pushes()[0].body).title).toBe("User");
  });

  it("delivery failures are logged and never fail the send", async () => {
    state.resendStatus = 500;
    state.pushStatus = { "https://push.test/ep-1": 500, "https://push.test/ep-2": 500 };
    const result = await send();
    expect(result.ok).toBe(true);
    expect(console.error).toHaveBeenCalledWith("[messages] new_message email failed:", expect.stringContaining("resend_500"));
    expect(console.error).toHaveBeenCalledWith("[messages] new_message push failed:", expect.any(String));
  });

  it("nothing is written to reminder_deliveries", async () => {
    await send();
    expect(state.tablesTouched.filter((t) => t.includes("reminder_deliveries"))).toEqual([]);
  });

  it("never uses WhatsApp or Viber", async () => {
    state.notification = notification({}, { channels: ["email", "push", "whatsapp", "viber"] });
    await send();
    expect(state.fetches.every((f) => f.url === "https://api.resend.com/emails" || f.url.startsWith("https://push.test/"))).toBe(true);
  });
});

describe("FR-69 #2 — channels from the recipient's message row", () => {
  it("{email} → email only", async () => {
    state.notification = notification({}, { channels: ["email"] });
    await send();
    expect(emails()).toHaveLength(1);
    expect(pushes()).toHaveLength(0);
  });

  it("{push} → push only", async () => {
    state.notification = notification({}, { channels: ["push"] });
    await send();
    expect(emails()).toHaveLength(0);
    expect(pushes()).toHaveLength(2);
  });

  it("{} → no notification", async () => {
    state.notification = notification({}, { channels: [] });
    const result = await send();
    expect(result.ok).toBe(true);
    expect(state.fetches).toHaveLength(0);
  });

  it("push without VAPID keys is skipped with a log line", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY_JWK", "");
    await send();
    expect(pushes()).toHaveLength(0);
    expect(emails()).toHaveLength(1);
  });
});

describe("no notification", () => {
  it("FR-70 #4: when the send was refused (user_blocked)", async () => {
    state.sendError = { code: "P0001", message: "user_blocked" };
    const result = await send();
    expect(result).toMatchObject({ ok: false, error: { code: "user_blocked" } });
    expect(state.fetches).toHaveLength(0);
  });

  it("when the recipient's deletion is pending", async () => {
    state.notification = notification({}, { deletion_pending: true });
    await send();
    expect(state.fetches).toHaveLength(0);
  });
});
