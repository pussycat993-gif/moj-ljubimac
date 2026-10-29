import { createClient } from "@/lib/supabase/server"
import { checkGates } from "@/lib/server/gates"
import { fail, fromDatabaseError, ok, type ActionResult, type ApiError } from "@/lib/server/result"
import type { Me } from "@/lib/actions/registration"
import { saveMessagePreference } from "@/lib/actions/messages"
import { whatsappConnection } from "@/lib/actions/whatsapp"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import {
  ReminderSettingsClient,
  type ChannelUsage,
  type PreferenceInput,
  type PushRegistration,
  type PushSubscriptionRow,
  type ReminderPreference,
  type ReminderSettings,
} from "./reminder-settings-client"

// S12 Podešavanja podsetnika · /podesavanja/podsetnici · EP-28 get (rpc:get_reminder_settings) and EP-43
// (locale, email, entitlements.premium) on the server; the client saves through the EP-28 update and
// switches push through EP-29 with the server actions below. They run on the server because the session
// lives in httpOnly cookies (owner decision, Steps 13–17) and Step 18 has no lib/actions file; the database
// enforces the rules (RLS self only, the reminder_preferences_before_write trigger for BR-13 and
// premium_required / whatsapp_not_connected / channel_disabled, the check constraints for the lead-time set,
// delivery time and channels, and the regeneration of future pending occurrences).
// Step 29: EP-30 (lib/actions/whatsapp.ts) connects WhatsApp; EP-31 (rpc:get_channel_usage) feeds the monthly
// counter card, read only for Premium users (a failed read hides the card).

const TYPES = ["vaccination", "treatment_dose", "vet_follow_up", "meal", "birthday", "manual"] as const
const LEADS = [0, 1440, 4320, 10080, 20160, 43200]
const CHANNELS = ["email", "push", "whatsapp", "viber"] as const
const FIXED: string[] = ["treatment_dose", "meal"]

/** Check-constraint violations of reminder_preferences → EP-28 field codes (API §7.1). */
function fromPreferenceError(error: { code?: string; message: string }): ApiError {
  if (error.code === "23514") {
    if (error.message.includes("lead_minutes")) {
      return { code: "validation_failed", message: error.message, fields: { lead_minutes: "invalid" } }
    }
    if (error.message.includes("delivery_time")) {
      return { code: "validation_failed", message: error.message, fields: { delivery_time: "required" } }
    }
    if (error.message.includes("channels")) {
      return { code: "validation_failed", message: error.message, fields: { channels: "required" } }
    }
  }
  return fromDatabaseError(error)
}

/** EP-28 update — reminder_preferences upsert on (user_id, type), one call per changed type card. */
async function savePreference(input: PreferenceInput): Promise<ActionResult<ReminderPreference>> {
  "use server"
  const supabase = await createClient()
  const caller = await checkGates(supabase, { access: "write" })
  if (!caller.ok) return caller

  const fields: Record<string, string> = {}
  const type = input?.type
  if (!TYPES.includes(type)) fields.type = "invalid"
  const fixed = FIXED.includes(type)

  const leads = Array.isArray(input?.lead_minutes) ? input.lead_minutes : []
  if (leads.length === 0) fields.lead_minutes = "required"
  else if (leads.length > 6 || new Set(leads).size !== leads.length || leads.some((l) => !LEADS.includes(l))) {
    fields.lead_minutes = "invalid"
  }

  const time = input?.delivery_time ?? null
  if (!fixed && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) fields.delivery_time = "required"

  const channels = Array.isArray(input?.channels) ? input.channels : []
  if (channels.length === 0) fields.channels = "required"
  else if (channels.some((c) => !CHANNELS.includes(c)) || new Set(channels).size !== channels.length) {
    fields.channels = "invalid"
  }
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields })

  const { data, error } = await supabase
    .from("reminder_preferences")
    .upsert(
      {
        type,
        // BR-13: doses and meals are stored as {0} with no delivery time (the trigger enforces it too).
        lead_minutes: fixed ? [0] : leads,
        delivery_time: fixed ? null : time,
        channels,
      },
      { onConflict: "user_id,type" },
    )
    .select("type, lead_minutes, delivery_time, channels, updated_at")
    .single()
  if (error) return { ok: false, error: fromPreferenceError(error) }
  return ok({
    type,
    lead_minutes: data.lead_minutes,
    delivery_time: data.delivery_time ? data.delivery_time.slice(0, 5) : null,
    channels: data.channels,
    fixed_time: FIXED.includes(data.type),
    is_default: false,
    updated_at: data.updated_at,
  })
}

/** EP-29 register — rpc:register_push_subscription (re-assigns an endpoint stored for another user). */
async function registerPush(input: PushRegistration): Promise<ActionResult<PushSubscriptionRow>> {
  "use server"
  const supabase = await createClient()
  const caller = await checkGates(supabase, { access: "write" })
  if (!caller.ok) return caller

  if (typeof input?.endpoint !== "string" || !input.endpoint.startsWith("https://")) {
    return fail("validation_failed", { fields: { endpoint: "invalid" } })
  }
  const { data, error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_user_agent: input.user_agent ?? undefined,
  })
  if (error) {
    const mapped = fromDatabaseError(error)
    if (mapped.code === "validation_failed" && error.details) {
      const [field, code] = error.details.split(":")
      if (field && code) mapped.fields = { [field]: code }
    }
    return { ok: false, error: mapped }
  }
  return ok(data as unknown as PushSubscriptionRow)
}

/** EP-29 check — push_subscriptions select by endpoint (0 or 1 row → push on / off for this browser). */
async function checkPush(endpoint: string): Promise<ActionResult<PushSubscriptionRow[]>> {
  "use server"
  const supabase = await createClient()
  const caller = await checkGates(supabase, { access: "read" })
  if (!caller.ok) return caller

  if (typeof endpoint !== "string" || endpoint === "") return fail("validation_failed", { fields: { endpoint: "invalid" } })
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, user_agent, created_at")
    .eq("endpoint", endpoint)
  if (error) return { ok: false, error: fromDatabaseError(error) }
  return ok(data)
}

/** EP-29 unregister — push_subscriptions delete by endpoint (own rows only, RLS). */
async function unregisterPush(endpoint: string): Promise<ActionResult<null>> {
  "use server"
  const supabase = await createClient()
  const caller = await checkGates(supabase, { access: "write" })
  if (!caller.ok) return caller

  if (typeof endpoint !== "string" || endpoint === "") return fail("validation_failed", { fields: { endpoint: "invalid" } })
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint)
  if (error) return { ok: false, error: fromDatabaseError(error) }
  return ok(null)
}

export default async function ReminderSettingsPage() {
  const supabase = await createClient()
  const [me, settings] = await Promise.all([supabase.rpc("get_me"), supabase.rpc("get_reminder_settings")])
  if (me.error) console.error("[podesavanja/podsetnici] get_me:", me.error.message)
  if (settings.error) console.error("[podesavanja/podsetnici] get_reminder_settings:", settings.error.message)
  const profile = (me.data ?? null) as Me | null
  const locale = fromProfileLocale(profile?.locale)
  const dict = getDictionary(locale)
  const premium = profile?.entitlements.premium ?? false
  const usage = premium ? await supabase.rpc("get_channel_usage") : null
  if (usage?.error) console.error("[podesavanja/podsetnici] get_channel_usage:", usage.error.message)

  return (
    <ReminderSettingsClient
      settings={settings.error ? null : (settings.data as unknown as ReminderSettings)}
      email={profile?.email ?? ""}
      premium={premium}
      usage={usage && !usage.error ? (usage.data as unknown as ChannelUsage) : null}
      locale={locale}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      copy={{ reminderSettings: dict.reminderSettings, common: dict.common }}
      actions={{ savePreference, registerPush, checkPush, unregisterPush, saveMessagePreference, whatsappConnection }}
    />
  )
}
