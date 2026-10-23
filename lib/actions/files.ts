"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGates } from "@/lib/server/gates";
import { fail, fromDatabaseError, ok, type ActionResult } from "@/lib/server/result";
import { r2 } from "@/lib/integrations/r2";

// EP-15 get_file_urls — presigned R2 GET URLs (10 minutes, API §10 step 5). Step 13 serves
// kind `pet_photo`; the other kinds arrive with their screens (Steps 15, 21, 24, 27, 28b) and
// answer url = null until then. Visibility is the caller's relation to the pet (RLS on pets):
// an item the caller may not see, or one without a file, gets url = null — the batch never fails.

export type FileKind = "attachment" | "pet_photo" | "moment_photo" | "organisation_logo" | "partner_logo" | "listing_photo";

/** API §6 FileUrl. */
export type FileUrl = {
  kind: FileKind;
  id: string;
  url: string | null;
  expires_at: string | null;
  mime_type: string | null;
};

export async function getFileUrls(input: { items: { kind: FileKind; id: string }[] }): Promise<ActionResult<FileUrl[]>> {
  const supabase = await createClient();
  const caller = await checkGates(supabase, { access: "read" });
  if (!caller.ok) return caller;

  const items = input?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return fail("validation_failed", { fields: { items: "out_of_range" } });
  }

  const petIds = [...new Set(items.filter((i) => i.kind === "pet_photo").map((i) => i.id))];
  const photoKeys = new Map<string, string>();
  if (petIds.length > 0) {
    const { data, error } = await supabase.from("pets").select("id, photo_r2_key").in("id", petIds);
    if (error) return { ok: false, error: fromDatabaseError(error) };
    for (const row of data ?? []) if (row.photo_r2_key) photoKeys.set(row.id, row.photo_r2_key);
  }

  const storage = photoKeys.size > 0 ? r2() : null;
  const urls = await Promise.all(
    items.map(async ({ kind, id }): Promise<FileUrl> => {
      const key = kind === "pet_photo" ? photoKeys.get(id) : undefined;
      if (!key || !storage) return { kind, id, url: null, expires_at: null, mime_type: null };
      const signed = await storage.presignGet(key, { fileName: key.split("/").pop() });
      return { kind, id, url: signed.url, expires_at: signed.expires_at, mime_type: null };
    }),
  );
  return ok(urls);
}
