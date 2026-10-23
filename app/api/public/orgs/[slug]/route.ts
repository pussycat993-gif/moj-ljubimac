import { apiError, httpStatus } from "@/lib/server/result";
import { getPublicOrgPage, PUBLIC_ORG_HEADERS } from "@/lib/server/public-org-page";

// EP-62 GET /api/public/orgs/:slug?limit=&offset= — public (no session), rendered on every request and never cached
// (TC ADR-18): Cache-Control: no-store on every answer, no cache tag and no purge. 200 PublicOrgPage (approved
// organisations only; a breeder also needs an active breeder plan, E-21; available animals only, public fields
// only, BR-37); 404 not_found otherwise; 422 validation_failed for bad paging. The read itself is
// lib/server/public-org-page.ts, shared with the S23 page.

export const dynamic = "force-dynamic";

/** A query integer: absent → undefined; anything but a plain integer → NaN (validation_failed). */
function intParam(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  return /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const query = new URL(request.url).searchParams;
  try {
    const result = await getPublicOrgPage(slug, {
      limit: intParam(query.get("limit")),
      offset: intParam(query.get("offset")),
    });
    if (!result.ok) {
      return Response.json(result.error, { status: httpStatus(result.error.code), headers: PUBLIC_ORG_HEADERS });
    }
    return Response.json(result.data, { status: 200, headers: PUBLIC_ORG_HEADERS });
  } catch (error) {
    console.error("[api/public/orgs]", error instanceof Error ? error.message : error);
    return Response.json(apiError("internal_error"), { status: 500, headers: PUBLIC_ORG_HEADERS });
  }
}
