"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkGates } from "@/lib/server/gates";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { withIdempotency } from "@/lib/server/idempotency";
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result";
import { sendEmail } from "@/lib/integrations/resend";
import { pushConfigFromEnv, sendPush, type PushEndpoint } from "@/lib/integrations/webpush";
import { format, fromProfileLocale, getDictionary } from "@/lib/i18n";
import type { ListingType } from "@/lib/actions/listings";

// Šapa pomoći messaging (Step 28c, API v1.3 §5.9): EP-82 sendMessage — rpc:send_message (one transaction; RLS and
// the Step 28a triggers give listing_not_active, cannot_message_self, user_blocked, marketplace_suspended), the
// API §11 rate limit (30 messages per hour per user, lib/server/rate-limit.ts) and API §3.3 idempotency
// (lib/server/idempotency.ts); after the commit the new-message notification (FR-69, API §9.4): the recipient's
// reminder_preferences row of type message decides email (Resend new_message, recipient's locale) and push (every
// push_subscriptions endpoint, { title, body, url }); skipped when the recipient's deletion is pending; failures are
// logged and never fail the send; never WhatsApp or Viber; nothing in reminder_deliveries. Also the server wrappers
// of the Data API reads EP-80 rpc:list_my_conversations, EP-81 rpc:get_conversation and EP-83
// rpc:mark_conversation_read (the session lives in httpOnly cookies, as for Step 28b's EP-76 / EP-78 wrappers), and
// saveMessagePreference — the EP-28 reminder_preferences upsert for the S12 Poruke card (type message). Gate 4 does
// not apply: messages are personal writes (API §5.9 conventions).

/** API §6 ConversationSummary. */
export type ConversationSummary = {
  id: string;
  listing: { id: string | null; title: string | null; type: ListingType | null; active: boolean; deleted: boolean };
  i_am_author: boolean;
  other: {
    user_id: string;
    kind: "user" | "shelter";
    display_name: string | null;
    initials: string | null;
    organisation_slug: string | null;
  };
  last_message: { preview: string; from_me: boolean };
  last_message_at: string;
  unread_count: number;
  i_blocked_other: boolean;
};

/** API §6 Conversation (thread header). */
export type Conversation = ConversationSummary & { can_send: boolean; message_total: number };

/** API §6 Message. */
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  from_me: boolean;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type ConversationList = { items: ConversationSummary[]; total: number; unread_conversations: number };
export type ConversationThread = { conversation: Conversation; messages: Message[]; total: number };
export type MarkReadResult = { conversation_id: string; marked: number; unread_conversations: number };

/** EP-82 Request: exactly one of listing_id (start or continue, BR-61) and conversation_id (reply). */
export type SendMessageInput = {
  listing_id?: string | null;
  conversation_id?: string | null;
  body: string;
  idempotency_key: string;
};

export type SendMessageResult = { conversation: ConversationSummary; message: Message; created_conversation: boolean };

/** EP-28 update for the S12 Poruke card: channels a subset of {email, push}; empty = notifications off. */
export type MessagePreferenceInput = { channels: ("email" | "push")[] };

export type MessagePreference = {
  type: "message";
  lead_minutes: number[];
  delivery_time: null;
  channels: ("email" | "push")[];
  fixed_time: false;
  is_default: false;
  updated_at: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BODY_MAX = 2000;
const PREVIEW_MAX = 120;
/** API §11: 30 messages per hour per user, across all conversations. */
const MESSAGE_RATE_LIMIT = { operation: "messages.send", limit: 30, windowSeconds: 3600 } as const;

/** Spaces, tabs and line breaks — the messages_body_check trim (TC §5.10). */
function trimBody(value: string): string {
  return value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

/** RPC error → ApiError; validation field codes travel in DETAIL '<field>:<code>'. */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field.replace(/^p_/, "")]: code };
  }
  return mapped;
}

// EP-82 ------------------------------------------------------------------------------------------------

type NotificationData = {
  conversation_id: string;
  body: string;
  sender_name: string | null;
  listing_title: string | null;
  recipient: {
    id: string;
    email: string | null;
    locale: string | null;
    full_name: string | null;
    deletion_pending: boolean;
    channels: string[];
  };
  push_subscriptions: PushEndpoint[];
};

/**
 * FR-69 new-message notification, after the send committed (API EP-82 side effects, §9.4). Reads the recipient
 * with the service role (server only). Never throws: failures are logged and the send stays `ok`.
 */
async function notifyNewMessage(messageId: string): Promise<void> {
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc("new_message_notification", { p_message_id: messageId });
    if (error || !data) {
      console.error("[messages] new_message_notification:", error?.message ?? "no data");
      return;
    }
    const n = data as unknown as NotificationData;
    if (n.recipient.deletion_pending) return;

    const locale = fromProfileLocale(n.recipient.locale);
    const t = getDictionary(locale);
    const sender = n.sender_name || t.sapa.common.userFallback;
    const listing = n.listing_title ?? t.messages.new_message.listingDeleted;
    const preview = n.body.slice(0, PREVIEW_MAX);
    const url = `${siteUrl()}/poruke/${n.conversation_id}`;
    const channels = n.recipient.channels;

    const jobs: Promise<void>[] = [];
    if (channels.includes("email") && n.recipient.email) {
      const firstName = n.recipient.full_name?.trim().split(/\s+/)[0] || null;
      jobs.push(
        sendEmail({
          to: n.recipient.email,
          locale,
          template: { id: "new_message", variables: { first_name: firstName, listing, sender, preview, url } },
        }).then((sent) => {
          if (sent.status === "failed") console.error("[messages] new_message email failed:", sent.error);
        }),
      );
    }
    if (channels.includes("push") && n.push_subscriptions.length > 0) {
      const config = pushConfigFromEnv();
      if (!config) {
        console.info("[messages] push not configured (VAPID keys empty) — new_message push skipped");
      } else {
        const push = t.messages.new_message_push;
        jobs.push(
          sendPush(
            n.push_subscriptions,
            { title: format(push.title, { sender }), body: format(push.body, { listing, preview }), url },
            {
              ...config,
              removeEndpoint: async (id) => {
                const { error: removeError } = await service.from("push_subscriptions").delete().eq("id", id);
                if (removeError) throw new Error(removeError.message);
              },
            },
          ).then((result) => {
            if (result.status === "failed") console.error("[messages] new_message push failed:", result.error);
          }),
        );
      }
    }
    await Promise.all(jobs);
  } catch (error) {
    console.error("[messages] new-message notification:", error instanceof Error ? error.message : error);
  }
}

/** EP-82 — start a conversation about a listing (or continue the caller's own, BR-61) or reply in one. */
export async function sendMessage(input: SendMessageInput): Promise<ActionResult<SendMessageResult>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const fields: Record<string, string> = {};
  const listingId = input?.listing_id ?? null;
  const conversationId = input?.conversation_id ?? null;
  if ((listingId === null) === (conversationId === null)) fields.listing_id = "invalid";
  else if (listingId !== null && (typeof listingId !== "string" || !UUID.test(listingId))) fields.listing_id = "invalid";
  else if (conversationId !== null && (typeof conversationId !== "string" || !UUID.test(conversationId))) {
    fields.conversation_id = "invalid";
  }
  const body = typeof input?.body === "string" ? trimBody(input.body) : "";
  if (body.length === 0) fields.body = "required";
  else if (body.length > BODY_MAX) fields.body = "too_long";
  if (typeof input?.idempotency_key !== "string" || !UUID_V4.test(input.idempotency_key)) {
    fields.idempotency_key = "invalid";
  }
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const userId = caller.data.user.id;
  return withIdempotency(supabase, { userId, key: input.idempotency_key, operation: "messages.send" }, async () => {
    const limited = await checkRateLimit(supabase, { userId, ...MESSAGE_RATE_LIMIT });
    if (limited) return { ok: false, error: limited };

    const { data, error } = await supabase.rpc("send_message", {
      // Exactly one is null (checked above); rpc:send_message takes both arguments.
      p_listing_id: listingId as string,
      p_conversation_id: conversationId as string,
      p_body: body,
    });
    if (error) return { ok: false, error: fromRpcError(error) };

    const result = data as unknown as SendMessageResult;
    await notifyNewMessage(result.message.id);
    return ok(result);
  });
}

// EP-80 / EP-81 / EP-83 (server wrappers of the Data API reads) -------------------------------------------

export async function listConversations(input: { limit?: number; offset?: number } = {}): Promise<ActionResult<ConversationList>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  const { data, error } = await supabase.rpc("list_my_conversations", {
    p_limit: input.limit ?? 20,
    p_offset: input.offset ?? 0,
  });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as ConversationList);
}

export async function getConversation(input: {
  conversation_id: string;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<ConversationThread>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  if (typeof input?.conversation_id !== "string" || !UUID.test(input.conversation_id)) return fail("not_found");
  const { data, error } = await supabase.rpc("get_conversation", {
    p_conversation_id: input.conversation_id,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as ConversationThread);
}

export async function markConversationRead(conversationId: string): Promise<ActionResult<MarkReadResult>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  if (typeof conversationId !== "string" || !UUID.test(conversationId)) return fail("not_found");
  const { data, error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  if (error) return { ok: false, error: fromRpcError(error) };
  return ok(data as unknown as MarkReadResult);
}

// EP-28 (type message) ------------------------------------------------------------------------------------

/**
 * EP-28 update of the S12 Poruke card — the reminder_preferences upsert on (user_id, type) with type message.
 * channels ⊆ {email, push} and may be empty (FR-69); WhatsApp / Viber → fields.channels = "invalid" (also refused
 * by the Step 28a reminder_preferences_message_channels_check). Lead time {0}, no delivery time.
 */
export async function saveMessagePreference(input: MessagePreferenceInput): Promise<ActionResult<MessagePreference>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;

  const channels = Array.isArray(input?.channels) ? input.channels : null;
  if (
    !channels ||
    channels.some((c) => c !== "email" && c !== "push") ||
    new Set(channels).size !== channels.length
  ) {
    return fail("validation_failed", { fields: { channels: "invalid" } });
  }

  const { data, error } = await supabase
    .from("reminder_preferences")
    .upsert(
      { type: "message", lead_minutes: [0], delivery_time: null, channels },
      { onConflict: "user_id,type" },
    )
    .select("lead_minutes, channels, updated_at")
    .single();
  if (error) {
    if (error.code === "23514" && error.message.includes("channels")) {
      return fail("validation_failed", { message: error.message, fields: { channels: "invalid" } });
    }
    return { ok: false, error: fromDatabaseError(error) };
  }
  return ok({
    type: "message",
    lead_minutes: data.lead_minutes,
    delivery_time: null,
    channels: data.channels as ("email" | "push")[],
    fixed_time: false,
    is_default: false,
    updated_at: data.updated_at,
  });
}
