import "server-only";

// Signed action tokens (API §9.3, TC ADR-16), signed with ACTION_TOKEN_SECRET (TC §8.1).
//   token = "<kind>_" + base64url("<kind>|<field>|…|<exp_unix>|<nonce>") + "." + base64url(HMAC-SHA256)
// The HMAC covers everything before the dot. Prefixes: dn_ reminder done (EP-32), hh_ household
// invitation, og_ organisation team invitation, tr_ record transfer, wv_ WhatsApp verification (EP-30,
// Step 29: 10 minutes, not single-use, stateless). Done tokens carry
// (occurrence_id, recipient_id), live 24 h and are single-use through the occurrence's done state —
// nothing is stored. Invitation and transfer tokens are random (randomToken) and stored hashed
// (hashToken). Web Crypto only, so it runs on Cloudflare Workers.

export type ActionTokenKind = "dn" | "hh" | "og" | "tr" | "wv";

export type ActionTokenPayload = { kind: ActionTokenKind; fields: string[]; expiresAt: Date };

export type ActionTokenCheck =
  | { ok: true; token: ActionTokenPayload }
  /** `token` is present when only the expiry failed (the signature was valid). */
  | { ok: false; reason: "malformed" | "bad_signature" | "expired"; token?: ActionTokenPayload };

/** dn_ tokens are valid 24 h from send (API §9.3, EP-32). */
export const DONE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** wv_ tokens (EP-30 verification_token) are valid 10 minutes from send_code. */
export const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;

const KINDS = new Set<string>(["dn", "hh", "og", "tr", "wv"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function secret(): string {
  const value = process.env.ACTION_TOKEN_SECRET;
  if (!value) throw new Error("ACTION_TOKEN_SECRET is not set; action tokens cannot be signed or verified.");
  return value;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Signs `kind|fields…|exp|nonce`. Fields must not contain "|". */
export async function signActionToken(kind: ActionTokenKind, fields: string[], expiresAt: Date): Promise<string> {
  if (fields.some((field) => field.includes("|"))) throw new Error("Action token fields must not contain '|'.");
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const payload = [kind, ...fields, String(exp), toBase64Url(randomBytes(12))].join("|");
  const signed = `${kind}_${toBase64Url(encoder.encode(payload))}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(signed)));
  return `${signed}.${toBase64Url(signature)}`;
}

/**
 * Checks the signature (constant time, Web Crypto verify), the kind and the expiry. `fieldCount`
 * rejects a token of the right kind with the wrong shape.
 */
export async function verifyActionToken(
  token: string | null | undefined,
  kind: ActionTokenKind,
  opts: { now?: Date; fieldCount?: number } = {},
): Promise<ActionTokenCheck> {
  if (typeof token !== "string" || token.length > 1024) return { ok: false, reason: "malformed" };
  const dot = token.indexOf(".");
  if (dot === -1 || token.indexOf(".", dot + 1) !== -1) return { ok: false, reason: "malformed" };
  const signed = token.slice(0, dot);
  if (!signed.startsWith(`${kind}_`)) return { ok: false, reason: "malformed" };
  const signature = fromBase64Url(token.slice(dot + 1));
  const payloadBytes = fromBase64Url(signed.slice(kind.length + 1));
  if (!signature || !payloadBytes || signature.length !== 32) return { ok: false, reason: "malformed" };

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    signature as Uint8Array<ArrayBuffer>,
    encoder.encode(signed),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };

  let payload: string;
  try {
    payload = decoder.decode(payloadBytes);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const parts = payload.split("|");
  // kind, fields…, exp, nonce
  if (parts.length < 3 || parts[0] !== kind || !KINDS.has(parts[0])) return { ok: false, reason: "malformed" };
  const fields = parts.slice(1, -2);
  if (opts.fieldCount !== undefined && fields.length !== opts.fieldCount) return { ok: false, reason: "malformed" };
  const exp = Number(parts[parts.length - 2]);
  if (!Number.isInteger(exp)) return { ok: false, reason: "malformed" };

  const decoded: ActionTokenPayload = { kind, fields, expiresAt: new Date(exp * 1000) };
  const now = opts.now ?? new Date();
  if (decoded.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired", token: decoded };
  return { ok: true, token: decoded };
}

/** dn_ token for one occurrence and one recipient, valid 24 h from `sentAt` (EP-32, EP-33 step 4). */
export function signDoneToken(occurrenceId: string, recipientId: string, sentAt: Date): Promise<string> {
  return signActionToken("dn", [occurrenceId, recipientId], new Date(sentAt.getTime() + DONE_TOKEN_TTL_MS));
}

/** A random, unsigned token with a prefix (hh_, og_, tr_), stored only as hashToken(token). */
export function randomToken(prefix: ActionTokenKind): string {
  return `${prefix}_${toBase64Url(randomBytes(32))}`;
}

/** SHA-256 hex of a token (the stored token_hash). */
export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The code digest inside a wv_ token: HMAC-SHA256 with the server secret over user, phone and code, so the
 * code cannot be checked (or brute-forced from the token) without ACTION_TOKEN_SECRET (EP-30).
 */
async function verificationCodeDigest(userId: string, phone: string, code: string): Promise<string> {
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(`wv-code|${userId}|${phone}|${code}`)),
  );
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * EP-30 verification_token: wv_ over (user_id, phone, code digest), expiring with the code (10 minutes).
 * Stateless — nothing is stored until verify_code; not single-use (the upsert on verify is idempotent).
 */
export async function signVerificationToken(userId: string, phone: string, code: string, expiresAt: Date): Promise<string> {
  return signActionToken("wv", [userId, phone, await verificationCodeDigest(userId, phone, code)], expiresAt);
}

/**
 * Checks a wv_ token against the caller and the typed code. Wrong code, expired or tampered token, or a
 * token issued to another user → null (EP-30 verification_code_invalid); otherwise the verified phone.
 */
export async function checkVerificationToken(
  token: string | null | undefined,
  userId: string,
  code: string,
  now: Date = new Date(),
): Promise<{ phone: string } | null> {
  const check = await verifyActionToken(token, "wv", { now, fieldCount: 3 });
  if (!check.ok) return null;
  const [tokenUser, phone, digest] = check.token.fields;
  if (tokenUser !== userId) return null;
  const expected = await verificationCodeDigest(userId, phone, code);
  let diff = expected.length ^ digest.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (digest.charCodeAt(i) || 0);
  return diff === 0 ? { phone } : null;
}
