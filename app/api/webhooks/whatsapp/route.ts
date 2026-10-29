import { NextResponse, type NextRequest } from "next/server";
import { format, fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n";
import { sendText, verifyWebhookSignature } from "@/lib/integrations/whatsapp";
import { verifyActionToken } from "@/lib/server/action-tokens";
import { formatBelgradeTime, reminderLabels, type ClaimedOccurrence } from "@/lib/server/dispatch";
import { apiError, fromDatabaseError } from "@/lib/server/result";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// API §9.1 — WhatsApp Business Platform webhook (Meta Cloud API), no session.
//   GET: Meta's verification handshake — echoes hub.challenge when hub.verify_token equals
//     WHATSAPP_VERIFY_TOKEN (TC §8.1).
//   POST: X-Hub-Signature-256 (HMAC-SHA256 of the raw body with WHATSAPP_APP_SECRET) or 401
//     invalid_signature. Then, always 200 within 5 s (failures are logged, so Meta does not retry storms):
//     - status events (sent, delivered, failed) update the whatsapp reminder_deliveries row by
//       provider_message_id. The row is already `delivered` when Meta accepted the message (EP-33), so `sent`
//       changes nothing; `delivered` sets delivered_at to the event time; `failed` marks the row failed.
//       Last write wins by timestamp: within one POST only the latest event per message is applied, and an
//       event older than the row's delivered_at is ignored (event times have second resolution, so an event
//       counts as the end of its second). A failure is final — a later `delivered` never revives it.
//     - a button reply ("Urađeno" quick reply of reminder_due, API §9.4) carries the occurrence's dn_ token:
//       exactly EP-32 (token check, mark_occurrence_done_for as the recipient, naturally idempotent), then a
//       short confirmation in the recipient's profiles.locale ("Označeno kao urađeno. {pet}: {title} —
//       označeno u {time}."; an invalid or expired token gets the action_expired_page body, not_found and
//       household_read_only the bodies of their action pages).
//     - anything else is ignored.

export const dynamic = "force-dynamic";

/** API §9.1: answer Meta within 5 s; processing that takes longer finishes (or fails) in the background. */
export const RESPONSE_BUDGET_MS = 4500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StatusEvent = { id: string; status: "sent" | "delivered" | "failed"; at: number; error: string | null };
type ButtonReply = { from: string; payload: string };

type WebhookBody = {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        statuses?: { id?: unknown; status?: unknown; timestamp?: unknown; errors?: { code?: unknown; title?: unknown }[] }[];
        messages?: {
          from?: unknown;
          type?: unknown;
          button?: { payload?: unknown };
          interactive?: { type?: unknown; button_reply?: { id?: unknown } };
        }[];
      };
    }[];
  }[];
};

const ok = () => new Response(null, { status: 200 });

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  if (params.get("hub.mode") === "subscribe" && expected !== "" && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json(apiError("invalid_signature", { message: "hub.verify_token does not match" }), { status: 401 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!(await verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256")))) {
    return NextResponse.json(apiError("invalid_signature", { message: "missing or wrong X-Hub-Signature-256" }), {
      status: 401,
    });
  }

  const work = processWebhook(raw).catch((error) => {
    console.error("[webhooks/whatsapp] processing failed:", error instanceof Error ? error.message : error);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, RESPONSE_BUDGET_MS);
  });
  await Promise.race([work, budget]);
  clearTimeout(timer);
  return ok();
}

function parse(raw: string): { statuses: StatusEvent[]; replies: ButtonReply[] } {
  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return { statuses: [], replies: [] };
  }
  const statuses: StatusEvent[] = [];
  const replies: ButtonReply[] = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      for (const s of Array.isArray(value?.statuses) ? value.statuses : []) {
        const at = Number(s?.timestamp);
        if (typeof s?.id !== "string" || !Number.isFinite(at)) continue;
        if (s.status !== "sent" && s.status !== "delivered" && s.status !== "failed") continue;
        const first = Array.isArray(s.errors) ? s.errors[0] : undefined;
        const error =
          s.status === "failed"
            ? `whatsapp_${typeof first?.code === "number" ? first.code : "failed"}${typeof first?.title === "string" ? `: ${first.title.slice(0, 200)}` : ""}`
            : null;
        statuses.push({ id: s.id, status: s.status, at, error });
      }
      for (const m of Array.isArray(value?.messages) ? value.messages : []) {
        if (typeof m?.from !== "string") continue;
        const payload =
          m.type === "button"
            ? m.button?.payload
            : m.type === "interactive" && m.interactive?.type === "button_reply"
              ? m.interactive.button_reply?.id
              : undefined;
        if (typeof payload === "string" && payload.startsWith("dn_")) replies.push({ from: m.from, payload });
      }
    }
  }
  return { statuses, replies };
}

async function processWebhook(raw: string) {
  const { statuses, replies } = parse(raw);
  if (statuses.length === 0 && replies.length === 0) return;
  const supabase = createServiceRoleClient();

  // Last write wins by timestamp: the latest event per message (a failure wins a tie).
  const latest = new Map<string, StatusEvent>();
  for (const event of statuses) {
    const seen = latest.get(event.id);
    if (!seen || event.at > seen.at || (event.at === seen.at && event.status === "failed")) latest.set(event.id, event);
  }
  for (const event of latest.values()) {
    if (event.status === "sent") continue;
    // Event times are whole seconds: the event counts as the end of its second.
    const at = new Date(event.at * 1000 + 999).toISOString();
    const query =
      event.status === "delivered"
        ? supabase
            .from("reminder_deliveries")
            .update({ delivered_at: at })
            .eq("provider_message_id", event.id)
            .eq("channel", "whatsapp")
            .eq("status", "delivered")
            .lte("delivered_at", at)
        : supabase
            .from("reminder_deliveries")
            .update({ status: "failed", error: event.error, delivered_at: null })
            .eq("provider_message_id", event.id)
            .eq("channel", "whatsapp")
            .or(`delivered_at.is.null,delivered_at.lte.${at}`);
    const { error } = await query;
    if (error) console.error("[webhooks/whatsapp] status update failed:", event.id, error.message);
  }

  for (const reply of replies) await markDone(supabase, reply);
}

async function markDone(supabase: ReturnType<typeof createServiceRoleClient>, reply: ButtonReply) {
  const check = await verifyActionToken(reply.payload, "dn", { fieldCount: 2 });
  const fields = check.ok ? check.token.fields : (check.token?.fields ?? null);
  const validIds = fields !== null && UUID.test(fields[0]) && UUID.test(fields[1]);
  const [occurrenceId, recipientId] = validIds ? fields : [null, null];

  let locale: Locale = "sr";
  let recipientExists = false;
  if (recipientId) {
    const { data } = await supabase.from("profiles").select("locale").eq("id", recipientId).maybeSingle();
    if (data) {
      locale = fromProfileLocale(data.locale);
      recipientExists = true;
    }
  }
  const t = getDictionary(locale);

  let text: string;
  if (!check.ok || !occurrenceId || !recipientId) {
    text = t.messages.action_expired_page.body;
  } else if (!recipientExists) {
    text = t.messages.action_not_found_page.body;
  } else {
    const { data, error } = await supabase.rpc("mark_occurrence_done_for", {
      p_occurrence_id: occurrenceId,
      p_recipient_id: recipientId,
    });
    if (error) {
      const code = fromDatabaseError(error).code;
      if (code === "not_found") text = t.messages.action_not_found_page.body;
      else if (code === "household_read_only") text = t.messages.action_read_only_page.body;
      else {
        console.error("[webhooks/whatsapp] mark_occurrence_done_for failed:", occurrenceId, error.message);
        return;
      }
    } else {
      const occurrence = data as unknown as Pick<ClaimedOccurrence, "type" | "title" | "pet_name"> & { done_at: string | null };
      const { pet, title } = reminderLabels(occurrence, locale);
      text = format(t.messages.whatsapp_done_reply, {
        pet,
        title,
        time: formatBelgradeTime(occurrence.done_at ?? new Date().toISOString(), locale),
      });
    }
  }

  const sent = await sendText({ to: reply.from, body: text });
  if (sent.status === "failed") console.error("[webhooks/whatsapp] confirmation not sent:", sent.error);
}
