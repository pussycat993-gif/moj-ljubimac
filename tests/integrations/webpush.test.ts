// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sendPush, pushConfigFromEnv, MAX_PAYLOAD_BYTES } = await import("@/lib/integrations/webpush");
type PushEndpoint = import("@/lib/integrations/webpush").PushEndpoint;

// lib/integrations/webpush.ts (TC ADR-05, ADR-17 @pushforge/builder; API §9.4) against a fake push
// service. Keys are generated in the test: a VAPID ECDSA P-256 private JWK and, per endpoint, the
// browser's ECDH P-256 p256dh key and 16-byte auth secret.

const b64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

let privateJWK: string;
let endpointKeys: { p256dh: string; auth: string };

beforeAll(async () => {
  const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  privateJWK = JSON.stringify(await crypto.subtle.exportKey("jwk", vapid.privateKey));
  const browser = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  endpointKeys = {
    p256dh: b64url(await crypto.subtle.exportKey("raw", browser.publicKey)),
    auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
  };
});

const payload = {
  title: "Luna: Besnilo",
  body: "19. 10. 2026. u 08:00",
  url: "https://mojljubimac.rs/podsetnici",
  done_url: "https://mojljubimac.rs/api/a/done?t=dn_abc.def",
};

function endpoint(id: string): PushEndpoint {
  return { id, endpoint: `https://push.example.test/send/${id}`, ...endpointKeys };
}

function fakePushService(statusesByEndpoint: Record<string, (number | Error)[]>) {
  const requests: { url: string; headers: Headers; body: ArrayBuffer }[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const key = String(url).split("/").pop()!;
    requests.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body as ArrayBuffer });
    const next = statusesByEndpoint[key].shift();
    if (next instanceof Error) throw next;
    return new Response(null, { status: next, headers: next === 201 ? { location: `https://push.example.test/m/${key}` } : {} });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requests };
}

const config = (fetchImpl: typeof fetch, removeEndpoint = vi.fn(async () => {})) => ({
  privateJWK,
  subject: "mailto:podrska@mojljubimac.rs",
  fetch: fetchImpl,
  removeEndpoint,
});

describe("sendPush", () => {
  it("sends an encrypted VAPID push and reports delivered with the message id", async () => {
    const { fetchImpl, requests } = fakePushService({ e1: [201] });
    const result = await sendPush([endpoint("e1")], payload, config(fetchImpl));
    expect(result).toEqual({
      status: "delivered",
      accepted: 1,
      removed: 0,
      provider_message_id: "https://push.example.test/m/e1",
      error: null,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://push.example.test/send/e1");
    expect(requests[0].headers.get("authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(requests[0].headers.get("content-encoding")).toMatch(/^aes(128)?gcm$/);
    const body = new Uint8Array(requests[0].body);
    expect(body.byteLength).toBeGreaterThan(JSON.stringify(payload).length);
    expect(Buffer.from(body).toString("utf8")).not.toContain("Besnilo");
  });

  it.each([404, 410])("an endpoint answering %i is deleted from push_subscriptions", async (status) => {
    const removeEndpoint = vi.fn(async () => {});
    const { fetchImpl, requests } = fakePushService({ gone: [status] });
    const result = await sendPush([endpoint("gone")], payload, config(fetchImpl, removeEndpoint));
    expect(removeEndpoint).toHaveBeenCalledWith("gone");
    expect(requests).toHaveLength(1);
    expect(result).toMatchObject({ status: "failed", accepted: 0, removed: 1, error: "push_gone" });
  });

  it("goes to every endpoint; delivered when at least one accepted", async () => {
    const removeEndpoint = vi.fn(async () => {});
    const { fetchImpl } = fakePushService({ phone: [201], laptop: [410] });
    const result = await sendPush([endpoint("phone"), endpoint("laptop")], payload, config(fetchImpl, removeEndpoint));
    expect(result).toMatchObject({ status: "delivered", accepted: 1, removed: 1, error: null });
    expect(removeEndpoint).toHaveBeenCalledTimes(1);
    expect(removeEndpoint).toHaveBeenCalledWith("laptop");
  });

  it("retries a transient failure once", async () => {
    const { fetchImpl, requests } = fakePushService({ e1: [500, 201] });
    expect((await sendPush([endpoint("e1")], payload, config(fetchImpl))).status).toBe("delivered");
    expect(requests).toHaveLength(2);
  });

  it("fails after the one retry and keeps the endpoint", async () => {
    const removeEndpoint = vi.fn(async () => {});
    const { fetchImpl, requests } = fakePushService({ e1: [503, new Error("reset")] });
    const result = await sendPush([endpoint("e1")], payload, config(fetchImpl, removeEndpoint));
    expect(requests).toHaveLength(2);
    expect(result).toMatchObject({ status: "failed", accepted: 0, removed: 0 });
    expect(result.error).toContain("reset");
    expect(removeEndpoint).not.toHaveBeenCalled();
  });

  it("refuses a payload over 4 KB", async () => {
    const { fetchImpl, requests } = fakePushService({ e1: [201] });
    const result = await sendPush([endpoint("e1")], { ...payload, body: "x".repeat(MAX_PAYLOAD_BYTES) }, config(fetchImpl));
    expect(result).toMatchObject({ status: "failed", error: "payload_too_large" });
    expect(requests).toHaveLength(0);
  });
});

describe("pushConfigFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null while any VAPID key is empty (local runs skip push)", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BPub");
    vi.stubEnv("VAPID_PRIVATE_KEY_JWK", "");
    vi.stubEnv("VAPID_SUBJECT", "mailto:podrska@mojljubimac.rs");
    expect(pushConfigFromEnv()).toBeNull();
  });

  it("reads the keys at call time", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BPub");
    vi.stubEnv("VAPID_PRIVATE_KEY_JWK", '{"kty":"EC"}');
    vi.stubEnv("VAPID_SUBJECT", "mailto:podrska@mojljubimac.rs");
    expect(pushConfigFromEnv()).toEqual({ privateJWK: '{"kty":"EC"}', subject: "mailto:podrska@mojljubimac.rs" });
  });
});
