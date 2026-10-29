// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// EP-33 with WhatsApp live (Step 29) — runDispatch (lib/server/dispatch.ts) over a fake service-role client
// and fake senders (the Meta API is faked; database behaviour is proven in pgTAP):
// FR-23 #4 / BR-14a: the cap is checked per message — with 29 delivered this Belgrade month the 30th is
// still sent by WhatsApp, the next one in the same run falls back to email + push, increments fell_back and
// records whatsapp_cap_reached on a whatsapp delivery row (API §7.2); FR-23 #5: channels {email, whatsapp}
// → one reminder_deliveries row per channel; the reminder_due template carries the same dn_ token as the
// email link; a failed WhatsApp send falls back to email + push (API §9.4); members and Viber never get
// WhatsApp/Viber (BR-24, BR-14b).

import type { ClaimedOccurrence, DispatchRecipient } from "@/lib/server/dispatch";

const { runDispatch, MONTHLY_MESSAGE_CAP } = await import("@/lib/server/dispatch");

type Row = Record<string, unknown>;

const OWNER = "a1000000-0000-4000-8000-000000000001";
const MEMBER = "a1000000-0000-4000-8000-000000000003";
const PHONE = "+381641234567";

const state = {
  claims: [] as ClaimedOccurrence[][],
  inserts: [] as Row[],
  numbers: {} as Record<string, string>,
  numberReads: 0,
  emails: [] as { to: string; template: { id: string; variables: Record<string, string | null> } }[],
  pushes: [] as Row[],
  whatsapps: [] as { to: string; locale: string; pet: string; title: string; when: string; payload: string }[],
  whatsappResult: null as null | { status: "failed"; error: string; undeliverable: boolean },
};

function supabase() {
  return {
    rpc: async (fn: string) => {
      if (fn === "claim_due_occurrences") return { data: state.claims.shift() ?? [], error: null };
      if (fn === "mark_missed_occurrences") return { data: 0, error: null };
      if (fn === "dispatch_watchdog_due") return { data: false, error: null };
      return { data: [], error: null };
    },
    from: (table: string) => {
      if (table === "reminder_deliveries") {
        return {
          insert: async (rows: Row[]) => {
            state.inserts.push(...rows);
            return { error: null };
          },
        };
      }
      // user_channels: the opted-in WhatsApp number.
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => ((filters[column] = value), chain),
        not: () => chain,
        maybeSingle: async () => {
          state.numberReads++;
          const address = state.numbers[filters.user_id as string];
          return { data: filters.channel === "whatsapp" && address ? { address } : null, error: null };
        },
      };
      return chain;
    },
  };
}

function recipient(overrides: Partial<DispatchRecipient> = {}): DispatchRecipient {
  return {
    id: OWNER,
    is_owner: true,
    email: "ivana.petrovic@mojljubimac.test",
    full_name: "Ivana Petrović",
    locale: "sr-Latn",
    premium: true,
    channels: ["email", "whatsapp"],
    whatsapp_opted_in: true,
    viber_opted_in: false,
    cap_used: 0,
    push_subscriptions: [{ id: "ps-1", endpoint: "https://push.example.test/1", p256dh: "k", auth: "a" }],
    ...overrides,
  };
}

function occurrence(n: number, overrides: Partial<ClaimedOccurrence> = {}): ClaimedOccurrence {
  return {
    occurrence_id: `f9000000-0000-4000-8000-0000000000a${n}`,
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

function run(options: { live?: boolean } = {}) {
  const live = options.live ?? true;
  return runDispatch({
    supabase: supabase() as never,
    sendEmail: async (input) => {
      state.emails.push(input as never);
      return { status: "delivered", id: `re_${state.emails.length}` };
    },
    sendPush: async (_endpoints, payload) => {
      state.pushes.push(payload as never);
      return { status: "delivered", accepted: 1, removed: 0, provider_message_id: "pm_1", error: null };
    },
    signDoneToken: async (occurrenceId, recipientId) => `dn_${occurrenceId.slice(-2)}_${recipientId.slice(-2)}.sig`,
    siteUrl: "https://mojljubimac.rs",
    sendWhatsApp: live
      ? async (input) => {
          state.whatsapps.push(input);
          return state.whatsappResult ?? { status: "delivered", id: `wamid.${state.whatsapps.length}` };
        }
      : undefined,
    liveChannels: new Set(["whatsapp", "viber"]),
  });
}

const rows = (channel?: string) => state.inserts.filter((r) => channel === undefined || r.channel === channel);

beforeEach(() => {
  state.claims = [];
  state.inserts = [];
  state.numbers = { [OWNER]: PHONE };
  state.numberReads = 0;
  state.emails = [];
  state.pushes = [];
  state.whatsapps = [];
  state.whatsappResult = null;
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FR-23 #5 — one reminder_deliveries row per selected channel", () => {
  it("channels {email, whatsapp} → an email row and a whatsapp row; the template carries the dn_ token of the email link", async () => {
    state.claims = [[occurrence(1)]];
    const counters = await run();
    expect(counters).toMatchObject({ claimed: 1, delivered: 2, failed: 0, fell_back: 0 });
    expect(rows().map((r) => r.channel).sort()).toEqual(["email", "whatsapp"]);
    expect(rows("whatsapp")[0]).toMatchObject({
      occurrence_id: occurrence(1).occurrence_id,
      recipient_id: OWNER,
      status: "delivered",
      provider_message_id: "wamid.1",
      error: null,
      delivered_at: expect.any(String),
    });
    expect(state.whatsapps).toEqual([
      { to: PHONE, locale: "sr", pet: "Luna", title: "Besnilo", when: "26. 10. 2026. u 08:00", payload: "dn_a1_01.sig" },
    ]);
    expect(state.emails[0].template.variables.done_url).toBe("https://mojljubimac.rs/api/a/done?t=dn_a1_01.sig");
    expect(state.pushes).toHaveLength(0);
  });

  it("an English recipient gets the en template values", async () => {
    state.claims = [[occurrence(1, { recipients: [recipient({ locale: "en", channels: ["whatsapp"] })] })]];
    await run();
    expect(state.whatsapps[0]).toMatchObject({ locale: "en", when: "26 Oct 2026 at 08:00" });
  });
});

describe("FR-23 #4 — the monthly cap (BR-14a), checked per message", () => {
  it("with 29 delivered this month the 30th is still sent by WhatsApp; the next one in the run falls back to email + push", async () => {
    const capped = { recipients: [recipient({ cap_used: MONTHLY_MESSAGE_CAP - 1, channels: ["whatsapp"] })] };
    state.claims = [[occurrence(1, capped), occurrence(2, capped)]];
    const counters = await run();

    expect(state.whatsapps.map((w) => w.payload)).toEqual(["dn_a1_01.sig"]);
    expect(counters.fell_back).toBe(1);
    const second = rows().filter((r) => r.occurrence_id === occurrence(2).occurrence_id);
    expect(second.map((r) => [r.channel, r.status, r.error])).toEqual([
      ["whatsapp", "failed", "whatsapp_cap_reached"],
      ["email", "delivered", null],
      ["push", "delivered", null],
    ]);
    // The cap row records the fallback; it is not a failed send.
    expect(counters).toMatchObject({ delivered: 3, failed: 0 });
  });

  it("with 30 delivered this month the occurrence goes by email and push and fell_back is incremented", async () => {
    state.claims = [[occurrence(1, { recipients: [recipient({ cap_used: 30, channels: ["whatsapp"] })] })]];
    const counters = await run();
    expect(state.whatsapps).toHaveLength(0);
    expect(state.emails).toHaveLength(1);
    expect(state.pushes).toHaveLength(1);
    expect(counters.fell_back).toBe(1);
    expect(rows("whatsapp")).toEqual([expect.objectContaining({ status: "failed", error: "whatsapp_cap_reached", delivered_at: null })]);
  });
});

describe("fallbacks and limits", () => {
  it("a failed WhatsApp send is recorded failed and the occurrence falls back to email + push (API §9.4)", async () => {
    state.whatsappResult = { status: "failed", error: "whatsapp_500", undeliverable: false };
    state.claims = [[occurrence(1, { recipients: [recipient({ channels: ["whatsapp"] })] })]];
    const counters = await run();
    expect(rows().map((r) => [r.channel, r.status])).toEqual([
      ["whatsapp", "failed"],
      ["email", "delivered"],
      ["push", "delivered"],
    ]);
    expect(counters).toMatchObject({ delivered: 2, failed: 1, fell_back: 1 });
  });

  it("FR-25: no Premium, or no opted-in number → email + push, no WhatsApp call", async () => {
    state.claims = [
      [
        occurrence(1, { recipients: [recipient({ premium: false, channels: ["whatsapp"] })] }),
        occurrence(2, { recipients: [recipient({ whatsapp_opted_in: false, channels: ["whatsapp"] })] }),
      ],
    ];
    const counters = await run();
    expect(state.whatsapps).toHaveLength(0);
    expect(rows("whatsapp")).toHaveLength(0);
    expect(counters.fell_back).toBe(2);
    expect(state.emails).toHaveLength(2);
  });

  it("BR-24: a household member never gets WhatsApp; BR-14b: Viber is never sent", async () => {
    state.numbers[MEMBER] = "+381601112223";
    state.claims = [
      [
        occurrence(1, {
          viber_enabled: true,
          recipients: [
            recipient({ channels: ["email", "viber"], viber_opted_in: true }),
            recipient({ id: MEMBER, is_owner: false, channels: ["email", "whatsapp"] }),
          ],
        }),
      ],
    ];
    await run();
    expect(state.whatsapps).toHaveLength(0);
    expect(rows().map((r) => r.channel).sort()).toEqual(["email", "email", "push"]);
  });

  it("without a WhatsApp sender the channel is not live and falls back (Step 19 behaviour)", async () => {
    state.claims = [[occurrence(1, { recipients: [recipient({ channels: ["whatsapp"] })] })]];
    const counters = await run({ live: false });
    expect(state.whatsapps).toHaveLength(0);
    expect(rows("whatsapp")).toHaveLength(0);
    expect(counters.fell_back).toBe(1);
  });

  it("the number is read once per recipient per run", async () => {
    state.claims = [[occurrence(1), occurrence(2), occurrence(3)]];
    await run();
    expect(state.whatsapps).toHaveLength(3);
    expect(state.numberReads).toBe(1);
  });
});
