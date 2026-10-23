// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveChannels, MONTHLY_MESSAGE_CAP } = await import("@/lib/server/dispatch");
type Channel = import("@/lib/server/dispatch").Channel;

// EP-33 step 3 (FR-25 fallback, BR-14a, BR-14b, BR-16, BR-24): WhatsApp / Viber resolve to the
// fallback {email, push} — counted in fell_back — when the recipient has no Premium, Viber is off,
// there is no opted-in user_channels row, or this would be the 31st message of the month. Members get
// email and push only. In Step 19 no WhatsApp/Viber sender exists yet, so the dispatch passes no live
// channels and they always fall back.

const owner = {
  is_owner: true,
  premium: true,
  channels: ["whatsapp"] as Channel[],
  whatsapp_opted_in: true,
  viber_opted_in: true,
};
const live = new Set<Channel>(["whatsapp", "viber"]);
const ctx = { viberEnabled: true, liveChannels: live, capUsed: 0 };

describe("resolveChannels", () => {
  it("email and push stay as chosen", () => {
    expect(resolveChannels({ ...owner, channels: ["email"] }, ctx)).toEqual({ channels: ["email"], fellBack: 0 });
    expect(resolveChannels({ ...owner, channels: ["push", "email"] }, ctx)).toEqual({ channels: ["email", "push"], fellBack: 0 });
  });

  it("FR-25: after Premium expires, WhatsApp falls back to email + push", () => {
    expect(resolveChannels({ ...owner, premium: false }, ctx)).toEqual({ channels: ["email", "push"], fellBack: 1 });
  });

  it("FR-25: after Premium expires, Viber falls back to email + push", () => {
    expect(resolveChannels({ ...owner, premium: false, channels: ["viber"] }, ctx)).toEqual({
      channels: ["email", "push"],
      fellBack: 1,
    });
  });

  it("BR-14b: Viber switched off by the Operator falls back", () => {
    expect(resolveChannels({ ...owner, channels: ["viber"] }, { ...ctx, viberEnabled: false })).toEqual({
      channels: ["email", "push"],
      fellBack: 1,
    });
  });

  it("no opted-in user_channels row falls back", () => {
    expect(resolveChannels({ ...owner, whatsapp_opted_in: false }, ctx)).toEqual({ channels: ["email", "push"], fellBack: 1 });
    expect(resolveChannels({ ...owner, channels: ["viber"], viber_opted_in: false }, ctx)).toEqual({
      channels: ["email", "push"],
      fellBack: 1,
    });
  });

  it("BR-14a: the 30th message of the month is sent, the 31st falls back", () => {
    expect(MONTHLY_MESSAGE_CAP).toBe(30);
    expect(resolveChannels(owner, { ...ctx, capUsed: 29 })).toEqual({ channels: ["whatsapp"], fellBack: 0 });
    expect(resolveChannels(owner, { ...ctx, capUsed: 30 })).toEqual({ channels: ["email", "push"], fellBack: 1 });
  });

  it("each replaced channel counts once; the fallback is not duplicated", () => {
    expect(resolveChannels({ ...owner, premium: false, channels: ["email", "whatsapp", "viber"] }, ctx)).toEqual({
      channels: ["email", "push"],
      fellBack: 2,
    });
  });

  it("Step 19: with no live WhatsApp/Viber sender, an otherwise eligible Premium owner falls back", () => {
    const noSender = { ...ctx, liveChannels: new Set<Channel>() };
    expect(resolveChannels(owner, noSender)).toEqual({ channels: ["email", "push"], fellBack: 1 });
    expect(resolveChannels({ ...owner, channels: ["viber", "email"] }, noSender)).toEqual({
      channels: ["email", "push"],
      fellBack: 1,
    });
  });

  it("BR-24: members are limited to email and push, even with WhatsApp in their preferences", () => {
    const member = { ...owner, is_owner: false };
    expect(resolveChannels({ ...member, channels: ["email", "whatsapp", "viber"] }, ctx)).toEqual({
      channels: ["email"],
      fellBack: 0,
    });
    expect(resolveChannels({ ...member, channels: ["push", "whatsapp"] }, ctx)).toEqual({ channels: ["push"], fellBack: 0 });
    expect(resolveChannels({ ...member, channels: ["whatsapp"] }, ctx)).toEqual({ channels: [], fellBack: 0 });
  });
});
