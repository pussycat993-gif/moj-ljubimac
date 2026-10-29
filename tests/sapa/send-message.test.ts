// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-82 sendMessage (lib/actions/messages.ts, Step 28c) over a fake server client: the API §4.1 gates, the input rules
// (exactly one of listing_id / conversation_id, body 1–2000 after trim, idempotency_key uuid v4), the API §11 rate
// limit (30 messages per hour per user, lib/server/rate-limit.ts on rate_limit_counters) and API §3.3 idempotency
// (lib/server/idempotency.ts on idempotency_keys). The fake rpc:send_message stands in for the Step 28c function and
// the Step 28a triggers (their database behaviour is proven in supabase/tests/sapa_conversations_api.test.sql).
// The new-message notification is stubbed here (tests/sapa/new-message-notification.test.ts covers it).

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const MARKO = "a1000000-0000-4000-8000-000000000002";
const JELENA = "a1000000-0000-4000-8000-000000000003";
const NIKOLA = "a1000000-0000-4000-8000-000000000005";
const MARKO_LISTING = "f3000000-0000-4000-8000-000000000002";
const EXPIRED_LISTING = "f3000000-0000-4000-8000-000000000006";
const JELENA_LISTING = "f3000000-0000-4000-8000-000000000004";

const state = {
  user: IVANA as string | null,
  tables: {} as Record<string, Row[]>,
  conversations: [] as { id: string; listing_id: string; starter_id: string; owner_id: string }[],
  messages: [] as Row[],
  blocks: [] as { blocker: string; blocked: string }[],
  rpcCalls: [] as { name: string; args: Row }[],
  notifications: 0,
};

const authors: Record<string, string> = { [MARKO_LISTING]: MARKO, [EXPIRED_LISTING]: MARKO, [JELENA_LISTING]: JELENA };

function sendMessageRpc(args: Row) {
  const me = state.user!;
  const err = (message: string, details?: string) => ({ data: null, error: { code: "P0001", message, details } });
  let conversation = args.p_conversation_id
    ? state.conversations.find((c) => c.id === args.p_conversation_id && (c.starter_id === me || c.owner_id === me))
    : state.conversations.find((c) => c.listing_id === args.p_listing_id && c.starter_id === me);
  let created = false;
  if (!conversation) {
    if (args.p_conversation_id) return err("not_found");
    const author = authors[String(args.p_listing_id)];
    if (!author) return err("not_found");
    if (args.p_listing_id === EXPIRED_LISTING) return err("listing_not_active");
    if (author === me) return err("cannot_message_self");
    if (state.blocks.some((b) => b.blocker === author && b.blocked === me)) return err("user_blocked");
    conversation = { id: crypto.randomUUID(), listing_id: String(args.p_listing_id), starter_id: me, owner_id: author };
    state.conversations.push(conversation);
    created = true;
  }
  const other = conversation.starter_id === me ? conversation.owner_id : conversation.starter_id;
  if (state.blocks.some((b) => b.blocker === other && b.blocked === me)) return err("user_blocked");
  const message = {
    id: crypto.randomUUID(),
    conversation_id: conversation.id,
    sender_id: me,
    from_me: true,
    body: args.p_body,
    created_at: new Date().toISOString(),
    read_at: null,
  };
  state.messages.push(message);
  return {
    data: {
      conversation: { id: conversation.id, other: { user_id: other }, last_message: { preview: String(args.p_body).slice(0, 120), from_me: true } },
      message,
      created_conversation: created,
    },
    error: null,
  };
}

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: { kind: "select" } | { kind: "insert"; row: Row } | { kind: "update"; patch: Row } = { kind: "select" };
  const rows = () => (state.tables[table] ??= []);
  const run = () => {
    if (op.kind === "insert") {
      rows().push({ created_at: new Date().toISOString(), ...op.row });
      return { data: null, error: null };
    }
    const matched = rows().filter((r) => filters.every((f) => f(r)));
    if (op.kind === "update") {
      for (const r of matched) Object.assign(r, op.patch);
      return { data: null, error: null };
    }
    return { data: matched, error: null };
  };
  const builder = {
    select: () => builder,
    insert: (row: Row) => ((op = { kind: "insert", row }), builder),
    update: (patch: Row) => ((op = { kind: "update", patch }), builder),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), builder),
    maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

function client() {
  return {
    auth: {
      getUser: async () =>
        state.user
          ? { data: { user: { id: state.user, email: "x@mojljubimac.test", email_confirmed_at: "2026-10-01T00:00:00Z" } }, error: null }
          : { data: { user: null }, error: null },
    },
    rpc: async (name: string, args: Row = {}) => {
      state.rpcCalls.push({ name, args });
      if (name === "send_message") return sendMessageRpc(args);
      throw new Error(`unexpected rpc ${name}`);
    },
    from: (table: string) => query(table),
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async () => {
      state.notifications++;
      return { data: null, error: { message: "stubbed" } };
    },
  }),
}));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/integrations/webpush", () => ({ sendPush: vi.fn(), pushConfigFromEnv: () => null }));

const { sendMessage } = await import("@/lib/actions/messages");

const key = () => crypto.randomUUID();
const sends = () => state.rpcCalls.filter((c) => c.name === "send_message");

beforeEach(() => {
  state.user = IVANA;
  state.tables = {
    profiles: [IVANA, MARKO, JELENA, NIKOLA].map((id) => ({ id, deletion_requested_at: null })),
    organisation_memberships: [],
    rate_limit_counters: [],
    idempotency_keys: [],
  };
  state.conversations = [];
  state.messages = [];
  state.blocks = [{ blocker: JELENA, blocked: NIKOLA }];
  state.rpcCalls = [];
  state.notifications = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("FR-68 #1, #2 — start and continue", () => {
  it("#1: a message on a listing creates the conversation and delivers the first message", async () => {
    const result = await sendMessage({ listing_id: MARKO_LISTING, body: "  Zdravo! Da li je još dostupno?\n", idempotency_key: key() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created_conversation).toBe(true);
    expect(result.data.message.body).toBe("Zdravo! Da li je još dostupno?");
    expect(sends()[0].args).toEqual({ p_listing_id: MARKO_LISTING, p_conversation_id: null, p_body: "Zdravo! Da li je još dostupno?" });
    expect(state.notifications).toBe(1);
  });

  it("#2: a second start on the same listing reuses the conversation (BR-61)", async () => {
    const first = await sendMessage({ listing_id: MARKO_LISTING, body: "Zdravo", idempotency_key: key() });
    const second = await sendMessage({ listing_id: MARKO_LISTING, body: "Još jednom", idempotency_key: key() });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.created_conversation).toBe(false);
    expect(second.data.conversation.id).toBe(first.data.conversation.id);
    expect(state.conversations).toHaveLength(1);
  });

  it("replies in a conversation by conversation_id", async () => {
    const first = await sendMessage({ listing_id: MARKO_LISTING, body: "Zdravo", idempotency_key: key() });
    if (!first.ok) throw new Error("first send failed");
    state.user = MARKO;
    const reply = await sendMessage({ conversation_id: first.data.conversation.id, body: "Može sutra", idempotency_key: key() });
    expect(reply.ok).toBe(true);
    expect(sends()[1].args).toEqual({ p_listing_id: null, p_conversation_id: first.data.conversation.id, p_body: "Može sutra" });
  });
});

describe("FR-68 #3, #4 — who may send", () => {
  it("#3: the author cannot message their own listing (cannot_message_self)", async () => {
    state.user = MARKO;
    const result = await sendMessage({ listing_id: MARKO_LISTING, body: "Ja", idempotency_key: key() });
    expect(result).toMatchObject({ ok: false, error: { code: "cannot_message_self" } });
    expect(state.notifications).toBe(0);
  });

  it("#4: a Visitor is refused with 401 unauthenticated", async () => {
    state.user = null;
    const result = await sendMessage({ listing_id: MARKO_LISTING, body: "Zdravo", idempotency_key: key() });
    expect(result).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(sends()).toHaveLength(0);
  });

  it("a listing that is no longer active → listing_not_active (E-33)", async () => {
    const result = await sendMessage({ listing_id: EXPIRED_LISTING, body: "Zdravo", idempotency_key: key() });
    expect(result).toMatchObject({ ok: false, error: { code: "listing_not_active" } });
  });

  it("FR-70 #4: a blocked sender gets user_blocked and nothing is sent", async () => {
    state.user = NIKOLA;
    const result = await sendMessage({ listing_id: JELENA_LISTING, body: "Zdravo Jelena", idempotency_key: key() });
    expect(result).toMatchObject({ ok: false, error: { code: "user_blocked" } });
    expect(state.messages).toHaveLength(0);
    expect(state.notifications).toBe(0);
  });
});

describe("FR-68 #7 — text only, 1–2000 characters", () => {
  it("an empty message cannot be sent", async () => {
    const result = await sendMessage({ listing_id: MARKO_LISTING, body: " \n\t ", idempotency_key: key() });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { body: "required" } } });
    expect(sends()).toHaveLength(0);
  });

  it("2,001 characters are refused, 2,000 accepted", async () => {
    const tooLong = await sendMessage({ listing_id: MARKO_LISTING, body: "a".repeat(2001), idempotency_key: key() });
    expect(tooLong).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { body: "too_long" } } });
    const max = await sendMessage({ listing_id: MARKO_LISTING, body: "a".repeat(2000), idempotency_key: key() });
    expect(max.ok).toBe(true);
  });

  it("exactly one of listing_id and conversation_id; a uuid v4 idempotency key", async () => {
    expect(await sendMessage({ body: "Zdravo", idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fields: { listing_id: "invalid" } },
    });
    expect(
      await sendMessage({ listing_id: MARKO_LISTING, conversation_id: MARKO_LISTING, body: "Zdravo", idempotency_key: key() }),
    ).toMatchObject({ ok: false, error: { fields: { listing_id: "invalid" } } });
    expect(await sendMessage({ listing_id: MARKO_LISTING, body: "Zdravo", idempotency_key: "nije-uuid" })).toMatchObject({
      ok: false,
      error: { fields: { idempotency_key: "invalid" } },
    });
  });
});

describe("rate limit and idempotency (API §11, §3.3)", () => {
  it("the 31st message within an hour → rate_limited with details.retry_after_s", async () => {
    for (let i = 0; i < 30; i++) {
      const result = await sendMessage({ listing_id: MARKO_LISTING, body: `Poruka ${i + 1}`, idempotency_key: key() });
      expect(result.ok).toBe(true);
    }
    const blocked = await sendMessage({ listing_id: MARKO_LISTING, body: "Poruka 31", idempotency_key: key() });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe("rate_limited");
    expect(blocked.error.details?.retry_after_s).toBeGreaterThan(0);
    expect(blocked.error.details?.retry_after_s).toBeLessThanOrEqual(3600);
    expect(sends()).toHaveLength(30);
    expect(state.tables.rate_limit_counters).toEqual([
      expect.objectContaining({ user_id: IVANA, operation: "messages.send", count: 30 }),
    ]);
  });

  it("the limit is per user across all conversations", async () => {
    state.tables.rate_limit_counters.push({
      user_id: IVANA,
      operation: "messages.send",
      window_start: new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString(),
      count: 30,
    });
    expect(await sendMessage({ listing_id: JELENA_LISTING, body: "Zdravo", idempotency_key: key() })).toMatchObject({
      ok: false,
      error: { code: "rate_limited" },
    });
    state.user = MARKO;
    expect((await sendMessage({ listing_id: JELENA_LISTING, body: "Zdravo", idempotency_key: key() })).ok).toBe(true);
  });

  it("the same idempotency_key within 24 h returns the original result and sends nothing", async () => {
    const k = key();
    const first = await sendMessage({ listing_id: MARKO_LISTING, body: "Zdravo", idempotency_key: k });
    const repeat = await sendMessage({ listing_id: MARKO_LISTING, body: "Zdravo", idempotency_key: k });
    expect(repeat).toEqual(first);
    expect(sends()).toHaveLength(1);
    expect(state.messages).toHaveLength(1);
    expect(state.notifications).toBe(1);
  });
});
