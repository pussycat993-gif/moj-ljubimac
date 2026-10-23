// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-50 #2 and FR-49 #3 — EP-59 sendRecordTransfer / resendRecordTransfer (lib/actions/transfers.ts) over a fake
// server client that models rpc:create_record_transfer / rpc:resend_record_transfer: a new transfer is valid 30 days
// (the tr_ token is signed per API §9.3 with the same expiry, and only its SHA-256 hash reaches the database);
// re-send creates a new row with a new token and expires the previous pending one; sending marks a breeder's
// offspring Sold (a shelter animal Adopted); the record_transfer email carries /poziv/<token>; a repeat with the
// same idempotency key sends nothing; Volunteer → forbidden_role; a pet already handed over → invitation_used.
// Resend is faked. The database side is proven in supabase/tests/record_transfers.test.sql.

type Row = Record<string, unknown>;

const NIKOLA = "a1000000-0000-4000-8000-000000000005";
const ZLATKO = "f9250000-0000-4000-8000-000000000001";
const SITE = "https://mojljubimac.test";
const DAY = 24 * 60 * 60 * 1000;

type Transfer = { id: string; pet_id: string; status: string; recipient_email: string; token_hash: string; created_at: string; expires_at: string };

const state = {
  role: "admin" as "admin" | "volunteer",
  transfers: [] as Transfer[],
  pet: { offspring_status: "reserved" as string },
  idempotency: [] as Row[],
  rpcCalls: [] as { name: string; args: Row }[],
  emails: [] as { to: string; locale: string; template: { id: string; variables: Record<string, string> } }[],
};

const sendEmail = vi.fn(async (input: (typeof state.emails)[number]) => {
  state.emails.push(input);
  return { status: "delivered" as const, id: "re_1" };
});
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: (input: (typeof state.emails)[number]) => sendEmail(input) }));
vi.mock("@/lib/integrations/r2", () => ({ r2: () => ({}), safeFileName: (n: string) => n }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { sendRecordTransfer, resendRecordTransfer } = await import("@/lib/actions/transfers");
const { hashToken, verifyActionToken } = await import("@/lib/server/action-tokens");

function dbError(message: string, details: string | null = null) {
  return { data: null, error: { code: "P0001", message, details } };
}

function json(t: Transfer) {
  return {
    id: t.id,
    pet_id: t.pet_id,
    status: t.status,
    recipient_email: t.recipient_email,
    sent_at: t.created_at,
    expires_at: t.expires_at,
    is_expired: t.status === "expired",
    accepted_at: null,
  };
}

/** create_record_transfer as the database does it. */
function createRpc(args: Row) {
  if (state.role !== "admin") return dbError("forbidden_role");
  if (state.transfers.some((t) => t.pet_id === args.p_pet_id && t.status === "accepted")) return dbError("invitation_used");
  for (const t of state.transfers) if (t.pet_id === args.p_pet_id && t.status === "pending") t.status = "expired";
  const now = new Date();
  const row: Transfer = {
    id: String(args.p_id),
    pet_id: String(args.p_pet_id),
    status: "pending",
    recipient_email: String(args.p_recipient_email),
    token_hash: String(args.p_token_hash),
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 30 * DAY).toISOString(),
  };
  state.transfers.push(row);
  state.pet.offspring_status = "sold";
  return {
    data: {
      transfer: json(row),
      organisation_name: "Odgajivačnica Đorđević",
      pet_name: "Zlatko",
      sender_locale: "sr-Latn",
      recipient_locale: row.recipient_email === "en@mojljubimac.test" ? "en" : null,
    },
    error: null,
  };
}

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: NIKOLA, email: "nikola@mojljubimac.test", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      let insert: Row | null = null;
      const run = async () => {
        if (table === "profiles") return { data: [{ id: NIKOLA, deletion_requested_at: null }], error: null };
        if (table === "organisation_memberships") {
          return { data: [{ organisation_id: "b2", organisations: { approval_status: "approved" } }], error: null };
        }
        if (insert) {
          state.idempotency.push({ ...insert, created_at: new Date().toISOString() });
          return { data: null, error: null };
        }
        return { data: state.idempotency.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null };
      };
      const api = {
        select: () => api,
        eq: (c: string, v: unknown) => (filters.push([c, v]), api),
        gte: () => api,
        insert: (value: Row) => ((insert = value), api),
        maybeSingle: async () => {
          const r = await run();
          return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
        },
        then: (resolve: (v: unknown) => unknown) => run().then(resolve),
      };
      return api;
    },
    rpc: async (name: string, args: Row = {}) => {
      state.rpcCalls.push({ name, args });
      if (name === "create_record_transfer") return createRpc(args);
      if (name === "resend_record_transfer") {
        const earlier = state.transfers.find((t) => t.id === args.p_transfer_id);
        if (!earlier) return dbError("not_found");
        return createRpc({
          p_id: args.p_new_id,
          p_pet_id: earlier.pet_id,
          p_recipient_email: earlier.recipient_email,
          p_token_hash: args.p_token_hash,
        });
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

function tokenOf(url: string) {
  return decodeURIComponent(url.split("/poziv/")[1] ?? "");
}

beforeEach(() => {
  vi.stubEnv("ACTION_TOKEN_SECRET", "test-action-token-secret");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  state.role = "admin";
  state.transfers = [];
  state.pet = { offspring_status: "reserved" };
  state.idempotency = [];
  state.rpcCalls = [];
  state.emails = [];
  sendEmail.mockClear();
});

describe("FR-50 #2 — a new transfer is valid 30 days", () => {
  it("expires_at = now + 30 days, the tr_ token carries the same expiry and only its hash is stored", async () => {
    const before = Date.now();
    const result = await sendRecordTransfer({ pet_id: ZLATKO, recipient_email: " Ivana.Petrovic@MojLjubimac.test ", idempotency_key: crypto.randomUUID() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ pet_id: ZLATKO, status: "pending", recipient_email: "ivana.petrovic@mojljubimac.test" });
    const lifetime = new Date(result.data.expires_at).getTime() - new Date(result.data.sent_at).getTime();
    expect(lifetime).toBe(30 * DAY);

    const call = state.rpcCalls[0];
    expect(call.args.p_recipient_email).toBe("ivana.petrovic@mojljubimac.test");
    const token = tokenOf(state.emails[0].template.variables.url);
    expect(token.startsWith("tr_")).toBe(true);
    expect(call.args.p_token_hash).toBe(await hashToken(token));
    expect(JSON.stringify(call.args)).not.toContain(token);

    const check = await verifyActionToken(token, "tr", { fieldCount: 1 });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.token.fields).toEqual([call.args.p_id]);
    const exp = check.token.expiresAt.getTime();
    expect(exp).toBeGreaterThanOrEqual(before + 30 * DAY - 1000);
    expect(exp).toBeLessThanOrEqual(Date.now() + 30 * DAY);
  });

  it("emails the record_transfer template with the /poziv/<token> link, in the recipient's language", async () => {
    await sendRecordTransfer({ pet_id: ZLATKO, recipient_email: "en@mojljubimac.test", idempotency_key: crypto.randomUUID() });
    expect(state.emails[0]).toMatchObject({
      to: "en@mojljubimac.test",
      locale: "en",
      template: { id: "record_transfer", variables: { organisation: "Odgajivačnica Đorđević", pet: "Zlatko" } },
    });
    expect(state.emails[0].template.variables.url).toMatch(new RegExp(`^${SITE}/poziv/tr_`));
    expect(state.emails[0].template.variables.date).not.toMatch(/\.$/);
  });

  it("re-send creates a new row with a new token and expires the previous pending one", async () => {
    const first = await sendRecordTransfer({ pet_id: ZLATKO, recipient_email: "ivana@mojljubimac.test", idempotency_key: crypto.randomUUID() });
    if (!first.ok) throw new Error("send failed");
    const again = await resendRecordTransfer({ transfer_id: first.data.id, idempotency_key: crypto.randomUUID() });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.id).not.toBe(first.data.id);
    expect(again.data.recipient_email).toBe("ivana@mojljubimac.test");
    expect(state.transfers.find((t) => t.id === first.data.id)?.status).toBe("expired");
    expect(state.transfers[0].token_hash).not.toBe(state.transfers[1].token_hash);
    expect(tokenOf(state.emails[1].template.variables.url)).not.toBe(tokenOf(state.emails[0].template.variables.url));
  });

  it("a repeat with the same idempotency key returns the original and sends nothing", async () => {
    const key = crypto.randomUUID();
    const first = await sendRecordTransfer({ pet_id: ZLATKO, recipient_email: "ivana@mojljubimac.test", idempotency_key: key });
    const second = await sendRecordTransfer({ pet_id: ZLATKO, recipient_email: "ivana@mojljubimac.test", idempotency_key: key });
    expect(second).toEqual(first);
    expect(state.emails).toHaveLength(1);
    expect(state.transfers).toHaveLength(1);
  });
});

describe("FR-49 #3 — sending the transfer marks the offspring Sold", () => {
  it("offspring_status reserved → sold", async () => {
    await sendRecordTransfer({ pet_id: ZLATKO, recipient_email: "ivana@mojljubimac.test", idempotency_key: crypto.randomUUID() });
    expect(state.pet.offspring_status).toBe("sold");
  });
});

describe("EP-59 errors", () => {
  it("a bad email → 422 validation_failed before any database call", async () => {
    const result = await sendRecordTransfer({ pet_id: ZLATKO, recipient_email: "nije-mejl", idempotency_key: crypto.randomUUID() });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed", fields: { recipient_email: "invalid" } } });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("a Volunteer → 403 forbidden_role and no email", async () => {
    state.role = "volunteer";
    const result = await sendRecordTransfer({ pet_id: ZLATKO, recipient_email: "ivana@mojljubimac.test", idempotency_key: crypto.randomUUID() });
    expect(result).toMatchObject({ ok: false, error: { code: "forbidden_role" } });
    expect(state.emails).toHaveLength(0);
  });

  it("the pet already handed over → 409 invitation_used", async () => {
    state.transfers.push({
      id: "t0", pet_id: ZLATKO, status: "accepted", recipient_email: "x@x.rs", token_hash: "h", created_at: "", expires_at: "",
    });
    const result = await sendRecordTransfer({ pet_id: ZLATKO, recipient_email: "ivana@mojljubimac.test", idempotency_key: crypto.randomUUID() });
    expect(result).toMatchObject({ ok: false, error: { code: "invitation_used" } });
  });
});

describe("Design §9.1 record_transfer", () => {
  it("renders subject, body and the Prihvati karton button", async () => {
    const { renderEmail } = await vi.importActual<typeof import("@/lib/integrations/resend")>("@/lib/integrations/resend");
    const email = renderEmail(
      { id: "record_transfer", variables: { organisation: "Azil Šapica", pet: "Žuća", date: "22. 11. 2026", url: `${SITE}/poziv/tr_x.y` } },
      "sr",
    );
    expect(email.subject).toBe("Stiže ti karton: Žuća");
    expect(email.text).toContain("Azil Šapica ti šalje ceo karton (ljubimac: Žuća) — vakcine, preglede i priloge. Link važi do 22. 11. 2026.");
    expect(email.text).toContain(`Prihvati karton: ${SITE}/poziv/tr_x.y`);
  });
});
