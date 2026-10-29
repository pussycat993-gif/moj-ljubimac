// @vitest-environment node
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// API §9.1 — /api/webhooks/whatsapp with the service-role client and the outbound Meta call faked
// (mark_occurrence_done_for is proven in supabase/tests/claim_due_occurrences.test.sql). GET handshake;
// POST: invalid X-Hub-Signature-256 → 401 invalid_signature; FR-24 #1 from WhatsApp: a button reply whose
// payload is the signed dn_ token marks the instance done as the recipient exactly like EP-32 and replies
// "Označeno kao urađeno. {pet}: {title} — označeno u {time}."; bad tokens, lost access and read-only
// households get the action-page bodies; status events update the delivery row by provider_message_id
// (last write wins by timestamp); everything else is ignored; always 200 once the signature is valid.

const fake = vi.hoisted(() => ({
  profiles: {} as Record<string, { locale: string }>,
  rpcResult: { data: null, error: null } as { data: unknown; error: { message: string; code?: string } | null },
  rpcCalls: [] as { fn: string; args: unknown }[],
  updates: [] as { table: string; values: Record<string, unknown>; filters: [string, ...unknown[]][] }[],
  replies: [] as { to: string; body: string }[],
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      fake.rpcCalls.push({ fn, args });
      return fake.rpcResult;
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => ({ data: fake.profiles[id] ?? null, error: null }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        const entry = { table, values, filters: [] as [string, ...unknown[]][] };
        fake.updates.push(entry);
        const chain = {
          eq: (...a: unknown[]) => (entry.filters.push(["eq", ...a]), chain),
          lte: (...a: unknown[]) => (entry.filters.push(["lte", ...a]), chain),
          or: (...a: unknown[]) => (entry.filters.push(["or", ...a]), chain),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
        };
        return chain;
      },
    }),
  }),
}));

vi.mock("@/lib/integrations/whatsapp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/whatsapp")>()),
  sendText: async (input: { to: string; body: string }) => {
    fake.replies.push(input);
    return { status: "delivered", id: "wamid.reply" };
  },
}));

const { GET, POST } = await import("@/app/api/webhooks/whatsapp/route");
const { signDoneToken, signActionToken } = await import("@/lib/server/action-tokens");

const APP_SECRET = "meta-app-secret";
const OCC = "f9000000-0000-4000-8000-0000000000a1";
const RECIPIENT = "a1000000-0000-4000-8000-000000000001";
const FROM = "381641234567";

function doneOccurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: OCC,
    type: "vaccination",
    title: "Besnilo",
    pet_name: "Luna",
    status: "done",
    // 08:15 Belgrade (CEST)
    done_at: "2026-10-23T06:15:00+00:00",
    done_by: RECIPIENT,
    ...overrides,
  };
}

const sign = (raw: string, secret = APP_SECRET) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

function post(payload: unknown, signature?: string | null) {
  const raw = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const header = signature === undefined ? sign(raw) : signature;
  if (header !== null) headers["x-hub-signature-256"] = header;
  return new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "POST", headers, body: raw });
}

function envelope(value: Record<string, unknown>) {
  return { object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value }] }] };
}

const buttonReply = (payload: string) =>
  envelope({
    messaging_product: "whatsapp",
    contacts: [{ wa_id: FROM }],
    messages: [{ from: FROM, id: "wamid.in", timestamp: "1761200100", type: "button", button: { payload, text: "Urađeno" } }],
  });

const status = (id: string, value: string, timestamp: number, errors?: unknown[]) =>
  ({ id, status: value, timestamp: String(timestamp), recipient_id: FROM, ...(errors ? { errors } : {}) });

beforeEach(() => {
  fake.profiles = { [RECIPIENT]: { locale: "sr-Latn" } };
  fake.rpcResult = { data: doneOccurrence(), error: null };
  fake.rpcCalls = [];
  fake.updates = [];
  fake.replies = [];
  vi.stubEnv("ACTION_TOKEN_SECRET", "action-secret-for-tests");
  vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify-me");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET — Meta verification handshake", () => {
  it("echoes hub.challenge when hub.verify_token matches", async () => {
    const url = "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1158201444";
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("1158201444");
  });

  it("a wrong verify token → 401", async () => {
    const url = "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1";
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "invalid_signature" });
  });
});

describe("POST — signature (API §9.1)", () => {
  it("a missing or invalid X-Hub-Signature-256 → 401 invalid_signature and nothing happens", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, new Date());
    for (const header of [null, "sha256=00", sign(JSON.stringify(buttonReply(token)), "other-secret")]) {
      const response = await POST(post(buttonReply(token), header));
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "invalid_signature" });
    }
    expect(fake.rpcCalls).toEqual([]);
    expect(fake.replies).toEqual([]);
  });
});

describe("POST — FR-24 #1: the 'Urađeno' quick reply", () => {
  it("marks the instance done as the recipient (EP-32 rules) and replies with the confirmation", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, new Date());
    const response = await POST(post(buttonReply(token)));
    expect(response.status).toBe(200);
    expect(fake.rpcCalls).toEqual([{ fn: "mark_occurrence_done_for", args: { p_occurrence_id: OCC, p_recipient_id: RECIPIENT } }]);
    expect(fake.replies).toEqual([{ to: FROM, body: "Označeno kao urađeno. Luna: Besnilo — označeno u 08:15." }]);
  });

  it("replies in the recipient's locale (en)", async () => {
    fake.profiles[RECIPIENT] = { locale: "en" };
    await POST(post(buttonReply(await signDoneToken(OCC, RECIPIENT, new Date()))));
    expect(fake.replies).toEqual([{ to: FROM, body: "Marked as done. Luna: Besnilo — marked at 08:15." }]);
  });

  it("a repeated reply (Meta delivers twice) is idempotent: the same done instance, the same confirmation", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, new Date());
    await POST(post(buttonReply(token)));
    await POST(post(buttonReply(token)));
    expect(fake.rpcCalls).toHaveLength(2);
    expect(fake.replies[0]).toEqual(fake.replies[1]);
  });

  it("an expired or tampered token marks nothing and replies with the action_expired_page body", async () => {
    const expired = await signDoneToken(OCC, RECIPIENT, new Date(Date.now() - 25 * 60 * 60 * 1000));
    const tampered = `${(await signDoneToken(OCC, RECIPIENT, new Date())).slice(0, -2)}xx`;
    const otherKind = await signActionToken("hh", [OCC, RECIPIENT], new Date(Date.now() + 60_000));
    for (const token of [expired, tampered]) {
      expect((await POST(post(buttonReply(token)))).status).toBe(200);
    }
    // A payload that is not a dn_ token is not a done reply at all.
    expect((await POST(post(buttonReply(otherKind)))).status).toBe(200);
    expect(fake.rpcCalls).toEqual([]);
    expect(fake.replies).toEqual([
      { to: FROM, body: "Link važi 24 sata i samo jednom. Otvori aplikaciju i označi podsetnik tamo." },
      { to: FROM, body: "Link važi 24 sata i samo jednom. Otvori aplikaciju i označi podsetnik tamo." },
    ]);
  });

  it("lost access → the not_found body; a read-only household → the household_read_only body", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, new Date());
    fake.rpcResult = { data: null, error: { code: "P0001", message: "not_found" } };
    await POST(post(buttonReply(token)));
    fake.rpcResult = { data: null, error: { code: "P0001", message: "household_read_only" } };
    await POST(post(buttonReply(token)));
    expect(fake.replies.map((r) => r.body)).toEqual([
      "Više nemaš pristup ovom podsetniku.",
      "Vlasniku domaćinstva je istekao Premium, pa podsetnik ne možeš da označiš.",
    ]);
  });

  it("an internal failure is logged and still answered 200", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.rpcResult = { data: null, error: { code: "XX000", message: "boom" } };
    const response = await POST(post(buttonReply(await signDoneToken(OCC, RECIPIENT, new Date()))));
    expect(response.status).toBe(200);
    expect(error).toHaveBeenCalled();
    expect(fake.replies).toEqual([]);
  });
});

describe("POST — status events update reminder_deliveries by provider_message_id", () => {
  it("delivered sets delivered_at to the event time; failed marks the row failed with the Meta error", async () => {
    const t = 1761200000; // 2025-10-23T06:13:20Z
    const response = await POST(
      post(
        envelope({
          statuses: [
            status("wamid.A", "delivered", t),
            status("wamid.B", "failed", t, [{ code: 131026, title: "Message undeliverable" }]),
          ],
        }),
      ),
    );
    expect(response.status).toBe(200);
    const at = new Date(t * 1000 + 999).toISOString();
    expect(fake.updates).toEqual([
      {
        table: "reminder_deliveries",
        values: { delivered_at: at },
        filters: [
          ["eq", "provider_message_id", "wamid.A"],
          ["eq", "channel", "whatsapp"],
          ["eq", "status", "delivered"],
          ["lte", "delivered_at", at],
        ],
      },
      {
        table: "reminder_deliveries",
        values: { status: "failed", error: "whatsapp_131026: Message undeliverable", delivered_at: null },
        filters: [
          ["eq", "provider_message_id", "wamid.B"],
          ["eq", "channel", "whatsapp"],
          ["or", `delivered_at.is.null,delivered_at.lte.${at}`],
        ],
      },
    ]);
  });

  it("last write wins by timestamp: only the latest event per message is applied; sent changes nothing", async () => {
    const t = 1761200000;
    await POST(
      post(
        envelope({
          statuses: [
            status("wamid.A", "failed", t + 5, [{ code: 131049, title: "Not delivered" }]),
            status("wamid.A", "delivered", t + 2),
            status("wamid.C", "sent", t),
          ],
        }),
      ),
    );
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0].values).toMatchObject({ status: "failed" });
  });

  it("anything else (text messages, read receipts, malformed bodies) is ignored with 200", async () => {
    for (const payload of [
      envelope({ messages: [{ from: FROM, id: "wamid.t", timestamp: "1", type: "text", text: { body: "Urađeno" } }] }),
      envelope({ statuses: [status("wamid.R", "read", 1761200000)] }),
      { object: "whatsapp_business_account" },
    ]) {
      expect((await POST(post(payload))).status).toBe(200);
    }
    expect(fake.updates).toEqual([]);
    expect(fake.rpcCalls).toEqual([]);
    expect(fake.replies).toEqual([]);
  });
});
