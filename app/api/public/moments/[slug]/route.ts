import { apiError } from "@/lib/server/result";
import { getPublicMoment, PUBLIC_MOMENT_HEADERS } from "@/lib/server/public-moments";

// EP-24 GET /api/public/moments/:slug — public (no session), rendered on every request and never cached
// (TC ADR-18): Cache-Control: no-store and X-Robots-Tag: noindex on every answer. 200 PublicMoment;
// 404 not_found for an unknown slug, an inactive link or a deleted moment (E-07). The read itself is
// lib/server/public-moments.ts, shared with the S09 page.

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const moment = await getPublicMoment(slug);
    if (!moment) return Response.json(apiError("not_found"), { status: 404, headers: PUBLIC_MOMENT_HEADERS });
    return Response.json(moment, { status: 200, headers: PUBLIC_MOMENT_HEADERS });
  } catch (error) {
    console.error("[api/public/moments]", error instanceof Error ? error.message : error);
    return Response.json(apiError("internal_error"), { status: 500, headers: PUBLIC_MOMENT_HEADERS });
  }
}
