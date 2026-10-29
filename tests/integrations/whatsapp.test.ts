// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// lib/integrations/whatsapp.ts — the Meta Cloud API adapter against a fake HTTP endpoint (no network):
// the reminder_due utility template (pet, title, due date and time; quick reply whose payload is the dn_
// token) and the verification_code authentication template (code + copy-code button) built per API §9.4,
// language from profiles.locale (sr-Latn → sr); 2 tries on network errors, 429 and 5xx, other 4xx at once
// (undeliverable numbers flagged for EP-30 fields.phone); fake mode without WHATSAPP_ACCESS_TOKEN (owner
// decision, Step 29); X-Hub-Signature-256 verification over the raw body (API §9.1).

const {
  GRAPH_API_URL,
  sendReminderDue,
  sendVerificationCode,
  sendText,
  templateLanguage,
  verifyWebhookSignature,
  whatsappConfigFromEnv,
} = await import("@/lib/integrations/whatsapp");

type Call = { url: string; init: RequestInit };

function fakeMeta(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift() ?? new Response(JSON.stringify({ messages: [{ id: "wamid.default" }] }), { status: 200 });
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof globalThis.fetch;
  const sleep = vi.fn(async () => {});
  return { calls, config: { phoneNumberId: "1234567890", accessToken: "meta-token", fetch, sleep }, sleep };
}

const okResponse = (id: string) => new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id }] }), { status: 200 });
const errorResponse = (status: number, code: number) =>
  new Response(JSON.stringify({ error: { code, message: `meta error ${code}` } }), { status });
const body = (call: Call) => JSON.parse(String(call.init.body)) as Record<string, unknown>;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("reminder_due (API §9.4, EP-33 step 4)", () => {
  it("posts the utility template with {{1}} pet, {{2}} title, {{3}} date and time and the quick-reply payload = dn_ token", async () => {
    const meta = fakeMeta([okResponse("wamid.HBgM")]);
    const result = await sendReminderDue(
      { to: "+381641234567", locale: "sr", pet: "Luna", title: "Besnilo", when: "26. 10. 2026. u 08:00", payload: "dn_abc.def" },
      meta.config,
    );
    expect(result).toEqual({ status: "delivered", id: "wamid.HBgM" });
    expect(meta.calls).toHaveLength(1);
    const [call] = meta.calls;
    expect(call.url).toBe(`${GRAPH_API_URL}/1234567890/messages`);
    expect(call.init.method).toBe("POST");
    expect(new Headers(call.init.headers).get("authorization")).toBe("Bearer meta-token");
    expect(body(call)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "381641234567",
      type: "template",
      template: {
        name: "reminder_due",
        language: { code: "sr" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Luna" },
              { type: "text", text: "Besnilo" },
              { type: "text", text: "26. 10. 2026. u 08:00" },
            ],
          },
          { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "dn_abc.def" }] },
        ],
      },
    });
  });

  it("an English recipient gets the en template; sr-Latn maps to sr", async () => {
    expect(templateLanguage("en")).toBe("en");
    expect(templateLanguage("sr")).toBe("sr");
    const meta = fakeMeta([okResponse("wamid.1")]);
    await sendReminderDue({ to: "+447700900123", locale: "en", pet: "For me", title: "Vet", when: "26 Oct 2026 at 08:00", payload: "dn_x.y" }, meta.config);
    expect((body(meta.calls[0]).template as { language: { code: string } }).language.code).toBe("en");
  });
});

describe("verification_code (API §9.4, EP-30 send_code)", () => {
  it("posts the authentication template with the code in the body and the copy-code button", async () => {
    const meta = fakeMeta([okResponse("wamid.code")]);
    const result = await sendVerificationCode({ to: "+381641234567", code: "042917", locale: "sr" }, meta.config);
    expect(result).toEqual({ status: "delivered", id: "wamid.code" });
    expect(body(meta.calls[0])).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "381641234567",
      type: "template",
      template: {
        name: "verification_code",
        language: { code: "sr" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "042917" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "042917" }] },
        ],
      },
    });
  });
});

describe("2 tries (API §9.4)", () => {
  it("a 5xx is retried once after 1 s, then succeeds", async () => {
    const meta = fakeMeta([errorResponse(503, 2), okResponse("wamid.retry")]);
    const result = await sendVerificationCode({ to: "+381641234567", code: "123456", locale: "sr" }, meta.config);
    expect(result).toEqual({ status: "delivered", id: "wamid.retry" });
    expect(meta.calls).toHaveLength(2);
    expect(meta.sleep).toHaveBeenCalledWith(1000);
  });

  it("network errors and 429 are retried; after 2 tries the result is failed", async () => {
    const meta = fakeMeta([new Error("socket hang up"), errorResponse(429, 130429)]);
    const result = await sendReminderDue({ to: "+381641234567", locale: "sr", pet: "Luna", title: "Besnilo", when: "x", payload: "dn_x.y" }, meta.config);
    expect(meta.calls).toHaveLength(2);
    expect(result).toMatchObject({ status: "failed", undeliverable: false });
    expect((result as { error: string }).error).toContain("whatsapp_429_130429");
  });

  it("another 4xx fails at once; an undeliverable number is flagged", async () => {
    const meta = fakeMeta([errorResponse(400, 131026)]);
    const result = await sendVerificationCode({ to: "+381641234567", code: "123456", locale: "sr" }, meta.config);
    expect(meta.calls).toHaveLength(1);
    expect(result).toMatchObject({ status: "failed", undeliverable: true });

    const auth = fakeMeta([errorResponse(401, 190)]);
    const unauthorised = await sendVerificationCode({ to: "+381641234567", code: "123456", locale: "sr" }, auth.config);
    expect(auth.calls).toHaveLength(1);
    expect(unauthorised).toMatchObject({ status: "failed", undeliverable: false });
  });
});

describe("free-form confirmation and fake mode", () => {
  it("sendText posts a text message (API §9.1 confirmation)", async () => {
    const meta = fakeMeta([okResponse("wamid.text")]);
    await sendText({ to: "381641234567", body: "Označeno kao urađeno." }, meta.config);
    expect(body(meta.calls[0])).toMatchObject({ type: "text", to: "381641234567", text: { body: "Označeno kao urađeno." } });
  });

  it("without WHATSAPP_ACCESS_TOKEN nothing is sent: the request is logged and gets a fake-<uuid> id", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const config = whatsappConfigFromEnv();
    expect(config).toEqual({ phoneNumberId: "1234567890", accessToken: "" });
    const result = await sendVerificationCode({ to: "+381641234567", code: "123456", locale: "sr" }, config);
    expect(result.status).toBe("delivered");
    expect((result as { id: string }).id).toMatch(/^fake-[0-9a-f-]{36}$/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[whatsapp:fake]", "verification_code", "+381641234567", { code: "123456" });
  });
});

describe("X-Hub-Signature-256 (API §9.1)", () => {
  const secret = "meta-app-secret";
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const sign = (payload: string, key = secret) => `sha256=${createHmac("sha256", key).update(payload).digest("hex")}`;

  it("accepts the HMAC-SHA256 of the raw body with the app secret", async () => {
    expect(await verifyWebhookSignature(raw, sign(raw), secret)).toBe(true);
  });

  it("rejects a wrong secret, a changed body, a missing or malformed header, and an empty secret", async () => {
    expect(await verifyWebhookSignature(raw, sign(raw, "other"), secret)).toBe(false);
    expect(await verifyWebhookSignature(`${raw} `, sign(raw), secret)).toBe(false);
    expect(await verifyWebhookSignature(raw, null, secret)).toBe(false);
    expect(await verifyWebhookSignature(raw, "sha1=abc", secret)).toBe(false);
    expect(await verifyWebhookSignature(raw, sign(raw, ""), "")).toBe(false);
  });
});
