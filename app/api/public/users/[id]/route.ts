import { createClient } from "@/lib/supabase/server";
import { r2 } from "@/lib/integrations/r2";
import { apiError, fromDatabaseError, httpStatus, type ApiError } from "@/lib/server/result";
import type { FileUrl } from "@/lib/actions/files";
import type { ListingSummary, PublicProfile } from "@/lib/actions/listings";

// EP-79 GET /api/public/users/:id?limit=&offset= — public user profile (S37) for Visitors and signed-in users.
// Reads rpc:get_public_profile (security definer, only the TC-listed fields — never email or phone, FR-67) with the
// caller's own session, so viewer.* and the block state follow the caller. Suspended, pending-deletion and unknown
// users → 404 not_found. Listing cover photos are signed for 10 minutes. Never cached (TC ADR-18).

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawSummary = Omit<ListingSummary, "cover_photo"> & { cover_photo: null; cover_photo_r2_key?: string | null };

function intParam(value: string | null, fallback: number): number {
  if (value === null || value === "") return fallback;
  return /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
}

function fromRpcError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const mapped = fromDatabaseError(error);
  if (mapped.code === "validation_failed" && error.details) {
    const [field, code] = error.details.split(":");
    if (field && code) mapped.fields = { [field]: code };
  }
  return mapped;
}

async function cover(listingId: string, key: string | null | undefined): Promise<FileUrl | null> {
  if (!key) return null;
  try {
    const signed = await r2().presignGet(key);
    return { kind: "listing_photo", id: listingId, url: signed.url, expires_at: signed.expires_at, mime_type: null };
  } catch (error) {
    console.error("[api/public/users/:id] presign failed:", error instanceof Error ? error.message : error);
    return { kind: "listing_photo", id: listingId, url: null, expires_at: null, mime_type: null };
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const limit = intParam(query.get("limit"), 18);
  const offset = intParam(query.get("offset"), 0);
  const fields: Record<string, string> = {};
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fields.limit = "out_of_range";
  if (!Number.isInteger(offset) || offset < 0) fields.offset = "out_of_range";
  if (Object.keys(fields).length > 0) {
    return Response.json(apiError("validation_failed", { fields }), { status: 422, headers: HEADERS });
  }
  if (!UUID.test(id)) {
    return Response.json(apiError("not_found"), { status: 404, headers: HEADERS });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_profile", { p_user_id: id, p_limit: limit, p_offset: offset });
    if (error) {
      const mapped = fromRpcError(error);
      return Response.json(mapped, { status: httpStatus(mapped.code), headers: HEADERS });
    }
    const raw = data as unknown as Omit<PublicProfile, "listings"> & { listings: RawSummary[] };
    const profile: PublicProfile = {
      ...raw,
      listings: await Promise.all(
        raw.listings.map(async ({ cover_photo_r2_key: key, ...item }) => ({ ...item, cover_photo: await cover(item.id, key) })),
      ),
    };
    return Response.json(profile, { status: 200, headers: HEADERS });
  } catch (error) {
    console.error("[api/public/users/:id]", error instanceof Error ? error.message : error);
    return Response.json(apiError("internal_error"), { status: 500, headers: HEADERS });
  }
}
