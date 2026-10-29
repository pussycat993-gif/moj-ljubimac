import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { format, fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n";
import type { EmailResult, EmailTemplate } from "@/lib/integrations/resend";
import type { PushEndpoint, PushPayload, PushResult } from "@/lib/integrations/webpush";
import type { WhatsAppResult } from "@/lib/integrations/whatsapp";
import type { Database } from "@/lib/supabase/database.types";

// EP-33 — dispatch due reminders (ADR-04, NFR-01). One run, in order, within a 45 s budget and in
// batches of ≤ 200:
//   1. claim (rpc:claim_due_occurrences) → 2. recipients and 3. channels per recipient →
//   4. send email (Resend) and web push, each with a signed dn_ action link (EP-32) →
//   5. one reminder_deliveries row per recipient × channel →
//   6. re-send final notices sent 30 min ago (claim_resend_occurrences) on the same rules →
//   7. mark missed (mark_missed_occurrences) → 8. watchdog (dispatch_watchdog_due, RISK-14).
// The SQL functions live in the reminder_dispatch migration; recipients and their channel inputs come
// back with each claimed notice. WhatsApp / Viber resolve to the fallback {email, push} unless the channel
// is live (liveChannels).
// Step 29 — WhatsApp (FR-23, BR-14a): a live WhatsApp channel sends the reminder_due template (API §9.4)
// whose "Urađeno" quick-reply payload is the same signed dn_ token as the email link. The BR-14a cap is
// counted per message inside the run (delivered this month + delivered in this run): the 30th is sent, the
// 31st falls back to {email, push} and gets a whatsapp row with error whatsapp_cap_reached (API §7.2). A
// failed WhatsApp send is recorded failed and falls back to {email, push} for that occurrence (API §9.4).
// The number comes from the recipient's opted-in user_channels row. Viber is never sent (BR-14b).

export type Channel = Database["public"]["Enums"]["delivery_channel"];

export type DispatchRecipient = {
  id: string;
  is_owner: boolean;
  email: string | null;
  full_name: string | null;
  locale: string | null;
  premium: boolean;
  channels: Channel[];
  whatsapp_opted_in: boolean;
  viber_opted_in: boolean;
  /** Delivered WhatsApp/Viber messages this Europe/Belgrade calendar month (BR-14a). */
  cap_used: number;
  push_subscriptions: PushEndpoint[];
};

export type ClaimedOccurrence = {
  occurrence_id: string;
  reminder_id: string;
  due_at: string;
  notify_at: string;
  type: Database["public"]["Enums"]["reminder_type"];
  title: string | null;
  pet_id: string | null;
  pet_name: string | null;
  viber_enabled: boolean;
  recipients: DispatchRecipient[];
};

export type DispatchCounters = {
  claimed: number;
  delivered: number;
  failed: number;
  fell_back: number;
  resent: number;
  missed: number;
  duration_ms: number;
};

/** BR-14a: 30 WhatsApp/Viber messages per Premium user per calendar month. */
export const MONTHLY_MESSAGE_CAP = 30;
export const BATCH_SIZE = 200;
export const RUN_BUDGET_MS = 45_000;
export const WATCHDOG_LOG_INTERVAL_MS = 60 * 60 * 1000;

const CHANNEL_ORDER: Channel[] = ["email", "push", "whatsapp", "viber"];

export type ChannelContext = {
  /** app_settings.viber_enabled (BR-14b). */
  viberEnabled: boolean;
  /** Channels with a working sender (Step 29: whatsapp when sendWhatsApp is wired). */
  liveChannels: ReadonlySet<Channel>;
  /** WhatsApp/Viber messages delivered this month, including the ones delivered earlier in this run. */
  capUsed: number;
};

/**
 * EP-33 step 3. The recipient's preference channels for the type; members are limited to
 * {email, push} (BR-24). WhatsApp / Viber is replaced by the fallback {email, push} — counted once per
 * replaced channel — when the recipient has no Premium (BR-16, FR-25), for Viber while it is switched
 * off (BR-14b), without an opted-in user_channels row, once 30 messages were delivered this month
 * (BR-14a: the 30th is sent, the 31st falls back), or while the channel has no sender yet.
 */
export function resolveChannels(
  recipient: Pick<DispatchRecipient, "is_owner" | "premium" | "channels" | "whatsapp_opted_in" | "viber_opted_in">,
  ctx: ChannelContext,
): { channels: Channel[]; fellBack: number } {
  const wanted = recipient.is_owner
    ? recipient.channels
    : recipient.channels.filter((channel) => channel === "email" || channel === "push");
  const result = new Set<Channel>();
  let fellBack = 0;
  for (const channel of wanted) {
    if (channel === "email" || channel === "push") {
      result.add(channel);
      continue;
    }
    const usable =
      recipient.premium &&
      (channel === "whatsapp" ? recipient.whatsapp_opted_in : ctx.viberEnabled && recipient.viber_opted_in) &&
      ctx.capUsed < MONTHLY_MESSAGE_CAP &&
      ctx.liveChannels.has(channel);
    if (usable) {
      result.add(channel);
    } else {
      fellBack++;
      result.add("email");
      result.add("push");
    }
  }
  return { channels: CHANNEL_ORDER.filter((channel) => result.has(channel)), fellBack };
}

/**
 * BR-14a / API §7.2: true when WhatsApp would have been sent but the monthly cap is used up — the case the
 * dispatch records on the delivery row as whatsapp_cap_reached.
 */
export function whatsappCapReached(
  recipient: Pick<DispatchRecipient, "is_owner" | "premium" | "channels" | "whatsapp_opted_in">,
  ctx: ChannelContext,
): boolean {
  return (
    recipient.is_owner &&
    recipient.channels.includes("whatsapp") &&
    recipient.premium &&
    recipient.whatsapp_opted_in &&
    ctx.liveChannels.has("whatsapp") &&
    ctx.capUsed >= MONTHLY_MESSAGE_CAP
  );
}

function intlLocale(locale: Locale) {
  return locale === "en" ? "en-GB" : "sr-Latn";
}

/** Design §9: "19. 10. 2026." · "19 Oct 2026", on the Europe/Belgrade calendar (NFR-02). */
export function formatBelgradeDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso));
}

/** Design §9: "08:00", Europe/Belgrade wall clock (NFR-02). */
export function formatBelgradeTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Belgrade",
  }).format(new Date(iso));
}

/** {pet} and {title} of Design §9.1 for an occurrence (null meal / birthday titles use Step 17's labels). */
export function reminderLabels(
  occurrence: Pick<ClaimedOccurrence, "type" | "title" | "pet_name">,
  locale: Locale,
): { pet: string; title: string } {
  const t = getDictionary(locale);
  const pet = occurrence.pet_name ?? t.reminders.forMe;
  let title = occurrence.title ?? "";
  if (!occurrence.title && occurrence.type === "meal") title = format(t.reminders.mealTitle, { pet });
  if (!occurrence.title && occurrence.type === "birthday") title = format(t.pet.birthdayTitle, { pet });
  return { pet, title };
}

/** {first_name}: the first word of profiles.full_name, or null. */
export function firstName(fullName: string | null): string | null {
  const word = (fullName ?? "").trim().split(/\s+/)[0];
  return word ? word : null;
}

export type DispatchDeps = {
  supabase: SupabaseClient<Database>;
  sendEmail: (input: { to: string; template: EmailTemplate; locale: Locale }) => Promise<EmailResult>;
  /** null when push is not configured (no VAPID keys): push is skipped without a row. */
  sendPush: ((endpoints: PushEndpoint[], payload: PushPayload) => Promise<PushResult>) | null;
  signDoneToken: (occurrenceId: string, recipientId: string, sentAt: Date) => Promise<string>;
  /** Step 29: the reminder_due template (API §9.4). Without it WhatsApp is never live. */
  sendWhatsApp?: (input: {
    to: string;
    locale: Locale;
    pet: string;
    title: string;
    when: string;
    payload: string;
  }) => Promise<WhatsAppResult>;
  /** NEXT_PUBLIC_SITE_URL, no trailing slash. */
  siteUrl: string;
  liveChannels?: ReadonlySet<Channel>;
  now?: () => number;
  budgetMs?: number;
};

type DeliveryRow = Database["public"]["Tables"]["reminder_deliveries"]["Insert"];

// RISK-14: the watchdog condition is logged at most once per hour per running instance.
let lastWatchdogLogAt: number | null = null;

/** Test hook: forget the last watchdog log time. */
export function resetWatchdogForTests() {
  lastWatchdogLogAt = null;
}

async function rpcJson<T>(supabase: SupabaseClient<Database>, fn: "claim_due_occurrences" | "claim_resend_occurrences"): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, { p_limit: BATCH_SIZE });
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (Array.isArray(data) ? data : []) as unknown as T[];
}

export async function runDispatch(deps: DispatchDeps): Promise<DispatchCounters> {
  const now = deps.now ?? Date.now;
  const started = now();
  const budget = deps.budgetMs ?? RUN_BUDGET_MS;
  const liveChannels = new Set<Channel>(deps.liveChannels ?? []);
  // No sender, no live channel; Viber has no adapter in v1 (BR-14b).
  if (!deps.sendWhatsApp) liveChannels.delete("whatsapp");
  liveChannels.delete("viber");
  const counters: DispatchCounters = { claimed: 0, delivered: 0, failed: 0, fell_back: 0, resent: 0, missed: 0, duration_ms: 0 };
  let pushSkipLogged = false;
  // BR-14a in-run count: WhatsApp messages delivered to each recipient during this run.
  const sentThisRun = new Map<string, number>();
  // Opted-in WhatsApp numbers (user_channels), read once per recipient per run.
  const whatsappNumbers = new Map<string, string | null>();

  async function whatsappNumber(userId: string): Promise<string | null> {
    if (whatsappNumbers.has(userId)) return whatsappNumbers.get(userId) ?? null;
    const { data, error } = await deps.supabase
      .from("user_channels")
      .select("address")
      .eq("user_id", userId)
      .eq("channel", "whatsapp")
      .not("opted_in_at", "is", null)
      .maybeSingle();
    if (error) console.error("[dispatch] could not read the WhatsApp number:", userId, error.message);
    const address = data?.address ?? null;
    whatsappNumbers.set(userId, address);
    return address;
  }

  async function deliver(occurrence: ClaimedOccurrence) {
    const rows: DeliveryRow[] = [];
    for (const recipient of occurrence.recipients) {
      const ctx: ChannelContext = {
        viberEnabled: occurrence.viber_enabled,
        liveChannels,
        capUsed: recipient.cap_used + (sentThisRun.get(recipient.id) ?? 0),
      };
      const resolved = resolveChannels(recipient, ctx);
      let channels = resolved.channels;
      counters.fell_back += resolved.fellBack;
      const capReached = whatsappCapReached(recipient, ctx);

      const locale = fromProfileLocale(recipient.locale);
      const t = getDictionary(locale);
      const { pet, title } = reminderLabels(occurrence, locale);
      const date = formatBelgradeDate(occurrence.due_at, locale);
      const time = formatBelgradeTime(occurrence.due_at, locale);
      const sentAt = new Date(now());
      const doneToken = await deps.signDoneToken(occurrence.occurrence_id, recipient.id, sentAt);
      const doneUrl = `${deps.siteUrl}/api/a/done?t=${encodeURIComponent(doneToken)}`;
      const appUrl = `${deps.siteUrl}/podsetnici`;

      if (capReached) {
        rows.push({
          occurrence_id: occurrence.occurrence_id,
          recipient_id: recipient.id,
          channel: "whatsapp",
          status: "failed",
          provider_message_id: null,
          error: "whatsapp_cap_reached",
          delivered_at: null,
        });
      }

      // WhatsApp first: a failed send falls back to {email, push} for this occurrence (API §9.4).
      if (channels.includes("whatsapp") && deps.sendWhatsApp) {
        const to = await whatsappNumber(recipient.id);
        const result: WhatsAppResult = to
          ? await deps.sendWhatsApp({
              to,
              locale,
              pet,
              title,
              when: format(t.messages.reminder_push.body, { date, time }),
              payload: doneToken,
            })
          : { status: "failed", error: "whatsapp_not_connected", undeliverable: false };
        rows.push({
          occurrence_id: occurrence.occurrence_id,
          recipient_id: recipient.id,
          channel: "whatsapp",
          status: result.status,
          provider_message_id: result.status === "delivered" ? result.id : null,
          error: result.status === "failed" ? result.error : null,
          delivered_at: result.status === "delivered" ? new Date(now()).toISOString() : null,
        });
        if (result.status === "delivered") {
          sentThisRun.set(recipient.id, (sentThisRun.get(recipient.id) ?? 0) + 1);
        } else {
          counters.fell_back++;
          const before = channels;
          channels = CHANNEL_ORDER.filter((c) => c === "email" || c === "push" || before.includes(c));
        }
      }

      for (const channel of channels) {
        if (channel === "email") {
          const result = recipient.email
            ? await deps.sendEmail({
                to: recipient.email,
                locale,
                template: {
                  id: "reminder_email",
                  variables: { first_name: firstName(recipient.full_name), pet, title, date, time, done_url: doneUrl, app_url: appUrl },
                },
              })
            : ({ status: "failed", error: "no_email" } as const);
          rows.push({
            occurrence_id: occurrence.occurrence_id,
            recipient_id: recipient.id,
            channel,
            status: result.status,
            provider_message_id: result.status === "delivered" ? result.id : null,
            error: result.status === "failed" ? result.error : null,
            delivered_at: result.status === "delivered" ? new Date(now()).toISOString() : null,
          });
        } else if (channel === "push") {
          if (recipient.push_subscriptions.length === 0) continue;
          if (!deps.sendPush) {
            if (!pushSkipLogged) console.info("[dispatch] push not configured (VAPID keys empty) — push skipped");
            pushSkipLogged = true;
            continue;
          }
          const result = await deps.sendPush(recipient.push_subscriptions, {
            title: format(t.messages.reminder_push.title, { pet, title }),
            body: format(t.messages.reminder_push.body, { date, time }),
            url: appUrl,
            done_url: doneUrl,
          });
          rows.push({
            occurrence_id: occurrence.occurrence_id,
            recipient_id: recipient.id,
            channel,
            status: result.status,
            provider_message_id: result.provider_message_id,
            error: result.error,
            delivered_at: result.status === "delivered" ? new Date(now()).toISOString() : null,
          });
        }
        // whatsapp: sent above; viber: never live in v1 (BR-14b).
      }
    }
    for (const row of rows) {
      if (row.status === "delivered") counters.delivered++;
      // A cap row records the fallback (counted in fell_back), not a failed send.
      else if (row.error !== "whatsapp_cap_reached") counters.failed++;
    }
    if (rows.length > 0) {
      const { error } = await deps.supabase.from("reminder_deliveries").insert(rows);
      if (error) console.error("[dispatch] could not record deliveries:", occurrence.occurrence_id, error.message);
    }
  }

  // Steps 1–5.
  let batch: ClaimedOccurrence[];
  do {
    batch = await rpcJson<ClaimedOccurrence>(deps.supabase, "claim_due_occurrences");
    counters.claimed += batch.length;
    for (const occurrence of batch) await deliver(occurrence);
  } while (batch.length === BATCH_SIZE && now() - started < budget);

  // Step 6.
  if (now() - started < budget) {
    do {
      batch = await rpcJson<ClaimedOccurrence>(deps.supabase, "claim_resend_occurrences");
      counters.resent += batch.length;
      for (const occurrence of batch) await deliver(occurrence);
    } while (batch.length === BATCH_SIZE && now() - started < budget);
  }

  // Step 7.
  const missed = await deps.supabase.rpc("mark_missed_occurrences");
  if (missed.error) throw new Error(`mark_missed_occurrences: ${missed.error.message}`);
  counters.missed = missed.data ?? 0;

  // Step 8 — detection and logging only; the Operator alert email waits for its copy (CR-24).
  const watchdog = await deps.supabase.rpc("dispatch_watchdog_due");
  if (watchdog.error) {
    console.error("[dispatch] watchdog query failed:", watchdog.error.message);
  } else if (watchdog.data === true) {
    const at = now();
    if (lastWatchdogLogAt === null || at - lastWatchdogLogAt >= WATCHDOG_LOG_INTERVAL_MS) {
      lastWatchdogLogAt = at;
      console.error(
        "[dispatch] RISK-14 watchdog: pending reminders are more than 15 minutes overdue and no delivery was recorded in the last 15 minutes.",
      );
    }
  }

  counters.duration_ms = now() - started;
  return counters;
}
