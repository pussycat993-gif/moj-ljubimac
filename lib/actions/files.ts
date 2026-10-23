"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import { r2 } from "@/lib/integrations/r2";

// EP-15 get_file_urls — presigned R2 GET URLs (10 minutes, API §10 step 5). Step 13 serves kind
// `pet_photo`, Step 15 `attachment`, Step 21 `moment_photo`; the other kinds arrive with their
// screens (Steps 24, 27, 28b) and answer url = null until then. Visibility is the caller's relation
// to the pet (RLS on pets, attachments and moment_photos): an item the caller may not see, or one
// without a file, gets url = null — the batch never fails.

export type FileKind = "attachment" | "pet_photo" | "moment_photo" | "organisation_logo" | "partner_logo" | "listing_photo";

/** API §6 FileUrl. */
export type FileUrl = {
  kind: FileKind;
  id: string;
  url: string | null;
  expires_at: string | null;
  mime_type: string | null;
};

type StoredFile = { key: string; fileName: string | null; mimeType: string | null };

export async function getFileUrls(input: { items: { kind: FileKind; id: string }[] }): Promise<ActionResult<FileUrl[]>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const items = input?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return fail("validation_failed", { fields: { items: "out_of_range" } });
  }

  const files = new Map<string, StoredFile>();
  const idsOf = (kind: FileKind) => [...new Set(items.filter((i) => i.kind === kind).map((i) => i.id))];

  const petIds = idsOf("pet_photo");
  if (petIds.length > 0) {
    const { data, error } = await supabase.from("pets").select("id, photo_r2_key").in("id", petIds);
    if (error) return { ok: false, error: fromDatabaseError(error) };
    for (const row of data ?? []) {
      if (row.photo_r2_key) {
        files.set(`pet_photo:${row.id}`, { key: row.photo_r2_key, fileName: row.photo_r2_key.split("/").pop() ?? null, mimeType: null });
      }
    }
  }

  const attachmentIds = idsOf("attachment");
  if (attachmentIds.length > 0) {
    const { data, error } = await supabase
      .from("attachments")
      .select("id, r2_key, file_name, mime_type")
      .in("id", attachmentIds);
    if (error) return { ok: false, error: fromDatabaseError(error) };
    for (const row of data ?? []) {
      files.set(`attachment:${row.id}`, {
        key: row.r2_key,
        fileName: row.file_name ?? row.r2_key.split("/").pop() ?? null,
        mimeType: row.mime_type,
      });
    }
  }

  const momentPhotoIds = idsOf("moment_photo");
  if (momentPhotoIds.length > 0) {
    const { data, error } = await supabase.from("moment_photos").select("id, r2_key").in("id", momentPhotoIds);
    if (error) return { ok: false, error: fromDatabaseError(error) };
    for (const row of data ?? []) {
      files.set(`moment_photo:${row.id}`, { key: row.r2_key, fileName: row.r2_key.split("/").pop() ?? null, mimeType: null });
    }
  }

  const storage = files.size > 0 ? r2() : null;
  const urls = await Promise.all(
    items.map(async ({ kind, id }): Promise<FileUrl> => {
      const file = files.get(`${kind}:${id}`);
      if (!file || !storage) return { kind, id, url: null, expires_at: null, mime_type: null };
      const signed = await storage.presignGet(file.key, { fileName: file.fileName });
      return { kind, id, url: signed.url, expires_at: signed.expires_at, mime_type: file.mimeType };
    }),
  );
  return ok(urls);
}
