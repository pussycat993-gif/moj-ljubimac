// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-30 action:whatsapp_connection (lib/actions/whatsapp.ts) over a fake server client, a fake service-role
// client and a faked Meta adapter: send_code → CodeSent (stateless wv_ verification_token, 10 min expiry,
// resend after 60 s, the verification_code template sent in the profile's language); verify with the right
// code → user_channels upserted (opted_in_at = now) and status connected; a wrong code, another user's token
// or an expired token → 422 verification_code_invalid; disconnect deletes the user_channels row and removes
// whatsapp from every reminder_preferences.channels (a type left empty → {email, push}); the 6th send_code
// in an hour → 429 rate_limited; a repeat with the same idempotency_key sends nothing (API §3.3).
// FR-23 #3: a Free user gets 403 premium_required (details.limit = "whatsapp") on send and verify.

type Row = Record<string, unknown>;

const IVANA = "a1000000-0000-4000-8000-000000000001";
const MARKO = "a1000000-0000-4000-8000-000000000002";

const state = {
  user: IVANA as string,
  premium: true,
  locale: "sr-Latn" as string | null,
  tables: {} as Record<string, Row[]>,
  sent: [] as { to: string; code: string; locale: string }[],
  sendResult: null as null | { status: "failed"; error: string; undeliverable: boolean },
};

vi.mock("@/lib/integrations/whatsapp", () => ({
  sendVerificationCode: async (input: { to: string; code: string; locale: string }) => {
    state.sent.push(input);
    return state.sendResult ?? { status: "delivered", id: "wamid.1" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ from: (t: string) => query(t) }) }));

const { whatsappConnection } = await import("@/lib/actions/whatsapp");

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  let payload: Row = {};
  let conflict: string[] = [];
  const rows = () => (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const run = async () => {
    state.tables[table] ??= [];
    if (table === "profiles") return { data: [{ id: state.user, deletion_requested_at: null, locale: state.locale }], error: null };
    if (table === "organisation_memberships") return { data: [], error: null };
    if (op === "insert") {
      const row = { ...payload, created_at: new Date().toISOString() };
      state.tables[table].push(row);
      return { data: [row], error: null };
    }
    if (op === "upsert") {
      const existing = state.tables[table].find((r) => conflict.every((c) => r[c] === payload[c]));
      if (existing) Object.assign(existing, payload);
      else state.tables[table].push({ ...payload });
      return { data: [existing ?? payload], error: null };
    }
    if (op === "update") {
      for (const r of rows()) Object.assign(r, payload);
      return { data: null, error: null };
    }
    if (op === "delete") {
      state.tables[table] = state.tables[table].filter((r) => !filters.every((f) => f(r)));
      return { data: null, error: null };
    }
    return { data: rows(), error: null };
  };
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push((r) => r[column] === value), api),
    gte: (column: string, value: unknown) => (filters.push((r) => String(r[column]) >= String(value)), api),
    contains: (column: string, values: unknown[]) =>
      (filters.push((r) => values.every((v) => (r[column] as unknown[]).includes(v))), api),
    insert: (value: Row) => ((op = "insert"), (payload = value), api),
    update: (value: Row) => ((op = "update"), (payload = value), api),
    upsert: (value: Row, options: { onConflict: string }) => (
      (op = "upsert"), (payload = value), (conflict = options.onConflict.split(",")), api
    ),
    delete: () => ((op = "delete"), api),
    maybeSingle: async () => {
      const r = await run();
      return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
    },
    single: async () => {
      const r = await run();
      return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
  };
  return api;
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: state.user, email: "ivana.petrovic@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => query(table),
    rpc: async (name: string) => {
      if (name === "is_premium") return { data: state.premium, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

let keyCounter = 0;
const key = () => `0b6f2c1e-6a4b-4c1d-8e2f-${String(++keyCounter).padStart(12, "0")}`;

async function sendCode(phone = "+381641234567") {
  const result = await whatsappConnection({ op: "send_code", phone, idempotency_key: key() });
  if (!result.ok) throw new Error(`send_code failed: ${result.error.code}`);
  return result.data as { phone: string; expires_at: string; resend_available_at: string; verification_token: string };
}

beforeEach(() => {
  state.user = IVANA;
  state.premium = true;
  state.locale = "sr-Latn";
  state.tables = {
    idempotency_keys: [],
    rate_limit_counters: [],
    user_channels: [],
    reminder_preferences: [],
  };
  state.sent = [];
  state.sendResult = null;
  vi.stubEnv("ACTION_TOKEN_SECRET", "action-secret-for-tests");
  vi.useRealTimers();
});

describe("EP-30 send_code", () => {
  it("returns CodeSent: the phone, expiry in 10 min, resend after 60 s and a stateless wv_ token; sends the code in the profile language", async () => {
    const before = Date.now();
    const sent = await sendCode();
    expect(sent.phone).toBe("+381641234567");
    expect(sent.verification_token).toMatch(/^wv_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const expires = new Date(sent.expires_at).getTime();
    const resend = new Date(sent.resend_available_at).getTime();
    expect(expires - before).toBeGreaterThanOrEqual(10 * 60 * 1000 - 50);
    expect(expires - before).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    expect(resend - before).toBeGreaterThanOrEqual(60 * 1000 - 50);
    expect(resend - before).toBeLessThanOrEqual(60 * 1000 + 1000);

    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]).toMatchObject({ to: "+381641234567", locale: "sr" });
    expect(state.sent[0].code).toMatch(/^\d{6}$/);
    // Nothing is stored until verify_code; the code itself never appears in the token.
    expect(state.tables.user_channels).toHaveLength(0);
    expect(sent.verification_token).not.toContain(state.sent[0].code);
  });

  it("an English profile gets the en template", async () => {
    state.locale = "en";
    await sendCode();
    expect(state.sent[0].locale).toBe("en");
  });

  it("a repeat with the same idempotency_key returns the original CodeSent and sends nothing", async () => {
    const k = key();
    const first = await whatsappConnection({ op: "send_code", phone: "+381641234567", idempotency_key: k });
    const second = await whatsappConnection({ op: "send_code", phone: "+381641234567", idempotency_key: k });
    expect(second).toEqual(first);
    expect(state.sent).toHaveLength(1);
  });

  it("validates the phone (E.164) → 422 fields.phone = invalid; Meta rejecting the number → fields.phone = undeliverable", async () => {
    const bad = await whatsappConnection({ op: "send_code", phone: "064 123", idempotency_key: key() });
    expect(bad).toEqual({ ok: false, error: expect.objectContaining({ code: "validation_failed", fields: { phone: "invalid" } }) });
    expect(state.sent).toHaveLength(0);

    state.sendResult = { status: "failed", error: "whatsapp_400_131026", undeliverable: true };
    const undeliverable = await whatsappConnection({ op: "send_code", phone: "+381641234567", idempotency_key: key() });
    expect(undeliverable).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation_failed", fields: { phone: "undeliverable" } }),
    });
  });

  it("the 6th send_code in an hour → 429 rate_limited with details.retry_after_s", async () => {
    for (let i = 0; i < 5; i++) await sendCode();
    const sixth = await whatsappConnection({ op: "send_code", phone: "+381641234567", idempotency_key: key() });
    expect(sixth.ok).toBe(false);
    if (sixth.ok) return;
    expect(sixth.error.code).toBe("rate_limited");
    expect(sixth.error.details?.retry_after_s).toBeGreaterThan(0);
    expect(state.sent).toHaveLength(5);
  });

  it("FR-23 #3: a Free user → 403 premium_required (details.limit = whatsapp) on send and verify; nothing is sent", async () => {
    const sent = await sendCode();
    state.premium = false;
    const send = await whatsappConnection({ op: "send_code", phone: "+381641234567", idempotency_key: key() });
    expect(send).toEqual({ ok: false, error: expect.objectContaining({ code: "premium_required", details: { limit: "whatsapp" } }) });
    const verify = await whatsappConnection({ op: "verify_code", verification_token: sent.verification_token, code: state.sent[0].code });
    expect(verify).toEqual({ ok: false, error: expect.objectContaining({ code: "premium_required", details: { limit: "whatsapp" } }) });
    expect(state.sent).toHaveLength(1);
    expect(state.tables.user_channels).toHaveLength(0);
  });
});

describe("EP-30 verify_code", () => {
  it("the right code upserts user_channels (address, opted_in_at) and returns status connected", async () => {
    const sent = await sendCode();
    const result = await whatsappConnection({ op: "verify_code", verification_token: sent.verification_token, code: state.sent[0].code });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ channel: "whatsapp", status: "connected", phone: "+381641234567" });
    expect(state.tables.user_channels).toEqual([
      expect.objectContaining({ user_id: IVANA, channel: "whatsapp", address: "+381641234567", opted_in_at: expect.any(String) }),
    ]);
    expect((result.data as { connected_at: string }).connected_at).toBe(state.tables.user_channels[0].opted_in_at);

    // Verifying again (another number) replaces the row: one row per (user, channel).
    const again = await sendCode("+381601112223");
    await whatsappConnection({ op: "verify_code", verification_token: again.verification_token, code: state.sent[1].code });
    expect(state.tables.user_channels).toHaveLength(1);
    expect(state.tables.user_channels[0].address).toBe("+381601112223");
  });

  it("a wrong code → 422 verification_code_invalid and nothing is stored", async () => {
    const sent = await sendCode();
    const wrong = String((Number(state.sent[0].code) + 1) % 1_000_000).padStart(6, "0");
    const result = await whatsappConnection({ op: "verify_code", verification_token: sent.verification_token, code: wrong });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "verification_code_invalid" }) });
    expect(state.tables.user_channels).toHaveLength(0);
  });

  it("a token issued to another user, or an expired token → 422 verification_code_invalid", async () => {
    const sent = await sendCode();
    state.user = MARKO;
    const other = await whatsappConnection({ op: "verify_code", verification_token: sent.verification_token, code: state.sent[0].code });
    expect(other).toEqual({ ok: false, error: expect.objectContaining({ code: "verification_code_invalid" }) });

    state.user = IVANA;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 11 * 60 * 1000));
    const expired = await whatsappConnection({ op: "verify_code", verification_token: sent.verification_token, code: state.sent[0].code });
    expect(expired).toEqual({ ok: false, error: expect.objectContaining({ code: "verification_code_invalid" }) });
    expect(state.tables.user_channels).toHaveLength(0);
  });

  it("a code that is not 6 digits → 422 validation_failed fields.code", async () => {
    const sent = await sendCode();
    const result = await whatsappConnection({ op: "verify_code", verification_token: sent.verification_token, code: "12ab" });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "validation_failed", fields: { code: "invalid" } }) });
  });
});

describe("EP-30 disconnect", () => {
  it("deletes the user_channels row and removes whatsapp from every type; a type left empty → {email, push}", async () => {
    state.tables.user_channels = [{ user_id: IVANA, channel: "whatsapp", address: "+381641234567", opted_in_at: "2026-10-20T08:00:00Z" }];
    state.tables.reminder_preferences = [
      { user_id: IVANA, type: "vaccination", channels: ["email", "whatsapp"] },
      { user_id: IVANA, type: "treatment_dose", channels: ["whatsapp"] },
      { user_id: IVANA, type: "birthday", channels: ["push"] },
      { user_id: MARKO, type: "vaccination", channels: ["whatsapp"] },
    ];
    // Disconnect is always allowed, also after Premium has ended.
    state.premium = false;
    const result = await whatsappConnection({ op: "disconnect" });
    expect(result).toEqual({ ok: true, data: { channel: "whatsapp", status: "not_connected", phone: null, connected_at: null } });
    expect(state.tables.user_channels).toHaveLength(0);
    expect(state.tables.reminder_preferences).toEqual([
      { user_id: IVANA, type: "vaccination", channels: ["email"] },
      { user_id: IVANA, type: "treatment_dose", channels: ["email", "push"] },
      { user_id: IVANA, type: "birthday", channels: ["push"] },
      { user_id: MARKO, type: "vaccination", channels: ["whatsapp"] },
    ]);
  });
});
