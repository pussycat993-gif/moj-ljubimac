import { NextResponse, type NextRequest } from "next/server";
import { format, fromProfileLocale, getDictionary, type Locale } from "@/lib/i18n";
import { escapeHtml, TOKEN_COLORS as C } from "@/lib/integrations/resend";
import { verifyActionToken } from "@/lib/server/action-tokens";
import { formatBelgradeTime, reminderLabels, type ClaimedOccurrence } from "@/lib/server/dispatch";
import { apiError, fromDatabaseError, httpStatus } from "@/lib/server/result";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// EP-32 — GET /api/a/done?t=<dn_ token>, no session (email and push "Urađeno"). The signed token
// (API §9.3) names the occurrence and the recipient; marking runs the EP-26 effects as the recipient
// (rpc mark_occurrence_done_for). A token whose instance is already done shows the same success page
// (single use comes from the done state). HEAD and Purpose / Sec-Purpose: prefetch requests get 200 with
// an empty body and change nothing (mail-scanner guard). The answer is a small localized HTML page in
// the recipient's profiles.locale (Design §9.1 action_done_page / action_expired_page), or JSON with
// Accept: application/json.
// The page is a template string with the Design §4.1 token values (owner decision, Step 19), not a
// React shell: a route handler cannot render the app's server components.

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageCopy = { heading: string; body: string; button: string };
type PageError = "invalid_action_token" | "not_found" | "household_read_only" | "internal_error";

function isPrefetch(request: NextRequest): boolean {
  const purpose = `${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`;
  return /prefetch/i.test(purpose);
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

function page(locale: Locale, copy: PageCopy, status: number): Response {
  const lang = locale === "en" ? "en" : "sr-Latn";
  const appUrl = `${siteUrl()}/podsetnici`;
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(copy.heading)} · Moj Ljubimac</title>
<style>
  @font-face { font-family: "Inter"; src: url("/fonts/Inter-Regular.ttf") format("truetype"); font-weight: 400; }
  @font-face { font-family: "Inter"; src: url("/fonts/Inter-Bold.ttf") format("truetype"); font-weight: 700; }
  body { margin: 0; min-height: 100vh; background: ${C.background}; color: ${C.foreground}; font-family: "Inter", system-ui, sans-serif; font-size: 16px; line-height: 24px; }
  main { max-width: 448px; margin: 0 auto; padding: 48px 16px; }
  .logo { display: block; height: 48px; width: auto; margin: 0 auto 24px; }
  .card { background: ${C.card}; color: ${C.foreground}; border: 1px solid ${C.border}; border-radius: 12px; padding: 24px; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 22px; line-height: 28px; font-weight: 700; }
  p { margin: 0 0 24px; color: ${C.mutedForeground}; }
  a.button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px; border-radius: 8px; background: ${C.primary}; color: ${C.primaryForeground}; font-weight: 600; text-decoration: none; }
  a.button:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; }
</style>
</head>
<body>
<main>
<img class="logo" src="/brand/logo-full.png" alt="Moj Ljubimac">
<div class="card">
<h1>${escapeHtml(copy.heading)}</h1>
<p>${escapeHtml(copy.body)}</p>
<a class="button" href="${escapeHtml(appUrl)}">${escapeHtml(copy.button)}</a>
</div>
</main>
</body>
</html>
`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function errorResponse(code: PageError, locale: Locale, wantsJson: boolean): Response {
  const status = httpStatus(code);
  if (wantsJson) return NextResponse.json(apiError(code), { status, headers: { "Cache-Control": "no-store" } });
  const t = getDictionary(locale);
  const copy =
    code === "invalid_action_token"
      ? t.messages.action_expired_page
      : code === "not_found"
        ? t.messages.action_not_found_page
        : code === "household_read_only"
          ? t.messages.action_read_only_page
          : { heading: t.common.error, body: "", button: t.messages.action_expired_page.button };
  return page(locale, copy, status);
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  if (isPrefetch(request)) return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");

  const check = await verifyActionToken(request.nextUrl.searchParams.get("t"), "dn", { fieldCount: 2 });
  const fields = check.ok ? check.token.fields : (check.token?.fields ?? null);
  const validIds = fields !== null && UUID.test(fields[0]) && UUID.test(fields[1]);
  const [occurrenceId, recipientId] = validIds ? fields : [null, null];

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (error) {
    console.error("[a/done]", error instanceof Error ? error.message : error);
    return errorResponse("internal_error", "sr", wantsJson);
  }

  // The recipient's language, also for an expired link when its signature is valid.
  let locale: Locale = "sr";
  let recipientExists = false;
  if (recipientId) {
    const { data } = await supabase.from("profiles").select("locale").eq("id", recipientId).maybeSingle();
    if (data) {
      locale = fromProfileLocale(data.locale);
      recipientExists = true;
    }
  }

  if (!check.ok || !occurrenceId || !recipientId) return errorResponse("invalid_action_token", locale, wantsJson);
  if (!recipientExists) return errorResponse("not_found", locale, wantsJson);

  const { data, error } = await supabase.rpc("mark_occurrence_done_for", {
    p_occurrence_id: occurrenceId,
    p_recipient_id: recipientId,
  });
  if (error) {
    const code = fromDatabaseError(error).code;
    if (code === "not_found" || code === "household_read_only") return errorResponse(code, locale, wantsJson);
    return errorResponse("internal_error", locale, wantsJson);
  }

  const occurrence = data as unknown as Pick<ClaimedOccurrence, "type" | "title" | "pet_name"> & { done_at: string | null };
  if (wantsJson) return NextResponse.json({ occurrence: data }, { headers: { "Cache-Control": "no-store" } });

  const t = getDictionary(locale);
  const { pet, title } = reminderLabels(occurrence, locale);
  const copy = t.messages.action_done_page;
  return page(
    locale,
    {
      heading: copy.heading,
      body: format(copy.body, { pet, title, time: formatBelgradeTime(occurrence.done_at ?? new Date().toISOString(), locale) }),
      button: copy.button,
    },
    200,
  );
}
