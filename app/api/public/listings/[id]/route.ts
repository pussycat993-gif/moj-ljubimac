import { createClient } from "@/lib/supabase/server";
import { r2 } from "@/lib/integrations/r2";
import { apiError, fromDatabaseError, httpStatus } from "@/lib/server/result";
import type { Listing, ListingPhoto } from "@/lib/actions/listings";

// EP-74 GET /api/public/listings/:id — one listing (S33, S34 edit preload) for Visitors and signed-in users. Reads
// rpc:get_listing (security invoker) with the caller's own session: a publicly visible listing for anyone, any
// status for the author and the Operator; everything else (resolved, expired, hidden, suspended author, blocked
// author, deleted, unknown) → 404 not_found, indistinguishable on purpose (FR-62 #3). Photos are signed for
// 10 minutes. Never cached (TC ADR-18): Cache-Control: no-store, no X-Robots-Tag, no purge.

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawListing = Omit<Listing, "photos"> & { photos: (ListingPhoto & { r2_key?: string })[] };

/** listing_photos.r2_key → a presigned GET; a failed presign → url null. */
async function sign(photo: ListingPhoto & { r2_key?: string }): Promise<ListingPhoto> {
  const { r2_key: key, ...rest } = photo;
  if (!key) return { ...rest, url: null };
  try {
    const signed = await r2().presignGet(key);
    return { ...rest, url: { kind: "listing_photo", id: rest.id, url: signed.url, expires_at: signed.expires_at, mime_type: null } };
  } catch (error) {
    console.error("[api/public/listings/:id] presign failed:", error instanceof Error ? error.message : error);
    return { ...rest, url: { kind: "listing_photo", id: rest.id, url: null, expires_at: null, mime_type: null } };
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return Response.json(apiError("not_found"), { status: 404, headers: HEADERS });
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_listing", { p_listing_id: id });
    if (error) {
      const mapped = fromDatabaseError(error);
      return Response.json(mapped, { status: httpStatus(mapped.code), headers: HEADERS });
    }
    const raw = data as unknown as RawListing;
    const listing: Listing = { ...raw, photos: await Promise.all(raw.photos.map(sign)) };
    return Response.json(listing, { status: 200, headers: HEADERS });
  } catch (error) {
    console.error("[api/public/listings/:id]", error instanceof Error ? error.message : error);
    return Response.json(apiError("internal_error"), { status: 500, headers: HEADERS });
  }
}
