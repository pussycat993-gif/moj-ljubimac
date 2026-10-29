import "server-only";

import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { fromProfileLocale, type Locale } from "@/lib/i18n";
import type { R2 } from "@/lib/integrations/r2";
import { sendEmail, type EmailResult, type EmailTemplate } from "@/lib/integrations/resend";
import { formatBelgradeDate } from "@/lib/server/dispatch";

// EP-50 archive builder (FR-41; TC ADR-13 Mechanics, ADR-17 fflate; API §10 item 6). One `preparing`
// data_exports row becomes one ZIP: data.json with the user's rows (owner decision, Step 30a: profile,
// subscriptions, pets and all their records, care log, moments, reminders, preferences, households, listings,
// the conversations the user is in with their messages, reports and blocks) and every file those rows point to
// under files/<r2_key> (pet photos, visit attachments, moment photos, listing photos). Binaries are stored
// (ZipPassThrough), JSON is deflated at level 6. Read with the service role (API §3.1: jobs). The archive goes to
// R2_BUCKET at exports/<user_id>/<data_export_id>.zip; the row becomes ready with r2_key, size_bytes, ready_at and
// expires_at = ready_at + 7 days, and the user gets the Design §9.1 data_export_ready email. Any failure (a
// database read, an R2 read or upload, more than 90 MB) sets status = failed.

export const MAX_ARCHIVE_BYTES = 90 * 1024 * 1024;
export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PAGE = 1000;
const IN_CHUNK = 100;

type DbResult = { data: unknown; error: { message: string } | null };

/** The part of the supabase-js query builder the builder uses (the service-role client satisfies it). */
export type ExportQuery = PromiseLike<DbResult> & {
  eq(column: string, value: unknown): ExportQuery;
  in(column: string, values: readonly unknown[]): ExportQuery;
  order(column: string, options?: { ascending?: boolean }): ExportQuery;
  range(from: number, to: number): ExportQuery;
  limit(count: number): ExportQuery;
};

export type ExportDb = {
  from(table: string): {
    select(columns: string): ExportQuery;
    update(values: Record<string, unknown>): ExportQuery;
  };
};

export type ExportRow = { id: string; user_id: string; requested_at: string };

type Row = Record<string, unknown>;

export type ExportDeps = {
  supabase: ExportDb;
  storage: Pick<R2, "get" | "put">;
  send?: (input: { to: string; template: EmailTemplate; locale: Locale }) => Promise<EmailResult>;
  now?: () => Date;
  siteUrl?: string;
};

export type ExportOutcome = { status: "ready"; r2_key: string; size_bytes: number } | { status: "failed"; error: string };

class ArchiveTooLarge extends Error {
  constructor() {
    super("archive larger than 90 MB");
  }
}

/** Every row of `table` where `column` is one of `values` (chunked `in`, paged by `orderBy`). */
async function selectIn(db: ExportDb, table: string, column: string, values: readonly unknown[], orderBy = "id"): Promise<Row[]> {
  const rows: Row[] = [];
  const unique = [...new Set(values.filter((v) => v !== null && v !== undefined))];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from(table)
        .select("*")
        .in(column, chunk)
        .order(orderBy, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      const page = (data ?? []) as Row[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return rows;
}

function uniqueRows(rows: Row[], key = "id"): Row[] {
  const seen = new Set<unknown>();
  return rows.filter((row) => (seen.has(row[key]) ? false : (seen.add(row[key]), true)));
}

const ids = (rows: Row[], key = "id") => rows.map((row) => row[key]);

/** Paddle customer and subscription ids are provider references, not personal data the user can use (Step 31). */
function withoutPaymentTokens(rows: Row[]): Row[] {
  return rows.map((row) => {
    const rest = { ...row };
    delete rest.provider_customer_id;
    delete rest.provider_subscription_id;
    return rest;
  });
}

export type UserData = Record<string, unknown> & { profile: Row | null };

/** The user's rows (owner decision, Step 30a), read with the service role. */
export async function collectUserData(db: ExportDb, userId: string): Promise<UserData> {
  const me = [userId];
  const [profile] = await selectIn(db, "profiles", "id", me);

  const pets = await selectIn(db, "pets", "owner_id", me);
  const petIds = ids(pets);
  const [weightEntries, vaccinations, treatments, vetVisits, attachments, memorialRecords, feedingEntries, stoolEntries, moments] =
    await Promise.all(
      ["weight_entries", "vaccinations", "treatments", "vet_visits", "attachments", "memorial_records", "feeding_entries", "stool_entries", "moments"].map(
        (table) => selectIn(db, table, "pet_id", petIds),
      ),
    );
  const doseLogs = await selectIn(db, "dose_logs", "treatment_id", ids(treatments));
  const momentPhotos = await selectIn(db, "moment_photos", "moment_id", ids(moments));
  const momentPublicLinks = await selectIn(db, "moment_public_links", "moment_id", ids(moments));

  const reminders = await selectIn(db, "reminders", "user_id", me);
  const reminderOccurrences = await selectIn(db, "reminder_occurrences", "reminder_id", ids(reminders));
  const reminderPreferences = await selectIn(db, "reminder_preferences", "user_id", me);
  const userChannels = await selectIn(db, "user_channels", "user_id", me);

  const ownedHouseholds = await selectIn(db, "households", "owner_id", me);
  const myMemberships = await selectIn(db, "household_memberships", "user_id", me);
  const households = uniqueRows([...ownedHouseholds, ...(await selectIn(db, "households", "id", ids(myMemberships, "household_id")))]);
  const householdMemberships = uniqueRows([
    ...myMemberships,
    ...(await selectIn(db, "household_memberships", "household_id", ids(ownedHouseholds))),
  ]);
  const householdPets = await selectIn(db, "household_pets", "household_id", ids(ownedHouseholds), "pet_id");

  const listings = await selectIn(db, "listings", "author_id", me);
  const listingPhotos = await selectIn(db, "listing_photos", "listing_id", ids(listings));
  const conversations = uniqueRows([
    ...(await selectIn(db, "conversations", "starter_id", me)),
    ...(await selectIn(db, "conversations", "owner_id", me)),
  ]);
  const messages = await selectIn(db, "messages", "conversation_id", ids(conversations));
  const reports = await selectIn(db, "reports", "reporter_id", me);
  const userBlocks = await selectIn(db, "user_blocks", "blocker_id", me);

  return {
    profile: profile ?? null,
    subscriptions: withoutPaymentTokens(await selectIn(db, "subscriptions", "user_id", me)),
    pets,
    weight_entries: weightEntries,
    vaccinations,
    treatments,
    dose_logs: doseLogs,
    vet_visits: vetVisits,
    attachments,
    memorial_records: memorialRecords,
    feeding_entries: feedingEntries,
    stool_entries: stoolEntries,
    moments,
    moment_photos: momentPhotos,
    moment_public_links: momentPublicLinks,
    reminders,
    reminder_occurrences: reminderOccurrences,
    reminder_preferences: reminderPreferences,
    user_channels: userChannels,
    households,
    household_memberships: householdMemberships,
    household_pets: householdPets,
    listings,
    listing_photos: listingPhotos,
    conversations,
    messages,
    reports,
    user_blocks: userBlocks,
  };
}

/** R2 keys of every file the rows point to: pet photos, attachments, moment photos, listing photos. */
export function fileKeys(data: UserData): string[] {
  const pick = (table: string, column: string) =>
    ((data[table] ?? []) as Row[]).map((row) => row[column]).filter((key): key is string => typeof key === "string" && key !== "");
  return [
    ...new Set([
      ...pick("pets", "photo_r2_key"),
      ...pick("attachments", "r2_key"),
      ...pick("moment_photos", "r2_key"),
      ...pick("listing_photos", "r2_key"),
    ]),
  ];
}

/** One ZIP: data.json (deflate level 6) and files/<r2_key> (stored as is). */
export function buildZip(data: unknown, files: { key: string; bytes: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else chunks.push(chunk);
  });

  const json = new ZipDeflate("data.json", { level: 6 });
  zip.add(json);
  json.push(new TextEncoder().encode(JSON.stringify(data, null, 2)), true);

  for (const file of files) {
    const entry = new ZipPassThrough(`files/${file.key}`);
    zip.add(entry);
    entry.push(file.bytes, true);
  }
  zip.end();
  if (failure) throw failure;

  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** {size} of data_export_ready: "12,4 MB" · "12.4 MB" (owner decision, Step 30a); below 1 MB in kB. */
export function formatArchiveSize(bytes: number, locale: Locale): string {
  const tag = locale === "en" ? "en-GB" : "sr-Latn";
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(Math.max(1, Math.round(bytes / 1024)))} kB`;
  }
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

export function exportKey(row: Pick<ExportRow, "id" | "user_id">): string {
  return `exports/${row.user_id}/${row.id}.zip`;
}

async function markFailed(db: ExportDb, id: string): Promise<void> {
  const { error } = await db.from("data_exports").update({ status: "failed" }).eq("id", id).eq("status", "preparing");
  if (error) console.error("[exports] could not mark", id, "failed:", error.message);
}

/** Builds, uploads and announces one archive; any failure before the row is ready sets it to failed. */
export async function processExport(row: ExportRow, deps: ExportDeps): Promise<ExportOutcome> {
  const now = deps.now ?? (() => new Date());
  const send = deps.send ?? ((input) => sendEmail(input));
  let ready: { key: string; size: number; expiresAt: string; profile: Row } | null = null;

  try {
    const data = await collectUserData(deps.supabase, row.user_id);
    if (!data.profile) throw new Error("profile not found");

    const files: { key: string; bytes: Uint8Array }[] = [];
    let total = 0;
    for (const key of fileKeys(data)) {
      const bytes = await deps.storage.get(key);
      total += bytes.byteLength;
      if (total > MAX_ARCHIVE_BYTES) throw new ArchiveTooLarge();
      files.push({ key, bytes });
    }

    const exportedAt = now();
    const zip = buildZip({ exported_at: exportedAt.toISOString(), ...data }, files);
    if (zip.byteLength > MAX_ARCHIVE_BYTES) throw new ArchiveTooLarge();

    const key = exportKey(row);
    await deps.storage.put(key, zip, "application/zip");

    const readyAt = now();
    const expiresAt = new Date(readyAt.getTime() + EXPORT_TTL_MS).toISOString();
    const { error } = await deps.supabase
      .from("data_exports")
      .update({ status: "ready", r2_key: key, size_bytes: zip.byteLength, ready_at: readyAt.toISOString(), expires_at: expiresAt })
      .eq("id", row.id)
      .eq("status", "preparing");
    if (error) throw new Error(`data_exports: ${error.message}`);
    ready = { key, size: zip.byteLength, expiresAt, profile: data.profile };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[exports] export", row.id, "failed:", message);
    await markFailed(deps.supabase, row.id);
    return { status: "failed", error: message };
  }

  // The archive is ready either way; a failed email is logged and S19 still offers the download.
  const locale = fromProfileLocale(ready.profile.locale as string | null);
  const site = (deps.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const email = ready.profile.email;
  if (typeof email === "string" && email !== "") {
    const sent = await send({
      to: email,
      locale,
      template: {
        id: "data_export_ready",
        variables: {
          size: formatArchiveSize(ready.size, locale),
          date: formatBelgradeDate(ready.expiresAt, locale),
          url: `${site}/profil/podaci`,
        },
      },
    });
    if (sent.status === "failed") console.error("[exports] data_export_ready email failed for", row.id, sent.error);
  }
  return { status: "ready", r2_key: ready.key, size_bytes: ready.size };
}
