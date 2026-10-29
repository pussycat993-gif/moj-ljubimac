"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkGates } from "@/lib/server/gates";
import { withIdempotency } from "@/lib/server/idempotency";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { checkVerificationToken, signVerificationToken, VERIFICATION_TOKEN_TTL_MS } from "@/lib/server/action-tokens";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import { sendVerificationCode } from "@/lib/integrations/whatsapp";
import { fromProfileLocale } from "@/lib/i18n";

// EP-30 action:whatsapp_connection (S12 Kanali card: number → "Pošalji kod" → code → "Povezano" →
// "Prekini vezu"). send_code and verify_code need Premium (BR-14); disconnect is always allowed.
// send_code is idempotent per idempotency_key for 24 h (API §3.3) and limited to 5 per hour, verify_code to
// 10 per hour (API §11, EP-30). The verification_token is stateless (API §9.3): a signed wv_ token over the
// user, the phone, the expiry and a keyed digest of the code — nothing is stored until verify_code, which
// upserts user_channels (opted_in_at = now(): the verified exchange is the opt-in). user_channels has no
// client write path (Step 08 RLS), so the upsert and the disconnect clean-up run with the service role,
// always scoped to the gated caller. Disconnect removes whatsapp from every reminder_preferences.channels of
// the caller; a type left empty becomes {email, push}.

/** API §6 WhatsAppConnection. */
export type WhatsAppConnection = {
  channel: "whatsapp";
  status: "connected" | "not_connected";
  phone: string | null;
  connected_at: string | null;
};

/** EP-30 send_code response. */
export type CodeSent = {
  phone: string;
  expires_at: string;
  resend_available_at: string;
  verification_token: string;
};

export type WhatsAppConnectionInput =
  | { op: "send_code"; phone: string; idempotency_key: string }
  | { op: "verify_code"; verification_token: string; code: string }
  | { op: "disconnect" };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164 = /^\+[1-9]\d{7,14}$/;
const CODE = /^\d{6}$/;

/** API §11: send_code 5 per hour, verify_code 10 per hour, per user. ("use server": only async exports.) */
const SEND_CODE_PER_HOUR = 5;
const VERIFY_CODE_PER_HOUR = 10;
const RESEND_AFTER_MS = 60 * 1000;

function randomCode(): string {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 1_000_000).padStart(6, "0");
}

async function isPremium(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<ActionResult<boolean>> {
  const { data, error } = await supabase.rpc("is_premium", { user_id: userId });
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return ok(data === true);
}

export async function whatsappConnection(input: WhatsAppConnectionInput): Promise<ActionResult<WhatsAppConnection | CodeSent>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "write" });
  if (!caller.ok) return caller;
  const userId = caller.data.user.id;

  if (input?.op === "disconnect") return disconnect(userId);
  if (input?.op !== "send_code" && input?.op !== "verify_code") return fail("validation_failed", { fields: { op: "invalid" } });

  const premium = await isPremium(supabase, userId);
  if (!premium.ok) return premium;
  if (!premium.data) return fail("premium_required", { details: { limit: "whatsapp" } });

  if (input.op === "send_code") {
    const fields: Record<string, string> = {};
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    if (!phone) fields.phone = "required";
    else if (!E164.test(phone)) fields.phone = "invalid";
    const key = typeof input.idempotency_key === "string" ? input.idempotency_key : "";
    if (!key) fields.idempotency_key = "required";
    else if (!UUID_V4.test(key)) fields.idempotency_key = "invalid";
    if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

    return withIdempotency<CodeSent>(supabase, { userId, key, operation: "whatsapp_send_code" }, async () => {
      const limited = await checkRateLimit(supabase, {
        userId,
        operation: "whatsapp.send_code",
        limit: SEND_CODE_PER_HOUR,
        windowSeconds: 60 * 60,
      });
      if (limited) return { ok: false, error: limited };

      const { data: profile } = await supabase.from("profiles").select("locale").eq("id", userId).maybeSingle();
      const now = Date.now();
      const code = randomCode();
      const expiresAt = new Date(now + VERIFICATION_TOKEN_TTL_MS);
      const sent = await sendVerificationCode({ to: phone, code, locale: fromProfileLocale(profile?.locale) });
      if (sent.status === "failed") {
        if (sent.undeliverable) return fail("validation_failed", { message: sent.error, fields: { phone: "undeliverable" } });
        console.error("[lib/actions/whatsapp] verification_code failed:", sent.error);
        return fail("internal_error", { message: `verification_code: ${sent.error}` });
      }
      return ok({
        phone,
        expires_at: expiresAt.toISOString(),
        resend_available_at: new Date(now + RESEND_AFTER_MS).toISOString(),
        verification_token: await signVerificationToken(userId, phone, code, expiresAt),
      });
    });
  }

  // verify_code
  const fields: Record<string, string> = {};
  if (typeof input.verification_token !== "string" || input.verification_token === "") fields.verification_token = "required";
  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!code) fields.code = "required";
  else if (!CODE.test(code)) fields.code = "invalid";
  if (Object.keys(fields).length > 0) return fail("validation_failed", { fields });

  const limited = await checkRateLimit(supabase, {
    userId,
    operation: "whatsapp.verify_code",
    limit: VERIFY_CODE_PER_HOUR,
    windowSeconds: 60 * 60,
  });
  if (limited) return { ok: false, error: limited };

  const verified = await checkVerificationToken(input.verification_token, userId, code);
  if (!verified) return fail("verification_code_invalid");

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("user_channels")
    .upsert(
      { user_id: userId, channel: "whatsapp", address: verified.phone, opted_in_at: new Date().toISOString() },
      { onConflict: "user_id,channel" },
    )
    .select("address, opted_in_at")
    .single();
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return ok({ channel: "whatsapp", status: "connected", phone: data.address, connected_at: data.opted_in_at });
}

async function disconnect(userId: string): Promise<ActionResult<WhatsAppConnection>> {
  const admin = createServiceRoleClient();
  const { error: deleteError } = await admin.from("user_channels").delete().eq("user_id", userId).eq("channel", "whatsapp");
  if (deleteError) return { ok: false, error: fromDatabaseError(deleteError) };

  const { data: preferences, error: readError } = await admin
    .from("reminder_preferences")
    .select("type, channels")
    .eq("user_id", userId)
    .contains("channels", ["whatsapp"]);
  if (readError) return { ok: false, error: fromDatabaseError(readError) };

  for (const preference of preferences ?? []) {
    const rest = preference.channels.filter((channel) => channel !== "whatsapp");
    const { error } = await admin
      .from("reminder_preferences")
      .update({ channels: rest.length > 0 ? rest : ["email", "push"] })
      .eq("user_id", userId)
      .eq("type", preference.type);
    if (error) return { ok: false, error: fromDatabaseError(error) };
  }
  return ok({ channel: "whatsapp", status: "not_connected", phone: null, connected_at: null });
}
