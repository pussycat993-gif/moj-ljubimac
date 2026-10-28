import { createClient } from "@/lib/supabase/server";
import { r2 } from "@/lib/integrations/r2";
import { apiError, fromDatabaseError, httpStatus, type ApiError } from "@/lib/server/result";
import type { FileUrl } from "@/lib/actions/files";
import type { ListingSummary } from "@/lib/actions/listings";

// EP-73 GET /api/public/listings?type=&category=&species=&city_id=&limit=&offset= — Šapa pomoći list (S32), for
// Visitors and signed-in users. Reads rpc:list_listings (security invoker) with the caller's own session, so RLS
// decides visibility and, with a session, the BR-59 block filter applies; cover photos are signed for 10 minutes.
// Never cached (TC ADR-18): Cache-Control: no-store on every answer, no X-Robots-Tag, no purge.

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" } as const;
const TYPES = ["need", "giving", "selling", "seeking"];
const CATEGORIES = ["food", "equipment_toys", "furniture", "carriers", "medicine_care", "other"];
const SPECIES = ["dog", "cat", "other"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawSummary = Omit<ListingSummary, "cover_photo"> & { cover_photo: null; cover_photo_r2_key?: string | null };

/** A query integer: absent → the default; anything but a plain integer → NaN (validation_failed). */
function intParam(value: string | null, fallback: number): number {
  if (value === null || value === "") return fallback;
  return /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
}

/** RPC errors carry their field code in DETAIL '<field>:<code>'. */
function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

/** The cover photo key → a presigned GET (FileUrl id = the listing id); a failed presign → url null. */
async function cover(listingId: string, key: string | null | undefined): Promise<FileUrl | null> {
  if (!key) return null;
  try {
    const signed = await r2().presignGet(key);
    return { kind: "listing_photo", id: listingId, url: signed.url, expires_at: signed.expires_at, mime_type: null };
  } catch (error) {
    console.error("[api/public/listings] presign failed:", error instanceof Error ? error.message : error);
    return { kind: "listing_photo", id: listingId, url: null, expires_at: null, mime_type: null };
  }
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const type = query.get("type") || null;
  const category = query.get("category") || null;
  const species = query.get("species") || null;
  const cityId = query.get("city_id") || null;
  const limit = intParam(query.get("limit"), 20);
  const offset = intParam(query.get("offset"), 0);

  const fields: Record<string, string> = {};
  if (type && !TYPES.includes(type)) fields.type = "invalid";
  if (category && !CATEGORIES.includes(category)) fields.category = "invalid";
  if (species && !SPECIES.includes(species)) fields.species = "invalid";
  if (cityId && !UUID.test(cityId)) fields.city_id = "unknown";
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fields.limit = "out_of_range";
  if (!Number.isInteger(offset) || offset < 0) fields.offset = "out_of_range";
  if (Object.keys(fields).length > 0) {
    return Response.json(apiError("validation_failed", { fields }), { status: 422, headers: HEADERS });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("list_listings", {
      ...(type ? { p_type: type } : {}),
      ...(category ? { p_category: category } : {}),
      ...(species ? { p_species: species } : {}),
      ...(cityId ? { p_city_id: cityId } : {}),
      p_limit: limit,
      p_offset: offset,
    });
    if (error) {
      const mapped = fromRpcError(error);
      return Response.json(mapped, { status: httpStatus(mapped.code), headers: HEADERS });
    }
    const raw = data as unknown as { items: RawSummary[]; total: number };
    const items: ListingSummary[] = await Promise.all(
      raw.items.map(async ({ cover_photo_r2_key: key, ...item }) => ({ ...item, cover_photo: await cover(item.id, key) })),
    );
    return Response.json({ items, total: raw.total }, { status: 200, headers: HEADERS });
  } catch (error) {
    console.error("[api/public/listings]", error instanceof Error ? error.message : error);
    return Response.json(apiError("internal_error"), { status: 500, headers: HEADERS });
  }
}
