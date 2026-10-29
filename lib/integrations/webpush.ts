import "server-only";

import { buildPushHTTPRequest } from "@pushforge/builder";

// Web Push adapter (TC ADR-05, ADR-17 @pushforge/builder; API §9.4). VAPID keys from TC §8.1:
// NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY_JWK (JWK JSON) and VAPID_SUBJECT. The payload
// encryption and the VAPID JWT come from @pushforge/builder. One push goes to every stored endpoint
// of the recipient; each endpoint gets 1 retry on network errors, 429 and 5xx; an endpoint answering
// 404 / 410 is gone and is deleted (removeEndpoint → push_subscriptions). Env vars are read at call time;
// with any key empty push is not configured and the dispatch skips it with a log line.

export type PushEndpoint = { id: string; endpoint: string; p256dh: string; auth: string };

/** API §9.4 payload, ≤ 4 KB: reminders carry done_url; new-message pushes (EP-82) are { title, body, url }. */
export type PushPayload = { title: string; body: string; url: string; done_url?: string | null };

export type PushConfig = {
  privateJWK: string;
  subject: string;
  /** Deletes a push_subscriptions row whose endpoint answered 404 / 410. */
  removeEndpoint: (id: string) => Promise<void>;
  /** Injected in tests (fake push service); the global fetch otherwise. */
  fetch?: typeof fetch;
};

export type PushResult = {
  /** delivered when at least one endpoint accepted the message. */
  status: "delivered" | "failed";
  accepted: number;
  removed: number;
  provider_message_id: string | null;
  error: string | null;
};

export const MAX_PAYLOAD_BYTES = 4096;
const ATTEMPTS = 2;

/** null when push is not configured (local runs without VAPID keys). */
export function pushConfigFromEnv(): { privateJWK: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateJWK = process.env.VAPID_PRIVATE_KEY_JWK ?? "";
  const subject = process.env.VAPID_SUBJECT ?? "";
  if (!publicKey || !privateJWK || !subject) return null;
  return { privateJWK, subject };
}

type EndpointOutcome = { kind: "accepted"; id: string | null } | { kind: "gone" } | { kind: "failed"; error: string };

async function sendToEndpoint(endpoint: PushEndpoint, payload: PushPayload, config: PushConfig): Promise<EndpointOutcome> {
  const doFetch = config.fetch ?? fetch;
  let lastError = "push_failed";
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let response: Response;
    try {
      const request = await buildPushHTTPRequest({
        privateJWK: config.privateJWK,
        subscription: { endpoint: endpoint.endpoint, keys: { p256dh: endpoint.p256dh, auth: endpoint.auth } },
        message: { payload, adminContact: config.subject },
      });
      response = await doFetch(request.endpoint, { method: "POST", headers: request.headers, body: request.body });
    } catch (error) {
      lastError = `push_error: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    if (response.ok) return { kind: "accepted", id: response.headers.get("location") };
    if (response.status === 404 || response.status === 410) return { kind: "gone" };
    lastError = `push_${response.status}`;
    if (response.status !== 429 && response.status < 500) break;
  }
  return { kind: "failed", error: lastError };
}

/** Sends one reminder push to every endpoint of a recipient. */
export async function sendPush(endpoints: PushEndpoint[], payload: PushPayload, config: PushConfig): Promise<PushResult> {
  if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PAYLOAD_BYTES) {
    return { status: "failed", accepted: 0, removed: 0, provider_message_id: null, error: "payload_too_large" };
  }
  const outcomes = await Promise.all(endpoints.map((endpoint) => sendToEndpoint(endpoint, payload, config)));
  let accepted = 0;
  let removed = 0;
  let providerMessageId: string | null = null;
  const errors: string[] = [];
  for (const [i, outcome] of outcomes.entries()) {
    if (outcome.kind === "accepted") {
      accepted++;
      providerMessageId ??= outcome.id;
    } else if (outcome.kind === "gone") {
      try {
        await config.removeEndpoint(endpoints[i].id);
        removed++;
      } catch (error) {
        console.error("[webpush] could not delete a gone endpoint:", error instanceof Error ? error.message : error);
      }
      errors.push("push_gone");
    } else {
      errors.push(outcome.error);
    }
  }
  return {
    status: accepted > 0 ? "delivered" : "failed",
    accepted,
    removed,
    provider_message_id: providerMessageId,
    error: accepted > 0 ? null : (errors[0] ?? "push_failed"),
  };
}
