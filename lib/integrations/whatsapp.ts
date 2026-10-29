import "server-only";

import type { Locale } from "@/lib/i18n";

// WhatsApp Business Platform (Meta Cloud API) adapter — TC §6, ADR-17 (fetch only, no SDK), API §9.1 and
// §9.4. Two templates (API §9.4, CR-19), language from profiles.locale (sr-Latn → sr):
//   reminder_due (Utility): {{1}} pet or "Za mene", {{2}} title, {{3}} due date and time; quick reply
//     "Urađeno" / "Done" whose payload is the occurrence's signed dn_ token (EP-33 step 4, EP-32).
//   verification_code (Authentication): {{1}} the 6-digit code, copy-code button (EP-30 send_code).
// Plus a free-form text reply inside the 24 h service window (the webhook's confirmation, API §9.1).
// 2 tries on network errors, 429 and 5xx (API §9.4); other 4xx fail at once. Secrets are the TC §8.1
// names, read at call time. Fake mode (owner decision, Step 29): with WHATSAPP_ACCESS_TOKEN empty nothing
// is sent — the request is logged with console.info("[whatsapp:fake]", …) and gets id "fake-<uuid>".
// Until Meta approves both templates, real sending works only against the Meta test number.

export const GRAPH_API_URL = "https://graph.facebook.com/v21.0";
export const RETRY_DELAYS_MS = [0, 1000] as const;

/**
 * Meta error codes that mean the number cannot receive this message (EP-30 `fields.phone = undeliverable`):
 * 100 / 131009 invalid parameter (the `to` number), 131021 recipient is the sender, 131026 undeliverable,
 * 131030 not in the test number's allowed list.
 */
const UNDELIVERABLE_CODES = new Set([100, 131009, 131021, 131026, 131030]);

export type WhatsAppResult =
  | { status: "delivered"; id: string }
  | { status: "failed"; error: string; undeliverable: boolean };

export type WhatsAppConfig = {
  phoneNumberId: string;
  /** Empty → fake mode. */
  accessToken: string;
  /** Injected in tests (fake Meta API); the global fetch otherwise. */
  fetch?: typeof fetch;
  /** Injected in tests so the retry does not wait. */
  sleep?: (ms: number) => Promise<void>;
};

export function whatsappConfigFromEnv(): WhatsAppConfig {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  };
}

/** API §9.4: the template language follows profiles.locale (sr-Latn → sr). */
export function templateLanguage(locale: Locale): "sr" | "en" {
  return locale === "en" ? "en" : "sr";
}

/** E.164 → the Cloud API `to` (digits only). */
function toAddress(phone: string): string {
  return phone.replace(/\D/g, "");
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type MessageBody = Record<string, unknown>;

async function send(
  label: string,
  to: string,
  message: MessageBody,
  fakeVars: Record<string, string>,
  config: WhatsAppConfig,
): Promise<WhatsAppResult> {
  if (!config.accessToken) {
    console.info("[whatsapp:fake]", label, to, fakeVars);
    return { status: "delivered", id: `fake-${crypto.randomUUID()}` };
  }

  const doFetch = config.fetch ?? fetch;
  const sleep = config.sleep ?? defaultSleep;
  const body = JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: toAddress(to), ...message });
  let lastError = "whatsapp_failed";
  let undeliverable = false;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    let response: Response;
    try {
      response = await doFetch(`${GRAPH_API_URL}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
        body,
      });
    } catch (error) {
      lastError = `network: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    const json = (await response.json().catch(() => null)) as {
      messages?: { id?: unknown }[];
      error?: { code?: unknown; message?: unknown };
    } | null;
    if (response.ok) {
      const id = json?.messages?.[0]?.id;
      return { status: "delivered", id: typeof id === "string" ? id : "" };
    }
    const code = typeof json?.error?.code === "number" ? json.error.code : null;
    const message = typeof json?.error?.message === "string" ? json.error.message : "";
    lastError = `whatsapp_${response.status}${code !== null ? `_${code}` : ""}${message ? `: ${message.slice(0, 200)}` : ""}`;
    undeliverable = code !== null && UNDELIVERABLE_CODES.has(code);
    if (response.status !== 429 && response.status < 500) break;
  }
  return { status: "failed", error: lastError, undeliverable };
}

/** EP-30 send_code — the verification_code authentication template with its copy-code button. */
export function sendVerificationCode(
  input: { to: string; code: string; locale: Locale },
  config: WhatsAppConfig = whatsappConfigFromEnv(),
): Promise<WhatsAppResult> {
  return send(
    "verification_code",
    input.to,
    {
      type: "template",
      template: {
        name: "verification_code",
        language: { code: templateLanguage(input.locale) },
        components: [
          { type: "body", parameters: [{ type: "text", text: input.code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: input.code }] },
        ],
      },
    },
    { code: input.code },
    config,
  );
}

/** EP-33 step 4 — the reminder_due utility template with the "Urađeno" quick reply carrying the dn_ token. */
export function sendReminderDue(
  input: { to: string; locale: Locale; pet: string; title: string; when: string; payload: string },
  config: WhatsAppConfig = whatsappConfigFromEnv(),
): Promise<WhatsAppResult> {
  return send(
    "reminder_due",
    input.to,
    {
      type: "template",
      template: {
        name: "reminder_due",
        language: { code: templateLanguage(input.locale) },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: input.pet },
              { type: "text", text: input.title },
              { type: "text", text: input.when },
            ],
          },
          { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: input.payload }] },
        ],
      },
    },
    { pet: input.pet, title: input.title, when: input.when },
    config,
  );
}

/** API §9.1 — the short confirmation after a button reply (free-form text inside the service window). */
export function sendText(
  input: { to: string; body: string },
  config: WhatsAppConfig = whatsappConfigFromEnv(),
): Promise<WhatsAppResult> {
  return send("text", input.to, { type: "text", text: { preview_url: false, body: input.body } }, { body: input.body }, config);
}

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const bytes = new Uint8Array(new ArrayBuffer(32));
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * API §9.1 — `X-Hub-Signature-256: sha256=<hex>` is HMAC-SHA256 of the raw body with WHATSAPP_APP_SECRET.
 * Web Crypto verify, so the comparison is constant time. An empty secret never verifies.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  appSecret: string = process.env.WHATSAPP_APP_SECRET ?? "",
): Promise<boolean> {
  if (!appSecret || !header || !header.startsWith("sha256=")) return false;
  const signature = hexToBytes(header.slice("sha256=".length));
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, [
    "verify",
  ]);
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(rawBody));
}
