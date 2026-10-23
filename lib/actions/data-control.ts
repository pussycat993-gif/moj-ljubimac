"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { formatBelgradeDate } from "@/lib/server/dispatch";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import { r2 } from "@/lib/integrations/r2";
import { sendEmail } from "@/lib/integrations/resend";
import type { Me } from "@/lib/actions/registration";
import { fromProfileLocale } from "@/lib/i18n";

// S19 Moji podaci (/profil/podaci): EP-50 requestDataExport / getMyDataOverview and EP-51
// requestAccountDeletion / cancelAccountDeletion, over the Step 23 database functions request_data_export,
// get_my_data_overview_base, request_account_deletion and cancel_account_deletion (owner decision). The
// §4.1 gates run first; gate 4 does not apply (API §5.6 intro: organisation writes only), and
// cancelAccountDeletion is the one call allowed through gate 3. requestDataExport only inserts the row —
// the archive is built by /api/internal/exports (Step 30a, TC ADR-13). The deletion request sends the
// Design §9.1 account_deletion_scheduled email; the cancel confirmation has no §9.1 template (CR-24) and
// is not sent.

/** API §6 FileUrl for the archive (presigned R2 GET, 10 min). */
export type ExportFileUrl = {
  kind: "data_export";
  id: string;
  url: string;
  expires_at: string;
  mime_type: "application/zip";
};

/** API §6 DataExport. */
export type DataExport = {
  id: string;
  status: "preparing" | "ready" | "failed" | "expired";
  file_name: string;
  size_bytes: number | null;
  requested_at: string;
  ready_at: string | null;
  expires_at: string | null;
  download_url: ExportFileUrl | null;
};

/** EP-50 getMyDataOverview Response. */
export type DataOverview = {
  latest_export: DataExport | null;
  summary: { pet_names: string[]; attachment_count: number; moment_count: number };
  deletion: {
    requested_at: string | null;
    due_at: string | null;
    days_left: number | null;
    heir_full_name: string | null;
  };
};

type ExportRow = {
  id: string;
  status: DataExport["status"];
  r2_key: string | null;
  size_bytes: number | null;
  requested_at: string;
  ready_at: string | null;
  expires_at: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** DataExport.file_name: moj-ljubimac-podaci-<requested_at date>.zip (Europe/Belgrade calendar). */
function exportFileName(requestedAt: string) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date(requestedAt));
  return `moj-ljubimac-podaci-${date}.zip`;
}

async function toDataExport(row: ExportRow): Promise<DataExport> {
  const fileName = exportFileName(row.requested_at);
  let downloadUrl: ExportFileUrl | null = null;
  if (row.status === "ready" && row.r2_key) {
    const signed = await r2().presignGet(row.r2_key, { fileName });
    downloadUrl = { kind: "data_export", id: row.id, url: signed.url, expires_at: signed.expires_at, mime_type: "application/zip" };
  }
  return {
    id: row.id,
    status: row.status,
    file_name: fileName,
    size_bytes: row.size_bytes === null ? null : Number(row.size_bytes),
    requested_at: row.requested_at,
    ready_at: row.ready_at,
    expires_at: row.expires_at,
    download_url: downloadUrl,
  };
}

async function readMe(supabase: Supabase): Promise<ActionResult<Me>> {
  const { data, error } = await supabase.rpc("get_me");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("not_found");
  return ok(data as unknown as Me);
}

/** EP-50 — inserts data_exports{status = preparing}; one still preparing → 409 export_in_progress. */
export async function requestDataExport(): Promise<ActionResult<DataExport>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const { data, error } = await supabase.rpc("request_data_export");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  if (!data) return fail("internal_error", { message: "request_data_export returned no row" });
  return ok(await toDataExport(data as unknown as ExportRow));
}

/** EP-50 — latest export (with its download URL when ready), the archive summary and the deletion block. */
export async function getMyDataOverview(): Promise<ActionResult<DataOverview>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const [base, latest] = await Promise.all([
    supabase.rpc("get_my_data_overview_base"),
    supabase
      .from("data_exports")
      .select("id, status, r2_key, size_bytes, requested_at, ready_at, expires_at")
      .eq("user_id", caller.data.user.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (base.error) return { ok: false, error: fromDatabaseError(base.error) };
  if (latest.error) return { ok: false, error: fromDatabaseError(latest.error) };

  let latestExport: DataExport | null = null;
  if (latest.data) {
    try {
      latestExport = await toDataExport(latest.data as ExportRow);
    } catch (error) {
      console.error("[lib/actions/data-control] presign failed:", error instanceof Error ? error.message : error);
      return fail("internal_error", { message: "export download URL could not be signed" });
    }
  }
  const overview = base.data as unknown as Omit<DataOverview, "latest_export">;
  return ok({ latest_export: latestExport, summary: overview.summary, deletion: overview.deletion });
}

/**
 * EP-51 — request: deletion_requested_at = now, deletion_due_at = +30 days (BR-31); `confirm` must be true;
 * already pending → 403 account_pending_deletion (gate 3). Sends account_deletion_scheduled with the due date.
 * Subscriptions are not changed, so a cancel restores the account unchanged (E-16).
 */
export async function requestAccountDeletion(input: { confirm: boolean }): Promise<ActionResult<Me>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;
  if (input?.confirm !== true) return fail("validation_failed", { fields: { confirm: "required" } });

  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  const me = await readMe(supabase);
  if (!me.ok) return me;

  if (me.data.deletion_due_at) {
    const locale = fromProfileLocale(me.data.locale);
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
    const sent = await sendEmail({
      to: me.data.email,
      locale,
      template: {
        id: "account_deletion_scheduled",
        variables: { date: formatBelgradeDate(me.data.deletion_due_at, locale), url: `${site}/profil/podaci` },
      },
    });
    // The request is stored either way; S19 shows the same date.
    if (sent.status === "failed") console.error("[lib/actions/data-control] deletion email failed:", sent.error);
  }
  return me;
}

/** EP-51 — cancel: both deletion columns back to null (E-16); nothing pending → no-op. No email (CR-24). */
export async function cancelAccountDeletion(): Promise<ActionResult<Me>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read", exempt: "cancel_deletion" });
  if (!caller.ok) return caller;

  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) return { ok: false, error: fromDatabaseError(error) };
  return readMe(supabase);
}
