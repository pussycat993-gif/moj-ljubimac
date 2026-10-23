// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { signActionToken, verifyActionToken, signDoneToken, randomToken, hashToken, DONE_TOKEN_TTL_MS } = await import(
  "@/lib/server/action-tokens"
);

// lib/server/action-tokens.ts (API §9.3, TC ADR-16): dn_ + base64url("dn|occurrence|recipient|exp|nonce")
// + "." + base64url(HMAC-SHA256 with ACTION_TOKEN_SECRET). FR-24 from the message relies on these
// tokens being bound to one occurrence and one recipient and expiring after 24 h.

const OCC = "f9000000-0000-4000-8000-0000000000a1";
const RECIPIENT = "a1000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-10-23T08:00:00Z");

function decodePayload(token: string) {
  const body = token.slice(token.indexOf("_") + 1, token.indexOf("."));
  return Buffer.from(body, "base64url").toString("utf8");
}

describe("action tokens", () => {
  beforeEach(() => {
    vi.stubEnv("ACTION_TOKEN_SECRET", "test-secret-of-sufficient-length");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs dn_ tokens in the §9.3 format, bound to occurrence and recipient", async () => {
    const token = await signActionToken("dn", [OCC, RECIPIENT], new Date(NOW.getTime() + DONE_TOKEN_TTL_MS));
    expect(token).toMatch(/^dn_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    const parts = decodePayload(token).split("|");
    expect(parts.slice(0, 3)).toEqual(["dn", OCC, RECIPIENT]);
    expect(Number(parts[3])).toBe(Math.floor(NOW.getTime() / 1000) + 24 * 60 * 60);
    expect(parts[4]).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("verifies a valid token and returns its fields and expiry", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, NOW);
    const check = await verifyActionToken(token, "dn", { now: NOW, fieldCount: 2 });
    expect(check).toEqual({
      ok: true,
      token: { kind: "dn", fields: [OCC, RECIPIENT], expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000) },
    });
  });

  it("each signature is unique (random nonce)", async () => {
    const a = await signDoneToken(OCC, RECIPIENT, NOW);
    const b = await signDoneToken(OCC, RECIPIENT, NOW);
    expect(a).not.toBe(b);
  });

  it("is valid for 24 hours from send, then expired (with the decoded fields)", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, NOW);
    const justBefore = new Date(NOW.getTime() + 24 * 60 * 60 * 1000 - 1000);
    expect((await verifyActionToken(token, "dn", { now: justBefore })).ok).toBe(true);
    const after = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const check = await verifyActionToken(token, "dn", { now: after });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe("expired");
      expect(check.token?.fields).toEqual([OCC, RECIPIENT]);
    }
  });

  it("rejects a token whose payload was changed (another recipient)", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, NOW);
    const forgedPayload = decodePayload(token).replace(RECIPIENT, "a1000000-0000-4000-8000-000000000001");
    const forged = `dn_${Buffer.from(forgedPayload).toString("base64url")}${token.slice(token.indexOf("."))}`;
    expect(await verifyActionToken(forged, "dn", { now: NOW })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a changed signature and a token signed with another secret", async () => {
    const token = await signDoneToken(OCC, RECIPIENT, NOW);
    const last = token.at(-2) === "A" ? "B" : "A";
    const tampered = `${token.slice(0, -2)}${last}${token.at(-1)}`;
    expect((await verifyActionToken(tampered, "dn", { now: NOW })).ok).toBe(false);

    vi.stubEnv("ACTION_TOKEN_SECRET", "another-secret-entirely-different");
    expect(await verifyActionToken(token, "dn", { now: NOW })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects malformed tokens, other kinds and the wrong number of fields", async () => {
    for (const bad of [null, undefined, "", "dn_", "dn_abc", "dn_a.b.c", "x".repeat(2000), "dn_%%%.%%%"]) {
      expect(await verifyActionToken(bad, "dn", { now: NOW })).toEqual({ ok: false, reason: "malformed" });
    }
    const invitation = await signActionToken("hh", ["b1000000-0000-4000-8000-000000000001"], new Date(NOW.getTime() + 60_000));
    expect(await verifyActionToken(invitation, "dn", { now: NOW })).toEqual({ ok: false, reason: "malformed" });
    expect((await verifyActionToken(invitation, "hh", { now: NOW })).ok).toBe(true);
    const oneField = await signActionToken("dn", [OCC], new Date(NOW.getTime() + 60_000));
    expect(await verifyActionToken(oneField, "dn", { now: NOW, fieldCount: 2 })).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses fields containing the separator", async () => {
    await expect(signActionToken("dn", ["a|b", RECIPIENT], NOW)).rejects.toThrow("must not contain");
  });

  it("needs ACTION_TOKEN_SECRET", async () => {
    vi.stubEnv("ACTION_TOKEN_SECRET", "");
    await expect(signDoneToken(OCC, RECIPIENT, NOW)).rejects.toThrow("ACTION_TOKEN_SECRET");
  });

  it("randomToken has the prefix and 256 random bits; hashToken is SHA-256 hex", async () => {
    const a = randomToken("hh");
    expect(a).toMatch(/^hh_[A-Za-z0-9_-]{43}$/);
    expect(randomToken("hh")).not.toBe(a);
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
