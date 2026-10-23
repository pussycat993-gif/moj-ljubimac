// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// FR-29 #2 / BR-24 — the Step 19 dispatch module as it is (lib/server/dispatch.ts, not edited here): an
// opted-in household member gets reminders for a shared pet by email and push only, even when their own
// preferences include WhatsApp and the owner has Premium (and WhatsApp were live). The owner keeps
// WhatsApp. Recipients and opt-in come from claim_due_occurrences (pgTAP: claim_due_occurrences.test.sql).

const { resolveChannels, runDispatch } = await import("@/lib/server/dispatch");
type Channel = import("@/lib/server/dispatch").Channel;
type ClaimedOccurrence = import("@/lib/server/dispatch").ClaimedOccurrence;

const live = new Set<Channel>(["whatsapp", "viber"]);
const ctx = { viberEnabled: true, liveChannels: live, capUsed: 0 };

const owner = {
  id: "a1000000-0000-4000-8000-000000000001",
  is_owner: true,
  email: "ivana.petrovic@mojljubimac.test",
  full_name: "Ivana Petrović",
  locale: "sr-Latn",
  premium: true,
  channels: ["whatsapp", "email"] as Channel[],
  whatsapp_opted_in: true,
  viber_opted_in: false,
  cap_used: 0,
  push_subscriptions: [] as { id: string; endpoint: string; p256dh: string; auth: string }[],
};
const member = {
  id: "a1000000-0000-4000-8000-000000000003",
  is_owner: false,
  email: "jelena.nikolic@mojljubimac.test",
  full_name: "Jelena Nikolić",
  locale: "sr-Latn",
  // Members use Free rules (BR-24); even a member with Premium and WhatsApp set up gets email + push only.
  premium: true,
  channels: ["whatsapp", "email", "push"] as Channel[],
  whatsapp_opted_in: true,
  viber_opted_in: true,
  cap_used: 0,
  push_subscriptions: [{ id: "s1000000-0000-4000-8000-000000000001", endpoint: "https://push.example/jelena", p256dh: "p", auth: "a" }],
};

describe("FR-29 #2: member reminder channels", () => {
  it("resolveChannels gives an opted-in member only email and push, with WhatsApp in their preferences", () => {
    expect(resolveChannels(member, ctx)).toEqual({ channels: ["email", "push"], fellBack: 0 });
    expect(resolveChannels({ ...member, channels: ["whatsapp", "viber", "email"] }, ctx).channels).toEqual(["email"]);
  });

  it("…while the Premium owner of the same reminder keeps WhatsApp", () => {
    expect(resolveChannels(owner, ctx)).toEqual({ channels: ["email", "whatsapp"], fellBack: 0 });
  });

  it("a dispatch run sends the member email and push only — never WhatsApp", async () => {
    const occurrence: ClaimedOccurrence = {
      occurrence_id: "o1000000-0000-4000-8000-000000000001",
      reminder_id: "r1000000-0000-4000-8000-000000000001",
      due_at: "2026-10-26T07:00:00Z",
      notify_at: "2026-10-26T07:00:00Z",
      type: "vaccination",
      title: "Besnilo — Rabisin",
      pet_id: "c1000000-0000-4000-8000-000000000001",
      pet_name: "Luna",
      viber_enabled: true,
      recipients: [owner, member],
    };
    const inserted: Record<string, unknown>[] = [];
    let claims = 0;
    const supabase = {
      rpc: async (fn: string) => {
        if (fn === "claim_due_occurrences") return { data: claims++ === 0 ? [occurrence] : [], error: null };
        if (fn === "claim_resend_occurrences") return { data: [], error: null };
        if (fn === "mark_missed_occurrences") return { data: 0, error: null };
        if (fn === "dispatch_watchdog_due") return { data: false, error: null };
        throw new Error(fn);
      },
      from: () => ({
        insert: async (rows: Record<string, unknown>[]) => {
          inserted.push(...rows);
          return { error: null };
        },
      }),
    };
    const sendEmail = vi.fn(async () => ({ status: "delivered" as const, id: "re_1" }));
    const sendPush = vi.fn(async () => ({ status: "delivered" as const, accepted: 1, removed: 0, provider_message_id: "push_1", error: null }));

    await runDispatch({
      supabase: supabase as never,
      sendEmail,
      sendPush,
      signDoneToken: async (o, r) => `dn_${o}_${r}`,
      siteUrl: "https://mojljubimac.test",
      liveChannels: live,
    });

    const memberRows = inserted.filter((row) => row.recipient_id === member.id).map((row) => row.channel);
    expect(memberRows.sort()).toEqual(["email", "push"]);
    expect(inserted.some((row) => row.recipient_id === member.id && (row.channel === "whatsapp" || row.channel === "viber"))).toBe(false);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: member.email }));
    expect(sendPush).toHaveBeenCalledWith(member.push_subscriptions, expect.objectContaining({ title: "Luna: Besnilo — Rabisin" }));
  });
});
